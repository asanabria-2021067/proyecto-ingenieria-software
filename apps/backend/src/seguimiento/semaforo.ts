export type ColorSemaforo = 'VERDE' | 'AMARILLO' | 'ROJO';

export interface EntradaSemaforo {
  /** Hitos sin completar cuya fecha límite ya pasó. */
  hitosAtrasados: number;
  /** Hitos sin completar que vencen dentro de la ventana de aviso. */
  hitosProximos: number;
  /** Tareas sin terminar (no HECHO, no eliminadas). */
  tareasAbiertas: number;
  /** Tareas sin terminar con la fecha límite vencida. */
  tareasVencidas: number;
  /** Sprint operable con fecha de fin planeada; null si no hay. */
  sprint: { avancePct: number; transcurridoPct: number } | null;
}

export interface ResultadoSemaforo {
  color: ColorSemaforo;
  motivos: string[];
}

/** Días hacia adelante en que un hito sin completar ya cuenta como «por vencer». */
export const DIAS_HITO_PROXIMO = 3;
/** Fracción de tareas abiertas vencidas desde la que el proyecto pasa a rojo. */
export const UMBRAL_TAREAS_VENCIDAS_ROJO = 0.25;
/** Puntos porcentuales que el avance del sprint puede ir por detrás del tiempo transcurrido. */
export const ATRASO_SPRINT_AMARILLO = 15;
export const ATRASO_SPRINT_ROJO = 30;

export const AYUDA_SEMAFORO: Record<ColorSemaforo, string> = {
  VERDE: 'Sin hitos atrasados, sin tareas vencidas y el sprint va al ritmo del tiempo.',
  AMARILLO: 'Hay tareas vencidas, un hito por vencer o el sprint va un poco atrasado (15 a 29 puntos).',
  ROJO: 'Hay un hito atrasado, 1 de cada 4 tareas abiertas está vencida o el sprint va 30 puntos o más por detrás del tiempo.',
};

const limitar = (n: number) => Math.min(100, Math.max(0, n));

/** Semáforo de salud del proyecto: el peor de los criterios manda. Función pura. */
export function calcularSemaforo(e: EntradaSemaforo): ResultadoSemaforo {
  const rojo: string[] = [];
  const amarillo: string[] = [];

  if (e.hitosAtrasados > 0) {
    rojo.push(`${e.hitosAtrasados} ${e.hitosAtrasados === 1 ? 'hito atrasado' : 'hitos atrasados'}`);
  }
  if (e.tareasVencidas > 0 && e.tareasAbiertas > 0) {
    const texto = `${e.tareasVencidas} ${e.tareasVencidas === 1 ? 'tarea vencida' : 'tareas vencidas'}`;
    (e.tareasVencidas / e.tareasAbiertas >= UMBRAL_TAREAS_VENCIDAS_ROJO ? rojo : amarillo).push(texto);
  }
  if (e.hitosProximos > 0) {
    amarillo.push(
      `${e.hitosProximos} ${e.hitosProximos === 1 ? 'hito vence' : 'hitos vencen'} en ${DIAS_HITO_PROXIMO} días o menos`,
    );
  }
  if (e.sprint) {
    const atraso = Math.round(limitar(e.sprint.transcurridoPct) - limitar(e.sprint.avancePct));
    const texto = `El sprint va ${atraso} puntos por detrás del tiempo`;
    if (atraso >= ATRASO_SPRINT_ROJO) rojo.push(texto);
    else if (atraso >= ATRASO_SPRINT_AMARILLO) amarillo.push(texto);
  }

  if (rojo.length > 0) return { color: 'ROJO', motivos: [...rojo, ...amarillo] };
  if (amarillo.length > 0) return { color: 'AMARILLO', motivos: amarillo };
  return { color: 'VERDE', motivos: [] };
}
