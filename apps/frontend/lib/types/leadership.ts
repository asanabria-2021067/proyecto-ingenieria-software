/**
 * Contratos de liderazgo (Sprint 7, 06 v2 §18-§20). Reflejan
 * `apps/backend/src/leadership/**` y `src/eligibility/project-eligibility.service.ts`.
 * Fechas como string ISO; horas como string decimal (se formatean, nunca se
 * convierten a `Number` para mostrarlas).
 */

export type EstadoApelacionLiderazgo = 'PENDIENTE' | 'ACEPTADA' | 'DENEGADA' | 'CANCELADA';

export type OrigenCambioLiderazgo = 'SOLICITUD_LIDER' | 'CAMBIO_ADMINISTRATIVO';

/** Catálogo CERRADO de 9 motivos. No existe ningún criterio de «horas mínimas». */
export const MOTIVOS_INELEGIBILIDAD = [
  'USUARIO_NO_EXISTE',
  'USUARIO_DESHABILITADO',
  'SIN_PARTICIPACION_ACTIVA',
  'SIN_PARTICIPACION_ACTIVA_EN_EL_ROL',
  'SALIDA_EN_CURSO',
  'ES_EL_LIDER_ACTUAL',
  'PROYECTO_NO_OPERATIVO',
  'ROL_SIN_CUPO',
  'YA_PARTICIPA_EN_EL_ROL',
] as const;
export type MotivoInelegibilidad = (typeof MOTIVOS_INELEGIBILIDAD)[number];

/** Traducción del catálogo real (solo estos 9). Un código desconocido se muestra tal cual. */
export const MOTIVO_INELEGIBILIDAD_LABEL: Record<MotivoInelegibilidad, string> = {
  USUARIO_NO_EXISTE: 'El usuario no existe',
  USUARIO_DESHABILITADO: 'El usuario está deshabilitado',
  SIN_PARTICIPACION_ACTIVA: 'No tiene participación activa en el proyecto',
  SIN_PARTICIPACION_ACTIVA_EN_EL_ROL: 'No tiene participación activa en el rol',
  SALIDA_EN_CURSO: 'Tiene una solicitud de salida en curso',
  ES_EL_LIDER_ACTUAL: 'Ya es el líder actual',
  PROYECTO_NO_OPERATIVO: 'El proyecto no está operativo',
  ROL_SIN_CUPO: 'El rol no tiene cupo disponible',
  YA_PARTICIPA_EN_EL_ROL: 'Ya participa en el rol',
};

export function motivoInelegibilidadLabel(motivo: string): string {
  return (MOTIVO_INELEGIBILIDAD_LABEL as Record<string, string>)[motivo] ?? motivo;
}

export interface UsuarioResumenDto {
  idUsuario: number;
  nombre: string;
  apellido: string;
}

export interface ParticipacionActivaDto {
  idParticipacion: number;
  idRolProyecto: number;
  nombreRol: string;
}

/** `GET /proyectos/:pid/liderazgo/contexto` (E093). Las advertencias son texto del servidor. */
export interface LeadershipContextDto {
  projectId: number;
  estadoProyecto: string;
  liderActual: UsuarioResumenDto;
  tieneParticipacionActiva: boolean;
  participacionesActivas: ParticipacionActivaDto[];
  conservaMembresiaSiSeTransfiere: boolean;
  advertenciaApelacion: string | null;
  advertenciaAdmin: string | null;
}

/** Un candidato anotado con hechos objetivos; nunca hay ranking. */
export interface LeadershipCandidateDto {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
  rolesActivos: Array<{ idRolProyecto: number; nombreRol: string }>;
  horasReportadas: string;
  horasLegacy: string;
  tareasDistintas: number;
  esElegible: boolean;
  motivos: MotivoInelegibilidad[];
  seleccionable: boolean;
}

/** `GET /proyectos/:pid/liderazgo/candidatos` (E094). */
export interface LeadershipCandidatesDto {
  contexto: LeadershipContextDto;
  candidatos: LeadershipCandidateDto[];
}

/** `GET /proyectos/:pid/liderazgo/historial` (E095). */
export interface LeadershipHistoryItemDto {
  idHistorialLiderazgo: number;
  idProyecto: number;
  liderAnterior: UsuarioResumenDto;
  liderNuevo: UsuarioResumenDto;
  admin: UsuarioResumenDto;
  motivo: string;
  origen: OrigenCambioLiderazgo | string;
  registradoEn: string;
  idApelacion: number | null;
  candidatoSugerido: UsuarioResumenDto | null;
}

/** `GET …/liderazgo/apelaciones` (E096) y `GET /admin/liderazgo/apelaciones` (E100). */
export interface ApelacionItemDto {
  idApelacion: number;
  idProyecto: number;
  asunto: string;
  mensaje: string;
  estadoApelacion: EstadoApelacionLiderazgo | string;
  creadaEn: string;
  resueltaEn: string | null;
  mensajeResolucion: string | null;
  liderSolicitante: UsuarioResumenDto;
  candidatoPropuesto: UsuarioResumenDto;
  adminResolutor: UsuarioResumenDto | null;
}

/** Paginación común de §46. */
export interface PaginaLiderazgo<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// ─── DTOs de entrada ─────────────────────────────────────────────────────────

/** Los TRES campos son obligatorios (`CreateLeadershipAppealDto`). */
export interface CreateLeadershipAppealInput {
  asunto: string;
  mensaje: string;
  idCandidatoPropuesto: number;
}

/** `expectedLeaderId` es el testigo CAS: sin él, dos administradores se pisarían en silencio. */
export interface TransferLeadershipInput {
  idLiderNuevo: number;
  expectedLeaderId: number;
  motivo: string;
}

/** El campo se llama `mensajeResolucion`, no `motivo`. */
export interface DenyAppealInput {
  mensajeResolucion: string;
}

export const ASUNTO_MAX = 200;
export const MENSAJE_APELACION_MAX = 10000;
export const MOTIVO_TRANSFERENCIA_MAX = 5000;
export const MENSAJE_RESOLUCION_MAX = 5000;
