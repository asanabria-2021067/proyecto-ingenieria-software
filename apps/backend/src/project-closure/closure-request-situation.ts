/**
 * Situación de una solicitud de cierre para la bandeja administrativa.
 *
 * Un proyecto en `EN_SOLICITUD_CIERRE` no dice por sí solo en qué punto está
 * su cierre: lo dice su cadena de `RevisionCierreProyecto`. Esta función la
 * lee y devuelve UNA situación por proyecto.
 *
 * Es pura a propósito —sin Prisma, sin reloj, sin bitácora—: la bitácora no
 * conserva todos los eventos del flujo, así que la única fuente fiable son las
 * filas de revisión persistidas. No modifica lo que recibe.
 */

export const SITUACIONES_SOLICITUD_CIERRE = [
  'PENDIENTE_DE_EVALUACION',
  'REENVIADA_PARA_REVISION',
  'EN_ESPERA_DE_CORRECCIONES',
  'SIN_ENTREGA_FORMAL',
  'SIN_CLASIFICACION',
] as const;
export type SituacionSolicitudCierre = (typeof SITUACIONES_SOLICITUD_CIERRE)[number];

/** Estados de `EstadoRevisionCierre`; se aceptan como texto para no acoplar la función a Prisma. */
export interface RevisionCierreResumen {
  idRevisionCierre: number;
  numeroRevision: number;
  estadoRevision: string;
  enviadaEn: Date | null;
  resueltaEn: Date | null;
}

export interface SolicitudCierreClasificada {
  situacion: SituacionSolicitudCierre;
  /** Solo en pendientes: primera solicitud o una nueva tras devolver a ejecución. */
  origen: 'PRIMERA_SOLICITUD' | 'NUEVA_SOLICITUD_TRAS_DEVOLUCION' | null;
  /** Revisión vigente: la `ENVIADA` o, en espera de correcciones, el borrador. */
  revisionId: number | null;
  numeroRevision: number | null;
  enviadaEn: Date | null;
  /** Cuándo pidió el administrador la corrección que originó la revisión vigente. */
  correccionSolicitadaEn: Date | null;
  /** Solo una entrega `ENVIADA` admite veredicto. */
  puedeResolver: boolean;
}

const ultima = <T>(lista: readonly T[]): T | null => (lista.length > 0 ? lista[lista.length - 1] : null);

const SIN_REVISION = { origen: null, revisionId: null, numeroRevision: null, enviadaEn: null, correccionSolicitadaEn: null, puedeResolver: false } as const;

/**
 * Clasifica la cadena de revisiones de UN proyecto en solicitud de cierre.
 *
 * - Sin revisiones → `SIN_ENTREGA_FORMAL` (proyectos legacy).
 * - Con una `ENVIADA` → `REENVIADA_PARA_REVISION` si la revisión resuelta
 *   inmediatamente anterior es `CORRECCION_DOCUMENTAL`; si no,
 *   `PENDIENTE_DE_EVALUACION`. `numeroRevision > 1` NO basta: una solicitud
 *   nueva tras `DEVUELTA_A_EJECUCION` también es mayor que 1.
 * - Sin `ENVIADA` y con un `BORRADOR` nacido de una corrección →
 *   `EN_ESPERA_DE_CORRECCIONES`.
 * - Cualquier otra combinación → `SIN_CLASIFICACION`: nunca se fuerza.
 *
 * Si conviven `ENVIADA` y `BORRADOR` (los índices lo permiten, el flujo no),
 * gana la `ENVIADA`: es lo único que el administrador puede resolver.
 */
export function clasificarSolicitudCierre(revisiones: readonly RevisionCierreResumen[]): SolicitudCierreClasificada {
  if (revisiones.length === 0) return { situacion: 'SIN_ENTREGA_FORMAL', ...SIN_REVISION };

  const cadena = [...revisiones].sort((a, b) => a.numeroRevision - b.numeroRevision);
  /** Última revisión RESUELTA por debajo de `numero`; un borrador no es un veredicto previo. */
  const anteriorResuelta = (numero: number) =>
    ultima(cadena.filter((r) => r.numeroRevision < numero && r.estadoRevision !== 'BORRADOR'));
  const vigente = (estado: string) => ultima(cadena.filter((r) => r.estadoRevision === estado));

  // Un proyecto aún en solicitud de cierre no puede tener un cierre aprobado.
  const inconsistente: SolicitudCierreClasificada = { situacion: 'SIN_CLASIFICACION', ...SIN_REVISION };
  if (cadena.some((r) => r.estadoRevision === 'APROBADA')) return inconsistente;

  const enviada = vigente('ENVIADA');
  if (enviada) {
    const anterior = anteriorResuelta(enviada.numeroRevision);
    const base = {
      revisionId: enviada.idRevisionCierre,
      numeroRevision: enviada.numeroRevision,
      enviadaEn: enviada.enviadaEn,
      puedeResolver: true,
    };
    if (anterior?.estadoRevision === 'CORRECCION_DOCUMENTAL') {
      return { situacion: 'REENVIADA_PARA_REVISION', origen: null, ...base, correccionSolicitadaEn: anterior.resueltaEn };
    }
    return {
      situacion: 'PENDIENTE_DE_EVALUACION',
      origen: anterior?.estadoRevision === 'DEVUELTA_A_EJECUCION' ? 'NUEVA_SOLICITUD_TRAS_DEVOLUCION' : 'PRIMERA_SOLICITUD',
      ...base,
      correccionSolicitadaEn: null,
    };
  }

  const borrador = vigente('BORRADOR');
  const origenBorrador = borrador ? anteriorResuelta(borrador.numeroRevision) : null;
  if (borrador && origenBorrador?.estadoRevision === 'CORRECCION_DOCUMENTAL') {
    return {
      situacion: 'EN_ESPERA_DE_CORRECCIONES',
      origen: null,
      revisionId: borrador.idRevisionCierre,
      numeroRevision: borrador.numeroRevision,
      enviadaEn: null,
      correccionSolicitadaEn: origenBorrador.resueltaEn,
      puedeResolver: false,
    };
  }

  return inconsistente;
}
