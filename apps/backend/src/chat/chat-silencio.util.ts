export interface SilencioParticipante {
  silenciadaHasta?: Date | null;
  silenciadaSiempre?: boolean | null;
}

/** Modo no molestar: `diasSemana` 0 = domingo ... 6 = sabado, horas "HH:mm" en `zona`. */
export interface NoMolestar {
  activo: boolean;
  horaInicio: string;
  horaFin: string;
  diasSemana: number[];
  zona: string;
}

const DIAS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Dia de la semana (0-6) y minutos desde medianoche de `ahora` en `zona`; null si la zona no es valida. */
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

/**
 * Dentro del horario si `inicio <= hora < fin`. Si `fin <= inicio` el rango cruza
 * la medianoche y el dia elegido es el del INICIO: de madrugada cuenta el dia anterior.
 */
export function estaEnNoMolestar(pref: NoMolestar | null | undefined, ahora: Date = new Date()): boolean {
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

/**
 * El silencio vence justo en `silenciadaHasta`: en ese instante ya no aplica.
 * Con `noMolestar`, tambien cuenta como silenciada durante su horario.
 */
export function estaSilenciada(
  participante: SilencioParticipante | null | undefined,
  ahora: Date = new Date(),
  noMolestar?: NoMolestar | null,
): boolean {
  if (estaEnNoMolestar(noMolestar, ahora)) return true;
  if (!participante) return false;
  if (participante.silenciadaSiempre) return true;
  return !!participante.silenciadaHasta && participante.silenciadaHasta.getTime() > ahora.getTime();
}
