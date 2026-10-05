'use client';

import { getMonthMatrix, WEEKDAY_LABELS_ES } from '@/lib/calendar/utils';
import { MODALIDAD_ESTILO } from '@/lib/calendar/modalidad';
import type { AgendaItem } from '@/lib/calendar/agenda';

const MAX_VISIBLE_POR_DIA = 3;

function puntoDe(item: AgendaItem): string {
  return item.kind === 'evento' ? MODALIDAD_ESTILO[item.modalidad].punto : 'bg-primary';
}

function etiquetaDia(date: Date, total: number, isToday: boolean): string {
  const fecha = date.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' });
  const actividad = total === 0 ? 'sin actividad' : total === 1 ? '1 actividad' : `${total} actividades`;
  return `${isToday ? 'Hoy, ' : ''}${fecha}, ${actividad}`;
}

/**
 * HU-169 (T-264): vista mensual, extendida a partir de la rejilla existente
 * (`getMonthMatrix`/`WEEKDAY_LABELS_ES`, ya usada por MiniCalendar) — no se
 * rehace. Un día con más de MAX_VISIBLE_POR_DIA ítems se agrupa con un
 * indicador "+N más" en vez de desbordar la celda; seleccionar el día
 * (mismo patrón que antes) muestra el detalle completo debajo.
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
  const weeks = getMonthMatrix(year, month);

  return (
    <div className="card-base max-sm:p-tight">
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
                  aria-label={etiquetaDia(day.date, items.length, isToday)}
                  className={`flex min-h-[52px] min-w-0 flex-col items-stretch gap-1 rounded-control border p-0.5 text-left transition-colors sm:min-h-[92px] sm:p-1 ${
                    isToday
                      ? 'border-primary'
                      : day.inCurrentMonth
                        ? 'border-outline-variant/40'
                        : 'border-transparent opacity-50'
                  } ${isSelected ? 'bg-surface-container-high' : 'bg-surface-container-lowest hover:bg-surface-container'}`}
                >
                  <span className="flex items-center justify-center gap-1 sm:justify-end">
                    {isToday && <span className="type-meta hidden font-bold text-text-primary sm:inline">Hoy</span>}
                    <span
                      className={`type-meta flex h-6 min-w-6 items-center justify-center rounded-pill px-1 ${
                        // HU-184 (T-324): "hoy" con relleno primario (no acento: el
                        // acento es de los eventos virtuales) + borde de la celda.
                        isToday ? 'bg-primary font-bold text-on-primary' : ''
                      }`}
                    >
                      {day.date.getDate()}
                    </span>
                  </span>
                  <div className="flex flex-wrap items-center justify-center gap-0.5 sm:hidden" aria-hidden="true">
                    {visibles.map((item) => (
                      <span key={`${item.kind}-${item.id}`} className={`h-1.5 w-1.5 rounded-pill ${puntoDe(item)}`} />
                    ))}
                    {restantes > 0 && <span className="type-meta leading-none">+{restantes}</span>}
                  </div>
                  <div className="hidden flex-1 flex-col gap-0.5 overflow-hidden sm:flex">
                    {visibles.map((item) => {
                      const estilo = item.kind === 'evento' ? MODALIDAD_ESTILO[item.modalidad] : null;
                      return (
                        <span
                          key={`${item.kind}-${item.id}`}
                          className="flex items-center gap-1 truncate rounded-control bg-surface-container px-1 py-0.5 type-meta"
                        >
                          {estilo ? (
                            <span
                              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-control ${estilo.relleno}`}
                              title={estilo.label}
                            >
                              <estilo.icon className="h-2.5 w-2.5" aria-hidden="true" />
                              <span className="sr-only">{estilo.label}</span>
                            </span>
                          ) : (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-pill bg-primary" aria-hidden="true" />
                          )}
                          <span className="truncate">{item.titulo}</span>
                        </span>
                      );
                    })}
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
