'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  formatMonthLabel,
  getMonthMatrix,
  WEEKDAY_LABELS_ES,
} from '@/lib/calendar/utils';

/** Cuadrícula de mes controlada: quien la usa maneja el mes/año y qué días
 *  marcar. Reutilizada por el widget del dashboard y por /dashboard/calendario. */
export function MiniCalendar({
  year,
  month,
  onPrevMonth,
  onNextMonth,
  markedDates,
  todayKey,
  selectedKey,
  onSelectDay,
  size = 'sm',
}: {
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  markedDates: Set<string>;
  todayKey: string;
  selectedKey?: string;
  onSelectDay?: (key: string) => void;
  size?: 'sm' | 'md';
}) {
  const weeks = getMonthMatrix(year, month);
  const cellSize = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-10 w-10 text-sm';

  return (
    <div>
      <div className="mb-tight flex items-center justify-between">
        <button
          type="button"
          onClick={onPrevMonth}
          aria-label="Mes anterior"
          className="rounded-control p-tight text-text-secondary transition-colors hover:bg-surface-container hover:text-text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="type-body font-semibold capitalize text-text-primary">
          {formatMonthLabel(year, month)}
        </span>
        <button
          type="button"
          onClick={onNextMonth}
          aria-label="Mes siguiente"
          className="rounded-control p-tight text-text-secondary transition-colors hover:bg-surface-container hover:text-text-primary"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
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
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((day) => {
              const isToday = day.key === todayKey;
              const isSelected = selectedKey === day.key;
              const hasEvent = markedDates.has(day.key);
              return (
                <button
                  key={day.key}
                  type="button"
                  disabled={!onSelectDay}
                  onClick={() => onSelectDay?.(day.key)}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={onSelectDay ? isSelected : undefined}
                  className={`relative flex ${cellSize} items-center justify-center rounded-pill font-medium transition-colors ${
                    !day.inCurrentMonth
                      ? 'text-text-disabled'
                      : 'text-text-primary'
                  } ${isToday ? 'bg-accent font-bold text-on-accent' : ''} ${
                    isSelected && !isToday ? 'bg-surface-container-high' : ''
                  } ${onSelectDay ? 'cursor-pointer hover:bg-surface-container' : 'cursor-default'}`}
                >
                  {day.date.getDate()}
                  {hasEvent && !isToday && (
                    <span
                      className="absolute bottom-0.5 h-1 w-1 rounded-pill bg-primary"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
