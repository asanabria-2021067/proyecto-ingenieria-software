'use client';

import { getMonthMatrix, WEEKDAY_LABELS_ES, WEEKDAY_NAMES_ES, type CalendarDay } from '@/lib/calendar/utils';
import { IconoTipoEvento, TONO_CLASES } from '@/lib/calendar/paleta';
import { tonoDeEvento } from '@/lib/calendar/time-grid';
import { agendaItemKey, type AgendaItem } from '@/lib/calendar/agenda';

const MAX_VISIBLE_POR_DIA = 3;

/** Ficha de un elemento dentro de una celda del mes (mismo aspecto en todas las vistas que usan la rejilla). */
export const CALENDAR_DAY_CHIP_CLASS =
  'flex items-center gap-1 truncate rounded-control bg-surface-container px-1 py-0.5 type-meta';

/** HU-184: evento con el color de su tipo (o de la persona, si es compartido); tarea propia en primario. */
function puntoDe(item: AgendaItem): string {
  if (item.kind === 'evento') return TONO_CLASES[tonoDeEvento(item)].punto;
  return item.compartidoPor ? TONO_CLASES[item.compartidoPor.tono].punto : 'bg-primary';
}

function etiquetaDia(date: Date, total: number, isToday: boolean): string {
  const fecha = date.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' });
  const actividad = total === 0 ? 'sin actividad' : total === 1 ? '1 actividad' : `${total} actividades`;
  return `${isToday ? 'Hoy, ' : ''}${fecha}, ${actividad}`;
}

/**
 * Rejilla mensual compartida: tarjeta, cabecera de días, seis semanas de
 * lunes a domingo y la celda-botón de cada día (número, hoy, seleccionado).
 * Es solo presentación y medidas; qué va DENTRO de cada día lo decide quien la
 * usa con `renderDay`. La usan el calendario del estudiante (`MonthView`,
 * tareas y eventos) y el calendario administrativo de Sprints.
 *
 * G04 (UI-14): fuera del mes la fecha se lee a opacidad completa en
 * `text-text-secondary`; la celda ya no se atenúa entera.
 */
