import { Injectable, NotFoundException } from '@nestjs/common';
import { EstadoHoras, EstadoSprint, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { TeamService } from '../team/team.service';
import { SprintsService } from '../sprints/sprints.service';
import { ProjectHoursSummaryService } from '../sprints/project-hours-summary.service';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacoraValor } from '../bitacora/tipos-evento-bitacora';
import { SprintBurndownDto } from '../sprints/dto/sprint-burndown.dto';
import { ProjectExportMemberDto, ProjectExportModel } from './dto/project-export.dto';
import { DEFAULT_EXPORT_OPTIONS, ExportOptions } from './export-options';
import { SprintComparativeAnalyticsDto } from '../sprints/dto/sprint-analytics.dto';

/**
 * Portada del PDF (revisión del PR): el Sprint en curso rotula el reporte;
 * sin uno en curso, el último cerrado (mayor número). Sin Sprints no hay
 * línea de Sprint.
 */
export function sprintDePortada(
  sprints: ReadonlyArray<{ numero: number; estado: EstadoSprint }>,
): number | null {
  const enCurso = sprints.filter(
    (s) => s.estado === EstadoSprint.ACTIVO || s.estado === EstadoSprint.EN_FINALIZACION,
  );
  const candidatos = enCurso.length > 0 ? enCurso : sprints.filter((s) => s.estado === EstadoSprint.CERRADO);
  return candidatos.length === 0 ? null : Math.max(...candidatos.map((s) => s.numero));
}

/**
 * T-259/T-260/T-261 (HU-164): orquesta el export de proyecto — nunca
 * recalcula horas ni avance por su cuenta. Junta lo que ya calculan
 * `TeamService` (miembros/horasConfirmadas, idéntico a `/miembros`),
 * `ProjectHoursSummaryService` (horasPendientes) y `SprintsService`
 * (avance por Sprint), detrás de una única autorización: el scope
 * `exportacion` de `ProjectReadPolicyService` (exclusivo de líder/admin).
 */
