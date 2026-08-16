import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoSprint, EstadoTarea, Prisma, TipoNotificacion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SprintsContextService } from './sprints-context.service';
import { SprintsAuthorizationService } from './sprints-authorization.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdjustRecognizedHoursDto } from './dto/adjust-recognized-hours.dto';
import { SprintClosingSummaryDto, SprintClosingSummaryParticipantDto } from './dto/sprint-closing-summary.dto';

@Injectable()
export class SprintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sprintsContext: SprintsContextService,
    private readonly sprintsAuthorization: SprintsAuthorizationService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Inicia el Sprint manualmente: exclusivo del líder (contrato A1), y solo
   * si el proyecto no tiene ya un Sprint operable (ACTIVO o
   * EN_FINALIZACION) — CERRADO nunca bloquea. Todo ocurre dentro de una
   * transacción: la comprobación de "sin Sprint operable" dentro de la
   * transacción reduce la ventana de carrera, pero la garantía real contra
   * dos inicios concurrentes es el índice único parcial
   * `sprint_operable_unique` (Foundation) sobre (idProyecto) WHERE estado
   * IN (ACTIVO, EN_FINALIZACION): el segundo `create` que intente violarlo
   * recibe P2002, que aquí se traduce a ConflictException en vez de dejar
   * escapar el error crudo de Prisma (mismo patrón que
   * TasksService.createActiveAssignment /
   * ProjectsService.isPendingExitRequestCollision).
   *
   * numero = MAX(numero) + 1 por proyecto (1 si nunca existió un Sprint).
   * No existe un constraint de unicidad de (idProyecto, numero) en
   * Foundation, pero no es necesario: todo `create` de este método fija
   * estado=ACTIVO, así que cualquier segunda inserción concurrente para el
   * mismo proyecto siempre colisiona primero contra
   * `sprint_operable_unique` (single-column, sobre idProyecto) antes de que
   * un posible número duplicado pudiera materializarse en una fila
   * persistida.
   */
  async startSprint(projectId: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.sprintsAuthorization.assertCanStartSprint(projectId, userId, tx);

      const sprintOperable = await this.sprintsContext.getCurrentSprint(projectId, tx);
      if (sprintOperable) {
        throw new ConflictException(
          'Ya existe un Sprint activo o en finalización para este proyecto',
        );
      }

      const ultimoSprint = await tx.sprint.findFirst({
        where: { idProyecto: projectId },
        orderBy: { numero: 'desc' },
        select: { numero: true },
      });
      const siguienteNumero = (ultimoSprint?.numero ?? 0) + 1;

      try {
        return await tx.sprint.create({
          data: {
            idProyecto: projectId,
            numero: siguienteNumero,
            estado: EstadoSprint.ACTIVO,
          },
        });
      } catch (error) {
        if (this.isOperableSprintCollision(error)) {
          throw new ConflictException(
            'Ya existe un Sprint activo o en finalización para este proyecto',
          );
        }
        throw error;
      }
    });
  }

  /**
   * Finaliza el Sprint (ACTIVO -> EN_FINALIZACION): exclusivo del líder
   * (reutiliza SprintsAuthorizationService.assertCanFinalizeSprint, que ya
   * aísla projectId+sprintId — Contrato A1/A3), solo si el Sprint sigue
   * ACTIVO y todas sus tareas (no eliminadas) están HECHO. Toda la
   * validación y la transición ocurren dentro de una única transacción:
   *
   *   autorización -> estado ACTIVO -> tareas no-HECHO -> updateMany
   *   condicionado por estado=ACTIVO -> lectura final
   *
   * La comprobación explícita de `estado === ACTIVO` es un precheck legible
   * (falla rápido con un mensaje claro); la garantía real contra dos
   * finalizaciones concurrentes es el `updateMany` condicionado por
   * `estado: ACTIVO` — si `count === 0`, otra transacción ya ganó la carrera
   * (o el Sprint cambió de estado entre el precheck y este punto) y se
   * traduce a ConflictException sin tocar ninguna fila.
   *
   * La notificación ocurre DESPUÉS de que `$transaction` resuelve (nunca
   * dentro): si la transacción lanza en cualquier paso, el callback de
   * notificación ni siquiera se alcanza, así que un rollback nunca notifica.
   * Se hacen dos llamadas post-commit, ambas reutilizando NotificationsService
   * sin duplicar su lógica de audiencia/rooms: notifyProjectActiveParticipants
   * (bandeja persistida + evento genérico 'notification', mismo mecanismo
   * que ya usa el resto del dominio) y notifySprintFinalizationStarted
   * (extensión mínima de A4: mismo criterio de audiencia, evento realtime
   * específico SPRINT_FINALIZATION_STARTED, sin persistir bandeja
   * duplicada).
   */
  async finalizeSprint(projectId: number, sprintId: number, userId: number) {
    const sprintFinalizado = await this.prisma.$transaction(async (tx) => {
      const sprint = await this.sprintsAuthorization.assertCanFinalizeSprint(
        projectId,
        sprintId,
        userId,
        tx,
      );

      if (sprint.estado !== EstadoSprint.ACTIVO) {
        throw new ConflictException('El Sprint ya no está en estado ACTIVO');
      }

      // Tarea.eliminadoEn: null — mismo filtro de soft delete que el resto
      // del dominio tasks/ ya aplica (TasksContextService.getTaskInProjectOrThrow,
      // TasksService.findAll/findOne): una tarea eliminada no cuenta como
      // pendiente. Un Sprint sin ninguna tarea (0 relevantes) cumple
      // trivialmente "0 tareas no-HECHO" — A4 no introduce una regla de
      // "mínimo una tarea" que Foundation/A1-A3 nunca definieron.
      const tareasPendientes = await tx.tarea.count({
        where: {
          idProyecto: projectId,
          idSprint: sprintId,
          eliminadoEn: null,
          estadoTarea: { not: EstadoTarea.HECHO },
        },
      });
      if (tareasPendientes > 0) {
        throw new ConflictException(
          'No se puede finalizar el Sprint mientras existan tareas pendientes',
        );
      }

      const actualizado = await tx.sprint.updateMany({
        where: {
          idSprint: sprintId,
          idProyecto: projectId,
          estado: EstadoSprint.ACTIVO,
        },
        data: {
          estado: EstadoSprint.EN_FINALIZACION,
          fechaFinalizacionIniciada: new Date(),
        },
      });

      if (actualizado.count === 0) {
        throw new ConflictException('El Sprint ya no está en estado ACTIVO');
      }

      const filaFinal = await tx.sprint.findFirst({
        where: { idSprint: sprintId, idProyecto: projectId },
      });
      if (!filaFinal) {
        throw new Error(
          `No se pudo leer el Sprint con id ${sprintId} recién finalizado dentro de la transacción`,
        );
      }

      return filaFinal;
    });

    await this.notificationsService.notifyProjectActiveParticipants(projectId, userId, {
      tipoNotificacion: TipoNotificacion.CAMBIO_ESTADO_PROYECTO,
      tituloNotificacion: 'Sprint en finalización',
      mensajeNotificacion: `El Sprint #${sprintFinalizado.numero} entró en finalización.`,
      datosJson: { projectId, sprintId },
    });

    await this.notificationsService.notifySprintFinalizationStarted(projectId, userId, {
      projectId,
      sprintId,
    });

    return sprintFinalizado;
  }

  /**
   * A7: ajusta/aprueba el registro de reconocimiento de horas ya existente
   * (HorasParticipacion) para una participación dentro de un Sprint —
   * `horasCalculadas` (persistido por A5/proceso de cálculo previo) es la
   * única fuente de comparación; A7 nunca la recalcula ni toca
   * AsignacionTarea.horasReales.
   *
   * Aislamiento cross-project: la búsqueda exige simultáneamente
   * idParticipacion + idSprint (ya validado contra projectId por
   * `assertCanAdjustRecognizedHours` vía `getSprintInProjectOrThrow`) +
   * participacion.rolProyecto.idProyecto === projectId, para no confiar
   * únicamente en participacionId como identificador.
   *
   * La comparación usa Prisma.Decimal.equals (no floating point) porque
   * horasCalculadas/horasAprobadas son columnas Decimal(6,2).
   *
   * `horasCalculadas === null` (A7.1) nunca se trata como 0: A7 ajusta un
   * cálculo ya persistido, no lo inventa. Sin una base de cálculo real
   * todavía no hay nada que aprobar, así que se rechaza con
   * BadRequestException en vez de asumir silenciosamente un 0 que
   * permitiría "aprobar" horas sobre un reconocimiento inexistente.
   */
  async adjustRecognizedHours(
    projectId: number,
    sprintId: number,
    participationId: number,
    userId: number,
    dto: AdjustRecognizedHoursDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.sprintsAuthorization.assertCanAdjustRecognizedHours(projectId, sprintId, userId, tx);

      const registro = await tx.horasParticipacion.findFirst({
        where: {
          idParticipacion: participationId,
          idSprint: sprintId,
          participacion: { rolProyecto: { idProyecto: projectId } },
        },
      });
      if (!registro) {
        throw new NotFoundException(
          `No existe un registro de horas para la participación ${participationId} en el Sprint ${sprintId} del proyecto ${projectId}`,
        );
      }

      if (registro.horasCalculadas === null) {
        throw new BadRequestException(
          'No hay horas calculadas disponibles para ajustar en este registro',
        );
      }

      const horasCalculadas = registro.horasCalculadas;
      const horasAprobadas = new Prisma.Decimal(dto.horasAprobadas);
      const requiereJustificacion = !horasAprobadas.equals(horasCalculadas);

      if (requiereJustificacion && !dto.justificacionAjuste?.trim()) {
        throw new BadRequestException(
          'justificacionAjuste es obligatoria cuando horasAprobadas difiere de horasCalculadas',
        );
      }

      return tx.horasParticipacion.update({
        where: { idRegistroHoras: registro.idRegistroHoras },
        data: {
          horasAprobadas: dto.horasAprobadas,
          justificacionAjuste: dto.justificacionAjuste?.trim() ?? null,
        },
      });
    });
  }

  /**
   * A8: read-model de revisión/finalización de horas del Sprint
   * (SprintClosingSummary), person-centric — cada participante aparece una
   * única vez sin importar cuántos roles tenga en el proyecto (mismo
   * invariante que ProjectsService.getTeamSummary /
   * TeamSummaryMemberDto). Puramente de lectura: nunca recalcula horas
   * (A5), nunca invoca `adjustRecognizedHours` (A7), nunca toca
   * `AsignacionTarea.horasReales` ni marca tramos como reconocidos.
   *
   * Presupuesto de ≤2 queries por invocación, independiente del número de
   * participantes:
   *   1) `assertCanViewClosingSummary` (Sprint+Proyecto+liderazgo en una
   *      sola consulta vía `getSprintWithProjectOrThrow`) — aísla
   *      projectId+sprintId y rechaza con NotFoundException/ForbiddenException
   *      ANTES de agregar nada.
   *   2) una única consulta SQL agregada (`$queryRaw` con CTEs) que resuelve
   *      participantes+roles+tareas+horas de una vez — nunca un loop en
   *      JavaScript que consulte persona por persona.
   *
   * Estrategia de agregación (evita duplicación por JOIN):
   *   - `participantes`: UNION de usuarios con asignación en una tarea del
   *     Sprint y usuarios con HorasParticipacion de este Sprint — ambos
   *     acotados a projectId+sprintId, nunca solo sprintId.
   *   - `tareas_por_usuario`: COUNT(DISTINCT id_tarea) — identidad de Tarea,
   *     nunca cantidad de filas de AsignacionTarea (varios tramos históricos
   *     de la misma tarea cuentan una sola vez).
   *   - `horas_por_usuario`: SUM por usuario sobre HorasParticipacion
   *     filtrado a idSprint — si el usuario tiene varias ParticipacionProyecto
   *     (multirol) en el proyecto, cada una aporta a lo sumo una fila de
   *     HorasParticipacion para este Sprint (invariante de A7.1, índice
   *     único parcial `horas_participacion_sprint_unique`), así que el SUM
   *     nunca duplica horas por rol.
   *   - `roles_por_usuario`: `json_agg(DISTINCT ...)` sobre
   *     ParticipacionProyecto/RolProyecto acotado a idProyecto — produce el
   *     array de roles sin duplicar al participante.
   * Los tres CTE se combinan con LEFT JOIN sobre `participantes` (1 fila por
   * usuario), así que el resultado final tiene exactamente 1 fila por
   * participante sin importar cuántos roles/tareas/registros de horas tenga.
   */
  async getSprintClosingSummary(
    projectId: number,
    sprintId: number,
    userId: number,
  ): Promise<SprintClosingSummaryDto> {
    await this.sprintsAuthorization.assertCanViewClosingSummary(projectId, sprintId, userId);

    const participantes = await this.prisma.$queryRaw<SprintClosingSummaryParticipantDto[]>(Prisma.sql`
      WITH participantes AS (
        SELECT DISTINCT at.id_usuario AS id_usuario
        FROM asignacion_tarea at
        JOIN tarea t ON t.id_tarea = at.id_tarea
        WHERE t.id_proyecto = ${projectId} AND t.id_sprint = ${sprintId}
        UNION
        SELECT DISTINCT pp.id_usuario AS id_usuario
        FROM horas_participacion hp
        JOIN participacion_proyecto pp ON pp.id_participacion = hp.id_participacion
        JOIN rol_proyecto rp ON rp.id_rol_proyecto = pp.id_rol_proyecto
        WHERE hp.id_sprint = ${sprintId} AND rp.id_proyecto = ${projectId}
      ),
      tareas_por_usuario AS (
        SELECT at.id_usuario AS id_usuario, COUNT(DISTINCT at.id_tarea)::int AS tareas_realizadas
        FROM asignacion_tarea at
        JOIN tarea t ON t.id_tarea = at.id_tarea
        WHERE t.id_proyecto = ${projectId} AND t.id_sprint = ${sprintId}
        GROUP BY at.id_usuario
      ),
      horas_por_usuario AS (
        SELECT pp.id_usuario AS id_usuario,
               COALESCE(SUM(hp.horas_reportadas), 0)::float8 AS horas_reportadas,
               COALESCE(SUM(hp.horas_calculadas), 0)::float8 AS horas_calculadas,
               COALESCE(SUM(hp.horas_aprobadas), 0)::float8 AS horas_aprobadas
        FROM horas_participacion hp
        JOIN participacion_proyecto pp ON pp.id_participacion = hp.id_participacion
        JOIN rol_proyecto rp ON rp.id_rol_proyecto = pp.id_rol_proyecto
        WHERE hp.id_sprint = ${sprintId} AND rp.id_proyecto = ${projectId}
        GROUP BY pp.id_usuario
      ),
      roles_por_usuario AS (
        SELECT pp.id_usuario AS id_usuario,
               json_agg(DISTINCT jsonb_build_object('idRolProyecto', rp.id_rol_proyecto, 'nombreRol', rp.nombre_rol)) AS roles
        FROM participacion_proyecto pp
        JOIN rol_proyecto rp ON rp.id_rol_proyecto = pp.id_rol_proyecto
        WHERE rp.id_proyecto = ${projectId}
          AND pp.id_usuario IN (SELECT id_usuario FROM participantes)
        GROUP BY pp.id_usuario
      )
      SELECT
        u.id_usuario AS "idUsuario",
        u.nombre AS "nombre",
        u.apellido AS "apellido",
        u.correo AS "correo",
        u.foto_url AS "fotoUrl",
        COALESCE(rpu.roles, '[]'::json) AS "roles",
        COALESCE(tpu.tareas_realizadas, 0) AS "tareasRealizadas",
        COALESCE(hpu.horas_reportadas, 0) AS "horasReportadas",
        COALESCE(hpu.horas_calculadas, 0) AS "horasCalculadas",
        COALESCE(hpu.horas_aprobadas, 0) AS "horasAprobadas"
      FROM participantes p
      JOIN usuario u ON u.id_usuario = p.id_usuario
      LEFT JOIN tareas_por_usuario tpu ON tpu.id_usuario = p.id_usuario
      LEFT JOIN horas_por_usuario hpu ON hpu.id_usuario = p.id_usuario
      LEFT JOIN roles_por_usuario rpu ON rpu.id_usuario = p.id_usuario
      ORDER BY u.apellido, u.nombre, u.id_usuario
    `);

    return { idProyecto: projectId, idSprint: sprintId, participantes };
  }

  /**
   * Reconoce específicamente la violación del índice parcial
   * `sprint_operable_unique` (idProyecto), mismo criterio estrecho que
   * TasksService.isActiveAssignmentCollision: no basta `code === 'P2002'`,
   * se exige además modelo Sprint y target exactamente ['id_proyecto'].
   * Cualquier otro P2002 (u otro código) se relanza sin cambios.
   */
  private isOperableSprintCollision(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }
    if (error.code !== 'P2002') {
      return false;
    }

    const modelName = error.meta?.modelName;
    const target = error.meta?.target;

    return (
      modelName === 'Sprint' &&
      Array.isArray(target) &&
      target.length === 1 &&
      target[0] === 'id_proyecto'
    );
  }
}
