import { apiFetch } from '@/lib/api/client';

export type ClavePaso = 'perfil' | 'horas' | 'postulacion' | 'organizacion' | 'mensaje';

export interface PrimerosPasos {
  pasos: { clave: ClavePaso; completado: boolean }[];
  completados: number;
  total: number;
  cerrada: boolean;
  visible: boolean;
}

export const getPrimerosPasos = () => apiFetch<PrimerosPasos>('/usuarios/me/primeros-pasos');

export const cerrarPrimerosPasos = () =>
  apiFetch<{ cerrada: true }>('/usuarios/me/primeros-pasos/cerrar', { method: 'POST' });

export const getEjemploProyecto = (idProyecto: number) =>
  apiFetch<{ existe: boolean; idSprint: number | null }>(`/proyectos/${idProyecto}/ejemplo`);

export const crearEjemploProyecto = (idProyecto: number) =>
  apiFetch<{ creado: boolean; idSprint: number }>(`/proyectos/${idProyecto}/ejemplo`, { method: 'POST' });

export const borrarEjemploProyecto = (idProyecto: number) =>
  apiFetch<{ tareasEliminadas: number; sprintEliminado: boolean }>(`/proyectos/${idProyecto}/ejemplo`, {
    method: 'DELETE',
  });

export interface ReporteProblemaPayload {
  ruta: string;
  userAgent: string;
  descripcion: string;
  urlCaptura?: string;
}

export const enviarReporteProblema = (payload: ReporteProblemaPayload) =>
  apiFetch<{ mensaje: string }>('/reportes-problema', { method: 'POST', body: JSON.stringify(payload) });

export type EstadoReporte = 'PENDIENTE' | 'ATENDIDO';

export interface ReporteProblema {
  idReporte: number;
  idUsuario: number;
  ruta: string;
  userAgent: string;
  descripcion: string;
  urlCaptura: string | null;
  estado: EstadoReporte;
  creadoEn: string;
  atendidoEn: string | null;
  atendidoPor: number | null;
  usuario: { idUsuario: number; nombre: string; apellido: string; correo: string };
}

export const listarReportesProblema = (estado: EstadoReporte) =>
  apiFetch<ReporteProblema[]>(`/admin/reportes-problema?estado=${estado}`);

export const atenderReporteProblema = (idReporte: number) =>
  apiFetch<{ idReporte: number; estado: 'ATENDIDO' }>(`/admin/reportes-problema/${idReporte}/atender`, {
    method: 'PATCH',
  });
