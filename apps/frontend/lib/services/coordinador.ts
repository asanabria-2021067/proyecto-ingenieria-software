import { apiFetch } from '@/lib/api/client';

export interface CarreraAlcance {
  idCarrera: number;
  nombreCarrera: string;
  facultad: string | null;
}

/** GET /coordinador/mi-alcance. Para el administrador `todas` es true y `carreras` va vacío. */
export interface MiAlcance {
  todas: boolean;
  carreras: CarreraAlcance[];
  regla: string;
}

export type ClavePendienteCoordinador = 'revisiones' | 'cierres';

/** GET /coordinador/pendientes: conteos filtrados al alcance del coordinador. */
export interface PendientesCoordinador {
  total: number;
  items: Array<{ clave: ClavePendienteCoordinador; total: number }>;
}

/** GET|PUT /admin/coordinadores/:idUsuario/alcance. */
export interface AlcanceCoordinador {
  idUsuario: number;
  carreraIds: number[];
  facultades: string[];
  carreras: CarreraAlcance[];
  regla: string;
}

export interface GuardarAlcancePayload {
  carreraIds: number[];
  facultades: string[];
}

export const getMiAlcance = () => apiFetch<MiAlcance>('/coordinador/mi-alcance');

export const getPendientesCoordinador = () => apiFetch<PendientesCoordinador>('/coordinador/pendientes');

export const getAlcanceCoordinador = (idUsuario: number) =>
  apiFetch<AlcanceCoordinador>(`/admin/coordinadores/${idUsuario}/alcance`);

export const guardarAlcanceCoordinador = (idUsuario: number, payload: GuardarAlcancePayload) =>
  apiFetch<AlcanceCoordinador>(`/admin/coordinadores/${idUsuario}/alcance`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
