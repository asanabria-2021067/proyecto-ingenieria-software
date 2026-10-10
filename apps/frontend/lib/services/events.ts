import { apiFetch } from '@/lib/api/client';

/** Modalidad de la sesión de un evento — mismos 3 valores que ModalidadProyecto, enum propio. */
export type ModalidadEvento = 'PRESENCIAL' | 'VIRTUAL' | 'MIXTA';

/** HU-184: categoría del evento (color en el calendario). */
export type TipoEvento = 'TUTORIA' | 'REUNION' | 'ENTREGA' | 'REVISION' | 'TALLER' | 'OTRO';

/** HU-169 (T-263): evento de calendario de un proyecto. */
export interface EventoProyectoDTO {
  idEvento: number;
  idProyecto: number;
  tituloEvento: string;
  descripcionEvento: string | null;
  fechaInicio: string;
  fechaFin: string;
  antelacionMinutos: number;
  modalidad: ModalidadEvento;
  ubicacionLat: number | null;
  ubicacionLng: number | null;
  ubicacionNombre: string | null;
  linkSesion: string | null;
  /** idRolProyecto destinatarios; [] = visible para todos los participantes. */
  rolesDestino: number[];
  /** HU-184 */
  tipoEvento: TipoEvento;
  /** HU-184: idUsuario invitados; [] = todo el proyecto. */
  invitados: number[];
}

/** GET /usuarios/me/eventos incluye el proyecto para poder agruparlo en la vista global. */
export interface MiEventoDTO extends EventoProyectoDTO {
  proyecto: { idProyecto: number; tituloProyecto: string };
}

export interface EventPayload {
  tituloEvento: string;
  descripcionEvento?: string;
  fechaInicio: string;
  fechaFin: string;
  antelacionMinutos?: number;
  modalidad?: ModalidadEvento;
  ubicacionLat?: number;
  ubicacionLng?: number;
  ubicacionNombre?: string;
  linkSesion?: string;
  rolesDestino?: number[];
  tipoEvento?: TipoEvento;
  invitados?: number[];
}

/** Eventos de todos los proyectos del usuario (líder o integrante activo) en un rango — GET /usuarios/me/eventos */
export function getMisEventos(desde: Date, hasta: Date): Promise<MiEventoDTO[]> {
  const params = new URLSearchParams({ desde: desde.toISOString(), hasta: hasta.toISOString() });
  return apiFetch<MiEventoDTO[]>(`/usuarios/me/eventos?${params.toString()}`);
}

export function getProjectEvents(projectId: number): Promise<EventoProyectoDTO[]> {
  return apiFetch<EventoProyectoDTO[]>(`/proyectos/${projectId}/eventos`);
}

export function createEvent(projectId: number, payload: EventPayload): Promise<EventoProyectoDTO> {
  return apiFetch<EventoProyectoDTO>(`/proyectos/${projectId}/eventos`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateEvent(
  projectId: number,
  eventId: number,
  payload: Partial<EventPayload>,
): Promise<EventoProyectoDTO> {
  return apiFetch<EventoProyectoDTO>(`/proyectos/${projectId}/eventos/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteEvent(projectId: number, eventId: number): Promise<void> {
  return apiFetch<void>(`/proyectos/${projectId}/eventos/${eventId}`, { method: 'DELETE' });
}
