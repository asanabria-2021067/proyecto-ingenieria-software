import type { ApelacionItemDto } from '@/lib/types/leadership';

/**
 * Piezas compartidas por la bandeja de apelaciones (`/dashboard/admin/apelaciones`)
 * y la vista de revisión (`/dashboard/admin/apelaciones/[apelacionId]`).
 */

/** Pestañas de la bandeja. «Pendientes» es la de trabajo y la predeterminada; el resto es historial. */
export const FILTROS_APELACION = [
  { value: 'PENDIENTE', label: 'Pendientes' },
  { value: 'ACEPTADA', label: 'Aceptadas' },
  { value: 'DENEGADA', label: 'Denegadas' },
  { value: 'CANCELADA', label: 'Canceladas' },
  { value: 'TODAS', label: 'Todas' },
] as const;
export type FiltroApelacion = (typeof FILTROS_APELACION)[number]['value'];
export const FILTRO_APELACION_PREDETERMINADO: FiltroApelacion = 'PENDIENTE';

/** Etiqueta de estado de apelación: tono `pill-*` (app/global.css); la forma la pone `.pill`. */
export const ESTADO_APELACION_BADGE: Record<string, { label: string; className: string }> = {
  PENDIENTE: { label: 'Pendiente', className: 'pill-amber' },
  ACEPTADA: { label: 'Aceptada', className: 'pill-success' },
  DENEGADA: { label: 'Denegada', className: 'pill-red' },
  CANCELADA: { label: 'Cancelada', className: 'pill-neutral' },
};

/** Sin `?estado=` (o con uno desconocido) se muestra la bandeja de trabajo: Pendientes. */
export function parseFiltroApelacion(value: string | null): FiltroApelacion {
  return (FILTROS_APELACION.some((f) => f.value === value) ? value : FILTRO_APELACION_PREDETERMINADO) as FiltroApelacion;
}

function query(filtro: FiltroApelacion, page: number): string {
  const params = new URLSearchParams();
  if (filtro !== FILTRO_APELACION_PREDETERMINADO) params.set('estado', filtro);
  if (page > 1) params.set('page', String(page));
  const texto = params.toString();
  return texto ? `?${texto}` : '';
}

export function appealsInboxHref(filtro: FiltroApelacion = FILTRO_APELACION_PREDETERMINADO, page = 1): string {
  return `/dashboard/admin/apelaciones${query(filtro, page)}`;
}

/** El detalle arrastra la pestaña y la página de origen para poder volver al mismo punto de la bandeja. */
export function appealDetailHref(idApelacion: number, filtro: FiltroApelacion = FILTRO_APELACION_PREDETERMINADO, page = 1): string {
  return `/dashboard/admin/apelaciones/${idApelacion}${query(filtro, page)}`;
}

/** Los estados del proyecto en los que el backend permite resolver una apelación (Publicado o En progreso). */
export function proyectoAdmiteResolucion(estadoProyecto: string | undefined): boolean {
  return estadoProyecto === 'PUBLICADO' || estadoProyecto === 'EN_PROGRESO';
}

export function nombreCompleto(u: { nombre: string; apellido: string }): string {
  return `${u.nombre} ${u.apellido}`.trim();
}

export function formatearFechaApelacion(iso: string | null | undefined): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Búsqueda local sobre la página cargada: proyecto, asunto, solicitante o candidato. */
export function coincideApelacion(a: ApelacionItemDto, texto: string): boolean {
  const q = texto.trim().toLowerCase();
  if (!q) return true;
  return [
    a.proyecto?.tituloProyecto ?? '',
    `#${a.idProyecto}`,
    `proyecto #${a.idProyecto}`,
    `#${a.idApelacion}`,
    a.asunto,
    nombreCompleto(a.liderSolicitante),
    nombreCompleto(a.candidatoPropuesto),
  ].some((v) => v.toLowerCase().includes(q));
}
