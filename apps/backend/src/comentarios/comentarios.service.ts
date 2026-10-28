import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EstadoProyecto, Prisma, TipoNotificacion } from '@prisma/client';
import { INSIGNIAS_EVENTO } from '../insignias/insignias.catalog';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ProjectTransactionService,
  type ProjectLockRow,
  type ProjectTransactionContext,
} from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { CreateComentarioDto } from './dto/create-comentario.dto';
import { UpdateComentarioDto } from './dto/update-comentario.dto';
import { extraerMenciones, normalizarMenciones } from './menciones/menciones.parser';

type Db = Prisma.TransactionClient | PrismaService;

/** HU-200: dónde vive un comentario, para el texto y el enlace de la mención. */
interface ContextoComentario {
  contexto: 'TAREA' | 'PROYECTO' | 'HITO';
  idProyecto: number;
  idTarea: number | null;
  idHito: number | null;
}

const usuarioPublicoSelect = {
  select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true },
} as const;

/**
 * C036 (06 v2 §16/§32/§34): el canal A de proyecto/hito escribe dentro de
 * `ProjectTransactionService.run` (lock del proyecto primero) con la familia
 * `COMENTARIO_PROYECTO_HITO`, y sus dos lectores pasan por la política de
 * lectura histórica antes de la autorización existente. Las notificaciones
 * `COMENTARIO_PROYECTO`/`COMENTARIO_HITO` se conservan después del commit.
 * C037: el canal de tarea (createForTask/updateForTask/removeForTask) también
 * corre bajo `run` con la familia `COMENTARIO_TAREA` y exige que la tarea
 * pertenezca a un Sprint ACTIVO; `COMENTARIO_TAREA` se notifica tras el commit.
 * HU-200: en los tres canales, crear y editar validan las menciones `@[…](id)`
 * dentro del mismo `run` (solo líder o participantes ACTIVO; el resto queda
 * como texto) y sincronizan `MencionComentario`. Tras el commit, cada nuevo
 * mencionado recibe `MENCION_COMENTARIO` en lugar del aviso genérico.
 */
