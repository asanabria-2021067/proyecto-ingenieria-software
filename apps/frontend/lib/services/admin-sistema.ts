import { apiFetch, apiFetchBlob } from '@/lib/api/client';

export interface MantenimientoPublico {
  bloqueando: boolean;
  mensaje: string;
  regresoEstimado: string | null;
  inicioProgramado: string | null;
}

export interface MantenimientoAdmin extends MantenimientoPublico {
  activo: boolean;
}

export type MantenimientoInput = {
  activo: boolean;
  mensaje?: string;
  regresoEstimado?: string | null;
  inicioProgramado?: string | null;
};

export const MENSAJE_MANTENIMIENTO = 'La plataforma está en mantenimiento. Disculpa las molestias.';

export const getMantenimiento = () => apiFetch<MantenimientoPublico>('/mantenimiento');
export const getAdminMantenimiento = () => apiFetch<MantenimientoAdmin>('/admin/mantenimiento');
export const putAdminMantenimiento = (body: MantenimientoInput) =>
  apiFetch<MantenimientoAdmin>('/admin/mantenimiento', { method: 'PUT', body: JSON.stringify(body) });

export type EstadoServicio = 'operativo' | 'caido' | 'no_configurado';

export interface EstadoSistema {
  baseDatos: EstadoServicio;
  redis: EstadoServicio;
  cloudinary: EstadoServicio;
  socket: EstadoServicio;
  conexionesSocket: number;
  version: { commit: string; fecha: string };
  migraciones: { nombre: string; fecha: string | null }[];
}

export const getEstadoSistema = () => apiFetch<EstadoSistema>('/admin/estado-sistema');

export interface TablaMeta {
  clave: string;
  etiqueta: string;
  columnas: string[];
  filtros: { columna: string; tipo: 'int' | 'bool' | 'texto' | 'enum'; valores?: string[] }[];
  busqueda: boolean;
}

export interface TablaConsulta {
  q?: string;
  filtros?: Record<string, string>;
  orden?: string;
  dir?: 'asc' | 'desc';
  pagina?: number;
  limite?: number;
}

export type TablaFila = Record<string, string | number | boolean | null>;

export interface TablaPagina {
  filas: TablaFila[];
  total: number;
  pagina: number;
  limite: number;
}

export const getTablas = () => apiFetch<TablaMeta[]>('/admin/tablas');

function tablaParams(c: TablaConsulta, paginado: boolean): string {
  const p = new URLSearchParams();
  if (c.q?.trim()) p.set('q', c.q.trim());
  const filtros = Object.entries(c.filtros ?? {}).filter(([, v]) => v !== '');
  if (filtros.length) p.set('filtros', filtros.map(([k, v]) => `${k}:${v}`).join(','));
  if (c.orden) {
    p.set('orden', c.orden);
    p.set('dir', c.dir ?? 'asc');
  }
  if (paginado) {
    p.set('pagina', String(c.pagina ?? 1));
    p.set('limite', String(c.limite ?? 20));
  }
  const texto = p.toString();
  return texto ? `?${texto}` : '';
}

export const getTablaPagina = (entidad: string, c: TablaConsulta) =>
  apiFetch<TablaPagina>(`/admin/tablas/${entidad}${tablaParams(c, true)}`);

export const getTablaRegistro = (entidad: string, id: string | number) =>
  apiFetch<TablaFila>(`/admin/tablas/${entidad}/${id}`);

/** El CSV llega como blob; `apiFetchBlob` pide PDF por defecto, aquí se pide CSV. */
export const getTablaCsv = (entidad: string, c: TablaConsulta) =>
  apiFetchBlob(`/admin/tablas/${entidad}/exportar${tablaParams(c, false)}`, { headers: { Accept: 'text/csv' } });
