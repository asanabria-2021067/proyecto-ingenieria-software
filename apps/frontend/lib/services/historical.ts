import { apiFetch } from '@/lib/api/client';
import type { EstadoDocumentoCierre, EstadoRevisionCierre, TipoDocumentoCierre } from '@/lib/types/closure';

/**
 * Contratos de `GET /proyectos/:pid/historico` (E118) y
 * `GET /proyectos/:pid/sprints/:sid/contribuciones-eliminadas` (E119).
 * Reflejan `HistoricalProjectReadService` (apps/backend/src/project-closure).
 * Todos los importes de horas son string decimal; las fechas, ISO string.
 * Es una superficie de SOLO LECTURA: `permisos` llega siempre en `false`.
 */

export interface HistoricalUsuario {
  idUsuario: number;
  nombre: string;
  apellido: string;
}

export interface HistoricalDocumento {
  idDocumentoCierre: number;
  tipoDocumento: TipoDocumentoCierre | string;
  nombreArchivo: string;
  tamanoBytes: number | null;
  checksumSha256: string | null;
  estadoDocumento: EstadoDocumentoCierre | string;
}

export interface HistoricalMiembro {
  idParticipacion: number;
  usuario: HistoricalUsuario;
  rol: { idRolProyecto: number; nombreRol: string };
  estadoParticipacion: string;
  fechaIngreso: string;
  fechaSalida: string | null;
}

export interface HistoricalSprint {
  idSprint: number;
  numero: number;
  fechaInicio: string;
  fechaCierre: string | null;
}

export interface HistoricalRevision {
  idRevisionCierre: number;
  numeroRevision: number;
  estadoRevision: EstadoRevisionCierre | string;
  enviadaEn: string | null;
  resueltaEn: string | null;
  comentarioRevisor: string | null;
  fingerprintEntrega: string | null;
  documentosEnviados: Array<HistoricalDocumento & { orden: number }>;
}

export interface HistoricalHorasUsuario {
  idUsuario: number;
  nombre: string;
  apellido: string;
  reportadasGranulares: string;
  legacy: string;
  propuestasPendientes: string;
  acreditadas: string;
  tareasDistintas: number;
}

export interface HistoricalLeadershipItem {
  idHistorialLiderazgo: number;
  idLiderAnterior: number | null;
  idLiderNuevo: number;
  idAdminResponsable: number | null;
  origen: string;
  motivo: string | null;
  registradoEn: string;
  idApelacion: number | null;
}

export interface HistoricalProjectView {
  projectId: number;
  resumen: {
    idProyecto: number;
    tituloProyecto: string;
    descripcionProyecto: string | null;
    tipoProyecto: string;
    estadoProyecto: string;
    fechaInicio: string | null;
    fechaFinEstimada: string | null;
  };
  liderazgo: { liderActual: HistoricalUsuario; historial: HistoricalLeadershipItem[] };
  miembrosHistoricos: HistoricalMiembro[];
  sprintsCerrados: HistoricalSprint[];
  contribucionesEliminadas: DeletedContribution[];
  totales: {
    reportadasGranulares: string;
    legacy: string;
    propuestasPendientes: string;
    acreditadas: string;
    tareasDistintas: number;
    porUsuario: HistoricalHorasUsuario[];
  };
  revisiones: HistoricalRevision[];
  informeOficial: HistoricalDocumento | null;
  permisos: { puedeEditar: false; puedeEnviar: false; puedeResolver: false; puedeSubirDocumentos: false };
  lector: { perfil: string; soloPropio: boolean };
}

export interface DeletedContribution {
  idAsignacion: number;
  tarea: { idTarea: number; tituloTarea: string; idSprint: number | null };
  usuario: HistoricalUsuario;
  rolHistorico: {
    idParticipacion: number;
    idRolProyecto: number;
    nombreRol: string;
    estadoParticipacion: string;
  } | null;
  asignadaEn: string;
  desasignadaEn: string | null;
  cache: string | null;
  origenReporte: string;
  registrosEfectivos: Array<{ idRegistroTiempo: number; horas: string; fecha: string; justificacionExceso: string | null }>;
  registrosRevocados: Array<{ idRegistroTiempo: number; horas: string; fecha: string; revocadoEn: string }>;
  ajustes: Array<{ idAjusteHora: number; deltaHoras: string; horasBase: string; justificacion: string | null; anuladoEn: string | null; vigente: boolean }>;
  [clave: string]: unknown;
}

/** E118 — proyección histórica completa según lo que el lector puede ver. 403 para externos. */
export function getHistoricalProject(idProyecto: number): Promise<HistoricalProjectView> {
  return apiFetch<HistoricalProjectView>(`/proyectos/${idProyecto}/historico`);
}

/** E119 — contribuciones de tareas eliminadas de un Sprint (lectura histórica). */
export function getDeletedContributions(idProyecto: number, idSprint: number): Promise<DeletedContribution[]> {
  return apiFetch<DeletedContribution[]>(`/proyectos/${idProyecto}/sprints/${idSprint}/contribuciones-eliminadas`);
}
