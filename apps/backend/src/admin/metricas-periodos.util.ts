import type { PeriodoMetricas } from './dto/metricas-query.dto';

/**
 * HU-178 (T-300): límites de los periodos de las métricas del panel admin.
 * Semanas de lunes a domingo y meses calendario en hora de Guatemala — la
 * misma zona que eventos y validación de fechas. America/Guatemala no tiene
 * horario de verano, así que el desfase UTC-6 es fijo y no hace falta Intl.
 */
const DESFASE_GUATEMALA_MS = 6 * 60 * 60 * 1000;
const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** Cantidad de periodos de cada serie, incluido el periodo en curso. */
export const CANTIDAD_PERIODOS: Record<PeriodoMetricas, number> = {
  semana: 8,
  mes: 6,
};

export interface RangoPeriodo {
  /** Instante UTC del inicio (inclusivo) del periodo. */
  inicio: Date;
  /** Instante UTC del fin (exclusivo) del periodo. */
  fin: Date;
  /** Fecha calendario de Guatemala en que inicia el periodo (YYYY-MM-DD). */
  etiqueta: string;
}

/**
 * Periodos en orden cronológico, del más antiguo al que contiene `ahora`.
 * Se calcula sobre el "reloj de pared" de Guatemala (UTC corrido 6 h) y
 * luego se devuelve cada límite como instante UTC real.
 */
export function construirPeriodos(periodo: PeriodoMetricas, ahora: Date = new Date()): RangoPeriodo[] {
  const local = new Date(ahora.getTime() - DESFASE_GUATEMALA_MS);
  const anio = local.getUTCFullYear();
  const mes = local.getUTCMonth();
  const dia = local.getUTCDate();
  const cantidad = CANTIDAD_PERIODOS[periodo];

  const periodos: RangoPeriodo[] = [];
  for (let i = cantidad - 1; i >= 0; i--) {
    let inicioLocal: number;
    let finLocal: number;
    if (periodo === 'semana') {
      const diasDesdeLunes = (local.getUTCDay() + 6) % 7;
      inicioLocal = Date.UTC(anio, mes, dia - diasDesdeLunes - 7 * i);
      finLocal = inicioLocal + 7 * UN_DIA_MS;
    } else {
      inicioLocal = Date.UTC(anio, mes - i, 1);
      finLocal = Date.UTC(anio, mes - i + 1, 1);
    }
    periodos.push({
      inicio: new Date(inicioLocal + DESFASE_GUATEMALA_MS),
      fin: new Date(finLocal + DESFASE_GUATEMALA_MS),
      etiqueta: new Date(inicioLocal).toISOString().slice(0, 10),
    });
  }
  return periodos;
}

/** Índice del periodo que contiene `fecha`, o -1 si queda fuera de la ventana. */
export function indicePeriodo(fecha: Date, periodos: RangoPeriodo[]): number {
  const t = fecha.getTime();
  return periodos.findIndex((p) => t >= p.inicio.getTime() && t < p.fin.getTime());
}
