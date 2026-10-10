import { apiFetch } from '@/lib/api/client';
import type { MiEventoDTO } from '@/lib/services/events';
import type { MiTareaDTO } from '@/lib/services/users';

/** HU-184: persona en la lista de calendarios compartidos. */
export interface UsuarioCalendarioDTO {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  fotoUrl: string | null;
}

export interface CalendariosCompartidosDTO {
  /** Personas con las que yo compartí mi calendario. */
  compartidoPorMi: UsuarioCalendarioDTO[];
  /** Personas que me compartieron su calendario (estilo Teams: se superponen al mío). */
  compartidosConmigo: UsuarioCalendarioDTO[];
}

/** Fecha límite de una tarea de otra persona: solo lo necesario para pintarla. */
export interface TareaCompartidaDTO {
  idTarea: number;
  tituloTarea: string;
  estadoTarea: MiTareaDTO['estadoTarea'];
  prioridad: MiTareaDTO['prioridad'];
  fechaLimite: string;
  proyecto: { idProyecto: number; tituloProyecto: string };
}

export interface AgendaCompartidaDTO {
  eventos: MiEventoDTO[];
  tareas: TareaCompartidaDTO[];
}

/** GET /usuarios/me/calendario/compartidos */
export function getCalendariosCompartidos(): Promise<CalendariosCompartidosDTO> {
  return apiFetch<CalendariosCompartidosDTO>('/usuarios/me/calendario/compartidos');
}

/** POST /usuarios/me/calendario/compartidos — comparte mi calendario (solo lectura). */
export function compartirCalendario(idUsuario: number): Promise<UsuarioCalendarioDTO> {
  return apiFetch<UsuarioCalendarioDTO>('/usuarios/me/calendario/compartidos', {
    method: 'POST',
    body: JSON.stringify({ idUsuario }),
  });
}

/** DELETE /usuarios/me/calendario/compartidos/:idUsuario */
export function dejarDeCompartirCalendario(idUsuario: number): Promise<{ eliminado: boolean }> {
  return apiFetch<{ eliminado: boolean }>(`/usuarios/me/calendario/compartidos/${idUsuario}`, { method: 'DELETE' });
}

/** GET /usuarios/me/calendario/compartidos-conmigo/:idPropietario/agenda?desde&hasta */
export function getAgendaCompartida(idPropietario: number, desde: Date, hasta: Date): Promise<AgendaCompartidaDTO> {
  const params = new URLSearchParams({ desde: desde.toISOString(), hasta: hasta.toISOString() });
  return apiFetch<AgendaCompartidaDTO>(
    `/usuarios/me/calendario/compartidos-conmigo/${idPropietario}/agenda?${params.toString()}`,
  );
}
