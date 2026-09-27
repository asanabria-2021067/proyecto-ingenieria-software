'use client';

import { Clock } from 'lucide-react';
import { getMonthMatrix, WEEKDAY_LABELS_ES } from '@/lib/calendar/utils';
import type { AgendaItem } from '@/lib/calendar/agenda';

const MAX_VISIBLE_POR_DIA = 3;

/**
 * HU-169 (T-264): vista mensual, extendida a partir de la rejilla existente
 * (`getMonthMatrix`/`WEEKDAY_LABELS_ES`, ya usada por MiniCalendar) — no se
 * rehace. Un día con más de MAX_VISIBLE_POR_DIA ítems se agrupa con un
 * indicador "+N más" en vez de desbordar la celda; seleccionar el día
 * (mismo patrón que antes) muestra el detalle completo debajo.
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
  const weeks = getMonthMatrix(year, month);

  return (
    <div className="card-base">
      <div className="mb-tight grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS_ES.map((label, i) => (
          <div key={i} className="type-meta py-tight text-center uppercase">
            {label}
          </div>
        ))}
      </div>
      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((day) => {
              const items = itemsByDay.get(day.key) ?? [];
              const visibles = items.slice(0, MAX_VISIBLE_POR_DIA);
              const restantes = items.length - visibles.length;
              const isToday = day.key === todayKey;
              const isSelected = selectedKey === day.key;

              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => onSelectDay(day.key)}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={isSelected}
                  className={`flex min-h-[92px] flex-col items-stretch gap-1 rounded-control border p-1 text-left transition-colors ${
                    day.inCurrentMonth ? 'border-outline-variant/40' : 'border-transparent opacity-50'
                  } ${isSelected ? 'bg-surface-container-high' : 'bg-surface-container-lowest hover:bg-surface-container'}`}
                >
                  <span
                    className={`type-meta self-end rounded-pill px-1.5 ${
                      // El acento queda reservado para el ícono de evento (una sola cosa
                      // destacada por bloque): "hoy" se marca con borde, no relleno.
                      isToday ? 'border border-outline-variant font-bold text-on-surface' : ''
                    }`}
                  >
                    {day.date.getDate()}
                  </span>
                  <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                    {visibles.map((item) => (
                      <span
                        key={`${item.kind}-${item.id}`}
                        className="flex items-center gap-1 truncate rounded-control bg-surface-container px-1 py-0.5 type-meta"
                      >
                        {item.kind === 'evento' ? (
                          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-control bg-accent text-on-accent">
                            <Clock className="h-2.5 w-2.5" aria-hidden="true" />
                          </span>
                        ) : (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-pill bg-primary" aria-hidden="true" />
                        )}
                        <span className="truncate">{item.titulo}</span>
                      </span>
                    ))}
                    {restantes > 0 && (
                      <span className="type-meta px-1">+{restantes} más</span>
                    )}
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