export function CalendarMonthGrid({
  year,
  month,
  todayKey,
  selectedKey,
  onSelectDay,
  renderDay,
  renderDayCompact,
  getDayLabel,
  todayTone = 'outline',
}: {
  year: number;
  month: number;
  todayKey: string;
  selectedKey: string | null;
  onSelectDay: (key: string) => void;
  /** Contenido del día, bajo su número. */
  renderDay: (day: CalendarDay) => React.ReactNode;
  /**
   * HU-184 (T-324): contenido del día en móvil, donde la celda no alcanza para
   * títulos. Con esta prop la rejilla se compacta por debajo de `sm` y
   * `renderDay` solo se pinta desde `sm`. Es decorativo: lo que importa lo
   * dice `getDayLabel`.
   */
  renderDayCompact?: (day: CalendarDay) => React.ReactNode;
  /** Nombre accesible del día; sin él se lee el texto de la celda. */
  getDayLabel?: (day: CalendarDay) => string;
  /**
   * Cómo se marca hoy. `outline` (por defecto): número con borde. `accent`:
   * número relleno con el acento (calendario de Sprints). `primary`: número
   * relleno con el primario, borde de la celda y el texto «Hoy» (calendario
   * del estudiante, donde el acento es de los eventos).
   */
  todayTone?: 'outline' | 'accent' | 'primary';
}) {
  const weeks = getMonthMatrix(year, month);
  const compacta = renderDayCompact !== undefined;

  return (
    <div className={`card-base ${compacta ? 'max-sm:p-tight' : ''}`}>
      <div className="mb-tight grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS_ES.map((label, i) => (
          <div key={i} className="type-meta py-tight text-center uppercase">
            {/* G04 (UI-32): la inicial es decorativa; el lector oye el nombre del día. */}
            <span aria-hidden="true">{label}</span>
            <span className="sr-only">{WEEKDAY_NAMES_ES[i]}</span>
          </div>
        ))}
      </div>
      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((day) => {
              const isToday = day.key === todayKey;
              const isSelected = selectedKey === day.key;
              const hoyPrimario = isToday && todayTone === 'primary';

              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => onSelectDay(day.key)}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={isSelected}
                  aria-label={getDayLabel?.(day)}
                  className={`flex min-w-0 flex-col items-stretch gap-1 rounded-control border text-left transition-colors ${
                    compacta ? 'min-h-[52px] p-0.5 sm:min-h-[92px] sm:p-1' : 'min-h-[92px] p-1'
                  } ${
                    hoyPrimario
                      ? 'border-primary'
                      : day.inCurrentMonth
                        ? 'border-outline-variant/40'
                        : 'border-transparent'
                  } ${isSelected ? 'bg-surface-container-high' : 'bg-surface-container-lowest hover:bg-surface-container'}`}
                >
                  <span className={`flex items-center gap-1 ${compacta ? 'justify-center sm:justify-end' : 'justify-end'}`}>
                    {hoyPrimario && <span className="type-meta hidden font-bold text-text-primary sm:inline">Hoy</span>}
                    <span
                      className={`type-meta flex h-6 min-w-6 items-center justify-center rounded-pill px-1 ${
                        !isToday
                          ? day.inCurrentMonth
                            ? ''
                            : 'text-text-secondary'
                          : todayTone === 'primary'
                            ? 'bg-primary font-bold text-on-primary'
                            : todayTone === 'accent'
                              ? 'bg-accent font-bold text-on-accent'
                              : 'border border-outline-variant font-bold text-on-surface'
                      }`}
                    >
                      {day.date.getDate()}
                    </span>
                  </span>
                  {compacta && (
                    <div className="flex flex-wrap items-center justify-center gap-0.5 sm:hidden" aria-hidden="true">
                      {renderDayCompact(day)}
                    </div>
                  )}
                  <div className={`flex-1 flex-col gap-0.5 overflow-hidden ${compacta ? 'hidden sm:flex' : 'flex'}`}>
                    {renderDay(day)}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * HU-169 (T-264): vista mensual del estudiante sobre la rejilla compartida.
 * Un día con más de MAX_VISIBLE_POR_DIA ítems se agrupa con un indicador
 * "+N más" en vez de desbordar la celda; seleccionar el día muestra el
 * detalle completo debajo.
 * HU-184 (T-324): en móvil la celda no alcanza para títulos; muestra solo
 * puntos con el color de cada ítem y el detalle queda en la lista de abajo.
 */
export function MonthView({
  year,
  month,
  todayKey,
  selectedKey,
  itemsByDay,
  onSelectDay,
}: {
  year: number;
  month: number;
  todayKey: string;
  selectedKey: string | null;
  itemsByDay: Map<string, AgendaItem[]>;
  onSelectDay: (key: string) => void;
}) {
  const partes = (day: CalendarDay) => {
    const items = itemsByDay.get(day.key) ?? [];
    const visibles = items.slice(0, MAX_VISIBLE_POR_DIA);
    return { items, visibles, restantes: items.length - visibles.length, textoFueraDeMes: day.inCurrentMonth ? '' : 'text-text-secondary' };
  };

  return (
    <CalendarMonthGrid
      year={year}
      month={month}
      todayKey={todayKey}
      todayTone="primary"
      selectedKey={selectedKey}
      onSelectDay={onSelectDay}
      getDayLabel={(day) => etiquetaDia(day.date, (itemsByDay.get(day.key) ?? []).length, day.key === todayKey)}
      // G05-R02: fuera del mes solo se atenúan los puntos decorativos. El texto (títulos y «+N»)
      // va en text-text-secondary a opacidad completa: con opacity-50 quedaba en 2.35:1.
      renderDayCompact={(day) => {
        const { visibles, restantes, textoFueraDeMes } = partes(day);
        return (
          <>
            {visibles.map((item) => (
              <span key={agendaItemKey(item)} className={`h-1.5 w-1.5 rounded-pill ${puntoDe(item)} ${day.inCurrentMonth ? '' : 'opacity-50'}`} />
            ))}
            {restantes > 0 && <span className={`type-meta leading-none ${textoFueraDeMes}`}>+{restantes}</span>}
          </>
        );
      }}
      renderDay={(day) => {
        const { visibles, restantes, textoFueraDeMes } = partes(day);
        return (
          <>
            {visibles.map((item) => (
              <span key={agendaItemKey(item)} className={`${CALENDAR_DAY_CHIP_CLASS} ${textoFueraDeMes}`}>
                {/* G01 (UI-01): un evento OCUPADO no tiene tipo real: punto, sin ícono ni nombre de tipo. */}
                {item.kind === 'evento' && !item.ocupado ? (
                  <IconoTipoEvento tipo={item.tipo} tono={tonoDeEvento(item)} />
                ) : (
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-pill ${puntoDe(item)}`} aria-hidden="true" />
                )}
                <span className="truncate">{item.titulo}</span>
              </span>
            ))}
            {restantes > 0 && <span className={`type-meta px-1 ${textoFueraDeMes}`}>+{restantes} más</span>}
          </>
        );
      }}
    />
  );
}
