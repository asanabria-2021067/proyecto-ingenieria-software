import { EstadoProyecto } from '@prisma/client';
import type { ProjectIdSource } from '../project-policy/project-id-resolver.service';

/**
 * Sprint 7 (06 v2 §32/§33): tipos de la metadata obligatoria de toda ruta
 * de escritura participante. La metadata describe DÓNDE está el proyecto
 * (`source`), QUÉ estados de proyecto admite (`states`), QUÉ exige del Sprint
 * ambiente (`sprint`) y a QUÉ familia del catálogo pertenece (`family`), de
 * modo que el guard rechace temprano y el service repita la autorización
 * mutable después del lock con el mismo catálogo.
 */

export type { ProjectIdSource };

/** B=BORRADOR, R=EN_REVISION, O=OBSERVADO, P=PUBLICADO, E=EN_PROGRESO, S=EN_SOLICITUD_CIERRE, C=CERRADO. */
export type ProjectStateCode = 'B' | 'R' | 'O' | 'P' | 'E' | 'S' | 'C';

export const PROJECT_STATE_BY_CODE: Readonly<Record<ProjectStateCode, EstadoProyecto>> = {
  B: EstadoProyecto.BORRADOR,
  R: EstadoProyecto.EN_REVISION,
  O: EstadoProyecto.OBSERVADO,
  P: EstadoProyecto.PUBLICADO,
  E: EstadoProyecto.EN_PROGRESO,
  S: EstadoProyecto.EN_SOLICITUD_CIERRE,
  C: EstadoProyecto.CERRADO,
};

export type ProjectStates = readonly ProjectStateCode[];

/**
 * Exigencia sobre el Sprint AMBIENTE del proyecto (el operable, si existe):
 * - ACTIVO: debe existir un Sprint operable y estar ACTIVO;
 * - NOT_FINALIZING: no debe existir un Sprint EN_FINALIZACION (puede no haber operable);
 * - EN_FINALIZACION: el operable debe estar EN_FINALIZACION;
 * - NONE_OPERABLE: no debe existir ningún Sprint operable;
 * - ANY: sin exigencia de ambiente.
 */
export type SprintRequirement = 'ACTIVO' | 'NOT_FINALIZING' | 'EN_FINALIZACION' | 'NONE_OPERABLE' | 'ANY';

/** Exigencia sobre el Sprint de la ENTIDAD afectada; se evalúa en el service aunque el guard haya aprobado el ambiente. */
export type EntitySprintRequirement = 'ACTIVO' | 'EN_FINALIZACION' | 'NO_CERRADO' | 'ANY';

/**
 * Regla de actor de la familia. `ACTOR_EXISTENTE` significa que la
 * autorización específica de la familia (HU-D4 por rol, propietario del
 * tramo, autor del comentario, etc.) la decide el service con `tx`, y la
 * policy solo valida estado de proyecto, ambiente y entidad.
 */
export type WriteActorRule =
  | 'LIDER'
  | 'ADMIN'
  | 'PARTICIPANTE_ACTIVO'
  | 'LIDER_O_PARTICIPANTE_ACTIVO'
  | 'ACTOR_EXISTENTE';

/** Familias de escritura del catálogo de 06 v2 §32 (una por fila de la tabla). */
export type ProjectWriteFamily =
  | 'TAREA_WRITE'
  | 'TAREA_ASIGNACION'
  | 'AVANCE'
  | 'REGISTRO_TIEMPO'
  | 'AJUSTE_HORA'
  | 'ROL_CRUD'
  | 'ROL_ALTA_PARTICIPACION'
  | 'ROL_RETIRO'
  | 'ETIQUETA_CRUD'
  | 'ETIQUETA_TAREA'
  | 'COMENTARIO_PROYECTO_HITO'
  | 'COMENTARIO_TAREA'
  | 'SPRINT_START'
  | 'SPRINT_FINALIZE'
  | 'SPRINT_CLOSE'
  | 'HITO_CREATE'
  | 'PROYECTO_EDICION'
  | 'PUBLICACION_ENVIO'
  | 'PUBLICACION_REVISION'
  | 'MENSAJE_REVISION'
  | 'MENSAJE_REVISION_ACUSE'
  | 'POSTULACION'
  | 'SALIDA'
  | 'LIDERAZGO'
  | 'CIERRE_PREPARACION'
  | 'CIERRE_EVIDENCIAS'
  | 'CIERRE_ENVIO'
  | 'CIERRE_VEREDICTO'
  | 'CIERRE_LIMPIEZA';

export interface ProjectWriteMetadata {
  /** Fuente(s) enumerada(s) del identificador de proyecto; se usa la primera presente. */
  source: ProjectIdSource | ProjectIdSource[];
  /** Estados de proyecto admitidos. */
  states: ProjectStates;
  /** Exigencia del Sprint ambiente. */
  sprint: SprintRequirement;
  /** Familia del catálogo; opcional en el guard, obligatoria en el service. */
  family?: ProjectWriteFamily;
}

/** Default restrictivo (06 v2 §32): P/E + Sprint ambiente ACTIVO, proyecto en `params.projectId`. */
export const DEFAULT_PROJECT_WRITE_METADATA: ProjectWriteMetadata = Object.freeze({
  source: { kind: 'param', name: 'projectId' } as ProjectIdSource,
  states: ['P', 'E'] as const,
  sprint: 'ACTIVO',
});

/** Mensajes congelados (SYNC GATE 2) que el guard y la policy conservan literalmente. */
export const NO_ACTIVE_SPRINT_MESSAGE = 'No hay un Sprint activo en este proyecto';
export const FINALIZING_SPRINT_MESSAGE =
  'El Sprint actual está en finalización y el proyecto está temporalmente bloqueado';
export const NO_FINALIZING_SPRINT_MESSAGE = 'El Sprint actual no está en finalización';
export const OPERABLE_SPRINT_EXISTS_MESSAGE = 'Ya existe un Sprint operable en este proyecto';
export const PROJECT_STATE_INVALID_CODE = 'PROYECTO_ESTADO_INVALIDO';
export const PROJECT_STATE_INVALID_MESSAGE = 'El estado actual del proyecto no permite esta operación';
export const ENTITY_SPRINT_INVALID_MESSAGE =
  'El Sprint de la entidad afectada no admite esta operación';
