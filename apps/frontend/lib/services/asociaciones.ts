import { apiFetch, apiFetchBlob } from '@/lib/api/client';
import type { FilaHorasCentral, Semestre } from '@/lib/services/horas-semestre';

export type CargoJunta = 'PRESIDENTE' | 'VICEPRESIDENTE' | 'SECRETARIO' | 'TESORERO' | 'VOCAL';
export type NivelPermisoJunta = 'ADMINISTRADOR' | 'EDITOR' | 'LECTURA';
export type TipoHorasFiltro = 'BECA' | 'EXTENSION';

export interface MiJunta {
  idAsociacion: number;
  nombre: string;
  logoUrl: string | null;
  cargo: CargoJunta;
  nivelPermiso: NivelPermisoJunta;
}

export interface FilaEstudianteAsociacion extends FilaHorasCentral {
  semestreCarrera: number | null;
  proyectosActivos: number;
}

export interface EstudiantesAsociacionPagina {
  semestre: Semestre;
  filas: FilaEstudianteAsociacion[];
  siguienteCursor: number | null;
}

export interface FiltrosAsociacion {
  anio?: number;
  periodo?: 1 | 2;
  tipo?: TipoHorasFiltro;
  enRiesgo?: boolean;
  busqueda?: string;
}

export interface ProyectoAsociacion {
  idProyecto: number;
  titulo: string;
  estado: string;
  avanceTareasPct: number;
  avanceSprintsPct: number;
  integrantes: number;
  horasAcreditadas: number;
}

function query(filtros: FiltrosAsociacion, extra: Record<string, number | undefined> = {}): string {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries({ ...filtros, ...extra })) {
    if (valor === undefined || valor === false || valor === '') continue;
    params.set(clave, String(valor));
  }
  const texto = params.toString();
  return texto ? `?${texto}` : '';
}

const base = (id: number) => `/asociaciones/${id}`;

export const getMisJuntas = () => apiFetch<MiJunta[]>('/asociaciones/mis-juntas');

export const getEstudiantesAsociacion = (id: number, filtros: FiltrosAsociacion, cursor?: number) =>
  apiFetch<EstudiantesAsociacionPagina>(`${base(id)}/estudiantes${query(filtros, { cursor, limit: 50 })}`);

export const getProyectosAsociacion = (id: number) => apiFetch<ProyectoAsociacion[]>(`${base(id)}/proyectos`);

export const descargarEstudiantesAsociacion = (id: number, formato: 'csv' | 'pdf', filtros: FiltrosAsociacion) =>
  apiFetchBlob(`${base(id)}/estudiantes/${formato}${query(filtros)}`, { headers: { Accept: '*/*' } });

export const descargarProyectosAsociacion = (id: number, formato: 'csv' | 'pdf') =>
  apiFetchBlob(`${base(id)}/proyectos/${formato}`, { headers: { Accept: '*/*' } });

export interface MetaAsociacion {
  idMeta: number;
  tipo: TipoHorasFiltro;
  porcentajeObjetivo: number;
  avance: { alDia: number; total: number; porcentaje: number };
  cumplida: boolean;
}

export interface MetasAsociacionRespuesta {
  semestre: { anio: number; periodo: 1 | 2 };
  metas: MetaAsociacion[];
}

export interface CrearMetaInput {
  anio: number;
  periodo: 1 | 2;
  tipo: TipoHorasFiltro;
  porcentajeObjetivo: number;
}

export const getMetasAsociacion = (id: number) => apiFetch<MetasAsociacionRespuesta>(`${base(id)}/metas`);

export const crearMetaAsociacion = (id: number, input: CrearMetaInput) =>
  apiFetch<unknown>(`${base(id)}/metas`, { method: 'POST', body: JSON.stringify(input) });

export const actualizarMetaAsociacion = (id: number, idMeta: number, porcentajeObjetivo: number) =>
  apiFetch<unknown>(`${base(id)}/metas/${idMeta}`, { method: 'PATCH', body: JSON.stringify({ porcentajeObjetivo }) });

export const eliminarMetaAsociacion = (id: number, idMeta: number) =>
  apiFetch<unknown>(`${base(id)}/metas/${idMeta}`, { method: 'DELETE' });

export interface AvisoAsociacionInput {
  mensaje: string;
  filtros: FiltrosAsociacion;
  cantidadEsperada: number;
}

export const contarDestinatariosAviso = (id: number, filtros: FiltrosAsociacion) =>
  apiFetch<{ cantidad: number; maximo: number }>(`${base(id)}/avisos/destinatarios${query(filtros)}`);

export const enviarAvisoAsociacion = (id: number, input: AvisoAsociacionInput) =>
  apiFetch<{ idAnuncio: number; destinatarios: number }>(`${base(id)}/avisos`, { method: 'POST', body: JSON.stringify(input) });

export interface MiembroJunta {
  idJuntaAsociacion: number;
  idUsuario: number;
  cargo: CargoJunta;
  nivelPermiso: NivelPermisoJunta;
  usuario: { idUsuario: number; nombre: string; apellido: string; correo: string };
}

export interface AsociacionAdmin {
  idAsociacion: number;
  nombre: string;
  descripcion: string | null;
  logoUrl: string | null;
  archivada: boolean;
  carreras: { carrera: { idCarrera: number; nombreCarrera: string } }[];
  junta: MiembroJunta[];
}

export interface AsociacionInput {
  nombre: string;
  descripcion?: string;
  idsCarreras: number[];
}

export interface AsignarJuntaInput {
  idUsuario: number;
  cargo: CargoJunta;
  nivelPermiso?: NivelPermisoJunta;
}

const ADMIN = '/admin/asociaciones';
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const getAsociacionesAdmin = () => apiFetch<AsociacionAdmin[]>(ADMIN);

export const crearAsociacion = (input: AsociacionInput) => apiFetch<AsociacionAdmin>(ADMIN, json('POST', input));

export const actualizarAsociacion = (id: number, input: Partial<AsociacionInput> & { archivada?: boolean }) =>
  apiFetch<AsociacionAdmin>(`${ADMIN}/${id}`, json('PATCH', input));

export const asignarJunta = (id: number, input: AsignarJuntaInput) => apiFetch<MiembroJunta>(`${ADMIN}/${id}/junta`, json('POST', input));

export const actualizarJunta = (id: number, idUsuario: number, input: { cargo?: CargoJunta; nivelPermiso?: NivelPermisoJunta }) =>
  apiFetch<MiembroJunta>(`${ADMIN}/${id}/junta/${idUsuario}`, json('PATCH', input));

export const quitarJunta = (id: number, idUsuario: number) =>
  apiFetch<{ idAsociacion: number; idUsuario: number }>(`${ADMIN}/${id}/junta/${idUsuario}`, { method: 'DELETE' });

export interface CandidatoParticipante {
  idUsuario: number;
  nombre: string;
  apellido: string;
  carne: string | null;
  cargo: CargoJunta | null;
}

export const getCandidatosParticipantes = (id: number, q?: string) =>
  apiFetch<CandidatoParticipante[]>(`${base(id)}/candidatos-participantes${q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
