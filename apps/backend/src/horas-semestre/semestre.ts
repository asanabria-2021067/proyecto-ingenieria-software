import { addDaysToDay, diffInDays, guatemalaDayOf } from '../common/utils/guatemala-date';

export interface Semestre {
  anio: number;
  periodo: 1 | 2;
  /** YYYY-MM-DD */
  inicio: string;
  fin: string;
}

export function semestreDeAnioPeriodo(anio: number, periodo: 1 | 2): Semestre {
  return periodo === 1
    ? { anio, periodo, inicio: `${anio}-01-01`, fin: `${anio}-06-30` }
    : { anio, periodo, inicio: `${anio}-07-01`, fin: `${anio}-12-31` };
}

/** Semestre (hora de Guatemala) al que pertenece un instante: 1ro 1 ene-30 jun, 2do 1 jul-31 dic. */
export function semestreDe(fecha: Date): Semestre {
  const dia = guatemalaDayOf(fecha);
  return semestreDeAnioPeriodo(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) <= 6 ? 1 : 2);
}

/** Desde el 5 de enero y el 1 de julio se vuelve a pedir el registro; del 1 al 4 de enero solo a quien nunca ha tenido uno. */
export function necesitaRegistro(p: {
  hoy: string;
  tieneRegistroActual: boolean;
  tieneAlgunRegistro: boolean;
}): boolean {
  if (p.tieneRegistroActual) return false;
  return !p.tieneAlgunRegistro || p.hoy.slice(5) >= '01-05';
}

/**
 * Proyeccion lineal: ritmo = avance / dias transcurridos del semestre.
 * Devuelve el dia (YYYY-MM-DD) en que se alcanza la meta, o null si no hay ritmo para proyectar.
 */
export function proyectarFechaMeta(p: {
  avance: number;
  meta: number | null;
  inicioSemestre: string;
  hoy: string;
}): string | null {
  if (p.meta === null || p.meta <= 0) return null;
  if (p.avance >= p.meta) return p.hoy;
  const transcurridos = diffInDays(p.hoy, p.inicioSemestre) + 1;
  if (p.avance <= 0 || transcurridos <= 0) return null;
  const diasFaltantes = Math.ceil(((p.meta - p.avance) * transcurridos) / p.avance);
  return addDaysToDay(p.hoy, diasFaltantes);
}

/**
 * En riesgo si el avance (% de la meta) esta mas de 20 puntos por debajo del
 * avance esperado segun el tiempo transcurrido del semestre.
 */
export function esEnRiesgo(avancePct: number, inicioSemestre: string, finSemestre: string, hoy: string): boolean {
  const total = diffInDays(finSemestre, inicioSemestre) + 1;
  const transcurridos = Math.min(Math.max(diffInDays(hoy, inicioSemestre) + 1, 0), total);
  return avancePct < (transcurridos / total) * 100 - 20;
}
