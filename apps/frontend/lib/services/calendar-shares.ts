import { apiFetch } from '@/lib/api/client';
import type { ModalidadEvento, TipoEvento } from '@/lib/services/events';
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

/**
 * G01 (UI-01): contrato mínimo de una agenda compartida. `DETALLE` solo cuando
 * tengo acceso propio al proyecto; si no, `OCUPADO`: horario sin identidad.
 * Nunca trae descripción, enlace, ubicación, invitados ni recordatorio: el
 * backend no los envía y estos tipos no los admiten.
 */
export type VisibilidadCompartida = 'DETALLE' | 'OCUPADO';

export type EventoCompartidoDTO = {
  idEvento: number;
  fechaInicio: string;
  fechaFin: string;
} & (
  | {
      visibilidad: 'DETALLE';
      tituloEvento: string;
      tipoEvento: TipoEvento;
      modalidad: ModalidadEvento;
      proyecto: { idProyecto: number; tituloProyecto: string };
    }
  | { visibilidad: 'OCUPADO' }
);

/** Fecha límite de una tarea de otra persona, con la misma política que los eventos. */
export type TareaCompartidaDTO = {
  idTarea: number;
  fechaLimite: string;
} & (
  | {
      visibilidad: 'DETALLE';
      tituloTarea: string;
      estadoTarea: MiTareaDTO['estadoTarea'];
      prioridad: MiTareaDTO['prioridad'];
      proyecto: { idProyecto: number; tituloProyecto: string };
    }
  | { visibilidad: 'OCUPADO' }
);

export interface AgendaCompartidaDTO {
  eventos: EventoCompartidoDTO[];
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

/** DELETE /usuarios/me/calendario/compartidos-conmigo/:idPropietario — G01 (UI-31): me quito un calendario que me compartieron. */
export function dejarDeRecibirCalendario(idPropietario: number): Promise<{ eliminado: boolean }> {
  return apiFetch<{ eliminado: boolean }>(`/usuarios/me/calendario/compartidos-conmigo/${idPropietario}`, {
    method: 'DELETE',
  });
}

/** GET /usuarios/me/calendario/compartidos-conmigo/:idPropietario/agenda?desde&hasta */
export function getAgendaCompartida(idPropietario: number, desde: Date, hasta: Date): Promise<AgendaCompartidaDTO> {
  const params = new URLSearchParams({ desde: desde.toISOString(), hasta: hasta.toISOString() });
  return apiFetch<AgendaCompartidaDTO>(
    `/usuarios/me/calendario/compartidos-conmigo/${idPropietario}/agenda?${params.toString()}`,
  );
}
