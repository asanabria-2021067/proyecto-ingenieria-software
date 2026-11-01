import type { CargoJunta, FiltrosAsociacion, MiJunta, NivelPermisoJunta, TipoHorasFiltro } from '@/lib/services/asociaciones';

export const CARGO_LABEL: Record<CargoJunta, string> = {
  PRESIDENTE: 'Presidente',
  VICEPRESIDENTE: 'Vicepresidente',
  SECRETARIO: 'Secretario',
  TESORERO: 'Tesorero',
  VOCAL: 'Vocal',
};

export const NIVEL_LABEL: Record<NivelPermisoJunta, string> = {
  ADMINISTRADOR: 'Administrador',
  EDITOR: 'Editor',
  LECTURA: 'Lectura',
};

export const AVISO_PRIVACIDAD_JUNTA = 'La junta directiva de la asociación de tu carrera puede ver tu avance de horas.';

export const rutaAsociacion = (idAsociacion: number) => `/dashboard/asociacion/${idAsociacion}`;

/** Id de la asociación cuya vista está abierta, o null si se está en la vista de estudiante. */
export function asociacionDeRuta(pathname: string | null): number | null {
  const m = /^\/dashboard\/asociacion\/(\d+)(\/|$)/.exec(pathname ?? '');
  return m ? Number(m[1]) : null;
}

/** Mismas reglas que el servidor: el Presidente y quien tenga nivel Editor o superior publican a nombre de la asociación. */
export const puedePublicarComoAsociacion = (j: Pick<MiJunta, 'cargo' | 'nivelPermiso'>) =>
  j.cargo === 'PRESIDENTE' || j.nivelPermiso === 'EDITOR' || j.nivelPermiso === 'ADMINISTRADOR';

export interface FiltrosAsociacionUI {
  /** `actual` o `anio-periodo`. */
  semestre: string;
  tipo: 'todos' | TipoHorasFiltro;
  enRiesgo: boolean;
  busqueda: string;
}

export const FILTROS_ASOCIACION_INICIALES: FiltrosAsociacionUI = { semestre: 'actual', tipo: 'todos', enRiesgo: false, busqueda: '' };

export function filtrosAsociacion(ui: FiltrosAsociacionUI): FiltrosAsociacion {
  const filtros: FiltrosAsociacion = {};
  if (ui.semestre !== 'actual') {
    const [anio, periodo] = ui.semestre.split('-').map(Number);
    filtros.anio = anio;
    filtros.periodo = periodo as 1 | 2;
  }
  if (ui.tipo !== 'todos') filtros.tipo = ui.tipo;
  if (ui.enRiesgo) filtros.enRiesgo = true;
  if (ui.busqueda.trim()) filtros.busqueda = ui.busqueda.trim();
  return filtros;
}

export const hayFiltrosAsociacion = (ui: FiltrosAsociacionUI) =>
  ui.semestre !== 'actual' || ui.tipo !== 'todos' || ui.enRiesgo || ui.busqueda.trim() !== '';
