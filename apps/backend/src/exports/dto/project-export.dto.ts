import { EstadoParticipacion, EstadoProyecto, TipoProyecto } from '@prisma/client';
import { TeamMemberGroup, TeamSummaryLeaderDto } from '../../team/dto/team-summary-member.dto';
import { SprintComparativeAnalyticsDto } from '../../sprints/dto/sprint-analytics.dto';

/**
 * T-259/T-260 (HU-164): fila de miembro del export — mismo universo que
 * `/miembros` (activos + retirados con contribución, nunca retirados sin
 * contribución) y mismo `horasConfirmadas` que `TeamSummaryMemberDto.
 * horasReconocidas` (idéntico cálculo, solo renombrado para el archivo).
 * `horasPendientes` es HorasParticipacion.PENDIENTE del mismo integrante —
 * mismo origen de datos, criterio adicional que la pantalla de Miembros hoy
 * no muestra.
 */
export interface ProjectExportMemberDto {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  rol: string;
  estadoParticipacion: EstadoParticipacion;
  grupo: TeamMemberGroup;
  horasConfirmadas: number;
  horasPendientes: number;
}

export interface ProjectExportProyectoDto {
  idProyecto: number;
  tituloProyecto: string;
  tipoProyecto: TipoProyecto;
  estadoProyecto: EstadoProyecto;
}

/**
 * Modelo único consumido por CSV y PDF — ambos formatos parten de la MISMA
 * captura para que sus totales coincidan entre sí y con la pantalla (T-260).
 * `avance` reutiliza `SprintComparativeAnalyticsDto` tal cual
 * `SprintsService.computeSprintsComparative` la resuelve, aislada en su
 * propio campo para que enchufar el burndown (T-240) más adelante sea
 * agregar un campo aquí, no reescribir el resto del modelo.
 */
export interface ProjectExportModel {
  proyecto: ProjectExportProyectoDto;
  lider: TeamSummaryLeaderDto;
  miembros: ProjectExportMemberDto[];
  fechaGeneracion: Date;
  /** Número del Sprint que rotula la portada: el activo/en finalización, si no el último cerrado; null si no hay Sprints. */
  sprintPortada: number | null;
  avance: SprintComparativeAnalyticsDto;
}