@Injectable()
export class ComentariosService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly readPolicy: ProjectReadPolicyService,
    // HU-190: opcional (suites con argumentos posicionales).
    private readonly events?: EventEmitter2,
  ) {}

  private lockedProject(ctx: Pick<ProjectTransactionContext, 'project'>): ProjectLockRow {
    if (!ctx.project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return ctx.project;
  }

  /**
   * Tarea 28: los comentarios de tarea ya no se crean mediante esta ruta
   * genérica (proyecto implícito vía `idTarea` en el body). Se rechazan
   * aquí mismo, antes de resolver cualquier contexto, para que la única vía
   * de creación de un comentario de tarea sea la ruta anidada y
   * contextualizada `POST /proyectos/:projectId/tareas/:taskId/comentarios`
   * (ver `createForTask`). Los comentarios de proyecto e hito conservan
   * exactamente el mismo comportamiento que tenían antes de esta tarea.
   */
  async create(userId: number, dto: CreateComentarioDto) {
    if (dto.idTarea) {
      throw new BadRequestException(
        'Los comentarios de tarea deben crearse mediante POST /proyectos/:projectId/tareas/:taskId/comentarios',
      );
    }

    const parentCount = Number(!!dto.idProyecto) + Number(!!dto.idHito);
    if (parentCount !== 1) {
      throw new BadRequestException('Debes enviar exactamente una entidad destino: idProyecto o idHito');
    }

    const contexto = await this.resolveProjectContext(dto);
    const tipo = dto.idProyecto ? TipoNotificacion.COMENTARIO_PROYECTO : TipoNotificacion.COMENTARIO_HITO;

    // C036: autorización del canal y política dentro del lock; la notificación
    // existente se emite después del commit.
    const { comentario, mencionados } = await this.projectTx.run(
      contexto.idProyecto,
      userId,
      'comentarios.create',
      async (ctx) => {
        const { tx } = ctx;
        await this.assertChannelAWriteAllowed(contexto.idProyecto, userId, tx);
        await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'COMENTARIO_PROYECTO_HITO', userId);
        const menciones = await this.prepararMenciones(tx, contexto.idProyecto, dto.contenido);
        const comentario = await tx.comentario.create({
          data: {
            idAutor: userId,
            idProyecto: dto.idProyecto,
            idTarea: dto.idTarea,
            idHito: dto.idHito,
            contenido: menciones.contenido,
          },
        });
        await this.sincronizarMenciones(tx, comentario.idComentario, menciones.mencionados, true);
        return { comentario, mencionados: menciones.mencionados };
      },
    );

    await this.notificarMenciones(mencionados, userId, comentario.idComentario, {
      contexto: dto.idProyecto ? 'PROYECTO' : 'HITO',
      idProyecto: contexto.idProyecto,
      idTarea: null,
      idHito: dto.idHito ?? null,
    });
    await this.notifyChannelA(userId, contexto.idProyecto, dto, tipo, comentario.idComentario, mencionados);
    return comentario;
  }

  /**
   * Único punto de creación de comentarios de tarea (Tarea 28). Valida
   * proyecto+tarea en base de datos (`getTareaEnProyectoOrThrow`, con
   * `proyecto.eliminadoEn: null` incluido) antes de reutilizar la misma
   * regla de autorización de escritura (`assertChannelAWriteAllowed`) que
   * ya usan los comentarios de proyecto e hito. C037 (06 v2 §32): todo corre
   * dentro del `run` del proyecto y, tras el lock, la tarea comentada debe
   * pertenecer a un Sprint ACTIVO (entidad de `COMENTARIO_TAREA`): anotar
   * una tarea nunca escribe en un Sprint cerrado. Se permite anotar una tarea
   * legacy existente en prepublicación; crear tareas ahí sigue prohibido.
   *
   * Tarea 29: a diferencia de `create()` (proyecto/hito), NO delega en
   * `notifyChannelA`/`notifyProjectActiveParticipants`. Los destinatarios
   * de un comentario de tarea nunca son "todos los participantes activos
   * del proyecto": son, como mucho, un único usuario (el asignado activo o,
   * en su defecto, quien creó la tarea), resuelto en vivo por
   * `getTaskCommentRecipientIds` en cada llamada, después del commit.
   */
  async createForTask(
    projectId: number,
    taskId: number,
    userId: number,
    contenido: string,
  ) {
    const { tarea, comentario, mencionados } = await this.projectTx.run(
      projectId,
      userId,
      'comentarios.createForTask',
      async (ctx) => {
        const { tx } = ctx;
        const tarea = await this.getTareaEnProyectoOrThrow(projectId, taskId, tx);
        await this.assertChannelAWriteAllowed(projectId, userId, tx);
        await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'COMENTARIO_TAREA', userId, {
          sprintId: tarea.idSprint,
        });
        const menciones = await this.prepararMenciones(tx, projectId, contenido);
        const comentario = await tx.comentario.create({
          data: {
            idAutor: userId,
            idTarea: taskId,
            contenido: menciones.contenido,
          },
        });
        await this.sincronizarMenciones(tx, comentario.idComentario, menciones.mencionados, true);
        return { tarea, comentario, mencionados: menciones.mencionados };
      },
    );

    this.events?.emit(INSIGNIAS_EVENTO, { claves: ['comentarios'], idUsuarios: [userId] });

    await this.notificarMenciones(mencionados, userId, comentario.idComentario, {
      contexto: 'TAREA',
      idProyecto: projectId,
      idTarea: taskId,
      idHito: null,
    });

    // HU-200: quien fue mencionado ya recibió un aviso más específico.
    const recipientIds = (await this.getTaskCommentRecipientIds(taskId, tarea.creadaPor, userId)).filter(
      (recipientId) => !mencionados.includes(recipientId),
    );
    await this.notifications.notifyUsers(recipientIds, {
      tipoNotificacion: TipoNotificacion.COMENTARIO_TAREA,
      tituloNotificacion: 'Nuevo comentario',
      mensajeNotificacion: 'Se agregó un comentario nuevo en el proyecto.',
      datosJson: {
        idProyecto: projectId,
        idComentario: comentario.idComentario,
        idTarea: taskId,
        idHito: null,
      },
    });

    return comentario;
  }

  /**
   * Tarea 29: destinatarios de un comentario de tarea, con prioridad
   * estricta: (1) el usuario con asignación activa (`desasignadaEn: null`)
   * es el único candidato principal; (2) si no hay asignación activa, el
   * único candidato es `tarea.creadaPor`; (3) el autor del comentario se
   * excluye; (4) el resultado se deduplica. Las asignaciones cerradas
   * (históricas) nunca son candidatas, y no se consulta a los participantes
   * del proyecto para este propósito. La asignación se consulta en base de
   * datos en cada llamada (nunca cacheada), para reflejar reasignaciones y
   * desasignaciones ocurridas entre comentarios consecutivos.
   */
  private async getTaskCommentRecipientIds(
    taskId: number,
    taskCreatorId: number,
    authorUserId: number,
  ): Promise<number[]> {
    const activeAssignment = await this.prisma.asignacionTarea.findFirst({
      where: {
        idTarea: taskId,
        desasignadaEn: null,
      },
      select: { idUsuario: true },
    });

    const primaryRecipientId = activeAssignment?.idUsuario ?? taskCreatorId;

    return [...new Set([primaryRecipientId])].filter(
      (recipientId) => recipientId !== authorUserId,
    );
  }

  /**
   * Notificación del canal A (proyecto/hito) a los participantes activos,
   * emitida después del commit del `run` (C036). HU-200: los mencionados
   * quedan fuera porque ya recibieron `MENCION_COMENTARIO`.
   */
  private async notifyChannelA(
    userId: number,
    idProyecto: number,
    data: { idTarea?: number; idHito?: number },
    tipo: TipoNotificacion,
    idComentario: number,
    mencionados: number[] = [],
  ): Promise<void> {
    const payload = {
      tipoNotificacion: tipo,
      tituloNotificacion: 'Nuevo comentario',
      mensajeNotificacion: 'Se agregó un comentario nuevo en el proyecto.',
      datosJson: {
        idProyecto,
        idComentario,
        idTarea: data.idTarea ?? null,
        idHito: data.idHito ?? null,
      },
    };
    if (mencionados.length === 0) {
      await this.notifications.notifyProjectActiveParticipants(idProyecto, userId, payload);
      return;
    }
    await this.notifications.notifyProjectActiveParticipants(idProyecto, userId, payload, undefined, mencionados);
  }

  // ---------------------------------------------------------------------
  // HU-200 — menciones con @
  // ---------------------------------------------------------------------

  /**
   * T-376: líder y participantes ACTIVO del proyecto, es decir, los mismos que
   * pueden leer sus comentarios (`assertChannelAReadAllowed`). Es la lista del
   * autocompletado, y la misma regla que valida cada mención al guardar.
   */
  async findMencionables(idProyecto: number, userId: number) {
    await this.readPolicy.assertRead(undefined, { projectId: idProyecto, actorId: userId, scope: 'resumen' });
    await this.assertChannelAReadAllowed(idProyecto, userId);

    const [proyecto, participaciones] = await Promise.all([
      this.prisma.proyecto.findUnique({
        where: { idProyecto },
        select: { creador: usuarioPublicoSelect },
      }),
      this.prisma.participacionProyecto.findMany({
        where: { estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto } },
        select: { usuario: usuarioPublicoSelect },
      }),
    ]);

    const porId = new Map<number, { idUsuario: number; nombre: string; apellido: string; fotoUrl: string | null; esLider: boolean }>();
    if (proyecto?.creador) {
      porId.set(proyecto.creador.idUsuario, { ...proyecto.creador, esLider: true });
    }
    for (const { usuario } of participaciones) {
      if (!porId.has(usuario.idUsuario)) {
        porId.set(usuario.idUsuario, { ...usuario, esLider: false });
      }
    }
    return [...porId.values()].sort((a, b) =>
      `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`, 'es'),
    );
  }

  /** Subconjunto de `candidatos` que puede ser mencionado en el proyecto. */
  private async idsMencionables(db: Db, idProyecto: number, candidatos: number[]): Promise<Set<number>> {
    const proyecto = await db.proyecto.findUnique({
      where: { idProyecto },
      select: { creadoPor: true },
    });
    const participaciones = await db.participacionProyecto.findMany({
      where: { idUsuario: { in: candidatos }, estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto } },
      select: { idUsuario: true },
    });
    const elegibles = new Set(participaciones.map((p) => p.idUsuario));
    if (proyecto && candidatos.includes(proyecto.creadoPor)) {
      elegibles.add(proyecto.creadoPor);
    }
    return elegibles;
  }

  /**
   * Recorta el contenido y deja como token solo las menciones válidas; una
   * mención a quien no pertenece al proyecto se degrada a texto, sin error.
   * Sin tokens no consulta la base.
   */
  private async prepararMenciones(db: Db, idProyecto: number, contenido: string) {
    const texto = contenido.trim();
    const candidatos = extraerMenciones(texto).map((m) => m.idUsuario);
    if (candidatos.length === 0) {
      return { contenido: texto, mencionados: [] as number[] };
    }
    const elegibles = await this.idsMencionables(db, idProyecto, candidatos);
    return {
      contenido: normalizarMenciones(texto, elegibles),
      mencionados: candidatos.filter((id) => elegibles.has(id)),
    };
  }

  /**
   * Deja en `MencionComentario` exactamente `mencionados` y devuelve los que se
   * agregaron en esta escritura: al editar, solo ellos reciben aviso.
   */
  private async sincronizarMenciones(
    db: Db,
    idComentario: number,
    mencionados: number[],
    esNuevo: boolean,
  ): Promise<number[]> {
    const previas = esNuevo
      ? []
      : (
          await db.mencionComentario.findMany({ where: { idComentario }, select: { idUsuario: true } })
        ).map((m) => m.idUsuario);
    const quitar = previas.filter((id) => !mencionados.includes(id));
    const agregar = mencionados.filter((id) => !previas.includes(id));

    if (quitar.length > 0) {
      await db.mencionComentario.deleteMany({ where: { idComentario, idUsuario: { in: quitar } } });
    }
    if (agregar.length > 0) {
      await db.mencionComentario.createMany({
        data: agregar.map((idUsuario) => ({ idComentario, idUsuario })),
        skipDuplicates: true,
      });
    }
    return agregar;
  }

  /** T-377: aviso post-commit a los mencionados; el autor nunca se notifica a sí mismo. */
  private async notificarMenciones(
    mencionados: number[],
    autorId: number,
    idComentario: number,
    ctx: ContextoComentario,
  ): Promise<void> {
    const destinatarios = mencionados.filter((id) => id !== autorId);
    if (destinatarios.length === 0) return;

    const [autor, tituloContexto] = await Promise.all([
      this.prisma.usuario.findUnique({
        where: { idUsuario: autorId },
        select: { nombre: true, apellido: true },
      }),
      this.tituloContexto(ctx),
    ]);

    await this.notifications.notifyFromTemplate(destinatarios, 'MENCION_COMENTARIO', {
      autorNombre: autor ? `${autor.nombre} ${autor.apellido}` : 'Un integrante',
      contexto: ctx.contexto,
      tituloContexto,
      idProyecto: ctx.idProyecto,
      idComentario,
      idTarea: ctx.idTarea,
      idHito: ctx.idHito,
    });
  }

  private async tituloContexto(ctx: ContextoComentario): Promise<string> {
    if (ctx.idTarea !== null) {
      const tarea = await this.prisma.tarea.findUnique({
        where: { idTarea: ctx.idTarea },
        select: { tituloTarea: true },
      });
      return tarea?.tituloTarea ?? '';
    }
    if (ctx.idHito !== null) {
      const hito = await this.prisma.hito.findUnique({
        where: { idHito: ctx.idHito },
        select: { tituloHito: true },
      });
      return hito?.tituloHito ?? '';
    }
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { idProyecto: ctx.idProyecto },
      select: { tituloProyecto: true },
    });
    return proyecto?.tituloProyecto ?? '';
  }

  /**
   * T-378: el contador de comentarios de cada hito del proyecto (botón de la
   * tarjeta del hito). Ruta autorizada, no el detalle público del proyecto.
   */
  async countByHitosDelProyecto(idProyecto: number, userId: number) {
    await this.readPolicy.assertRead(undefined, { projectId: idProyecto, actorId: userId, scope: 'resumen' });
    await this.assertChannelAReadAllowed(idProyecto, userId);
    const grupos = await this.prisma.comentario.groupBy({
      by: ['idHito'],
      where: { eliminadoEn: null, hito: { idProyecto } },
      _count: { _all: true },
    });
    return grupos
      .filter((g): g is typeof g & { idHito: number } => g.idHito !== null)
      .map((g) => ({ idHito: g.idHito, cantidad: g._count._all }));
  }

  private readonly autorSelect = usuarioPublicoSelect;

  /** Menciones de cada comentario con el nombre VIGENTE del usuario (T-378). */
  private readonly mencionesInclude = {
    select: { usuario: usuarioPublicoSelect },
  } as const;

  async findByProyecto(idProyecto: number, userId: number) {
    // C036 (§34): política de lectura histórica antes de la autorización existente.
    await this.readPolicy.assertRead(undefined, { projectId: idProyecto, actorId: userId, scope: 'resumen' });
    await this.assertChannelAReadAllowed(idProyecto, userId);
    return this.prisma.comentario.findMany({
      where: { idProyecto, eliminadoEn: null },
      include: { autor: this.autorSelect, menciones: this.mencionesInclude },
      orderBy: { creadoEn: 'asc' },
    });
  }

  /**
   * Único listado de comentarios de tarea (Tarea 28.C): valida proyecto+tarea
   * igual que `createForTask`/`updateForTask`/`removeForTask` antes de
   * reutilizar `assertChannelAReadAllowed`. Reemplaza por completo a las
   * antiguas `findByTarea`/`findByTareaDesc` (sin `projectId`), retiradas
   * junto con la ruta genérica `GET /comentarios/tarea/:idTarea`.
   */
  async findByTareaEnProyecto(projectId: number, taskId: number, userId: number) {
    const tarea = await this.getTareaEnProyectoOrThrow(projectId, taskId);
    // C037 (§34): política de lectura histórica (Sprint de la tarea como
    // entidad) antes de la autorización existente.
    await this.readPolicy.assertRead(undefined, {
      projectId,
      actorId: userId,
      scope: 'tareas',
      entitySprintId: tarea.idSprint,
    });
    await this.assertChannelAReadAllowed(projectId, userId);
    return this.prisma.comentario.findMany({
      where: { idTarea: taskId, eliminadoEn: null },
      include: { autor: this.autorSelect, menciones: this.mencionesInclude },
      orderBy: { creadoEn: 'desc' },
    });
  }

  async findByHito(idHito: number, userId: number) {
    const hito = await this.prisma.hito.findUnique({
      where: { idHito },
      select: { idProyecto: true },
    });
    if (!hito) throw new NotFoundException('Hito no encontrado');
    await this.readPolicy.assertRead(undefined, { projectId: hito.idProyecto, actorId: userId, scope: 'resumen' });
    await this.assertChannelAReadAllowed(hito.idProyecto, userId);
    return this.prisma.comentario.findMany({
      where: { idHito, eliminadoEn: null },
      include: { autor: this.autorSelect, menciones: this.mencionesInclude },
      orderBy: { creadoEn: 'asc' },
    });
  }

  /**
   * Validación contextual estricta para la ruta anidada de comentarios de
   * tarea (Tarea 28): la tarea debe pertenecer exactamente a `projectId`,
   * no estar eliminada, y su proyecto tampoco debe estar eliminado. Una
   * consulta en base de datos (no una comparación en memoria tras traer la
   * tarea globalmente), para que una tarea de otro proyecto sea
   * indistinguible de una inexistente.
   */
  private async getTareaEnProyectoOrThrow(projectId: number, taskId: number, db: Db = this.prisma) {
    const tarea = await db.tarea.findFirst({
      where: {
        idTarea: taskId,
        idProyecto: projectId,
        eliminadoEn: null,
        proyecto: { eliminadoEn: null },
      },
      // C037: `idSprint` alimenta la exigencia de entidad (Sprint ACTIVO).
      select: { idTarea: true, idProyecto: true, creadaPor: true, idSprint: true },
    });
    if (!tarea) {
      throw new NotFoundException(`Tarea con id ${taskId} no encontrada en el proyecto ${projectId}`);
    }
    return tarea;
  }

  /**
   * Comprueba que `commentId` pertenezca exactamente a `taskId` (no a otra
   * tarea del mismo proyecto, ni a una tarea de otro proyecto, ni a un
   * comentario de proyecto o hito) y que no esté eliminado lógicamente.
   * Se llama únicamente después de `getTareaEnProyectoOrThrow`, así que un
   * comentario cruzado nunca revela su existencia en otro contexto: se
   * comporta exactamente igual que un `commentId` inexistente.
   */
  private async getComentarioEnTareaOrThrow(taskId: number, commentId: number, db: Db = this.prisma) {
    const comentario = await db.comentario.findFirst({
      where: { idComentario: commentId, idTarea: taskId, eliminadoEn: null },
      select: { idComentario: true, idAutor: true },
    });
    if (!comentario) {
      throw new NotFoundException(
        `Comentario con id ${commentId} no encontrado en la tarea ${taskId}`,
      );
    }
    return comentario;
  }

  /**
   * Lectura de comentarios permitida solo al líder real del proyecto o a un
   * participante con participación activa. A diferencia de la escritura, no
   * depende del estado del proyecto.
   */
  private async assertChannelAReadAllowed(idProyecto: number, userId: number) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { idProyecto },
      select: { creadoPor: true },
    });
    if (!proyecto) throw new NotFoundException('Proyecto no encontrado');

    if (proyecto.creadoPor === userId) return;

    const participa = await this.prisma.participacionProyecto.findFirst({
      where: {
        idUsuario: userId,
        estadoParticipacion: 'ACTIVO',
        rolProyecto: { idProyecto },
      },
      select: { idParticipacion: true },
    });
    if (!participa) {
      throw new ForbiddenException('No tienes acceso a los comentarios de este proyecto');
    }
  }

  /**
   * Tarea 28.B: las rutas genéricas (`PATCH`/`DELETE /comentarios/:idComentario`)
   * ya no pueden operar sobre un comentario de tarea, sin importar autoría o
   * liderazgo. Se lanza el mismo `NotFoundException` que usa la ausencia real
   * del comentario, para que un comentario de tarea sea indistinguible de uno
   * inexistente en el canal genérico. La única vía válida para un comentario
   * de tarea es la ruta anidada (`updateForTask`/`removeForTask`).
   */
  private assertNotTaskComment(comentario: { idTarea: number | null }): void {
    if (comentario.idTarea !== null) {
      throw new NotFoundException('Comentario no encontrado');
    }
  }

  /**
   * C036: PATCH genérico del canal A. La identidad (comentario → proyecto) se
   * resuelve fuera del lock; existencia, no-tarea, autoría, autorización del
   * canal y política se reejecutan dentro del `run` antes de escribir.
   */
  async update(idComentario: number, userId: number, dto: UpdateComentarioDto) {
    const { idProyecto } = await this.loadChannelAComment(idComentario, userId, 'editar');

    const { actualizado, idHito, nuevos } = await this.projectTx.run(
      idProyecto,
      userId,
      'comentarios.update',
      async (ctx) => {
        const { tx } = ctx;
        const { comentario } = await this.loadChannelAComment(idComentario, userId, 'editar', tx);
        await this.assertChannelAWriteAllowed(idProyecto, userId, tx);
        await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'COMENTARIO_PROYECTO_HITO', userId);
        const menciones = await this.prepararMenciones(tx, idProyecto, dto.contenido);
        const actualizado = await tx.comentario.update({
          where: { idComentario },
          data: { contenido: menciones.contenido, editadoEn: new Date() },
        });
        const nuevos = await this.sincronizarMenciones(tx, idComentario, menciones.mencionados, false);
        return { actualizado, idHito: comentario.idHito ?? null, nuevos };
      },
    );

    // HU-200: al editar solo se avisa a quien se agregó en esta edición.
    await this.notificarMenciones(nuevos, userId, idComentario, {
      contexto: idHito === null ? 'PROYECTO' : 'HITO',
      idProyecto,
      idTarea: null,
      idHito,
    });
    return actualizado;
  }

  /** C036: DELETE genérico del canal A (soft delete), mismo orden que `update`. */
  async remove(idComentario: number, userId: number) {
    const { idProyecto } = await this.loadChannelAComment(idComentario, userId, 'eliminar');

    return this.projectTx.run(idProyecto, userId, 'comentarios.remove', async (ctx) => {
      const { tx } = ctx;
      await this.loadChannelAComment(idComentario, userId, 'eliminar', tx);
      await this.assertChannelAWriteAllowed(idProyecto, userId, tx);
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'COMENTARIO_PROYECTO_HITO', userId);
      return tx.comentario.update({
        where: { idComentario },
        data: { eliminadoEn: new Date() },
      });
    });
  }

  /**
   * Carga un comentario del canal genérico y aplica, en este orden, las reglas
   * existentes: existe y no está eliminado → no es comentario de tarea
   * (Tarea 28.B) → solo el autor → proyecto resoluble (propio o del hito).
   */
  private async loadChannelAComment(
    idComentario: number,
    userId: number,
    accion: 'editar' | 'eliminar',
    db: Db = this.prisma,
  ) {
    const comentario = await db.comentario.findUnique({
      where: { idComentario },
      select: {
        idComentario: true,
        idAutor: true,
        eliminadoEn: true,
        idProyecto: true,
        idTarea: true,
        idHito: true,
        hito: { select: { idProyecto: true } },
      },
    });
    if (!comentario || comentario.eliminadoEn) {
      throw new NotFoundException('Comentario no encontrado');
    }
    this.assertNotTaskComment(comentario);
    if (comentario.idAutor !== userId) {
      throw new ForbiddenException(`Solo el autor puede ${accion} este comentario`);
    }

    const idProyecto = comentario.idProyecto ?? comentario.hito?.idProyecto;
    if (!idProyecto) throw new NotFoundException('Proyecto de comentario no encontrado');

    return { comentario, idProyecto };
  }

  /**
   * Actualización contextualizada (Tarea 28). Orden obligatorio: proyecto y
   * tarea válidos → el comentario pertenece exactamente a esa tarea →
   * autorización (misma política real: solo el autor, luego
   * `assertChannelAWriteAllowed`) → escritura. Un comentario de otra tarea,
   * de otro proyecto o de un hito/proyecto nunca llega a la comprobación de
   * autoría: `getComentarioEnTareaOrThrow` ya lo trata como inexistente. C037: todo
   * bajo el `run` del proyecto; tras el lock, el Sprint de la tarea debe
   * estar ACTIVO.
   */
  async updateForTask(
    projectId: number,
    taskId: number,
    commentId: number,
    userId: number,
    dto: UpdateComentarioDto,
  ) {
    const { actualizado, nuevos } = await this.projectTx.run(
      projectId,
      userId,
      'comentarios.updateForTask',
      async (ctx) => {
        const { tx } = ctx;
        const tarea = await this.getTareaEnProyectoOrThrow(projectId, taskId, tx);
        const comentario = await this.getComentarioEnTareaOrThrow(taskId, commentId, tx);

        if (comentario.idAutor !== userId) {
          throw new ForbiddenException('Solo el autor puede editar este comentario');
        }

        await this.assertChannelAWriteAllowed(projectId, userId, tx);
        await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'COMENTARIO_TAREA', userId, {
          sprintId: tarea.idSprint,
        });
        const menciones = await this.prepararMenciones(tx, projectId, dto.contenido);
        const actualizado = await tx.comentario.update({
          where: { idComentario: commentId },
          data: { contenido: menciones.contenido, editadoEn: new Date() },
        });
        const nuevos = await this.sincronizarMenciones(tx, commentId, menciones.mencionados, false);
        return { actualizado, nuevos };
      },
    );

    // HU-200: al editar solo se avisa a quien se agregó en esta edición.
    await this.notificarMenciones(nuevos, userId, commentId, {
      contexto: 'TAREA',
      idProyecto: projectId,
      idTarea: taskId,
      idHito: null,
    });
    return actualizado;
  }

  /**
   * Eliminación contextualizada (Tarea 28): mismo orden y mismo mecanismo
   * real (soft delete vía `eliminadoEn`, nunca borrado físico) que
   * `updateForTask`.
   */
  async removeForTask(projectId: number, taskId: number, commentId: number, userId: number) {
    return this.projectTx.run(projectId, userId, 'comentarios.removeForTask', async (ctx) => {
      const { tx } = ctx;
      const tarea = await this.getTareaEnProyectoOrThrow(projectId, taskId, tx);
      const comentario = await this.getComentarioEnTareaOrThrow(taskId, commentId, tx);

      if (comentario.idAutor !== userId) {
        throw new ForbiddenException('Solo el autor puede eliminar este comentario');
      }

      await this.assertChannelAWriteAllowed(projectId, userId, tx);
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'COMENTARIO_TAREA', userId, {
        sprintId: tarea.idSprint,
      });
      return tx.comentario.update({
        where: { idComentario: commentId },
        data: { eliminadoEn: new Date() },
      });
    });
  }

  private async resolveProjectContext(dto: CreateComentarioDto) {
    if (dto.idProyecto) {
      const proyecto = await this.prisma.proyecto.findUnique({
        where: { idProyecto: dto.idProyecto },
        select: { idProyecto: true },
      });
      if (!proyecto) throw new NotFoundException('Proyecto no encontrado');
      return proyecto;
    }
    if (dto.idHito) {
      const hito = await this.prisma.hito.findUnique({
        where: { idHito: dto.idHito },
        select: { idProyecto: true },
      });
      if (!hito) throw new NotFoundException('Hito no encontrado');
      return { idProyecto: hito.idProyecto };
    }
    throw new BadRequestException('Entidad de comentario inválida');
  }

  private async assertChannelAWriteAllowed(idProyecto: number, userId: number, db: Db = this.prisma) {
    const proyecto = await db.proyecto.findUnique({
      where: { idProyecto },
      select: { estadoProyecto: true, creadoPor: true },
    });
    if (!proyecto) throw new NotFoundException('Proyecto no encontrado');

    if (
      proyecto.estadoProyecto === EstadoProyecto.BORRADOR ||
      proyecto.estadoProyecto === EstadoProyecto.EN_REVISION ||
      proyecto.estadoProyecto === EstadoProyecto.OBSERVADO
    ) {
      if (proyecto.creadoPor !== userId) {
        throw new ForbiddenException('Solo el líder puede comentar en este estado');
      }
      return;
    }

    if (
      proyecto.estadoProyecto === EstadoProyecto.PUBLICADO ||
      proyecto.estadoProyecto === EstadoProyecto.EN_PROGRESO
    ) {
      const participa = await db.participacionProyecto.findFirst({
        where: {
          idUsuario: userId,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto },
        },
        select: { idParticipacion: true },
      });
      if (!participa) {
        throw new ForbiddenException('Debes ser participante activo para comentar');
      }
      return;
    }

    throw new ForbiddenException('El proyecto está en modo solo lectura');
  }
}
