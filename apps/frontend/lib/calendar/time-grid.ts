import type { AgendaItem } from './agenda';
import { TIPO_EVENTO_ESTILO, type TonoCalendario } from './paleta';

export type EventoItem = Extract<AgendaItem, { kind: 'evento' }>;

/** Alto de una hora en la cuadrícula (px). */
export const HORA_ALTO_PX = 48;
/** Hora a la que la cuadrícula hace scroll al abrir (la jornada empieza ahí). */
export const HORA_INICIAL_VISIBLE = 7;
/** Un evento muy corto igual necesita espacio para leerse. */
const MINUTOS_MINIMOS_VISIBLES = 30;

export interface BloqueEvento {
  item: EventoItem;
  /** px desde la medianoche del día. */
  top: number;
  height: number;
  /** Columna dentro de su grupo de eventos solapados (0..columnas-1). */
  columna: number;
  columnas: number;
}

function minutosDelDia(fecha: Date): number {
  return fecha.getHours() * 60 + fecha.getMinutes();
}

/**
 * HU-184 (T-324): posiciona los eventos con hora de un día en la cuadrícula.
 * Los que se solapan se reparten en columnas (como Teams/Outlook): cada grupo
 * de eventos encadenados por solapamiento comparte el mismo número de
 * columnas, y cada evento toma la primera columna libre.
 */
export function layoutDia(eventos: EventoItem[]): BloqueEvento[] {
  const ordenados = eventos
    .filter((e) => !e.multiDia)
    .map((item) => {
      const inicio = minutosDelDia(item.fechaInicio);
      const finReal = minutosDelDia(item.fechaFin) || 24 * 60; // termina a medianoche
      const fin = Math.max(finReal, inicio + MINUTOS_MINIMOS_VISIBLES);
      return { item, inicio, fin: Math.min(fin, 24 * 60) };
    })
    .sort((a, b) => a.inicio - b.inicio || b.fin - a.fin);

  const bloques: BloqueEvento[] = [];
  let grupo: { item: EventoItem; inicio: number; fin: number; columna: number }[] = [];
  let finGrupo = -1;

  const cerrarGrupo = () => {
    const columnas = grupo.reduce((max, e) => Math.max(max, e.columna + 1), 1);
    for (const e of grupo) {
      bloques.push({
        item: e.item,
        top: (e.inicio / 60) * HORA_ALTO_PX,
        height: ((e.fin - e.inicio) / 60) * HORA_ALTO_PX,
        columna: e.columna,
        columnas,
      });
    }
    grupo = [];
  };

  for (const evento of ordenados) {
    if (grupo.length > 0 && evento.inicio >= finGrupo) {
      cerrarGrupo();
      finGrupo = -1;
    }
    const ocupadas = new Set(grupo.filter((e) => e.fin > evento.inicio).map((e) => e.columna));
    let columna = 0;
    while (ocupadas.has(columna)) columna += 1;
    grupo.push({ ...evento, columna });
    finGrupo = Math.max(finGrupo, evento.fin);
  }
  if (grupo.length > 0) cerrarGrupo();

  return bloques;
}

/** Tono de un evento: el de la persona si viene de un calendario compartido; si no, el de su tipo. */
export function tonoDeEvento(item: EventoItem): TonoCalendario {
  return item.compartidoPor?.tono ?? TIPO_EVENTO_ESTILO[item.tipo].tono;
}

/** Posición (px) de la línea de "ahora" en la cuadrícula. */
export function posicionAhora(ahora: Date): number {
  return (minutosDelDia(ahora) / 60) * HORA_ALTO_PX;
}
