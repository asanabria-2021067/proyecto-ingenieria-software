import { apiFetch } from '@/lib/api/client';
import type {
  ActualizarOrganizacionInput,
  BusquedaOrganizaciones,
  CanalOrganizacion,
  CrearOrganizacionInput,
  InvitacionOrganizacion,
  InvitarInput,
  MensajeOrganizacion,
  MiInvitacion,
  MiOrganizacion,
  OrganizacionDetalle,
  OrganizacionResumen,
  PlantillaOrganizacion,
  RolOrganizacion,
  SolicitudUnirse,
  UsuarioOrganizacion,
} from '@/lib/types/organizations';

const BASE = '/organizaciones';
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const crearOrganizacion = (input: CrearOrganizacionInput) =>
  apiFetch<OrganizacionResumen>(BASE, json('POST', input));

export const getPlantillasOrganizacion = () => apiFetch<PlantillaOrganizacion[]>(`${BASE}/plantillas`);

export const actualizarOrganizacion = (id: number, input: ActualizarOrganizacionInput) =>
  apiFetch<OrganizacionResumen>(`${BASE}/${id}`, json('PATCH', input));

export const getMisOrganizaciones = () => apiFetch<MiOrganizacion[]>(`${BASE}/mias`);

export function buscarOrganizaciones(q: string, page = 1) {
  const params = new URLSearchParams({ page: String(page) });
  if (q.trim()) params.set('q', q.trim());
  return apiFetch<BusquedaOrganizaciones>(`${BASE}/buscar?${params.toString()}`);
}

export const getOrganizacion = (id: number) => apiFetch<OrganizacionDetalle>(`${BASE}/${id}`);

export const archivarOrganizacion = (id: number) =>
  apiFetch<{ idOrganizacion: number; archivada: boolean }>(`${BASE}/${id}/archivar`, { method: 'POST' });

/** `confirmar` lo exige el backend: la transferencia no es reversible por el propietario anterior. */
export const transferirOrganizacion = (id: number, idUsuario: number) =>
  apiFetch<{ idPropietario: number }>(`${BASE}/${id}/transferir`, json('POST', { idUsuario, confirmar: true }));

export const salirDeOrganizacion = (id: number) => apiFetch<void>(`${BASE}/${id}/salir`, { method: 'POST' });

export const cambiarRolMiembro = (id: number, idUsuario: number, rolOrganizacion: RolOrganizacion) =>
  apiFetch<{ idUsuario: number; rolOrganizacion: RolOrganizacion }>(
    `${BASE}/${id}/miembros/${idUsuario}`,
    json('PATCH', { rolOrganizacion }),
  );

export const quitarMiembro = (id: number, idUsuario: number) =>
  apiFetch<void>(`${BASE}/${id}/miembros/${idUsuario}`, { method: 'DELETE' });

export const buscarCandidatos = (id: number, q: string) =>
  apiFetch<UsuarioOrganizacion[]>(`${BASE}/${id}/candidatos?q=${encodeURIComponent(q.trim())}`);

export const getInvitacionesOrganizacion = (id: number) =>
  apiFetch<InvitacionOrganizacion[]>(`${BASE}/${id}/invitaciones`);

export const invitarMiembro = (id: number, input: InvitarInput) =>
  apiFetch<InvitacionOrganizacion>(`${BASE}/${id}/invitaciones`, json('POST', input));

export const cancelarInvitacion = (id: number, idInvitacion: number) =>
  apiFetch<void>(`${BASE}/${id}/invitaciones/${idInvitacion}`, { method: 'DELETE' });

export const getMisInvitaciones = () => apiFetch<MiInvitacion[]>(`${BASE}/invitaciones/mias`);

export const responderInvitacion = (idInvitacion: number, aceptar: boolean) =>
  apiFetch<{ idInvitacion: number; idOrganizacion: number; aceptada: boolean }>(
    `${BASE}/invitaciones/${idInvitacion}/${aceptar ? 'aceptar' : 'rechazar'}`,
    { method: 'POST' },
  );

export const getSolicitudesOrganizacion = (id: number) => apiFetch<SolicitudUnirse[]>(`${BASE}/${id}/solicitudes`);

export const solicitarUnirse = (id: number) =>
  apiFetch<{ idSolicitud: number; creadaEn: string; venceEn: string }>(`${BASE}/${id}/solicitudes`, {
    method: 'POST',
  });

export const resolverSolicitud = (id: number, idSolicitud: number, aceptar: boolean) =>
  apiFetch<{ idSolicitud: number; aceptada: boolean }>(
    `${BASE}/${id}/solicitudes/${idSolicitud}/${aceptar ? 'aceptar' : 'rechazar'}`,
    { method: 'POST' },
  );

export const getCanalOrganizacion = (id: number) => apiFetch<CanalOrganizacion>(`${BASE}/${id}/chat`);

export const getMensajesOrganizacion = (id: number) =>
  apiFetch<MensajeOrganizacion[]>(`${BASE}/${id}/chat/mensajes`);

export const enviarMensajeOrganizacion = (id: number, contenido: string) =>
  apiFetch<MensajeOrganizacion>(`${BASE}/${id}/chat/mensajes`, json('POST', { contenido }));
