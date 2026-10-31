import { Injectable, NotFoundException } from '@nestjs/common';
import { EstadoHito, EstadoSprint, EstadoTarea, Prioridad, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SprintsContextService } from './sprints-context.service';
import { SprintsAuthorizationService } from './sprints-authorization.service';
import { calcularProgresoHito } from '../common/hito-progreso';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { SprintDetailDto, SprintDetailHitoDto, SprintListItemDto } from './dto/sprint-history.dto';
import {
  SprintAnalyticsDto,
  SprintComparativeAnalyticsDto,
  SprintComparativeAnalyticsItemDto,
} from './dto/sprint-analytics.dto';
import { SprintBurndownDto } from './dto/sprint-burndown.dto';

/**
 * Lecturas de Sprint (historial, detalle, analítica, burndown y comparativa).
 * Extraído de SprintsService sin cambios de comportamiento; SprintsService
 * conserva los mismos métodos públicos y delega aquí.
 */
@Injectable()
export class SprintsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sprintsContext: SprintsContextService,
    private readonly sprintsAuthorization: SprintsAuthorizationService,
    private readonly readPolicy: ProjectReadPolicyService,
  ) {}

  /**
   * A10: mismo subconjunto público de Usuario que
   * ComentariosService.autorSelect — nunca contrasena/tokens/objeto
   * completo.
   */
  private static readonly HISTORY_USUARIO_SELECT = {
    idUsuario: true,
    nombre: true,
    apellido: true,
    fotoUrl: true,
  } as const;

  /**
   * A10: listado histórico de Sprints del proyecto — metadata mínima
   * (Sección 5), sin reconstrucción de tareas/horas/agregaciones. El
   * aislamiento por proyecto vive en el propio `where` de la consulta
   * (`idProyecto: projectId`), no en un filtro posterior en JavaScript.
   */
  /**
   * A10.1: agrega tareas/hitos/horas estimadas por Sprint del proyecto en
   * una única consulta SQL (nunca una por Sprint) — presupuesto total de
   * `listSprints` queda en 2 queries, independiente de cuántos Sprints tenga
   * el proyecto. Mismo universo de tareas que `getSprintDetail` (A10):
   * `idProyecto = projectId AND eliminadoEn IS NULL`, nunca un filtro
   * distinto inventado solo para este agregado.
   *
   * `tareas` = COUNT(*) de esas tareas (identidad de Tarea, coherente con
   * `tareasRealizadas` de A8 que también cuenta `Tarea` distinta).
   * `hitos` = COUNT(DISTINCT id_hito), excluyendo NULL automáticamente
   * (COUNT(DISTINCT col) de Postgres nunca cuenta NULL) — una tarea sin
   * hito no aporta, y varias tareas del mismo hito cuentan una sola vez.
   * `horasEstimadas` = SUM(tiempo_estimado_horas), nunca horasReales/
   * horasCalculadas/horasAprobadas (eso es reconocimiento de A5/A7, un
   * dominio completamente distinto que esta métrica no toca).
   *
   * Un Sprint sin tareas no aparece en el resultado de la consulta
   * agregada (no hay fila que agrupar); se completa con 0/0/0 al fusionar
   * en JavaScript, nunca se omite el Sprint de la lista final.
   */
  private async getSprintAggregatesByProject(
    projectId: number,
  ): Promise<Map<number, { tareas: number; hitos: number; horasEstimadas: number }>> {
    const filas = await this.prisma.$queryRaw<
      { idSprint: number; tareas: number; hitos: number; horasEstimadas: number }[]
    >(Prisma.sql`
      SELECT
        id_sprint AS "idSprint",
        COUNT(*)::int AS "tareas",
        COUNT(DISTINCT id_hito)::int AS "hitos",
        COALESCE(SUM(tiempo_estimado_horas), 0)::float8 AS "horasEstimadas"
      FROM tarea
      WHERE id_proyecto = ${projectId} AND eliminado_en IS NULL
      GROUP BY id_sprint
    `);

    return new Map(filas.map((fila) => [fila.idSprint, fila]));
  }

  /**
   * C046 (§34/§41 E064): la autorización actual se conserva y se le añade el
   * ámbito por actor; un administrador o un participante histórico solo ve
   * los Sprints cerrados del proyecto vivo.
   */
  async listSprints(projectId: number, userId: number): Promise<SprintListItemDto[]> {
    const decision = await this.readPolicy.assertRead(undefined, {
      projectId,
      actorId: userId,
      scope: 'sprints',
    });
    await this.sprintsAuthorization.assertCanListSprintHistory(projectId, userId);
    const alcance = this.sprintsContext.sprintScopeWhere(this.readPolicy.scopeForActor(decision));

    const [sprints, agregadosPorSprint] = await Promise.all([
      this.prisma.sprint.findMany({
        where: { idProyecto: projectId, ...alcance },
        orderBy: { numero: 'desc' },
        select: {
          idSprint: true,
          idProyecto: true,
          numero: true,
          estado: true,
          fechaInicio: true,
          fechaFinalizacionIniciada: true,
          fechaCierre: true,
        },
      }),
      this.getSprintAggregatesByProject(projectId),
    ]);

    return sprints.map((sprint) => {
      const agregados = agregadosPorSprint.get(sprint.idSprint);
      return {
        ...sprint,
        tareas: agregados?.tareas ?? 0,
        hitos: agregados?.hitos ?? 0,
        horasEstimadas: agregados?.horasEstimadas ?? 0,
      };
    });
  }

  /**
   * A10: reconstruye el detalle histórico de un Sprint desde las tablas
   * relacionales actuales — no existe tabla de snapshot/histórico; la
   * fuente de verdad sigue siendo Tarea/AsignacionTarea/Comentario/Hito.
   *
   * Aislamiento cross-project: `assertCanViewSprintHistory` ya resuelve el
   * Sprint vía `idSprint + idProyecto` (mismo contrato que
   * finalizar/cerrar/ajustar horas) — un `sprintId` de otro proyecto nunca
   * llega a la reconstrucción, lanza NotFoundException antes.
   *
   * Sin N+1 manual: 3 consultas fijas, ninguna dentro de un loop:
   *   1) Sprint + tareas (con `eliminadoEn: null`, mismo criterio de
   *      soft-delete que TasksService.findAll/findOne) + sus asignaciones
   *      (TODOS los tramos, no solo el activo — Sección 6.C) + sus
   *      comentarios (`eliminadoEn: null`, mismo criterio que
   *      ComentariosService), todo vía un único `select` anidado.
   *   2) y 3) Los Hitos referenciados por esas tareas y TODAS las tareas
   *      vigentes de esos Hitos en el proyecto (no solo las de este
   *      Sprint — mismo scope que `ProjectsService.calcularAvanceHitos` /
   *      `getAvance`), en paralelo vía `Promise.all`, cada una con una
   *      única consulta `IN (...)` (nunca una consulta por tarea/Hito).
   *
   * Una tarea con varios tramos de AsignacionTarea aparece UNA vez, con
   * todos sus tramos anidados dentro de `asignaciones` — nunca se duplica
   * la tarea por el JOIN. Un mismo Hito referenciado por varias tareas
   * aparece UNA vez en `hitos` (Map por idHito); cada tarea solo referencia
   * su `idHito`, nunca embebe una copia del Hito.
   *
   * `estadoHito` (A12) se devuelve exactamente como está persistido —
   * TasksService ya lo mantiene sincronizado en los write-paths reales de
   * `estadoTarea` (ver hito-progreso.ts), así que SprintDetail sigue sin
   * recalcularlo, solo lo lee. `porcentaje` (A12) se deriva con la MISMA
   * fórmula canónica (`calcularProgresoHito`), nunca una segunda
   * definición — puro cálculo de lectura, esta consulta GET nunca escribe
   * `Hito.estadoHito`.
   */
  async getSprintDetail(projectId: number, sprintId: number, userId: number): Promise<SprintDetailDto> {
    // C046 (§34/§41 E065): el detalle de un Sprint ACTIVO o EN_FINALIZACION
    // solo es visible para el líder actual; el resto de perfiles queda
    // limitado a los Sprints cerrados.
    await this.readPolicy.assertRead(undefined, {
      projectId,
      actorId: userId,
      scope: 'sprints',
      entitySprintId: sprintId,
    });
    await this.sprintsAuthorization.assertCanViewSprintHistory(projectId, sprintId, userId);

    // T-291: `select` acotado a los campos que se mapean en la respuesta, en
    // vez de traer todas las columnas de tareas, asignaciones y comentarios.
    const sprint = await this.prisma.sprint.findFirst({
      where: { idSprint: sprintId, idProyecto: projectId },
      select: {
        idSprint: true,
        idProyecto: true,
        numero: true,
        estado: true,
        fechaInicio: true,
        fechaFinalizacionIniciada: true,
        fechaCierre: true,
        cerradoPor: true,
        tareas: {
          where: { idProyecto: projectId, eliminadoEn: null },
          orderBy: { orden: 'asc' },
          select: {
            idTarea: true,
            tituloTarea: true,
            descripcionTarea: true,
            estadoTarea: true,
            prioridad: true,
            idHito: true,
            fechaCreacion: true,
            fechaLimite: true,
            tiempoEstimadoHoras: true,
            asignaciones: {
              orderBy: { fechaAsignacion: 'asc' },
              select: {
                idAsignacion: true,
                fechaAsignacion: true,
                desasignadaEn: true,
                horasReales: true,
                usuario: { select: SprintsReadService.HISTORY_USUARIO_SELECT },
              },
            },
            comentarios: {
              where: { eliminadoEn: null },
              orderBy: { creadoEn: 'asc' },
              select: {
                idComentario: true,
                contenido: true,
                creadoEn: true,
                autor: { select: SprintsReadService.HISTORY_USUARIO_SELECT },
              },
            },
          },
        },
      },
    });

    if (!sprint) {
      throw new NotFoundException(
        `Sprint con id ${sprintId} no encontrado en el proyecto ${projectId}`,
      );
    }

    const idsHito = [
      ...new Set(
        sprint.tareas
          .map((tarea) => tarea.idHito)
          .filter((idHito): idHito is number => idHito !== null),
      ),
    ];

    const hitosPorId = new Map<number, SprintDetailHitoDto>();
    if (idsHito.length > 0) {
      const [hitos, tareasDeHitos] = await Promise.all([
        this.prisma.hito.findMany({
          where: { idHito: { in: idsHito }, idProyecto: projectId },
          select: { idHito: true, tituloHito: true, estadoHito: true },
        }),
        // Scope idéntico a ProjectsService.calcularAvanceHitos/getAvance:
        // TODAS las tareas vigentes del Hito en el proyecto, no solo las
        // de este Sprint.
        this.prisma.tarea.findMany({
          where: { idHito: { in: idsHito }, idProyecto: projectId, eliminadoEn: null },
          select: { idHito: true, estadoTarea: true },
        }),
      ]);
      for (const hito of hitos) {
        const tareasDelHito = tareasDeHitos.filter((tarea) => tarea.idHito === hito.idHito);
        const { porcentaje } = calcularProgresoHito(tareasDelHito);
        hitosPorId.set(hito.idHito, {
          idHito: hito.idHito,
          tituloHito: hito.tituloHito,
          estadoHito: hito.estadoHito,
          porcentaje,
        });
      }
    }

    return {
      idSprint: sprint.idSprint,
      idProyecto: sprint.idProyecto,
      numero: sprint.numero,
      estado: sprint.estado,
      fechaInicio: sprint.fechaInicio,
      fechaFinalizacionIniciada: sprint.fechaFinalizacionIniciada,
      fechaCierre: sprint.fechaCierre,
      cerradoPor: sprint.cerradoPor,
      tareas: sprint.tareas.map((tarea) => ({
        idTarea: tarea.idTarea,
        tituloTarea: tarea.tituloTarea,
        descripcionTarea: tarea.descripcionTarea,
        estadoTarea: tarea.estadoTarea,
        prioridad: tarea.prioridad,
        idHito: tarea.idHito,
        fechaCreacion: tarea.fechaCreacion,
        fechaLimite: tarea.fechaLimite,
        tiempoEstimadoHoras: tarea.tiempoEstimadoHoras,
        asignaciones: tarea.asignaciones.map((asignacion) => ({
          idAsignacion: asignacion.idAsignacion,
          usuario: asignacion.usuario,
          fechaAsignacion: asignacion.fechaAsignacion,
          desasignadaEn: asignacion.desasignadaEn,
          horasReales: asignacion.horasReales?.toNumber() ?? null,
        })),
        comentarios: tarea.comentarios.map((comentario) => ({
          idComentario: comentario.idComentario,
          autor: comentario.autor,
          contenido: comentario.contenido,
          creadoEn: comentario.creadoEn,
        })),
      })),
      hitos: [...hitosPorId.values()],
    };
  }

  /** T-172: base vacía exhaustiva de `distribucionPorEstado` — evita que un `Record` parcial deje un `EstadoTarea` sin inicializar en 0. */
  private static readonly DISTRIBUCION_ESTADO_VACIA: Record<EstadoTarea, number> = {
    [EstadoTarea.POR_HACER]: 0,
    [EstadoTarea.EN_PROGRESO]: 0,
    [EstadoTarea.EN_REVISION]: 0,
    [EstadoTarea.HECHO]: 0,
  };

  /** T-172: base vacía exhaustiva de `distribucionPorPrioridad`, mismo criterio que `DISTRIBUCION_ESTADO_VACIA`. */
  private static readonly DISTRIBUCION_PRIORIDAD_VACIA: Record<Prioridad, number> = {
    [Prioridad.BAJA]: 0,
    [Prioridad.MEDIA]: 0,
    [Prioridad.ALTA]: 0,
  };

  /**
   * T-172 (HU-143): analítica de solo lectura de UN Sprint — tareas totales,
   * distribución por estado/prioridad, hitos, planificado frente a
   * completado. Restricción vigente: nunca "velocity" — solo cuenta tareas
   * ("tareas completadas por sprint").
   *
   * Autorización: líder O integrante activo (`assertCanViewSprintAnalytics`,
   * distinto del criterio exclusivo-líder de `getSprintDetail`/F4) — HU-143
   * lo pide explícitamente ("Como líder o integrante del proyecto").
   *
   * Presupuesto fijo de 3 queries (independiente del número de tareas/hitos
   * del Sprint), mismo patrón exacto que `getSprintDetail`:
   *   1) Sprint + sus tareas (`idProyecto` + `eliminadoEn: null`, mismo
   *      criterio de soft-delete que el resto del dominio) vía `include`.
   *   2) y 3) Hitos referenciados por esas tareas + TODAS las tareas
   *      vigentes de esos Hitos en el proyecto (mismo scope que
   *      `getSprintDetail`/`ProjectsService.calcularAvanceHitos`), en
   *      paralelo vía `Promise.all`.
   *
   * `hitos` reutiliza `calcularProgresoHito` — la MISMA fórmula canónica que
   * `getSprintDetail`, nunca una segunda definición de progreso de Hito.
   * `planificadoVsCompletado.tareasPlanificadas` = total de tareas del
   * Sprint (mismo universo que `tareasTotales`); `horasEstimadas` =
   * SUM(tiempoEstimadoHoras), nunca horas reales/reconocidas (A5/A7, un
   * dominio distinto que esta analítica no toca).
   */
  async getSprintAnalytics(
    projectId: number,
    sprintId: number,
    userId: number,
  ): Promise<SprintAnalyticsDto> {
    await this.readPolicy.assertRead(undefined, {
      projectId,
      actorId: userId,
      scope: 'sprints',
      entitySprintId: sprintId,
    });
    await this.sprintsAuthorization.assertCanViewSprintAnalytics(projectId, sprintId, userId);

    const sprint = await this.prisma.sprint.findFirst({
      where: { idSprint: sprintId, idProyecto: projectId },
      include: {
        tareas: {
          where: { idProyecto: projectId, eliminadoEn: null },
          select: {
            estadoTarea: true,
            prioridad: true,
            idHito: true,
            tiempoEstimadoHoras: true,
          },
        },
      },
    });

    if (!sprint) {
      throw new NotFoundException(
        `Sprint con id ${sprintId} no encontrado en el proyecto ${projectId}`,
      );
    }

    const distribucionPorEstado = { ...SprintsReadService.DISTRIBUCION_ESTADO_VACIA };
    const distribucionPorPrioridad = { ...SprintsReadService.DISTRIBUCION_PRIORIDAD_VACIA };
    let horasEstimadas = 0;
    let tareasCompletadas = 0;

    for (const tarea of sprint.tareas) {
      distribucionPorEstado[tarea.estadoTarea]++;
      distribucionPorPrioridad[tarea.prioridad]++;
      horasEstimadas += tarea.tiempoEstimadoHoras ?? 0;
      if (tarea.estadoTarea === EstadoTarea.HECHO) {
        tareasCompletadas++;
      }
    }

    const idsHito = [
      ...new Set(
        sprint.tareas
          .map((tarea) => tarea.idHito)
          .filter((idHito): idHito is number => idHito !== null),
      ),
    ];

    const hitos: SprintDetailHitoDto[] = [];
    if (idsHito.length > 0) {
      const [hitosRows, tareasDeHitos] = await Promise.all([
        this.prisma.hito.findMany({
          where: { idHito: { in: idsHito }, idProyecto: projectId },
          select: { idHito: true, tituloHito: true, estadoHito: true },
        }),
        this.prisma.tarea.findMany({
          where: { idHito: { in: idsHito }, idProyecto: projectId, eliminadoEn: null },
          select: { idHito: true, estadoTarea: true },
        }),
      ]);
      for (const hito of hitosRows) {
        const tareasDelHito = tareasDeHitos.filter((tarea) => tarea.idHito === hito.idHito);
        const { porcentaje } = calcularProgresoHito(tareasDelHito);
        hitos.push({
          idHito: hito.idHito,
          tituloHito: hito.tituloHito,
          estadoHito: hito.estadoHito,
          porcentaje,
        });
      }
    }

    return {
      idSprint: sprint.idSprint,
      idProyecto: sprint.idProyecto,
      numero: sprint.numero,
      estado: sprint.estado,
      tareasTotales: sprint.tareas.length,
      distribucionPorEstado,
      distribucionPorPrioridad,
      hitos,
      planificadoVsCompletado: {
        tareasPlanificadas: sprint.tareas.length,
        tareasCompletadas,
        horasEstimadas,
      },
    };
  }

  /**
   * T-240 (HU-160): datos crudos del burndown de un Sprint — el front
   * dibuja la línea ideal (`fechaInicio` -> `fechaFinPlaneada`) y la línea
   * real (`instantaneas`, sin rellenar huecos). Misma autorización que
   * `getSprintAnalytics` (líder o integrante activo): es analítica, no
   * gestión del Sprint.
   *
   * El total planeado sigue el mismo criterio de congelamiento que T-239:
   * un Sprint `CERRADO` reporta sus columnas `*Cierre` (ya congeladas por
   * `closeSprint`, nunca recalculadas); uno `ACTIVO`/`EN_FINALIZACION`
   * agrega en vivo TODAS sus tareas vigentes (HECHO o no — es "lo
   * planeado", no "lo pendiente").
   */
  async getSprintBurndown(
    projectId: number,
    sprintId: number,
    userId: number,
  ): Promise<SprintBurndownDto> {
    await this.readPolicy.assertRead(undefined, {
      projectId,
      actorId: userId,
      scope: 'sprints',
      entitySprintId: sprintId,
    });
    await this.sprintsAuthorization.assertCanViewSprintAnalytics(projectId, sprintId, userId);
    return this.computeSprintBurndown(projectId, sprintId);
  }

  /**
   * T-259/T-260/T-261 (HU-164): datos crudos del burndown extraídos sin
   * autorización propia, mismo motivo que `computeSprintsComparative` — el
   * export de proyecto (ExportsService) ya autorizó al actor por su propio
   * scope ('exportacion', que admite admin) antes de llamar aquí;
   * `assertCanViewSprintAnalytics` exige líder o integrante activo y
   * rechazaría a un admin exportador que no participa.
   */
  async computeSprintBurndown(projectId: number, sprintId: number): Promise<SprintBurndownDto> {
    const sprint = await this.prisma.sprint.findFirst({
      where: { idSprint: sprintId, idProyecto: projectId },
      select: {
        idSprint: true,
        estado: true,
        fechaInicio: true,
        fechaFinPlaneada: true,
        tareasPlanificadasCierre: true,
        puntosHistoriaPlanificadosCierre: true,
      },
    });
    if (!sprint) {
      throw new NotFoundException(
        `Sprint con id ${sprintId} no encontrado en el proyecto ${projectId}`,
      );
    }

    let tareasPlanificadasTotal: number;
    let puntosHistoriaPlanificadosTotal: number;
    if (sprint.estado === EstadoSprint.CERRADO) {
      tareasPlanificadasTotal = sprint.tareasPlanificadasCierre ?? 0;
      puntosHistoriaPlanificadosTotal = sprint.puntosHistoriaPlanificadosCierre ?? 0;
    } else {
      const tareas = await this.prisma.tarea.findMany({
        where: { idProyecto: projectId, idSprint: sprintId, eliminadoEn: null },
        select: { puntosHistoria: true },
      });
      tareasPlanificadasTotal = tareas.length;
      puntosHistoriaPlanificadosTotal = tareas.reduce(
        (acumulado, tarea) => acumulado + (tarea.puntosHistoria ?? 0),
        0,
      );
    }

    const instantaneasRows = await this.prisma.instantaneaSprint.findMany({
      where: { idSprint: sprintId },
      select: { fecha: true, tareasPendientes: true, tareasCompletadas: true, puntosHistoriaRestantes: true },
      orderBy: { fecha: 'asc' },
    });

    return {
      idSprint: sprint.idSprint,
      fechaInicio: sprint.fechaInicio.toISOString(),
      fechaFinPlaneada: sprint.fechaFinPlaneada ? sprint.fechaFinPlaneada.toISOString() : null,
      tareasPlanificadasTotal,
      puntosHistoriaPlanificadosTotal,
      instantaneas: instantaneasRows.map((fila) => ({
        fecha: fila.fecha.toISOString(),
        tareasPendientes: fila.tareasPendientes,
        tareasCompletadas: fila.tareasCompletadas,
        puntosHistoriaRestantes: fila.puntosHistoriaRestantes,
      })),
    };
  }

  /**
   * T-173 (HU-143): analítica comparativa entre TODOS los Sprints del
   * proyecto — cumplimiento por Sprint, planificado frente a completado,
   * evolución de hitos y tareas completadas por Sprint. Restricción
   * vigente: el campo se llama literalmente `tareasCompletadas`, nunca
   * "velocity".
   *
   * Autorización: mismo criterio que `getSprintAnalytics`
   * (`assertCanListSprintAnalytics` — líder o integrante activo).
   *
   * Una única consulta SQL agregada (`$queryRaw` con CTEs, mismo estilo que
   * `getSprintClosingSummary`) resuelve tareas+hitos de TODOS los Sprints
   * del proyecto de una vez — presupuesto de 1 query, independiente de
   * cuántos Sprints o tareas tenga el proyecto (nunca una consulta por
   * Sprint). Ordenado por `numero ASC` para reflejar la evolución en el
   * tiempo (a diferencia de `listSprints`/F3, que ordena `numero DESC` para
   * mostrar el más reciente primero).
   *
   * `tareas_agregadas`: total y completadas (`estado_tarea = 'HECHO'`) por
   * Sprint, mismo universo (`idProyecto` + `eliminadoEn IS NULL`) que
   * `getSprintAggregatesByProject`/`getSprintAnalytics`.
   * `sprint_hitos`: Hitos DISTINTOS referenciados por tareas de cada
   * Sprint. `hitos_agregados`: de esos Hitos distintos, cuántos están
   * `estado_hito = 'COMPLETADO'` (estado global y ya persistido del Hito,
   * A12 — esta consulta nunca lo recalcula). Un Sprint sin tareas/hitos
   * nunca desaparece del resultado (`LEFT JOIN` + `COALESCE(..., 0)`), igual
   * que `getSprintAggregatesByProject`.
   *
   * T-239 (HU-160): para un Sprint `CERRADO`, los cuatro campos se leen de
   * las columnas `*Cierre` congeladas por `calcularCongeladoDeCierreTx`
   * (escritas una única vez dentro de `closeSprint`) en vez de recalcularse
   * desde `tarea` — así una corrección posterior sobre una tarea de un
   * Sprint ya cerrado ajusta el Sprint EN CURSO, pero nunca reescribe la
   * fila ya congelada. `ACTIVO`/`EN_FINALIZACION` siguen el cálculo en vivo
   * de siempre.
   *
   * T-241 (HU-160): `puntosHistoriaCompletados` (la velocidad, en story
   * points) se lee EXCLUSIVAMENTE de `puntos_historia_completados_cierre`
   * para Sprints `CERRADO` — a propósito, sin la rama "en vivo" que sí
   * tienen los demás campos: la velocidad solo existe una vez que el Sprint
   * cerró y su congelado quedó fijo (`null` en cualquier otro estado).
   */
  async getSprintsAnalytics(
    projectId: number,
    userId: number,
  ): Promise<SprintComparativeAnalyticsDto> {
    // C046 (§41 E068): la comparativa también respeta el ámbito por actor.
    const decision = await this.readPolicy.assertRead(undefined, {
      projectId,
      actorId: userId,
      scope: 'sprints',
    });
    await this.sprintsAuthorization.assertCanListSprintAnalytics(projectId, userId);
    return this.computeSprintsComparative(projectId, decision.sprintEstados);
  }

  /**
   * T-261 (HU-164): consulta cruda de `getSprintsAnalytics` extraída sin
   * autorización propia, para que el export de proyecto (ExportsService) la
   * reutilice tal cual con el `sprintEstados` que ya resolvió SU propia
   * política ('exportacion') — `assertCanListSprintAnalytics` exige líder o
   * integrante activo y rechazaría a un admin exportador que no participa.
   * Igual que `ProjectHoursSummaryService.forProject`: sin auth interna, el
   * caller es quien ya autorizó.
   */
  async computeSprintsComparative(
    projectId: number,
    sprintEstados: readonly EstadoSprint[] | null,
  ): Promise<SprintComparativeAnalyticsDto> {
    // La comparativa es SQL agregado: el ámbito se aplica como fragmento
    // parametrizado, nunca interpolando estados en el texto de la consulta.
    const filtroEstados =
      sprintEstados === null
        ? Prisma.empty
        : Prisma.sql` AND s.estado::text IN (${Prisma.join([...sprintEstados])})`;

    const filas = await this.prisma.$queryRaw<
      Omit<SprintComparativeAnalyticsItemDto, 'porcentajeCumplimiento'>[]
    >(Prisma.sql`
      WITH tareas_agregadas AS (
        SELECT
          id_sprint AS "idSprint",
          COUNT(*)::int AS "tareasPlanificadas",
          COUNT(*) FILTER (WHERE estado_tarea = 'HECHO')::int AS "tareasCompletadas"
        FROM tarea
        WHERE id_proyecto = ${projectId} AND eliminado_en IS NULL
        GROUP BY id_sprint
      ),
      sprint_hitos AS (
        SELECT DISTINCT id_sprint, id_hito
        FROM tarea
        WHERE id_proyecto = ${projectId} AND eliminado_en IS NULL AND id_hito IS NOT NULL
      ),
      hitos_agregados AS (
        SELECT
          sh.id_sprint AS "idSprint",
          COUNT(*)::int AS "hitosTotales",
          COUNT(*) FILTER (WHERE h.estado_hito = 'COMPLETADO')::int AS "hitosCompletados"
        FROM sprint_hitos sh
        JOIN hito h ON h.id_hito = sh.id_hito
        GROUP BY sh.id_sprint
      )
      SELECT
        s.id_sprint AS "idSprint",
        s.numero AS "numero",
        s.estado AS "estado",
        CASE WHEN s.estado = 'CERRADO'
          THEN COALESCE(s.tareas_planificadas_cierre, 0)
          ELSE COALESCE(ta."tareasPlanificadas", 0)
        END AS "tareasPlanificadas",
        CASE WHEN s.estado = 'CERRADO'
          THEN COALESCE(s.tareas_completadas_cierre, 0)
          ELSE COALESCE(ta."tareasCompletadas", 0)
        END AS "tareasCompletadas",
        CASE WHEN s.estado = 'CERRADO'
          THEN COALESCE(s.hitos_totales_cierre, 0)
          ELSE COALESCE(ha."hitosTotales", 0)
        END AS "hitosTotales",
        CASE WHEN s.estado = 'CERRADO'
          THEN COALESCE(s.hitos_completados_cierre, 0)
          ELSE COALESCE(ha."hitosCompletados", 0)
        END AS "hitosCompletados",
        CASE WHEN s.estado = 'CERRADO'
          THEN s.puntos_historia_completados_cierre
          ELSE NULL
        END AS "puntosHistoriaCompletados"
      FROM sprint s
      LEFT JOIN tareas_agregadas ta ON ta."idSprint" = s.id_sprint
      LEFT JOIN hitos_agregados ha ON ha."idSprint" = s.id_sprint
      WHERE s.id_proyecto = ${projectId}${filtroEstados}
      ORDER BY s.numero ASC
    `);

    const sprints: SprintComparativeAnalyticsItemDto[] = filas.map((fila) => ({
      ...fila,
      porcentajeCumplimiento:
        fila.tareasPlanificadas === 0
          ? 0
          : Math.round((fila.tareasCompletadas / fila.tareasPlanificadas) * 100),
    }));

    return { idProyecto: projectId, sprints };
  }

  /**
   * T-239 (HU-160): mismo criterio de agregación que `getSprintsAnalytics`
   * (tareas no eliminadas del Sprint + Hitos DISTINTOS que esas tareas
   * referencian), pero acotado a UN sprint y llamado dentro de la
   * transacción de `closeSprint` — nunca se invoca fuera de ahí, así que
   * siempre corre bajo el lock del proyecto.
   */
  async calcularCongeladoDeCierreTx(
    tx: Prisma.TransactionClient,
    projectId: number,
    sprintId: number,
  ): Promise<{
    tareasPlanificadasCierre: number;
    tareasCompletadasCierre: number;
    tareasArrastradasCierre: number;
    hitosTotalesCierre: number;
    hitosCompletadosCierre: number;
    porcentajeCumplimientoCierre: number;
    puntosHistoriaPlanificadosCierre: number | null;
    puntosHistoriaCompletadosCierre: number | null;
  }> {
    const tareas = await tx.tarea.findMany({
      where: { idProyecto: projectId, idSprint: sprintId, eliminadoEn: null },
      select: { estadoTarea: true, idHito: true, puntosHistoria: true },
    });

    const completadas = tareas.filter((tarea) => tarea.estadoTarea === EstadoTarea.HECHO);
    const tareasPlanificadasCierre = tareas.length;
    const tareasCompletadasCierre = completadas.length;
    const tareasArrastradasCierre = tareasPlanificadasCierre - tareasCompletadasCierre;
    const porcentajeCumplimientoCierre =
      tareasPlanificadasCierre === 0
        ? 0
        : Math.round((tareasCompletadasCierre / tareasPlanificadasCierre) * 100);
    // T-241 (HU-160): si el Sprint tiene tareas pero NINGUNA lleva story
    // points, congelamos `null` (no `0`) — "sin puntos asignados" no es lo
    // mismo que "0 puntos completados", y la comparativa debe poder
    // distinguirlo explícitamente en vez de mostrar una velocidad falsa.
    const sinPuntosHistoriaAsignados =
      tareas.length > 0 && tareas.every((tarea) => tarea.puntosHistoria === null);
    const puntosHistoriaPlanificadosCierre = sinPuntosHistoriaAsignados
      ? null
      : tareas.reduce((acumulado, tarea) => acumulado + (tarea.puntosHistoria ?? 0), 0);
    const puntosHistoriaCompletadosCierre = sinPuntosHistoriaAsignados
      ? null
      : completadas.reduce((acumulado, tarea) => acumulado + (tarea.puntosHistoria ?? 0), 0);

    const idsHitosDistintos = [
      ...new Set(
        tareas
          .map((tarea) => tarea.idHito)
          .filter((idHito): idHito is number => idHito !== null),
      ),
    ];
    const hitosTotalesCierre = idsHitosDistintos.length;
    const hitosCompletadosCierre =
      idsHitosDistintos.length === 0
        ? 0
        : await tx.hito.count({
            where: { idHito: { in: idsHitosDistintos }, estadoHito: EstadoHito.COMPLETADO },
          });

    return {
      tareasPlanificadasCierre,
      tareasCompletadasCierre,
      tareasArrastradasCierre,
      hitosTotalesCierre,
      hitosCompletadosCierre,
      porcentajeCumplimientoCierre,
      puntosHistoriaPlanificadosCierre,
      puntosHistoriaCompletadosCierre,
    };
  }
}
