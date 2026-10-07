'use client';

import Link from 'next/link';
import type { CalendarDay } from '@/lib/calendar/utils';
import { agendaItemKey, type AgendaItem } from '@/lib/calendar/agenda';
import { TIPO_EVENTO_ESTILO, TONO_CLASES } from '@/lib/calendar/paleta';
import { tonoDeEvento, type EventoItem } from '@/lib/calendar/time-grid';

const PRIORIDAD_DOT: Record<string, string> = {
  ALTA: 'bg-status-error',
  MEDIA: 'bg-status-warning',
  BAJA: 'bg-outline-variant',
};

/** HU-184: ícono del evento con el color de su tipo (o de la persona, si es compartido) y su nombre para lectores. */
function EventoIcono({ item }: { item: EventoItem }) {
  const estilo = TIPO_EVENTO_ESTILO[item.tipo];
  return (
    <span
      className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-control ${TONO_CLASES[tonoDeEvento(item)].bloque}`}
      title={estilo.label}
    >
      <estilo.icon className="h-2.5 w-2.5" aria-hidden="true" />
      <span className="sr-only">{estilo.label}</span>
    </span>
  );
}

/**
 * HU-169 (T-264): vista semanal — 7 columnas (una fila apilada en móvil) con
 * los ítems del día ya cargados por el rango visible. Mismos ítems y misma
 * fuente que MonthView (AgendaItem), sin recargar al cambiar de vista.
 * HU-184 (T-324): un clic en un evento abre su detalle (`onSelectEvento`),
 * sea o no del proyecto que lidera el usuario. En móvil (días apilados) se
 * ocultan los días sin actividad, salvo hoy, para no hacer scroll por
 * tarjetas vacías. HU-184: en escritorio la semana se ve como cuadrícula por
 * horas (TimeGridView); esta lista queda para móvil.
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
    <div className="grid grid-cols-1 gap-tight md:grid-cols-7 md:gap-gap">
      {semanaVacia && (
        <p className="type-meta card-base py-3 text-center md:hidden">Sin actividad esta semana</p>
      )}
      {days.map((day) => {
        const items = itemsByDay.get(day.key) ?? [];
        const isToday = day.key === todayKey;
        const ocultarEnMovil = items.length === 0 && !isToday;
        return (
          <div
            key={day.key}
            aria-current={isToday ? 'date' : undefined}
            className={`card-base flex flex-col gap-tight max-md:p-stack ${isToday ? 'border-primary' : ''} ${
              ocultarEnMovil ? 'max-md:hidden' : ''
            }`}
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
                    onClick={() => onSelectEvento(item)}
                    className="flex items-start gap-1.5 rounded-control bg-surface-container-low px-1.5 py-1 text-left transition-colors hover:bg-surface-container"
                  >
                    <EventoIcono item={item} />
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
