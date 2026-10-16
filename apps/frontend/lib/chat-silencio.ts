import type { ChatConversacionGlobal, PreferenciaNoMolestar } from '@/lib/types/chat';

type Silencio = Pick<ChatConversacionGlobal, 'silenciadaHasta' | 'silenciadaSiempre'>;

const DIAS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function relojEnZona(ahora: Date, zona: string): { dia: number; minutos: number } | null {
  try {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: zona,
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(ahora);
    const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
    return { dia: DIAS.indexOf(valor('weekday')), minutos: Number(valor('hour')) * 60 + Number(valor('minute')) };
  } catch {
    return null;
  }
}

/** Misma regla que el backend: `inicio <= hora < fin`; si el rango cruza la medianoche, la madrugada cuenta el dia en que empezo. */
export function estaEnNoMolestar(pref: PreferenciaNoMolestar | null | undefined, ahora: Date = new Date()): boolean {
  if (!pref?.activo) return false;
  const reloj = relojEnZona(ahora, pref.zona);
  if (!reloj) return false;
  const inicio = aMinutos(pref.horaInicio);
  const fin = aMinutos(pref.horaFin);
  if (inicio === fin) return false;
  const { dia, minutos } = reloj;
  if (inicio < fin) return minutos >= inicio && minutos < fin && pref.diasSemana.includes(dia);
  if (minutos >= inicio) return pref.diasSemana.includes(dia);
  return minutos < fin && pref.diasSemana.includes((dia + 6) % 7);
}

/** Misma regla que el backend: el silencio vence justo en `silenciadaHasta`; el horario de no molestar tambien silencia. */
export function estaSilenciada(
  c: Silencio,
  ahora: Date = new Date(),
  noMolestar?: PreferenciaNoMolestar | null,
): boolean {
  if (estaEnNoMolestar(noMolestar, ahora)) return true;
  if (c.silenciadaSiempre) return true;
  return !!c.silenciadaHasta && new Date(c.silenciadaHasta).getTime() > ahora.getTime();
}

/** Badge del dock: no cuenta conversaciones silenciadas ni lo que llega en horario de no molestar. */
export function totalNoLeidos(
  conversaciones: (Silencio & { noLeidos: number })[],
  ahora: Date = new Date(),
  noMolestar?: PreferenciaNoMolestar | null,
): number {
  return conversaciones.reduce((total, c) => total + (estaSilenciada(c, ahora, noMolestar) ? 0 : c.noLeidos), 0);
}
