import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

type TxClient = Prisma.TransactionClient;

/**
 * Contrato público único (Tarea 31): nunca expone idProyecto,
 * nombreNormalizado ni datos internos de Prisma. Reutilizado por listado,
 * creación, edición (incluida la rama de payload vacío) y el resultado de
 * la etiqueta ya validada en updates/deletes.
 */
const LABEL_SELECT = {
  idEtiqueta: true,
  nombreEtiqueta: true,
  color: true,
} as const;

@Injectable()
export class LabelsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Fuente única del cálculo de `Etiqueta.nombreNormalizado` (Tarea 30).
   * Orden obligatorio: Unicode NFKC → trim → lowercase. No colapsa espacios
   * internos, no elimina acentos y no usa `toLocaleLowerCase` (evita
   * variar por configuración regional).
   */
  normalizeName(name: string): string {
    return name.normalize('NFKC').trim().toLowerCase();
  }

  /**
   * GET: líder o participante activo. Aislamiento estricto por
   * idProyecto; orden determinista (nombreNormalizado, idEtiqueta) para no
   * depender del orden físico de inserción. Un proyecto válido sin
   * etiquetas responde `[]`, nunca 404.
   */
  async findAllForProject(projectId: number, userId: number) {
    await this.assertCanReadProjectLabels(projectId, userId);
    return this.prisma.etiqueta.findMany({
      where: { idProyecto: projectId },
      select: LABEL_SELECT,
      orderBy: [{ nombreNormalizado: 'asc' }, { idEtiqueta: 'asc' }],
    });
  }

  /**
   * POST: exclusivo del líder. Orden: proyecto válido → liderazgo →
   * normalización → creación. El nombre visible ya llega recortado por
   * CreateLabelDto; no se vuelve a transformar aquí.
   */
  async create(projectId: number, userId: number, dto: CreateLabelDto) {
    await this.assertProjectLeader(projectId, userId);
    const nombreNormalizado = this.normalizeName(dto.nombreEtiqueta);

    try {
      return await this.prisma.etiqueta.create({
        data: {
          idProyecto: projectId,
          nombreEtiqueta: dto.nombreEtiqueta,
          nombreNormalizado,
          color: dto.color,
        },
        select: LABEL_SELECT,
      });
    } catch (error) {
      throw this.translateUniqueCollisionOrRethrow(error);
    }
  }

  /**
   * PATCH: exclusivo del líder. Orden: proyecto válido → liderazgo →
   * etiqueta perteneciente al proyecto (consulta única con idEtiqueta +
   * idProyecto, para que una etiqueta de otro proyecto sea indistinguible
   * de una inexistente) → operación. Un DTO vacío ({}) no escribe: devuelve
   * la etiqueta actual con el contrato público, sin lanzar 400.
   */
  async update(projectId: number, labelId: number, userId: number, dto: UpdateLabelDto) {
    await this.assertProjectLeader(projectId, userId);
    const actual = await this.getLabelInProjectOrThrow(projectId, labelId);

    if (dto.nombreEtiqueta === undefined && dto.color === undefined) {
      return actual;
    }

    const data: Prisma.EtiquetaUpdateInput = {};
    if (dto.nombreEtiqueta !== undefined) {
      data.nombreEtiqueta = dto.nombreEtiqueta;
      data.nombreNormalizado = this.normalizeName(dto.nombreEtiqueta);
    }
    if (dto.color !== undefined) {
      data.color = dto.color;
    }

    try {
      return await this.prisma.etiqueta.update({
        where: { idEtiqueta: labelId },
        data,
        select: LABEL_SELECT,
      });
    } catch (error) {
      throw this.translateUniqueCollisionOrRethrow(error);
    }
  }

  /**
   * DELETE: exclusivo del líder. Orden: proyecto válido → liderazgo →
   * etiqueta perteneciente al proyecto → transacción. Las filas
   * TareaEtiqueta se borran explícitamente antes de la etiqueta (misma
   * `tx`, con rollback total ante cualquier fallo) para dejar la intención
   * explícita, aunque la FK `tarea_etiqueta_id_etiqueta_fkey` ya declara
   * `ON DELETE CASCADE` (verificado en la migración
   * 20260720044028_migrate_tasks_labels_assignments). Nunca toca `Tarea`.
   * No es idempotente: una segunda eliminación no encuentra la etiqueta en
   * `getLabelInProjectOrThrow` y responde 404.
   */
  async remove(projectId: number, labelId: number, userId: number): Promise<void> {
    await this.assertProjectLeader(projectId, userId);
    await this.getLabelInProjectOrThrow(projectId, labelId);

    await this.prisma.$transaction(async (tx) => {
      await tx.tareaEtiqueta.deleteMany({ where: { idEtiqueta: labelId } });
      await tx.etiqueta.delete({ where: { idEtiqueta: labelId } });
    });
  }

  /**
   * PUT /proyectos/:projectId/tareas/:taskId/etiquetas/:labelId. Exclusivo
   * del líder. Toda la operación (validaciones incluidas) corre dentro de
   * una única transacción interactiva, con el mismo `tx` en cada paso, para
   * que proyecto/liderazgo/tarea/etiqueta se lean con la misma vista que la
   * escritura final. Orden: proyecto válido → liderazgo → tarea activa en
   * el proyecto → etiqueta en el proyecto → asociación. `upsert` sobre la
   * clave compuesta real (`idTarea_idEtiqueta`) es la única protección
   * necesaria contra duplicados, incluso con dos solicitudes concurrentes:
   * nunca se usa `findFirst` seguido de `create`.
   */
  async attachToTask(
    projectId: number,
    taskId: number,
    labelId: number,
    actorUserId: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.assertProjectLeader(projectId, actorUserId, tx);
      await this.getTaskInProjectOrThrow(projectId, taskId, tx);
      await this.getLabelInProjectOrThrow(projectId, labelId, tx);

      await tx.tareaEtiqueta.upsert({
        where: { idTarea_idEtiqueta: { idTarea: taskId, idEtiqueta: labelId } },
        update: {},
        create: { idTarea: taskId, idEtiqueta: labelId },
      });
    });
  }

  /**
   * DELETE /proyectos/:projectId/tareas/:taskId/etiquetas/:labelId.
   * Exclusivo del líder; mismo orden de validación y misma transacción que
   * `attachToTask`. `deleteMany` filtrado por ambas claves (idTarea +
   * idEtiqueta) es idempotente por construcción: una asociación ausente
   * produce `count: 0` sin lanzar, nunca `P2025` (a diferencia de `delete`
   * sobre la PK compuesta). No usa `idEtiqueta` ni `idTarea` solos, para no
   * afectar otras asociaciones de la misma tarea o de la misma etiqueta.
   */
  async detachFromTask(
    projectId: number,
    taskId: number,
    labelId: number,
    actorUserId: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.assertProjectLeader(projectId, actorUserId, tx);
      await this.getTaskInProjectOrThrow(projectId, taskId, tx);
      await this.getLabelInProjectOrThrow(projectId, labelId, tx);

      await tx.tareaEtiqueta.deleteMany({
        where: { idTarea: taskId, idEtiqueta: labelId },
      });
    });
  }

  /**
   * Traduce ÚNICAMENTE la violación reconocida del índice único compuesto
   * `Etiqueta(idProyecto, nombreNormalizado)` a 409; cualquier otro error
   * (otro P2002, P2003, P2025, errores de conexión, errores genéricos) se
   * relanza sin cambios. Rodea exclusivamente la llamada a
   * `etiqueta.create`/`etiqueta.update`, nunca la función completa.
   */
  private translateUniqueCollisionOrRethrow(error: unknown): unknown {
    if (this.isLabelNameCollision(error)) {
      return new ConflictException('Ya existe una etiqueta con ese nombre en el proyecto');
    }
    return error;
  }

  /**
   * Metadata real reproducida contra PostgreSQL (Tarea 31): Prisma expone
   * `modelName: 'Etiqueta'` y `target` con las columnas snake_case reales
   * del índice único (`id_proyecto`, `nombre_normalizado`), sin depender
   * del orden. No basta `error.code === 'P2002'`: un P2002 de otro modelo,
   * de otro target, un P2003 o un P2025 deben propagarse sin cambios.
   */
  private isLabelNameCollision(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }
    if (error.code !== 'P2002') {
      return false;
    }

    const modelName = error.meta?.modelName;
    const target = error.meta?.target;

    return (
      modelName === 'Etiqueta' &&
      Array.isArray(target) &&
      target.length === 2 &&
      target.includes('id_proyecto') &&
      target.includes('nombre_normalizado')
    );
  }

  /**
   * Reproduce, como helper privado propio de LabelsService, la misma regla
   * ya usada en TasksContextService.getProjectOrThrow /
   * ComentariosService.assertChannelA*Allowed (proyecto existente y no
   * eliminado). No se importa TasksModule ni ComentariosModule solo para
   * reutilizar este helper: LabelsModule no depende de esos módulos.
   */
  private async getProjectOrThrow(projectId: number, tx?: TxClient) {
    const db = tx ?? this.prisma;
    const proyecto = await db.proyecto.findFirst({
      where: { idProyecto: projectId, eliminadoEn: null },
      select: { idProyecto: true, creadoPor: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${projectId} no encontrado`);
    }
    return proyecto;
  }

  /**
   * Escritura (crear/editar/eliminar etiquetas): exclusiva de
   * Proyecto.creadoPor === userId. Ni participación activa, ni ser
   * asignado o autor de una tarea, ni liderar otro proyecto autorizan.
   */
  private async assertProjectLeader(
    projectId: number,
    userId: number,
    tx?: TxClient,
  ): Promise<void> {
    const proyecto = await this.getProjectOrThrow(projectId, tx);
    if (proyecto.creadoPor !== userId) {
      throw new ForbiddenException('No eres el líder de este proyecto');
    }
  }

  /**
   * Lectura: líder del proyecto O participación activa (rolProyecto.idProyecto
   * = projectId, estadoParticipacion: ACTIVO). Una participación retirada,
   * inactiva, o activa únicamente en otro proyecto no autoriza.
   */
  private async assertCanReadProjectLabels(
    projectId: number,
    userId: number,
    tx?: TxClient,
  ): Promise<void> {
    const proyecto = await this.getProjectOrThrow(projectId, tx);
    if (proyecto.creadoPor === userId) {
      return;
    }

    const db = tx ?? this.prisma;
    const participacion = await db.participacionProyecto.findFirst({
      where: {
        idUsuario: userId,
        estadoParticipacion: 'ACTIVO',
        rolProyecto: { idProyecto: projectId },
      },
      select: { idParticipacion: true },
    });
    if (!participacion) {
      throw new ForbiddenException('No tienes acceso a las etiquetas de este proyecto');
    }
  }

  /**
   * Tarea 32: consulta única con idTarea + idProyecto + eliminadoEn: null
   * (más `proyecto.eliminadoEn: null` como defensa adicional), reproduciendo
   * el mismo contrato que `TasksContextService.getTaskInProjectOrThrow` sin
   * importar TasksModule. `tx` es obligatorio: este helper solo se invoca
   * dentro de la transacción interactiva de attachToTask/detachFromTask.
   */
  private async getTaskInProjectOrThrow(projectId: number, taskId: number, tx: TxClient) {
    const tarea = await tx.tarea.findFirst({
      where: {
        idTarea: taskId,
        idProyecto: projectId,
        eliminadoEn: null,
        proyecto: { eliminadoEn: null },
      },
      select: { idTarea: true },
    });
    if (!tarea) {
      throw new NotFoundException(
        `Tarea con id ${taskId} no encontrada en el proyecto ${projectId}`,
      );
    }
    return tarea;
  }

  /**
   * Consulta única con idEtiqueta + idProyecto (nunca una búsqueda global
   * por idEtiqueta seguida de una comparación en memoria), para que una
   * etiqueta de otro proyecto sea indistinguible de una inexistente.
   */
  private async getLabelInProjectOrThrow(projectId: number, labelId: number, tx?: TxClient) {
    const db = tx ?? this.prisma;
    const etiqueta = await db.etiqueta.findFirst({
      where: { idEtiqueta: labelId, idProyecto: projectId },
      select: LABEL_SELECT,
    });
    if (!etiqueta) {
      throw new NotFoundException(
        `Etiqueta con id ${labelId} no encontrada en el proyecto ${projectId}`,
      );
    }
    return etiqueta;
  }
}
