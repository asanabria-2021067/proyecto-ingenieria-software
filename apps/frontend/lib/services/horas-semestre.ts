import { apiFetch, apiFetchBlob } from '@/lib/api/client';

export interface Semestre {
  anio: number;
  periodo: 1 | 2;
  inicio: string;
  fin: string;
}

export interface RegistroHorasSemestre {
  metaBeca: number | null;
  becaDeclarada: number;
  metaExtension: number | null;
  extensionDeclarada: number;
}

export interface HorasActual {
  semestre: Semestre;
  registro: RegistroHorasSemestre | null;
  necesitaRegistro: boolean;
}

export type ActualizarRegistroHoras = Partial<RegistroHorasSemestre>;

export interface TramoProgreso {
  meta: number | null;
  declaradas: number;
  acreditadas: number;
  avance: number;
  falta: number | null;
  fechaProyectada: string | null;
  enRiesgo: boolean;
}

export interface HorasProgreso {
  semestre: Semestre;
  beca: TramoProgreso;
  extension: TramoProgreso;
}

export interface HorasSemestreHistorial extends RegistroHorasSemestre {
  semestre: Semestre;
  becaAcreditada: number;
  extensionAcreditada: number;
}

export interface FilaHorasCentral {
  idUsuario: number;
  nombre: string;
  apellido: string;
  carne: string;
  idCarrera: number | null;
  carrera: string | null;
  metaBeca: number | null;
  becaDeclarada: number;
  becaAcreditada: number;
  faltaBeca: number | null;
  metaExtension: number | null;
  extensionDeclarada: number;
  extensionAcreditada: number;
  faltaExtension: number | null;
  enRiesgo: boolean;
}

export interface HorasCentralPagina {
  semestre: Semestre;
  filas: FilaHorasCentral[];
  siguienteCursor: number | null;
}

export interface TotalesCarrera {
  idCarrera: number | null;
  carrera: string | null;
  estudiantes: number;
  enRiesgo: number;
  metaBeca: number;
  becaDeclarada: number;
  becaAcreditada: number;
  faltaBeca: number;
  metaExtension: number;
  extensionDeclarada: number;
  extensionAcreditada: number;
  faltaExtension: number;
}

export interface HorasTotales {
  semestre: Semestre;
  porCarrera: TotalesCarrera[];
}

export interface AsociacionResumen {
  idAsociacion: number;
  nombre: string;
  archivada: boolean;
  carreras: { carrera: { idCarrera: number; nombreCarrera: string } }[];
}

export interface HorasCentralFiltros {
  anio?: number;
  periodo?: 1 | 2;
  idCarrera?: number;
  idAsociacion?: number;
  enRiesgo?: boolean;
}

function query(filtros: HorasCentralFiltros, extra: Record<string, number | undefined> = {}): string {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries({ ...filtros, ...extra })) {
    if (valor === undefined || valor === false) continue;
    params.set(clave, String(valor));
  }
  const texto = params.toString();
  return texto ? `?${texto}` : '';
}

export const getHorasActual = () => apiFetch<HorasActual>('/horas-semestre/actual');

export const putHorasActual = (data: ActualizarRegistroHoras) =>
  apiFetch<RegistroHorasSemestre>('/horas-semestre/actual', { method: 'PUT', body: JSON.stringify(data) });

export const getHorasProgreso = () => apiFetch<HorasProgreso>('/horas-semestre/progreso');

export const getHorasHistorial = () => apiFetch<HorasSemestreHistorial[]>('/horas-semestre/historial');

export const getHorasCentral = (filtros: HorasCentralFiltros, cursor?: number) =>
  apiFetch<HorasCentralPagina>(`/admin/horas-semestre${query(filtros, { cursor, limit: 50 })}`);

export const getHorasTotales = (filtros: HorasCentralFiltros) =>
  apiFetch<HorasTotales>(`/admin/horas-semestre/totales${query(filtros)}`);

export interface HorasComparativoSemestre {
  semestre: Semestre;
  estudiantesConRegistro: number;
  metaBeca: number;
  becaDeclarada: number;
  becaAcreditada: number;
  metaExtension: number;
  extensionDeclarada: number;
  extensionAcreditada: number;
}

export const getHorasComparativo = () =>
  apiFetch<{ semestres: HorasComparativoSemestre[] }>('/admin/horas-semestre/comparativo');

export interface ResumenAsociacion extends Omit<TotalesCarrera, 'idCarrera' | 'carrera'> {
  idAsociacion: number;
  nombre: string;
  carreras: string[];
  integrantesJunta: number;
  proyectosActivos: number;
}

export const getResumenAsociaciones = () =>
  apiFetch<{ semestre: Semestre; asociaciones: ResumenAsociacion[] }>('/admin/horas-semestre/resumen-asociaciones');

export const getAsociacionesAdmin = () => apiFetch<AsociacionResumen[]>('/admin/asociaciones');

export const descargarHorasCentral = (formato: 'csv' | 'pdf', filtros: HorasCentralFiltros) =>
  apiFetchBlob(`/admin/horas-semestre/${formato}${query(filtros)}`, { headers: { Accept: '*/*' } });
