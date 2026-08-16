import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoSprint, EstadoTarea, Prisma, TipoNotificacion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SprintsContextService } from './sprints-context.service';
import { SprintsAuthorizationService } from './sprints-authorization.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdjustRecognizedHoursDto } from './dto/adjust-recognized-hours.dto';

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
