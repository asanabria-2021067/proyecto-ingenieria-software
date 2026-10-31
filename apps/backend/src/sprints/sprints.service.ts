import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DestinoArrastre, EstadoSprint, EstadoTarea, Prisma, TipoNotificacion } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { INSIGNIAS_EVENTO } from '../insignias/insignias.catalog';
import { PrismaService } from '../prisma/prisma.service';
import { SprintsContextService } from './sprints-context.service';
import { SprintsAuthorizationService } from './sprints-authorization.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  SprintClosingBlockerDto,
  SprintClosingMemberTotalsDto,
  SprintClosingSummaryDto,
  SprintClosingSummaryParticipantDto,
  SprintClosingTramoDto,
} from './dto/sprint-closing-summary.dto';
import {
  SprintDetailDto,
  SprintListItemDto,
} from './dto/sprint-history.dto';
import {
  SprintAnalyticsDto,
  SprintComparativeAnalyticsDto,
} from './dto/sprint-analytics.dto';
import { SprintBurndownDto } from './dto/sprint-burndown.dto';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import {
  ProjectTransactionService,
  type ProjectLockRow,
  type ProjectTransactionContext,
} from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { ProjectHoursSummaryService } from './project-hours-summary.service';
import { HoursRecognitionService } from './hours-recognition.service';
import { SprintSnapshotsService } from './sprint-snapshots.service';
import { SprintsReadService } from './sprints-read.service';

/**
 * C045 (06 v2 §32/§41 E060–E062): iniciar, finalizar y cerrar un Sprint
 * corren en el runner por proyecto. La policy restringe el inicio a un
 * proyecto P/E sin Sprint operable, y finalizar/cerrar al Sprint exacto en
 * `ACTIVO`/`EN_FINALIZACION`; el cuerpo de consolidación de `closeSprint` se
 * conserva tal cual hasta su propio commit.
 */
/** Participante que aparece por su agregado pero no tiene tramos en el Sprint. */
const SIN_TRAMOS: SprintClosingMemberTotalsDto = {
  tareasDistintas: 0,
  estimacionAsociada: null,
  reportadas: '0.00',
  legacy: '0.00',
  exceso: '0.00',
  propuestas: '0.00',
  filasPendientes: 0,
  filasConsumidas: 0,
  tramos: [],
};

