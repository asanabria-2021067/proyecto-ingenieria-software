'use client';

import Link from 'next/link';
import type { CalendarDay } from '@/lib/calendar/utils';
import { agendaItemKey, type AgendaItem } from '@/lib/calendar/agenda';
import { IconoTipoEvento, PRIORIDAD_DOT, TONO_CLASES } from '@/lib/calendar/paleta';
import { tonoDeEvento } from '@/lib/calendar/time-grid';

/**
 * HU-169 (T-264): vista semanal — 7 columnas (una fila apilada en móvil) con
 * los ítems del día ya cargados por el rango visible. Mismos ítems y misma
 * fuente que MonthView (AgendaItem), sin recargar al cambiar de vista.
 * HU-184 (T-324): un clic en un evento abre su detalle (`onSelectEvento`),
 * sea o no del proyecto que lidera el usuario. En móvil (días apilados) se
 * ocultan los días sin actividad, salvo hoy, para no hacer scroll por
 * tarjetas vacías. HU-184: desde xl la semana se ve como cuadrícula por
 * horas (TimeGridView); esta lista queda para móvil, tablet y portátil.
 */
export function WeekView({
  days,
  todayKey,
  itemsByDay,
  onSelectEvento,
}: {
  days: CalendarDay[];
  todayKey: string;
  itemsByDay: Map<string, AgendaItem[]>;
  onSelectEvento: (item: Extract<AgendaItem, { kind: 'evento' }>) => void;
}) {
  const semanaVacia = days.every((day) => (itemsByDay.get(day.key) ?? []).length === 0);

  return (
    // G02 (UI-02): esta lista solo se muestra donde la cuadrícula no cabe (<xl):
    // siempre una columna de días, sin la rejilla de 7 que la hacía ilegible.
    <div className="grid grid-cols-1 gap-tight">
      {semanaVacia && <p className="type-meta card-base py-3 text-center">Sin actividad esta semana</p>}
      {days.map((day) => {
        const items = itemsByDay.get(day.key) ?? [];
        const isToday = day.key === todayKey;
        const ocultar = items.length === 0 && !isToday;
        return (
          <div
            key={day.key}
            aria-current={isToday ? 'date' : undefined}
            className={`card-base flex flex-col gap-tight p-stack ${isToday ? 'border-primary' : ''} ${ocultar ? 'hidden' : ''}`}
          >
            <div
              className={`type-meta flex items-center justify-between rounded-control px-tight py-1 ${
                // HU-184 (T-324): "hoy" con relleno primario + borde de la tarjeta.
                isToday ? 'bg-primary font-bold text-on-primary' : ''
              }`}
            >
              <span className="capitalize">
                {day.date.toLocaleDateString('es-GT', { weekday: 'short' })}
                {isToday && ' · Hoy'}
              </span>
              <span>{day.date.getDate()}</span>
            </div>

            <div className="flex flex-col gap-1">
              {items.length === 0 && (
                <p className="type-meta py-3 text-center">Sin actividad</p>
              )}
              {items.map((item) =>
                item.kind === 'tarea' ? (
                  item.href ? (
                    <Link
                      key={agendaItemKey(item)}
                      href={item.href}
                      className="flex items-start gap-1.5 rounded-control bg-surface-container-low px-1.5 py-1 transition-colors hover:bg-surface-container"
                    >
                      <span
                        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-pill ${PRIORIDAD_DOT[item.prioridad] ?? 'bg-outline-variant'}`}
                        aria-hidden="true"
                      />
                      <span className="type-body truncate text-text-primary">{item.titulo}</span>
                    </Link>
                  ) : (
                    // Tarea de un calendario compartido: no navegable.
                    <span
                      key={agendaItemKey(item)}
                      className="flex items-start gap-1.5 rounded-control bg-surface-container-low px-1.5 py-1"
                    >
                      <span
                        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-pill ${item.compartidoPor ? TONO_CLASES[item.compartidoPor.tono].punto : 'bg-outline-variant'}`}
                        aria-hidden="true"
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="type-body truncate text-text-primary">{item.titulo}</span>
                        <span className="type-meta truncate">{item.compartidoPor?.nombre}</span>
                      </span>
                    </span>
                  )
                ) : (
                  <button
                    key={agendaItemKey(item)}
                    type="button"
                    data-evento-key={agendaItemKey(item)}
                    onClick={() => onSelectEvento(item)}
                    className="flex items-start gap-1.5 rounded-control bg-surface-container-low px-1.5 py-1 text-left transition-colors hover:bg-surface-container"
                  >
                    {/* G01 (UI-01): un evento OCUPADO no tiene tipo real que anunciar. */}
                    {item.ocupado ? (
                      <span
                        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-pill ${item.compartidoPor ? TONO_CLASES[item.compartidoPor.tono].punto : 'bg-outline-variant'}`}
                        aria-hidden="true"
                      />
                    ) : (
                      <IconoTipoEvento tipo={item.tipo} tono={tonoDeEvento(item)} className="mt-0.5" />
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span className="type-body truncate text-text-primary">{item.titulo}</span>
                      <span className="type-meta truncate">
                        {item.horaInicio}
                        {item.compartidoPor && ` · ${item.compartidoPor.nombre}`}
                      </span>
                    </span>
                  </button>
                ),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
