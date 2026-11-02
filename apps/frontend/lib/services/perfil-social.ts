import { apiFetch, apiFetchBlob } from '@/lib/api/client';
import type { RolOrganizacion } from '@/lib/types/organizations';

/** MEJ-26: `GET /social/usuarios/:id/resumen`. Las horas son solo las acreditadas en UVGenius. */
export interface PerfilResumen {
  organizaciones: { idOrganizacion: number; nombreOrganizacion: string; logoUrl: string | null; rol: RolOrganizacion }[];
  asociaciones: { idAsociacion: number; nombre: string; logoUrl: string | null }[];
  /** Amigos aceptados con una conversación o un proyecto activo compartido. */
  puedeMensaje: boolean;
  horasSemestre: { anio: number; periodo: 1 | 2; becaAcreditadas: number; extensionAcreditadas: number };
}

/** MEJ-64: `GET /social/usuarios/:id/actividad`. */
export interface ActividadReciente {
  tipo: 'PROYECTO' | 'INSIGNIA' | 'ORGANIZACION';
  fecha: string;
  titulo: string;
  detalle: string | null;
  idProyecto: number | null;
  idOrganizacion: number | null;
}

/** MEJ-27/63: `GET /social/usuarios/:id/cv`. */
export interface CvProyectos {
  nombre: string;
  carrera: string | null;
  proyectos: { idProyecto: number; titulo: string; rol: string; inicio: string | null; fin: string | null; horasAcreditadas: number }[];
  totalHorasAcreditadas: number;
}

/** MEJ-28: conversación individual (de un proyecto compartido) lista para abrir en /dashboard/mensajes/:id. */
export interface MensajeDirecto {
  idConversacion: number;
  idProyecto: number;
}

export const getPerfilResumen = (id: number) => apiFetch<PerfilResumen>(`/social/usuarios/${id}/resumen`);

export const getActividadReciente = (id: number) => apiFetch<ActividadReciente[]>(`/social/usuarios/${id}/actividad`);

export const getCvProyectos = (id: number) => apiFetch<CvProyectos>(`/social/usuarios/${id}/cv`);

export const descargarCvPdf = (id: number) => apiFetchBlob(`/social/usuarios/${id}/cv/pdf`);

export const abrirMensajeDirecto = (idAmigo: number) =>
  apiFetch<MensajeDirecto>(`/social/amistades/${idAmigo}/mensaje`, { method: 'POST' });
