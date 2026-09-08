import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Etiqueta, Hito, Prisma, RolProyecto } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TasksContextService } from './tasks-context.service';
import { ProjectEligibilityService } from '../eligibility/project-eligibility.service';

type TxClient = Prisma.TransactionClient;

export interface RelatedResourcesInput {
  idHito?: number | null;
  idRolProyecto?: number | null;
  idsEtiquetas?: number[];
}

export interface RelatedResourcesResult {
  hito: Hito | null | undefined;
  rolProyecto: RolProyecto | null | undefined;
  etiquetas: Etiqueta[] | undefined;
  /**
   * X1.1: ParticipacionProyecto exacta resuelta para `idUsuarioAsignado`
   * (rol exacto si la tarea tiene idRolProyecto, cualquier participación
   * ACTIVO del proyecto si no) — la misma fila que
   * `assertUserParticipationForEffectiveRole` ya valida que existe.
   * `undefined` cuando `validateCreateTaskRelations` no recibió
   * `idUsuarioAsignado` (sin asignación inicial que crear); nunca `null`
   * en ese caso, para no confundirlo con "resuelto pero sin participación"
   * (imposible: la validación ya lanza si no encuentra ninguna).
   */
  idParticipacionAsignado?: number;
}

/**
 * C086: distingue crear una asignación NUEVA de revalidar una existente. Solo
 * la primera pasa por la elegibilidad del destino.
 */
export interface AssignmentResolutionOptions {
  nuevaAsignacion?: boolean;
  actorId?: number;
}

export interface CreateTaskRelationsInput {
  idHito?: number;
  idRolProyecto?: number;
  idsEtiquetas?: number[];
  idUsuarioAsignado?: number;
  /**
   * C086 (§17): quién ejecuta la operación. Solo importa para la excepción de
   * §18.1 — el saliente que entrega su propio trabajo no queda excluido de
   * recibirlo de vuelta durante la preparación.
   */
  actorId?: number;
}

/**
 * C040 (06 v2 §32/§40): la validación de relaciones (hito, rol y el conjunto
 * completo de `idsEtiquetas`) corre con el `tx` del runner por proyecto, así
 * que la mutación indirecta de etiquetas desde `create`/`update` queda
 * acotada al mismo proyecto y al mismo lock que la escritura de la tarea.
 * Este servicio nunca abre una transacción propia.
 */
@Injectable()
export class TasksRelationsService {
  constructor(
    private prisma: PrismaService,
    private tasksContext: TasksContextService,
    // C086: opcional por el mismo motivo posicional que en el resto del
    // dominio — las suites existentes construyen este servicio con dos
    // argumentos; en producción TasksModule siempre lo provee.
    private readonly eligibility?: ProjectEligibilityService,
  ) {}

  /**
   * `undefined` en un campo = el consumidor no pidió validar/tocar esa
   * relación (sin consulta). `null` en idHito/idRolProyecto = ausencia
   * explícita (sin consulta). Un ID numérico delega en TasksContextService,
   * que ya implementa la unicidad de la consulta y el contrato de errores
   * (NotFoundException / BadRequestException); no se duplica esa lógica
   * aquí. Orden: hito, luego rol, luego etiquetas (relevante para las
   * pruebas de secuencia de validaciones).
   */
  async validateRelatedResources(
    projectId: number,
    input: RelatedResourcesInput,
    tx?: TxClient,
  ): Promise<RelatedResourcesResult> {
    let hito: Hito | null | undefined;
    if (input.idHito === undefined) {
      hito = undefined;
    } else if (input.idHito === null) {
      hito = null;
    } else {
      hito = await this.tasksContext.getMilestoneInProjectOrThrow(projectId, input.idHito, tx);
    }

    let rolProyecto: RolProyecto | null | undefined;
    if (input.idRolProyecto === undefined) {
      rolProyecto = undefined;
    } else if (input.idRolProyecto === null) {
      rolProyecto = null;
    } else {
      rolProyecto = await this.tasksContext.getRoleInProjectOrThrow(
        projectId,
        input.idRolProyecto,
        tx,
      );
    }

    const etiquetas =
      input.idsEtiquetas === undefined
        ? undefined
        : await this.tasksContext.getLabelsInProjectOrThrow(projectId, input.idsEtiquetas, tx);

    return { hito, rolProyecto, etiquetas };
  }

  /**
   * roleId es el rol EFECTIVO de la tarea, ya resuelto por el consumidor
   * (número o null explícito; nunca undefined). El líder no queda exento:
   * la excepción de assertActiveProjectParticipant que permite leer sin
   * fila de participación no aplica aquí — asignar exige participación
   * real, con o sin rol según corresponda. Tarea.creadaPor nunca se
   * consulta ni interviene.
   *
   * Invocación pública e independiente: siempre valida el rol por su
   * cuenta (vía TasksContextService), sin confiar en que un llamador ya
   * lo haya hecho. validateCreateTaskRelations NO pasa por este método
   * cuando ya validó el rol — reutiliza directamente los helpers privados
   * de abajo para evitar la segunda consulta del mismo rol.
   *
   * X1.1: devuelve el `idParticipacion` exacto resuelto (nunca `null`: la
   * propia validación lanza BadRequestException si no encuentra ninguna
   * participación compatible), para que el caller pueda persistirlo en
   * `AsignacionTarea.idParticipacion` sin una segunda consulta.
   */
  async assertUserAssignableToProject(
    projectId: number,
    userId: number,
    roleId: number | null,
    tx?: TxClient,
    options: AssignmentResolutionOptions = {},
  ): Promise<number> {
    await this.assertUserExists(userId, tx);

    if (roleId !== null) {
      await this.tasksContext.getRoleInProjectOrThrow(projectId, roleId, tx);
    }

    return this.assertUserParticipationForEffectiveRole(projectId, userId, roleId, tx, options);
  }