@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readPolicy: ProjectReadPolicyService,
    private readonly teamService: TeamService,
    private readonly sprintsService: SprintsService,
    private readonly projectHours: ProjectHoursSummaryService,
    private readonly bitacoraEventos: BitacoraEventosService,
  ) {}

  async getProjectExportModel(
    projectId: number,
    actorId: number,
    opciones: ExportOptions = DEFAULT_EXPORT_OPTIONS,
  ): Promise<ProjectExportModel> {
    const decision = await this.readPolicy.assertRead(undefined, {
      projectId,
      actorId,
      scope: 'exportacion',
    });

    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto: projectId, eliminadoEn: null },
      select: {
        idProyecto: true,
        tituloProyecto: true,
        tipoProyecto: true,
        estadoProyecto: true,
        creadoPor: true,
      },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${projectId} no encontrado`);
    }

    const [equipo, horasProyecto, avance] = await Promise.all([
      this.teamService.buildTeamSummary(projectId, proyecto.creadoPor),
      this.projectHours.forProject(undefined, projectId),
      this.sprintsService.computeSprintsComparative(projectId, decision.sprintEstados),
    ]);

    const conRango = opciones.desde !== null || opciones.hasta !== null;
    const horasEnRango = conRango ? await this.horasEnRango(projectId, opciones) : null;
    const pendientesPorUsuario = new Map(
      horasProyecto.porUsuario.map((fila) => [fila.idUsuario, Number(fila.propuestasPendientes)]),
    );
    const avanceFiltrado = conRango ? await this.sprintsEnRango(projectId, avance, opciones) : avance;

    // T-259 (decisión del líder de proyecto, 2026-09-17): retirados SIN
    // contribución no aportan horas ni datos relevantes al export — el
    // mismo criterio que ya usa `/miembros` para agruparlos, aplicado aquí
    // como filtro en vez de como sección visual.
    const miembros: ProjectExportMemberDto[] = equipo.miembros
      .filter((miembro) => miembro.grupo !== 'RETIRADOS_SIN_CONTRIBUCION')
      .map((miembro) => ({
        idUsuario: miembro.idUsuario,
        nombre: miembro.nombre,
        apellido: miembro.apellido,
        correo: miembro.correo,
        rol: miembro.roles.map((rol) => rol.nombreRol).join(', '),
        estadoParticipacion: miembro.estadoParticipacion,
        grupo: miembro.grupo,
        horasConfirmadas: horasEnRango
          ? (horasEnRango.get(miembro.idUsuario)?.confirmadas ?? 0)
          : miembro.horasReconocidas,
        horasPendientes: horasEnRango
          ? (horasEnRango.get(miembro.idUsuario)?.pendientes ?? 0)
          : (pendientesPorUsuario.get(miembro.idUsuario) ?? 0),
      }));

    return {
      proyecto: {
        idProyecto: proyecto.idProyecto,
        tituloProyecto: proyecto.tituloProyecto,
        tipoProyecto: proyecto.tipoProyecto,
        estadoProyecto: proyecto.estadoProyecto,
      },
      lider: equipo.lider,
      miembros,
      fechaGeneracion: new Date(),
      sprintPortada: sprintDePortada(avanceFiltrado.sprints),
      avance: avanceFiltrado,
    };
  }

  /**
   * Revisión del PR: con rango de fechas, las horas se recalculan desde los
   * registros de horas (`HorasParticipacion`) cuyo periodo se traslapa con
   * el rango — APROBADA cuenta `horasAprobadas` (confirmadas) y PENDIENTE
   * `horasCalculadas` (pendientes), el mismo criterio de las dos columnas
   * sin rango. Sin rango NO se llama aquí: el export sigue saliendo del
   * mismo cálculo que la pantalla de Miembros.
   */
  private async horasEnRango(
    projectId: number,
    opciones: ExportOptions,
  ): Promise<Map<number, { confirmadas: number; pendientes: number }>> {
    const filas = await this.prisma.horasParticipacion.findMany({
      where: {
        participacion: { rolProyecto: { idProyecto: projectId } },
        estadoHoras: { in: [EstadoHoras.APROBADA, EstadoHoras.PENDIENTE] },
        ...(opciones.hasta ? { periodoInicio: { lte: opciones.hasta } } : {}),
        ...(opciones.desde ? { periodoFin: { gte: opciones.desde } } : {}),
      },
      select: {
        estadoHoras: true,
        horasAprobadas: true,
        horasCalculadas: true,
        participacion: { select: { idUsuario: true } },
      },
    });
    const cero = new Prisma.Decimal(0);
    const acumulado = new Map<number, { confirmadas: Prisma.Decimal; pendientes: Prisma.Decimal }>();
    for (const fila of filas) {
      const actual = acumulado.get(fila.participacion.idUsuario) ?? { confirmadas: cero, pendientes: cero };
      if (fila.estadoHoras === EstadoHoras.APROBADA) {
        actual.confirmadas = actual.confirmadas.plus(fila.horasAprobadas ?? cero);
      } else {
        actual.pendientes = actual.pendientes.plus(fila.horasCalculadas ?? cero);
      }
      acumulado.set(fila.participacion.idUsuario, actual);
    }
    return new Map(
      [...acumulado].map(([id, v]) => [id, { confirmadas: v.confirmadas.toNumber(), pendientes: v.pendientes.toNumber() }]),
    );
  }

  /**
   * Un Sprint entra al rango si su vida (inicio → cierre, o fin planeado
   * mientras siga abierto; sin ninguna de las dos, abierto hacia adelante)
   * se traslapa con [desde, hasta]. La analítica comparativa no trae fechas,
   * así que se consultan aparte y solo cuando hay rango.
   */
  private async sprintsEnRango(
    projectId: number,
    avance: SprintComparativeAnalyticsDto,
    opciones: ExportOptions,
  ): Promise<SprintComparativeAnalyticsDto> {
    const fechas = await this.prisma.sprint.findMany({
      where: { idProyecto: projectId },
      select: { idSprint: true, fechaInicio: true, fechaCierre: true, fechaFinPlaneada: true },
    });
    const finExclusivo = opciones.hasta ? opciones.hasta.getTime() + 24 * 60 * 60 * 1000 : null;
    const dentro = new Set(
      fechas
        .filter((sprint) => {
          const fin = sprint.fechaCierre ?? sprint.fechaFinPlaneada;
          const empiezaAntesDelFin = finExclusivo === null || sprint.fechaInicio.getTime() < finExclusivo;
          const terminaDespuesDelInicio =
            opciones.desde === null || fin === null || fin.getTime() >= opciones.desde.getTime();
          return empiezaAntesDelFin && terminaDespuesDelInicio;
        })
        .map((sprint) => sprint.idSprint),
    );
    return { ...avance, sprints: avance.sprints.filter((sprint) => dentro.has(sprint.idSprint)) };
  }

  /**
   * T-261: "cada exportación queda registrada... quién, cuándo y qué
   * exportó" — aunque exportar es una lectura pura (sin `tx` de dominio que
   * acompañar), se envuelve en una transacción de una sola sentencia para
   * reusar `BitacoraEventosService.registrarEvento` tal cual está, sin
   * relajar su contrato de "siempre con tx" para este caller.
   */
  async registrarExportacion(
    projectId: number,
    actorId: number,
    tipoEvento: TipoEventoBitacoraValor,
    detalle?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.bitacoraEventos.registrarEvento({
        tx,
        tipoEvento,
        idActor: actorId,
        idProyecto: projectId,
        tipoEntidad: 'PROYECTO',
        idEntidad: projectId,
        valorNuevo: detalle ?? null,
      }),
    );
  }

  /**
   * T-260 (HU-164, decisión del líder de proyecto, 2026-09-22): el burndown
   * impreso solo cubre Sprints CERRADO — nunca el Sprint activo, cuyo
   * burndown todavía cambia día a día. Mientras el proyecto no tenga NINGÚN
   * Sprint cerrado, el caller pasa `[]` y esta función ni siquiera consulta
   * (el PDF debe mostrar el aviso de "aún no disponible", no un burndown
   * vacío). Sin autorización propia: el caller (ExportsController, vía el
   * PDF) ya pasó por `getProjectExportModel` en la misma petición.
   */
  async getBurndownForClosedSprints(
    projectId: number,
    idsSprintsCerrados: number[],
  ): Promise<SprintBurndownDto[]> {
    return Promise.all(
      idsSprintsCerrados.map((idSprint) => this.sprintsService.computeSprintBurndown(projectId, idSprint)),
    );
  }
}
