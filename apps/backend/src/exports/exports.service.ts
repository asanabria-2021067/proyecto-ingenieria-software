import { Injectable, NotFoundException } from '@nestjs/common';
import { EstadoSprint } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { TeamService } from '../team/team.service';
import { SprintsService } from '../sprints/sprints.service';
import { ProjectHoursSummaryService } from '../sprints/project-hours-summary.service';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacoraValor } from '../bitacora/tipos-evento-bitacora';
import { SprintBurndownDto } from '../sprints/dto/sprint-burndown.dto';
import { ProjectExportMemberDto, ProjectExportModel } from './dto/project-export.dto';

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

  async getProjectExportModel(projectId: number, actorId: number): Promise<ProjectExportModel> {
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

    const pendientesPorUsuario = new Map(
      horasProyecto.porUsuario.map((fila) => [fila.idUsuario, Number(fila.propuestasPendientes)]),
    );

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
        horasConfirmadas: miembro.horasReconocidas,
        horasPendientes: pendientesPorUsuario.get(miembro.idUsuario) ?? 0,
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
      sprintPortada: sprintDePortada(avance.sprints),
      avance,
    };
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
  ): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.bitacoraEventos.registrarEvento({
        tx,
        tipoEvento,
        idActor: actorId,
        idProyecto: projectId,
        tipoEntidad: 'PROYECTO',
        idEntidad: projectId,
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