  private async assertUserExists(userId: number, tx?: TxClient): Promise<void> {
    const db = tx ?? this.prisma;
    const usuario = await db.usuario.findUnique({
      where: { idUsuario: userId },
      select: { idUsuario: true },
    });
    if (!usuario) {
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
    }
  }

  /**
   * Únicamente la consulta de participación para el rol efectivo dado —
   * no valida la existencia del rol ni del usuario. roleId numérico exige
   * participación ACTIVO en ese rol exacto; roleId null exige cualquier
   * participación ACTIVO dentro del proyecto.
   *
   * X1.1: retorna el `idParticipacion` de la fila encontrada (siempre
   * numérico: ambas ramas lanzan BadRequestException antes de retornar si
   * no hay ninguna) — única fuente de verdad de "qué participación exacta
   * corresponde a este usuario+rol efectivo+proyecto", reutilizada por
   * `assertUserAssignableToProject`/`validateCreateTaskRelations` para
   * persistir `AsignacionTarea.idParticipacion` sin duplicar el criterio
   * de resolución en el caller.
   */
  private async assertUserParticipationForEffectiveRole(
    projectId: number,
    userId: number,
    roleId: number | null,
    tx?: TxClient,
    options: AssignmentResolutionOptions = {},
  ): Promise<number> {
    const db = tx ?? this.prisma;

    /**
     * C086 (06 v2 §17/§23 §18.1): este es el ÚNICO punto donde se resuelve la
     * FK de participación de una asignación, así que también es el único donde
     * tiene sentido decidir si el destino puede recibir trabajo. La regla se
     * aplica a QUIEN RECIBE, nunca a quien asigna: un integrante con salida en
     * preparación debe poder seguir entregando y reasignando lo suyo, y solo
     * queda excluido de recibir cosas nuevas.
     *
     * Se evalúa SOLO al crear una asignación nueva. Revalidar la coherencia de
     * una asignación que ya existe (cambio de rol de la tarea) no es asignar
     * trabajo nuevo: expulsar ahí a quien tiene una salida en curso le quitaría
     * el trabajo que §13 le permite terminar.
     *
     * El assert exige `tx` porque solo vale bajo el lock; los callers de
     * producción que asignan corren dentro de `run`, así que siempre lo tienen.
     */
    if (options.nuevaAsignacion && tx && this.eligibility) {
      await this.eligibility.assertAssignmentDestination(tx, {
        projectId,
        taskRoleId: roleId,
        userId,
        handoverActorId: options.actorId ?? null,
      });
    }

    if (roleId !== null) {
      const participacionConRol = await db.participacionProyecto.findFirst({
        where: {
          idUsuario: userId,
          idRolProyecto: roleId,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto: projectId },
        },
        select: { idParticipacion: true },
      });
      if (!participacionConRol) {
        throw new BadRequestException(
          'El usuario no tiene una participación activa en el rol de la tarea',
        );
      }
      return participacionConRol.idParticipacion;
    }

    const participacionEnProyecto = await db.participacionProyecto.findFirst({
      where: {
        idUsuario: userId,
        estadoParticipacion: 'ACTIVO',
        rolProyecto: { idProyecto: projectId },
      },
      select: { idParticipacion: true },
    });
    if (!participacionEnProyecto) {
      throw new BadRequestException('El usuario no tiene una participación activa en el proyecto');
    }
    return participacionEnProyecto.idParticipacion;
  }

  /**
   * Orquesta la validación completa para creación: hito, rol y etiquetas
   * primero (vía validateRelatedResources — el rol se consulta aquí, una
   * sola vez), y solo si se solicitó asignar a alguien, la existencia del
   * usuario y su participación para idRolProyecto ?? null como rol
   * efectivo, reutilizando el rol ya validado sin volver a llamar a
   * getRoleInProjectOrThrow. No crea nada; solo valida y devuelve los
   * recursos ya resueltos para que la Tarea 18 los reutilice.
   */
  async validateCreateTaskRelations(
    projectId: number,
    input: CreateTaskRelationsInput,
    tx?: TxClient,
  ): Promise<RelatedResourcesResult> {
    const recursos = await this.validateRelatedResources(
      projectId,
      {
        idHito: input.idHito,
        idRolProyecto: input.idRolProyecto,
        idsEtiquetas: input.idsEtiquetas,
      },
      tx,
    );

    if (input.idUsuarioAsignado !== undefined) {
      await this.assertUserExists(input.idUsuarioAsignado, tx);

      const rolEfectivo = input.idRolProyecto ?? null;
      recursos.idParticipacionAsignado = await this.assertUserParticipationForEffectiveRole(
        projectId,
        input.idUsuarioAsignado,
        rolEfectivo,
        tx,
        { nuevaAsignacion: true, actorId: input.actorId },
      );
    }

    return recursos;
  }
}
