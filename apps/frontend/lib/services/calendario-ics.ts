import { apiFetch, apiFetchBlob } from '@/lib/api/client';
import type { EventoProyectoDTO } from '@/lib/services/events';

/** MEJ-34: evento abierto de un proyecto de la organización (`GET /organizaciones/:id/calendario`). */
export type EventoOrganizacion = Pick<
  EventoProyectoDTO,
  'idEvento' | 'idProyecto' | 'tituloEvento' | 'descripcionEvento' | 'fechaInicio' | 'fechaFin' | 'modalidad' | 'ubicacionNombre' | 'linkSesion' | 'tipoEvento'
> & { proyecto: { idProyecto: number; tituloProyecto: string } };

const rango = (desde: Date, hasta: Date) => `desde=${encodeURIComponent(desde.toISOString())}&hasta=${encodeURIComponent(hasta.toISOString())}`;

export const getEventosOrganizacion = (id: number, desde: Date, hasta: Date) =>
  apiFetch<EventoOrganizacion[]>(`/organizaciones/${id}/calendario?${rango(desde, hasta)}`);

/** MEJ-33: archivo .ics de los eventos del rango (máximo 62 días). */
export const descargarIcsPropio = (desde: Date, hasta: Date) =>
  apiFetchBlob(`/usuarios/me/eventos/ics?${rango(desde, hasta)}`, { headers: { Accept: 'text/calendar' } });

export const descargarIcsOrganizacion = (id: number, desde: Date, hasta: Date) =>
  apiFetchBlob(`/organizaciones/${id}/calendario/ics?${rango(desde, hasta)}`, { headers: { Accept: 'text/calendar' } });