@Injectable()
export class SprintsService {
  private readonly read: SprintsReadService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sprintsContext: SprintsContextService,
    private readonly sprintsAuthorization: SprintsAuthorizationService,
    private readonly notificationsService: NotificationsService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    // C046 (06 v2 §34): alcance por actor de los lectores de Sprint.
    private readonly readPolicy: ProjectReadPolicyService,
    // T-164: opcional por el mismo motivo que TasksService.bitacoraEventos —
    // las suites existentes construyen SprintsService directamente con 4
    // argumentos posicionales; en producción SprintsModule siempre lo provee.
    private readonly bitacoraEventos?: BitacoraEventosService,
    // C079 (§40): el detalle por integrante lo compone el proveedor de
    // agregación de horas; Sprints solo decide quién puede leerlo.
    private readonly projectHours?: ProjectHoursSummaryService,
    // C080 (§12): el reconocimiento por participación vive en su propio
    // servicio; `closeSprint` solo lo ORQUESTA y es el único que cambia el
    // estado del Sprint.
    private readonly recognition?: HoursRecognitionService,
    // T-238 (HU-160): la instantánea diaria vive en su propio servicio;
    // Sprints solo decide quién puede pedir la regeneración manual de hoy.
    private readonly snapshots?: SprintSnapshotsService,
    // HU-190: opcional (suites con argumentos posicionales).
    private readonly events?: EventEmitter2,
    // RTF-3.3: opcional porque las suites construyen SprintsService con
    // argumentos posicionales; en producción SprintsModule lo provee.
    read?: SprintsReadService,
  ) {
    this.read = read ?? new SprintsReadService(prisma, sprintsContext, sprintsAuthorization, readPolicy);
  }

  /**
   * C075 (06 v2 §12): las cuatro revalidaciones de finalización, siempre bajo
   * el lock y siempre sobre el conjunto HISTÓRICO. El detalle importa:
   *
   *   F1 — toda tarea marcada HECHO tiene traza: un HECHO sin ninguna
   *        asignación histórica no es trabajo realizado, es una casilla
   *        marcada. Desde HU-148/HU-160 ya NO exige que todas las tareas
   *        estén HECHO — cerrar con pendientes es válido (ver comentario
   *        junto al filtro `sinTraza`).
   *   F2 — NINGUNA asignación del Sprint sigue abierta, **incluidas las de
   *        tareas eliminadas**: borrar la tarea no cierra el tramo, y un
   *        tramo abierto al consolidar dejaría horas fuera del corte.
   *   F3 — toda asignación con horas tiene participación resuelta y origen
   *        determinado: sin eso no se sabe a quién ni bajo qué rol acreditar.
   *   F4 — las cachés granulares coinciden con el SUM efectivo.
   *
   * La normalización de tramos cerrados sin registros corre entre F2 y F3:
   * después de saber que nada sigue abierto y antes de contrastar atribución
   * y cuadre, para que ambos vean el estado definitivo y no uno donde una
   * caché NULL se escapa del contraste.
   *
   * Devuelve los conteos satisfechos para que la bitácora deje constancia de
   * QUÉ se revalidó, no solo de que se revalidó.
   */
  private async assertFinalizationPredicatesTx(
    tx: Prisma.TransactionClient,
    projectId: number,
    sprintId: number,
  ): Promise<{ f1: number; f2: number; f3: number; f4: number }> {
    const tareas = await tx.tarea.findMany({
      where: { idProyecto: projectId, idSprint: sprintId, eliminadoEn: null },
      select: { idTarea: true, estadoTarea: true, _count: { select: { asignaciones: true } } },
    });
    // HU-148 (mini, vía HU-160): aquí existía un bloqueo
    // (SPRINT_F1_TAREAS_PENDIENTES) que impedía finalizar/cerrar el Sprint si
    // quedaba alguna tarea no HECHO. Se quita a propósito: cerrar con
    // pendientes es lo que permite que el cumplimiento congelado (T-239)
    // refleje arrastre real en vez de ser 100% por construcción. Una tarea
    // pendiente de un Sprint cerrado se queda registrada contra ESE Sprint —
    // no hay arrastre automático a un Sprint siguiente, eso es explícitamente
    // otro alcance.
    //
    // Como consecuencia, `tareas` ya NO está garantizado HECHO en su
    // totalidad (ese bloqueo era justamente lo que lo garantizaba) — este
    // predicado filtra explícitamente por HECHO para no acusar de "sin traza"
    // a una tarea pendiente que legítimamente nadie tomó todavía.
    const sinTraza = tareas.filter(
      (tarea) => tarea.estadoTarea === EstadoTarea.HECHO && tarea._count.asignaciones === 0,
    );
    if (sinTraza.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        code: 'SPRINT_F1_HECHO_SIN_TRAZA',
        message: 'Hay tareas marcadas como HECHO sin ninguna asignación histórica',
        idsTarea: sinTraza.map((tarea) => tarea.idTarea),
      });
    }

    // F2: SIN filtro de `eliminadoEn` — ese es exactamente el caso que se
    // escapaba y el que este predicado existe para atrapar.
    const abiertas = await tx.asignacionTarea.findMany({
      where: { desasignadaEn: null, tarea: { idProyecto: projectId, idSprint: sprintId } },
      select: { idAsignacion: true, idTarea: true },
    });
    if (abiertas.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        code: 'SPRINT_F2_ASIGNACIONES_ABIERTAS',
        message: 'No se puede finalizar el Sprint mientras existan asignaciones abiertas',
        idsAsignacion: abiertas.map((fila) => fila.idAsignacion),
        idsTarea: [...new Set(abiertas.map((fila) => fila.idTarea))],
      });
    }

    // La normalización precede a F3 y F4: materializa a 0 los tramos cerrados
    // granulares sin registros para que ambos predicados evalúen el estado
    // definitivo, y no uno en el que una caché NULL se escapa del contraste.
    // C155 (§39/§48): la normalización previa vive en el servicio de
    // reconocimiento, que Sprints YA compone. Sprints sigue sin calcular ni
    // escribir `horasReales` por su cuenta: delega con su propio `tx`.
    await this.recognition?.normalizeClosedGranularTx(tx, { projectId, sprintId });

    const conHoras = await tx.asignacionTarea.findMany({
      where: { horasReales: { not: null }, tarea: { idProyecto: projectId, idSprint: sprintId } },
      select: { idAsignacion: true, idParticipacion: true, origenReporte: true },
    });
    // §22: los dos motivos de F3 son diagnósticos DISTINTOS y se informan por
    // separado, siempre citando los tramos exactos: un impedimento que no dice
    // cuál fila lo causa obliga al líder a adivinar dónde está el problema.
    const sinParticipacion = conHoras.filter((fila) => fila.idParticipacion === null);
    if (sinParticipacion.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        code: 'TRAMOS_SIN_PARTICIPACION',
        message: 'Hay tramos con horas sin participación resuelta',
        idsAsignacion: sinParticipacion.map((fila) => fila.idAsignacion),
      });
    }
    const sinConciliar = conHoras.filter((fila) => fila.origenReporte === 'POR_CONCILIAR');
    if (sinConciliar.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        code: 'ORIGEN_SIN_CONCILIAR',
        message: 'Hay tramos con horas cuyo origen todavía no está conciliado',
        idsAsignacion: sinConciliar.map((fila) => fila.idAsignacion),
      });
    }

    const granulares = await tx.asignacionTarea.findMany({
      where: {
        origenReporte: 'GRANULAR',
        reconocidoEn: null,
        tarea: { idProyecto: projectId, idSprint: sprintId },
      },
      select: {
        idAsignacion: true,
        horasReales: true,
        registrosTiempo: { where: { revocadoEn: null }, select: { horas: true } },
      },
    });
    const descuadradas = granulares.filter((tramo) => {
      const suma = tramo.registrosTiempo.reduce(
        (acc, fila) => acc.plus(fila.horas),
        new Prisma.Decimal(0),
      );
      return tramo.horasReales === null || !tramo.horasReales.equals(suma);
    });
    if (descuadradas.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        code: 'SPRINT_F4_CACHE_DESCUADRADA',
        message: 'Hay cachés granulares que no coinciden con la suma efectiva de registros',
        idsAsignacion: descuadradas.map((tramo) => tramo.idAsignacion),
      });
    }

    return { f1: tareas.length, f2: abiertas.length, f3: conHoras.length, f4: granulares.length };
  }

  private lockedProject(ctx: Pick<ProjectTransactionContext, 'project'>): ProjectLockRow {
    if (!ctx.project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return ctx.project;
  }

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
  async startSprint(projectId: number, userId: number, fechaFinPlaneada: string) {
    return this.projectTx.run(projectId, userId, 'sprints.startSprint', async (ctx) => {
      const { tx } = ctx;
      await this.sprintsAuthorization.assertCanStartSprint(projectId, userId, tx);
      // C045: además del liderazgo, el proyecto debe estar en P/E y no tener
      // ningún Sprint operable; iniciar en B/R/O/C deja de aceptarse.
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'SPRINT_START', userId);

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

      // `fechaInicio` la fija el servidor: el Sprint nace ACTIVO en este
      // mismo `create`, así que no existe un inicio distinto de "ahora".
      // `fechaFinPlaneada` llega ya validada por `StartSprintDto`
      // (YYYY-MM-DD, posterior a hoy, tope de 90 días) y se ancla a
      // medianoche UTC, que es como Prisma lee y escribe `@db.Date`. Es la
      // fecha esperada de fin del trabajo, no el cierre: ese sigue siendo el
      // flujo Finalizar -> Cerrar, y ningún otro método la vuelve a escribir.
      const fechaInicio = new Date();
      const fechaFinPlaneadaResuelta = new Date(`${fechaFinPlaneada}T00:00:00.000Z`);

      let sprintCreado;
      try {
        sprintCreado = await tx.sprint.create({
          data: {
            idProyecto: projectId,
            numero: siguienteNumero,
            estado: EstadoSprint.ACTIVO,
            fechaInicio,
            fechaFinPlaneada: fechaFinPlaneadaResuelta,
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

      // T-164: mismo tx que la creación del Sprint — un fallo posterior en
      // esta transacción revierte también el evento (sin eventos huérfanos).
      await this.bitacoraEventos?.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.SPRINT_STARTED,
        idActor: userId,
        idProyecto: projectId,
        idSprint: sprintCreado.idSprint,
        tipoEntidad: 'SPRINT',
        idEntidad: sprintCreado.idSprint,
        // El plan inicial queda en la bitácora: `fechaFinPlaneada` no se
        // puede cambiar después, así que este evento es su registro de origen.
        // Instante ISO para el inicio y día calendario para el plan, igual
        // que sus columnas (timestamp y DATE).
        valorNuevo: {
          numero: sprintCreado.numero,
          fechaInicio: fechaInicio.toISOString(),
          fechaFinPlaneada,
        },
      });

      await tx.tarea.updateMany({
        where: {
          idProyecto: projectId,
          idSprint: null,
          destinoArrastre: DestinoArrastre.SIGUIENTE_SPRINT,
          eliminadoEn: null,
        },
        data: {
          idSprint: sprintCreado.idSprint,
          destinoArrastre: null,
        },
      });

      return sprintCreado;
    });
  }

  /**
   * T-238 (HU-160): regenera la instantánea de HOY del Sprint (exclusivo del
   * líder). Nunca puede tocar una fecha pasada — `SprintSnapshotsService`
   * siempre calcula la fecha internamente como "hoy", nunca la recibe de
   * este método ni del llamador. Fuera de transacción: es una lectura del
   * estado actual seguida de un upsert idempotente, no una transición de
   * estado del Sprint.
   */
  async regenerarInstantaneaDeHoy(projectId: number, sprintId: number, userId: number) {
    const sprint = await this.sprintsAuthorization.assertCanManageSprintSnapshot(projectId, sprintId, userId);
    // La historia de un Sprint cerrado está congelada: agregarle un punto de hoy reescribe su burndown.
    if (sprint.estado === EstadoSprint.CERRADO) {
      throw new ConflictException('El Sprint está cerrado: su instantánea ya no se regenera');
    }
    if (!this.snapshots) {
      throw new Error('SprintSnapshotsService no está disponible');
    }
    return this.snapshots.generarInstantaneaDelDia(sprintId);
  }

  /**
   * Finaliza el Sprint (ACTIVO -> EN_FINALIZACION): exclusivo del líder
   * (reutiliza SprintsAuthorizationService.assertCanFinalizeSprint, que ya
   * aísla projectId+sprintId — Contrato A1/A3), solo si el Sprint sigue
   * ACTIVO. Desde HU-148/HU-160 ya NO exige que todas las tareas estén
   * HECHO — cerrar con pendientes es válido (ver `assertFinalizationPredicatesTx`).
   * Toda la validación y la transición ocurren dentro de una única transacción:
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
    const sprintFinalizado = await this.projectTx.run(
      projectId,
      userId,
      'sprints.finalizeSprint',
      async (ctx) => {
      const { tx } = ctx;
      const sprint = await this.sprintsAuthorization.assertCanFinalizeSprint(
        projectId,
        sprintId,
        userId,
        tx,
      );
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'SPRINT_FINALIZE', userId, {
        sprintId,
      });

      if (sprint.estado !== EstadoSprint.ACTIVO) {
        throw new ConflictException('El Sprint ya no está en estado ACTIVO');
      }

      // C075 (§12): las cuatro revalidaciones completas, no solo el conteo de
      // tareas pendientes. Cualquiera que falle aborta con cero escrituras.
      const predicados = await this.assertFinalizationPredicatesTx(tx, projectId, sprintId);

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

      // El actor queda en la bitácora: `Sprint` no tiene columna de
      // «finalizado por» y este commit no introduce migraciones. La fila
      // guarda la FECHA; el evento guarda QUIÉN y QUÉ se revalidó.
      await this.bitacoraEventos?.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.SPRINT_FINALIZED,
        idActor: userId,
        idProyecto: projectId,
        idSprint: sprintId,
        tipoEntidad: 'SPRINT',
        idEntidad: sprintId,
        valorAnterior: { estado: EstadoSprint.ACTIVO },
        valorNuevo: {
          estado: EstadoSprint.EN_FINALIZACION,
          fechaFinalizacionIniciada: filaFinal.fechaFinalizacionIniciada?.toISOString() ?? null,
          predicados,
        },
      });

      return filaFinal;
      },
    );

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
   * A8: read-model de revisión/finalización de horas del Sprint
   * (SprintClosingSummary), person-centric — cada participante aparece una
   * única vez sin importar cuántos roles tenga en el proyecto (mismo
   * invariante que ProjectsService.getTeamSummary /
   * TeamSummaryMemberDto). Puramente de lectura: nunca recalcula horas
   * (A5), nunca escribe el agregado de horas, nunca toca
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
    // C046 (§41 E066): resumen de cierre — solo el líder actual mientras el
    // Sprint no esté cerrado.
    await this.readPolicy.assertRead(undefined, {
      projectId,
      actorId: userId,
      scope: 'sprints',
      entitySprintId: sprintId,
    });
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
      ),
      -- A8.1: desglose por ParticipacionProyecto individual, necesario para
      -- que F5 pueda emitir PATCH .../horas/:participacionId (A7) por cada
      -- rol de un participante multirol. Mismo filtro projectId+sprintId que
      -- horas_por_usuario (nunca solo sprintId) -- cada idParticipacion
      -- aporta a lo sumo una fila por Sprint (indice unico parcial
      -- horas_participacion_sprint_unique, A7.1), asi que este json_agg
      -- nunca duplica una participacion. Los totales person-centric de mas
      -- abajo (horas_por_usuario) siguen siendo la fuente de los campos
      -- agregados existentes -- este CTE es aditivo, no los reemplaza.
      participaciones_por_usuario AS (
        SELECT pp.id_usuario AS id_usuario,
               json_agg(
                 jsonb_build_object(
                   'idParticipacion', hp.id_participacion,
                   'idRolProyecto', rp.id_rol_proyecto,
                   'nombreRol', rp.nombre_rol,
                   'horasReportadas', hp.horas_reportadas::float8,
                   'horasCalculadas', hp.horas_calculadas::float8,
                   'horasAprobadas', hp.horas_aprobadas::float8,
                   'justificacionAjuste', hp.justificacion_ajuste
                 )
                 ORDER BY rp.nombre_rol, hp.id_participacion
               ) AS participaciones
        FROM horas_participacion hp
        JOIN participacion_proyecto pp ON pp.id_participacion = hp.id_participacion
        JOIN rol_proyecto rp ON rp.id_rol_proyecto = pp.id_rol_proyecto
        WHERE hp.id_sprint = ${sprintId} AND rp.id_proyecto = ${projectId}
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
        COALESCE(hpu.horas_aprobadas, 0) AS "horasAprobadas",
        COALESCE(ppu.participaciones, '[]'::json) AS "participaciones"
      FROM participantes p
      JOIN usuario u ON u.id_usuario = p.id_usuario
      LEFT JOIN tareas_por_usuario tpu ON tpu.id_usuario = p.id_usuario
      LEFT JOIN horas_por_usuario hpu ON hpu.id_usuario = p.id_usuario
      LEFT JOIN roles_por_usuario rpu ON rpu.id_usuario = p.id_usuario
      LEFT JOIN participaciones_por_usuario ppu ON ppu.id_usuario = p.id_usuario
      ORDER BY u.apellido, u.nombre, u.id_usuario
    `);

    // C079 (§46): el desglose por tramos y ajustes se compone APARTE de la
    // consulta de HU-D1, que no cambia. Así el contrato anterior se conserva
    // intacto y lo nuevo se añade encima en vez de reescribirlo.
    const { totalesPorUsuario, blockers, estadoSprint } = await this.buildClosingBreakdown(
      projectId,
      sprintId,
    );

    return {
      idProyecto: projectId,
      idSprint: sprintId,
      estadoSprint,
      participantes: participantes.map((participante) => ({
        ...participante,
        totales: totalesPorUsuario.get(participante.idUsuario) ?? SIN_TRAMOS,
      })),
      blockers,
    };
  }

  /**
   * C079 (06 v2 §22/§46): composición del desglose de cierre. Es LECTURA pura
   * — no recalcula ni escribe nada — y mantiene separadas las cuatro capas que
   * §16 no considera intercambiables: reportado, legacy, ajustado y propuesto.
   *
   * Los blockers se devuelven con sus identificadores porque un impedimento
   * sin decir CUÁL fila lo causa obliga al líder a adivinar.
   */
  private async buildClosingBreakdown(projectId: number, sprintId: number) {
    const [sprint, tramos] = await Promise.all([
      this.prisma.sprint.findUnique({ where: { idSprint: sprintId }, select: { estado: true } }),
      this.prisma.asignacionTarea.findMany({
        // Sin filtro de `eliminadoEn` (§15/§22): el conjunto histórico incluye
        // los tramos de tareas eliminadas, que también deben consolidarse.
        where: { tarea: { idProyecto: projectId, idSprint: sprintId } },
        orderBy: { idAsignacion: 'asc' },
        select: {
          idAsignacion: true,
          idTarea: true,
          idUsuario: true,
          idParticipacion: true,
          desasignadaEn: true,
          origenReporte: true,
          horasReales: true,
          reconocidoEn: true,
          tarea: { select: { tituloTarea: true, eliminadoEn: true, tiempoEstimadoHoras: true } },
          registrosTiempo: { where: { revocadoEn: null }, select: { horas: true, justificacionExceso: true } },
          ajustes: { where: { anuladoEn: null }, select: { horasBase: true, deltaHoras: true, justificacion: true } },
        },
      }),
    ]);

    const cero = new Prisma.Decimal(0);
    const totalesPorUsuario = new Map<number, SprintClosingMemberTotalsDto>();
    const acumulado = new Map<number, {
      reportadas: Prisma.Decimal; legacy: Prisma.Decimal; propuestas: Prisma.Decimal;
      tareas: Map<number, number | null>; pendientes: number; consumidas: number;
      tramos: SprintClosingTramoDto[];
    }>();
    const sinParticipacion: number[] = [];
    const sinConsolidar: number[] = [];
    const basesDesactualizadas: number[] = [];

    for (const tramo of tramos) {
      const cache = tramo.horasReales ?? cero;
      const granulares = tramo.registrosTiempo.reduce((acc, fila) => acc.plus(fila.horas), cero);
      // Sobreestimación DEL TRAMO: lo reportado por encima de la estimación de
      // su tarea. Sin estimación no hay exceso que medir (no es cero: es que la
      // pregunta no aplica), y por eso `estimacionTarea` viaja tal cual.
      const estimacionTarea = tramo.tarea.tiempoEstimadoHoras;
      const excesoTramo =
        estimacionTarea === null ? cero : Prisma.Decimal.max(granulares.minus(estimacionTarea), 0);
      // El estudiante justifica su propio exceso al registrar las horas; un
      // tramo puede tener varios registros, así que se conservan todas.
      const justificacionesExceso = tramo.registrosTiempo
        .map((fila) => fila.justificacionExceso?.trim())
        .filter((texto): texto is string => !!texto);
      const legacyTramo = tramo.origenReporte === 'LEGACY' ? cache : cero;
      const vigente = tramo.ajustes[0] ?? null;
      if (vigente && !vigente.horasBase.equals(cache)) {
        basesDesactualizadas.push(tramo.idAsignacion);
      }
      if (tramo.idParticipacion === null) {
        sinParticipacion.push(tramo.idAsignacion);
      }
      if (tramo.reconocidoEn === null && tramo.desasignadaEn !== null && tramo.horasReales !== null) {
        sinConsolidar.push(tramo.idAsignacion);
      }

      const fila = acumulado.get(tramo.idUsuario) ?? {
        reportadas: cero, legacy: cero, propuestas: cero,
        tareas: new Map<number, number | null>(), pendientes: 0, consumidas: 0,
        tramos: [] as SprintClosingTramoDto[],
      };
      fila.reportadas = fila.reportadas.plus(granulares);
      fila.legacy = fila.legacy.plus(legacyTramo);
      fila.propuestas = fila.propuestas.plus(cache).plus(vigente?.deltaHoras ?? cero);
      fila.tareas.set(tramo.idTarea, tramo.tarea.tiempoEstimadoHoras);
      if (tramo.reconocidoEn === null) fila.pendientes += 1; else fila.consumidas += 1;
      fila.tramos.push({
        idAsignacion: tramo.idAsignacion,
        idTarea: tramo.idTarea,
        tituloTarea: tramo.tarea.tituloTarea,
        tareaEliminada: tramo.tarea.eliminadoEn !== null,
        idParticipacion: tramo.idParticipacion,
        abierto: tramo.desasignadaEn === null,
        origen: tramo.origenReporte,
        reportadas: granulares.toFixed(2),
        estimacionTarea,
        exceso: excesoTramo.toFixed(2),
        justificacionExceso: justificacionesExceso.length > 0 ? justificacionesExceso.join(' · ') : null,
        ajuste: vigente ? vigente.deltaHoras.toFixed(2) : null,
        justificacionAjuste: vigente?.justificacion ?? null,
        propuestas: cache.plus(vigente?.deltaHoras ?? cero).toFixed(2),
        reconocidoEn: tramo.reconocidoEn,
      });
      acumulado.set(tramo.idUsuario, fila);
    }

    for (const [idUsuario, fila] of acumulado) {
      const estimaciones = [...fila.tareas.values()].filter((valor): valor is number => valor !== null);
      const estimacionAsociada = estimaciones.length > 0 ? estimaciones.reduce((a, b) => a + b, 0) : null;
      const reportadasTotales = fila.reportadas.plus(fila.legacy);
      totalesPorUsuario.set(idUsuario, {
        tareasDistintas: fila.tareas.size,
        estimacionAsociada,
        reportadas: fila.reportadas.toFixed(2),
        legacy: fila.legacy.toFixed(2),
        exceso:
          estimacionAsociada === null
            ? '0.00'
            : Prisma.Decimal.max(reportadasTotales.minus(estimacionAsociada), 0).toFixed(2),
        propuestas: fila.propuestas.toFixed(2),
        filasPendientes: fila.pendientes,
        filasConsumidas: fila.consumidas,
        tramos: fila.tramos,
      });
    }

    const blockers: SprintClosingBlockerDto[] = [];
    if (sinParticipacion.length > 0) {
      blockers.push({
        code: 'TRAMOS_SIN_PARTICIPACION',
        message: 'Hay tramos sin participación resuelta; no puede saberse a quién acreditarlos',
        ids: sinParticipacion,
        cantidad: sinParticipacion.length,
      });
    }
    if (basesDesactualizadas.length > 0) {
      blockers.push({
        code: 'AJUSTE_DESACTUALIZADO',
        message: 'Hay ajustes vigentes calculados sobre un reporte distinto del actual',
        ids: basesDesactualizadas,
        cantidad: basesDesactualizadas.length,
      });
    }
    if (sinConsolidar.length > 0) {
      blockers.push({
        code: 'HORAS_SIN_CONSOLIDAR',
        message: 'Hay tramos cerrados con horas todavía no consolidadas',
        ids: sinConsolidar,
        cantidad: sinConsolidar.length,
      });
    }

    return { totalesPorUsuario, blockers, estadoSprint: sprint?.estado };
  }

  /**
   * C079 (§41 E069): detalle por integrante dentro del Sprint. La decisión de
   * lectura es la misma del resumen; el desglose lo compone el proveedor de
   * agregación, que no escribe nada.
   */
  async getSprintMemberDetail(projectId: number, sprintId: number, userId: number, actorId: number) {
    await this.readPolicy.assertRead(undefined, {
      projectId,
      actorId,
      scope: 'sprints',
      entitySprintId: sprintId,
    });
    await this.sprintsAuthorization.assertCanViewClosingSummary(projectId, sprintId, actorId);
    if (!this.projectHours) {
      throw new NotFoundException('El detalle por integrante no está disponible');
    }
    return this.projectHours.sprintMemberDetail(undefined, { sprintId, userId });
  }

  /**
   * A9: cierra el Sprint (EN_FINALIZACION -> CERRADO), única transición que
   * esta tarea implementa — CERRADO es terminal, sin ruta de reapertura.
   * Reutiliza `SprintsAuthorizationService.assertCanCloseSprint` (ya
   * existente desde A1-A3, mismo patrón que `assertCanFinalizeSprint`):
   * exclusivo del líder, aislado por projectId+sprintId.
   *
   * Mismo patrón exacto que `finalizeSprint` (precheck legible + `updateMany`
   * condicionado + relectura final), para no introducir una segunda
   * estrategia de transición en el mismo módulo:
   *
   *   autorización (lee el Sprint) -> precheck estado EN_FINALIZACION ->
   *   updateMany condicionado por estado=EN_FINALIZACION -> relectura final
   *
   * El precheck es solo un fallo rápido y legible; la garantía real contra
   * la carrera "el estado cambió entre la autorización/lectura inicial y el
   * commit" es el propio `updateMany` con `where: { ..., estado:
   * EN_FINALIZACION }` — si otra transacción ya cerró (o de algún modo
   * cambió) el Sprint entre la lectura de autorización y este punto,
   * `count === 0` y se traduce a ConflictException SIN sobrescribir el
   * estado real ni tocar fechaCierre/cerradoPor. No existe ninguna vía para
   * que `estado = CERRADO` quede persistido sin que `fechaCierre` y
   * `cerradoPor` también lo estén: los tres campos viajan en el mismo
   * `data` de una única sentencia condicionada, dentro de la misma
   * transacción — si cualquier paso posterior de la transacción lanza,
   * PostgreSQL revierte los tres a la vez.
   *
   * `fechaCierre` se genera server-side (`new Date()`), nunca se acepta del
   * cliente. `cerradoPor` es siempre el actor autorizado que ejecutó la
   * operación (mismo `userId` ya validado como líder), nunca un valor
   * enviado por el cliente.
   *
   * A9 nunca recalcula horas ni toca AsignacionTarea.horasReales: no
   * selecciona, no actualiza ni referencia HorasParticipacion/AsignacionTarea
   * en absoluto — los valores de A7 (horasCalculadas/horasAprobadas/
   * justificacionAjuste) permanecen exactamente como estaban, porque
   * closeSprint jamás los toca.
   *
   * A9.1: tras el `await` de `$transaction` (nunca dentro), emite
   * `SPRINT_CLOSED` vía `notificationsService.notifySprintClosed` — mismo
   * patrón exacto que `finalizeSprint` con `notifySprintFinalizationStarted`
   * (side effect post-commit, nunca dentro de la transacción de negocio).
   * Si la transacción lanza (Sprint ya no estaba EN_FINALIZACION, carrera
   * perdida, etc.), el `return` nunca se alcanza y el evento nunca se
   * emite — un cliente jamás recibe la señal de un cierre que en realidad
   * fue rollback. A9.1 no persiste ninguna `Notificacion` (igual que A4):
   * es una señal técnica realtime para que F6 invalide/oculte el banner de
   * bloqueo, no un mensaje de bandeja.
   */
  async closeSprint(projectId: number, sprintId: number, userId: number, destino?: DestinoArrastre) {
    const sprintCerrado = await this.projectTx.run(
      projectId,
      userId,
      'sprints.closeSprint',
      async (ctx) => {
      const { tx } = ctx;
      const sprint = await this.sprintsAuthorization.assertCanCloseSprint(
        projectId,
        sprintId,
        userId,
        tx,
      );
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'SPRINT_CLOSE', userId, {
        sprintId,
      });

      if (sprint.estado !== EstadoSprint.EN_FINALIZACION) {
        throw new ConflictException('El Sprint no está en estado EN_FINALIZACION');
      }

      // C080 (§12): CERRAR es CONSOLIDAR, no acreditar. Se reconocen TODAS las
      // participaciones elegibles primero y solo después se hace la única
      // transición de estado, de modo que ningún Sprint pueda quedar cerrado
      // con horas a medio consolidar: o entra todo, o no entra nada.
      await this.assertFinalizationPredicatesTx(tx, projectId, sprintId);

      const participaciones =
        (await this.recognition?.listEligibleParticipationsTx(tx, { projectId, sprintId })) ?? [];
      // Un único instante para TODO el lote: la consolidación de un Sprint es
      // un solo hecho, y verlo con marcas distintas por participación sugeriría
      // que ocurrió a trozos.
      const consolidadoEn = new Date();
      const consolidadas: Array<{
        idParticipacion: number;
        idUsuario: number;
        horasReportadas: string;
        horasPropuestas: string;
        idsAsignaciones: number[];
      }> = [];
      for (const idParticipacion of participaciones) {
        const resultado = await this.recognition!.recognizeParticipationHours(tx, {
          projectId,
          sprintId,
          participationId: idParticipacion,
          reconocidoEn: consolidadoEn,
        });
        if (resultado.horasParticipacion === null) {
          continue;
        }
        const duenio = await tx.participacionProyecto.findUniqueOrThrow({
          where: { idParticipacion },
          select: { idUsuario: true },
        });
        consolidadas.push({
          idParticipacion,
          idUsuario: duenio.idUsuario,
          horasReportadas: resultado.horasReportadas.toFixed(2),
          horasPropuestas: resultado.horasPropuestas.toFixed(2),
          idsAsignaciones: resultado.idsAsignacionesReconocidas,
        });
      }

      // T-239 (HU-160): congela la fila ANTES de la transición — en la misma
      // transacción que la vuelve CERRADO, así que si cualquier paso
      // posterior lanza, el congelamiento se revierte junto con todo lo
      // demás. A partir de aquí, `getSprintsAnalytics` deja de recalcular
      // este Sprint desde `tarea`: lee estas columnas tal cual quedaron hoy,
      // sin importar qué corrección se le haga después a una tarea vieja.
      const congelado = await this.read.calcularCongeladoDeCierreTx(tx, projectId, sprintId);

      if (congelado.tareasArrastradasCierre > 0) {
        if (!destino) {
          throw new BadRequestException(
            'El Sprint tiene tareas pendientes: se requiere elegir destino (SIGUIENTE_SPRINT o BACKLOG)',
          );
        }
        await tx.tarea.updateMany({
          where: {
            idProyecto: projectId,
            idSprint: sprintId,
            eliminadoEn: null,
            estadoTarea: { not: EstadoTarea.HECHO },
          },
          data: {
            idSprint: null,
            destinoArrastre: destino,
          },
        });
      }

      const actualizado = await tx.sprint.updateMany({
        where: {
          idSprint: sprintId,
          idProyecto: projectId,
          estado: EstadoSprint.EN_FINALIZACION,
        },
        data: {
          estado: EstadoSprint.CERRADO,
          fechaCierre: new Date(),
          cerradoPor: userId,
          ...congelado,
        },
      });

      if (actualizado.count === 0) {
        throw new ConflictException('El Sprint ya no está en estado EN_FINALIZACION');
      }

      const filaFinal = await tx.sprint.findFirst({
        where: { idSprint: sprintId, idProyecto: projectId },
      });
      if (!filaFinal) {
        throw new Error(
          `No se pudo leer el Sprint con id ${sprintId} recién cerrado dentro de la transacción`,
        );
      }

      await this.bitacoraEventos?.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.SPRINT_HOURS_CONSOLIDATED,
        idActor: userId,
        idProyecto: projectId,
        idSprint: sprintId,
        tipoEntidad: 'SPRINT',
        idEntidad: sprintId,
        valorNuevo: { consolidadas },
      });
      await this.bitacoraEventos?.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.SPRINT_CLOSED,
        idActor: userId,
        idProyecto: projectId,
        idSprint: sprintId,
        tipoEntidad: 'SPRINT',
        idEntidad: sprintId,
        valorAnterior: { estado: EstadoSprint.EN_FINALIZACION },
        valorNuevo: {
          estado: EstadoSprint.CERRADO,
          fechaCierre: filaFinal.fechaCierre?.toISOString() ?? null,
          cerradoPor: userId,
          // T-191 (HU-148): mismo conteo que congela T-239/T-189 en
          // `sprint.tareasArrastradasCierre` — se lee de `congelado`, nunca
          // se recalcula aquí, para no tener dos fuentes de verdad.
          tareasArrastradas: congelado.tareasArrastradasCierre,
          // Destino real que T-189 usó para mover las tareas pendientes
          // (SIGUIENTE_SPRINT o BACKLOG) — null cuando no hubo arrastre, ya
          // que en ese caso `destino` nunca se exige ni se usa.
          destinoArrastre: congelado.tareasArrastradasCierre > 0 ? destino ?? null : null,
        },
      });

      // §44: se avisa a TODO usuario con tramos consumidos, incluido aquel
      // cuya propuesta final es 0.00 — saber que su Sprint se consolidó en
      // cero también es información suya.
      // Sin nadie a quien avisar, ni siquiera se consulta el título.
      const proyecto = consolidadas.length > 0
        ? await tx.proyecto.findUniqueOrThrow({
            where: { idProyecto: projectId },
            select: { tituloProyecto: true },
          })
        : null;
      for (const fila of consolidadas) {
        await this.notificationsService.persistTemplateTx(
          tx,
          [fila.idUsuario],
          'HORAS_CONSOLIDADAS',
          {
            projectTitle: proyecto!.tituloProyecto,
            projectId,
            sprintId,
            numeroSprint: filaFinal.numero,
            horasReportadas: fila.horasReportadas,
            horasPropuestas: fila.horasPropuestas,
          },
          ctx.effects,
        );
      }

      return filaFinal;
      },
    );

    // Realtime SIEMPRE post-commit: nunca un socket dentro de la transacción.
    await this.notificationsService.notifySprintClosed(projectId, userId, {
      projectId,
      sprintId,
    });

    this.events?.emit(INSIGNIAS_EVENTO, { claves: ['sprints'], idProyecto: projectId });

    return sprintCerrado;
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

  listSprints(projectId: number, userId: number): Promise<SprintListItemDto[]> {
    return this.read.listSprints(projectId, userId);
  }

  getSprintDetail(projectId: number, sprintId: number, userId: number): Promise<SprintDetailDto> {
    return this.read.getSprintDetail(projectId, sprintId, userId);
  }

  getSprintAnalytics(projectId: number, sprintId: number, userId: number): Promise<SprintAnalyticsDto> {
    return this.read.getSprintAnalytics(projectId, sprintId, userId);
  }

  getSprintBurndown(projectId: number, sprintId: number, userId: number): Promise<SprintBurndownDto> {
    return this.read.getSprintBurndown(projectId, sprintId, userId);
  }

  computeSprintBurndown(projectId: number, sprintId: number): Promise<SprintBurndownDto> {
    return this.read.computeSprintBurndown(projectId, sprintId);
  }

  getSprintsAnalytics(projectId: number, userId: number): Promise<SprintComparativeAnalyticsDto> {
    return this.read.getSprintsAnalytics(projectId, userId);
  }

  computeSprintsComparative(
    projectId: number,
    sprintEstados: readonly EstadoSprint[] | null,
  ): Promise<SprintComparativeAnalyticsDto> {
    return this.read.computeSprintsComparative(projectId, sprintEstados);
  }
}
