'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  formatMonthLabel,
  getMonthMatrix,
  WEEKDAY_LABELS_ES,
} from '@/lib/calendar/utils';

/** Cuadrícula de mes controlada: quien la usa maneja el mes/año y qué días
 *  marcar. Reutilizada por el widget del dashboard, por /dashboard/calendario
 *  y por el resumen de Sprints del panel de administración.
 *
 *  Es solo presentación: no conoce tareas, eventos ni Sprints. Cada vista
 *  decide qué días marca (`markedDates`) y, si le interesa cuántos elementos
 *  caen en un día, pasa además `markedCounts` y `getDayLabel`. */
const NAV_CLASS =
  'rounded-control p-tight text-text-secondary outline-none transition-colors hover:bg-surface-container hover:text-text-primary focus-visible:ring-2 focus-visible:ring-primary/40';

export function MiniCalendar({
  year,
  month,
  onPrevMonth,
  onNextMonth,
  markedDates,
  todayKey,
  selectedKey,
  onSelectDay,
  getDayHref,
  size = 'sm',
  markedCounts,
  getDayLabel,
  todayTone = 'accent',
  adjacentMonthTone = 'disabled',
}: {
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  markedDates: Set<string>;
  todayKey: string;
  selectedKey?: string;
  onSelectDay?: (key: string) => void;
  /**
   * Si cada día lleva a otra página, su destino: el día se pinta como enlace
   * (y admite abrirse en otra pestaña) en vez de como botón.
   */
  getDayHref?: (key: string) => string;
  size?: 'sm' | 'md';
  /**
   * Cantidad de elementos por día (clave yyyy-mm-dd). Con dos o más, el día
   * muestra el número junto a su marca; el día de hoy también se marca.
   * Sin esta prop el calendario se comporta como siempre.
   */
  markedCounts?: ReadonlyMap<string, number>;
  /**
   * Nombre accesible de un día marcado (p. ej. «8 de octubre, 3
   * finalizaciones planificadas»), para no depender solo del punto. Si los
   * días son interactivos también nombra los que no tienen marca, con 0.
   */
  getDayLabel?: (key: string, count: number) => string;
  /**
   * G04 (UI-41): color del día de hoy. Por defecto `accent`, como siempre
   * (tablero y widgets que comparten esta rejilla no cambian). El calendario
   * del estudiante pide `primary` para que "hoy" se vea igual que en sus
   * vistas Día/Semana/Mes.
   */
  todayTone?: 'accent' | 'primary';
  /**
   * G05-R03: color de los días de los meses vecinos. Por defecto `disabled`,
   * como siempre (en el tablero y los widgets esos días no se pueden pulsar).
   * El calendario del estudiante pide `secondary`: allí son botones activos y
   * `text-text-disabled` los dejaba en 2.36:1 (claro) y 3.26:1 (oscuro).
   */
  adjacentMonthTone?: 'disabled' | 'secondary';
}) {
  const weeks = getMonthMatrix(year, month);
  const cellSize = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-10 w-10 text-sm';
  const hoyClase = todayTone === 'primary' ? 'bg-primary font-bold text-on-primary' : 'bg-accent font-bold text-on-accent';

  return (
    <div>
      <div className="mb-tight flex items-center justify-between">
        <button
          type="button"
          onClick={onPrevMonth}
          aria-label="Mes anterior"
          className={NAV_CLASS}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="type-body font-semibold capitalize text-text-primary">
          {formatMonthLabel(year, month)}
        </span>
        <button
          type="button"
          onClick={onNextMonth}
          aria-label="Mes siguiente"
          className={NAV_CLASS}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 justify-items-center gap-1">
        {WEEKDAY_LABELS_ES.map((label, i) => (
          <div
            key={i}
            className="type-meta text-center uppercase text-text-secondary"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 justify-items-center gap-1">
            {week.map((day) => {
              const isToday = day.key === todayKey;
              const isSelected = selectedKey === day.key;
              const count = markedCounts?.get(day.key) ?? 0;
              const hasEvent = markedDates.has(day.key) || count > 0;
              // Con conteos, hoy también lleva marca: el punto toma el color
              // del texto para seguir viéndose sobre el fondo del día actual.
              const showDot = hasEvent && (!isToday || markedCounts !== undefined);
              const interactive = Boolean(onSelectDay || getDayHref);
              const label =
                getDayLabel && (hasEvent || interactive)
                  ? getDayLabel(day.key, hasEvent ? Math.max(count, 1) : 0)
                  : undefined;
              // Con el tono primario, hoy no lleva el color base: `text-text-primary` ganaba
              // a `text-on-primary` por orden de CSS y el número quedaba ilegible sobre el
              // verde (2.44:1). Con el acento por defecto la cadena de clases no cambia.
              const colorTexto =
                isToday && todayTone === 'primary'
                  ? ''
                  : !day.inCurrentMonth
                    ? adjacentMonthTone === 'secondary'
                      ? 'text-text-secondary'
                      : 'text-text-disabled'
                    : 'text-text-primary';
              const base = `relative flex ${cellSize} items-center justify-center rounded-pill font-medium transition-colors ${colorTexto} ${isToday ? hoyClase : ''} ${
                isSelected && !isToday ? 'bg-surface-container-high' : ''
              }`;
              // El día-enlace (resumen de Sprints) lleva foco visible y realce propios;
              // el día-botón conserva exactamente las clases de siempre.
              const linkClassName = `${base} cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                isToday ? (todayTone === 'primary' ? 'hover:bg-primary/85' : 'hover:bg-accent/85') : 'hover:bg-surface-container'
              }`;
              const buttonClassName = `${base} ${onSelectDay ? 'cursor-pointer hover:bg-surface-container' : 'cursor-default'}`;
              const content = (
                <>
                  {day.date.getDate()}
                  {showDot && (
                    <span
                      className={`absolute bottom-0.5 h-1 w-1 rounded-pill ${isToday ? 'bg-current' : 'bg-primary'}`}
                      aria-hidden="true"
                    />
                  )}
                  {count > 1 && (
                    <span
                      data-slot="day-count"
                      className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-pill bg-primary px-0.5 type-micro font-bold leading-none text-on-primary"
                      aria-hidden="true"
                    >
                      {count}
                    </span>
                  )}
                </>
              );
              if (getDayHref) {
                return (
                  <Link
                    key={day.key}
                    href={getDayHref(day.key)}
                    // Son 42 destinos de la misma página: no se precargan uno a uno.
                    prefetch={false}
                    aria-current={isToday ? 'date' : undefined}
                    aria-label={label}
                    title={label}
                    data-marked={hasEvent || undefined}
                    data-adjacent-month={day.inCurrentMonth ? undefined : 'true'}
                    className={linkClassName}
                  >
                    {content}
                  </Link>
                );
              }
              return (
                <button
                  key={day.key}
                  type="button"
                  disabled={!onSelectDay}
                  onClick={() => onSelectDay?.(day.key)}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={onSelectDay ? isSelected : undefined}
                  aria-label={label}
                  title={label}
                  data-marked={hasEvent || undefined}
                  data-adjacent-month={day.inCurrentMonth ? undefined : 'true'}
                  className={buttonClassName}
                >
                  {content}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
