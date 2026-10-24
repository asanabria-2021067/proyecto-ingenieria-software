import { apiFetch } from '@/lib/api/client';

/**
 * HU-200 — comentarios de proyecto e hito (canal A del backend,
 * `ComentariosController`) y los datos de apoyo de las menciones. Los
 * comentarios de tarea siguen en `task-comments.ts`, con sus rutas anidadas.
 */

export interface UsuarioComentario {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
}

/** Mención ya validada por el backend, con el nombre VIGENTE del usuario. */
export interface MencionComentario {
  usuario: UsuarioComentario;
}

/** Forma común de un comentario listado en cualquiera de los tres canales. */
export interface ComentarioListado {
  idComentario: number;
  idAutor: number;
  contenido: string;
  creadoEn: string;
  editadoEn: string | null;
  autor: UsuarioComentario;
  /** Opcional: respuestas previas a HU-200 y fixtures antiguos no la traen. */
  menciones?: MencionComentario[];
}

export interface Mencionable extends UsuarioComentario {
  esLider: boolean;
}

export interface ConteoComentariosHito {
  idHito: number;
  cantidad: number;
}

export function getComentariosProyecto(idProyecto: number): Promise<ComentarioListado[]> {
  return apiFetch<ComentarioListado[]>(`/comentarios/proyecto/${idProyecto}`);
}

export function getComentariosHito(idHito: number): Promise<ComentarioListado[]> {
  return apiFetch<ComentarioListado[]>(`/comentarios/hito/${idHito}`);
}

export function crearComentarioProyecto(idProyecto: number, contenido: string): Promise<unknown> {
  return apiFetch(`/comentarios`, {
    method: 'POST',
    body: JSON.stringify({ idProyecto, contenido }),
  });
}

export function crearComentarioHito(idHito: number, contenido: string): Promise<unknown> {
  return apiFetch(`/comentarios`, {
    method: 'POST',
    body: JSON.stringify({ idHito, contenido }),
  });
}

/** PATCH genérico: solo comentarios de proyecto o hito (los de tarea usan su ruta anidada). */
export function editarComentario(idComentario: number, contenido: string): Promise<unknown> {
  return apiFetch(`/comentarios/${idComentario}`, {
    method: 'PATCH',
    body: JSON.stringify({ contenido }),
  });
}

export function eliminarComentario(idComentario: number): Promise<unknown> {
  return apiFetch(`/comentarios/${idComentario}`, { method: 'DELETE' });
}

/** Líder + participantes ACTIVO: quienes se pueden mencionar en el proyecto. */
export function getMencionables(idProyecto: number): Promise<Mencionable[]> {
  return apiFetch<Mencionable[]>(`/comentarios/proyecto/${idProyecto}/mencionables`);
}

export function getConteoComentariosHitos(idProyecto: number): Promise<ConteoComentariosHito[]> {
  return apiFetch<ConteoComentariosHito[]>(`/comentarios/proyecto/${idProyecto}/hitos/conteo`);
}
