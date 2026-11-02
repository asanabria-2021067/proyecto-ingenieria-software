import { apiFetch } from '@/lib/api/client';
import type { ProyectoDisponibleResumen } from '@/components/projects/available-project-card';

/** MEJ-19: dueño de un proyecto en Explorar. */
export type DuenioProyecto = 'PERSONAL' | 'ORGANIZACION' | 'ASOCIACION';

export const DUENIO_LABEL: Record<DuenioProyecto, string> = {
  PERSONAL: 'Personales',
  ORGANIZACION: 'De organizaciones',
  ASOCIACION: 'De asociaciones',
};

export interface CoincidenciaProyecto {
  porcentaje: number;
  interesesCompartidos: number;
  coincideHabilidades: boolean;
}

/** MEJ-15: proyecto de «Para ti» = el de Explorar + cuánto coincide contigo. */
export type ProyectoParaTi = ProyectoDisponibleResumen & { coincidencia: CoincidenciaProyecto };

export function getProyectosParaTi(duenio?: DuenioProyecto | ''): Promise<ProyectoParaTi[]> {
  return apiFetch<ProyectoParaTi[]>(duenio ? `/proyectos/para-ti?duenio=${duenio}` : '/proyectos/para-ti');
}

/** MEJ-20: copia el proyecto propio como borrador. */
export function duplicarProyecto(idProyecto: number): Promise<{ idProyecto: number; tituloProyecto: string; estadoProyecto: string }> {
  return apiFetch(`/proyectos/${idProyecto}/duplicar`, { method: 'POST' });
}

// ---- MEJ-18: seguir organizaciones y asociaciones

export interface SeguimientosMios {
  organizaciones: { idOrganizacion: number; nombreOrganizacion: string; logoUrl: string | null }[];
  asociaciones: { idAsociacion: number; nombre: string; logoUrl: string | null }[];
}

export interface AsociacionSeguible {
  idAsociacion: number;
  nombre: string;
  logoUrl: string | null;
  descripcion: string | null;
  carreras: string[];
  siguiendo: boolean;
}

export const getMisSeguimientos = () => apiFetch<SeguimientosMios>('/seguimientos/mios');
export const getAsociacionesSeguibles = () => apiFetch<AsociacionSeguible[]>('/seguimientos/asociaciones');
export const seguirOrganizacion = (id: number) => apiFetch(`/seguimientos/organizaciones/${id}`, { method: 'POST' });
export const dejarOrganizacion = (id: number) => apiFetch(`/seguimientos/organizaciones/${id}`, { method: 'DELETE' });
export const seguirAsociacion = (id: number) => apiFetch(`/seguimientos/asociaciones/${id}`, { method: 'POST' });
export const dejarAsociacion = (id: number) => apiFetch(`/seguimientos/asociaciones/${id}`, { method: 'DELETE' });

// ---- MEJ-22 / MEJ-62: invitar directo a un rol

export interface InvitacionRol {
  idInvitacionRol: number;
  mensaje: string | null;
  creadaEn: string;
  invitadoPor: { idUsuario: number; nombre: string; apellido: string; fotoUrl: string | null };
  rolProyecto: {
    idRolProyecto: number;
    nombreRol: string;
    descripcionRolProyecto: string | null;
    proyecto: { idProyecto: number; tituloProyecto: string; estadoProyecto: string };
  };
}

export interface InvitacionRolEnviada {
  idInvitacionRol: number;
  idRolProyecto: number;
  idInvitado: number;
}

export interface SugerenciaInvitado {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
  carrera: string | null;
  mismaCarrera: boolean;
  porcentaje: number;
  habilidadesEnComun: string[];
}

export const getMisInvitacionesRol = () => apiFetch<InvitacionRol[]>('/invitaciones-rol/mias');
export const getInvitacionesRolProyecto = (idProyecto: number) =>
  apiFetch<InvitacionRolEnviada[]>(`/invitaciones-rol/proyecto/${idProyecto}`);
export const invitarARol = (input: { idRolProyecto: number; idUsuario: number; mensaje?: string }) =>
  apiFetch<InvitacionRolEnviada>('/invitaciones-rol', { method: 'POST', body: JSON.stringify(input) });
export const responderInvitacionRol = (idInvitacionRol: number, aceptar: boolean) =>
  apiFetch(`/invitaciones-rol/${idInvitacionRol}/${aceptar ? 'aceptar' : 'rechazar'}`, { method: 'POST' });

export function getSugerenciasInvitado(params: { habilidades: number[]; idCarrera?: number | null; idProyecto?: number }) {
  const qs = new URLSearchParams();
  if (params.habilidades.length) qs.set('habilidades', params.habilidades.join(','));
  if (params.idCarrera) qs.set('carrera', String(params.idCarrera));
  if (params.idProyecto) qs.set('proyecto', String(params.idProyecto));
  return apiFetch<SugerenciaInvitado[]>(`/invitaciones-rol/sugerencias?${qs.toString()}`);
}
