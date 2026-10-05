'use client';

import Link from 'next/link';
import type { CalendarDay } from '@/lib/calendar/utils';
import type { AgendaItem } from '@/lib/calendar/agenda';
import { MODALIDAD_ESTILO } from '@/lib/calendar/modalidad';
import type { ModalidadEvento } from '@/lib/services/events';

const PRIORIDAD_DOT: Record<string, string> = {
  ALTA: 'bg-status-error',
  MEDIA: 'bg-status-warning',
  BAJA: 'bg-outline-variant',
};

/** HU-184 (T-324): ícono del evento con el color de su modalidad (y su nombre para lectores de pantalla). */
function EventoIcono({ modalidad }: { modalidad: ModalidadEvento }) {
  const estilo = MODALIDAD_ESTILO[modalidad];
  return (
    <span
      className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-control ${estilo.relleno}`}
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
 */
export function WeekView({
  days,
  todayKey,
  itemsByDay,
  isEventEditable,
  onEditEvento,
}: {
  days: CalendarDay[];
  todayKey: string;
  itemsByDay: Map<string, AgendaItem[]>;
  isEventEditable: (projectId: number) => boolean;
  onEditEvento: (item: Extract<AgendaItem, { kind: 'evento' }>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-gap md:grid-cols-7">
      {days.map((day) => {
        const items = itemsByDay.get(day.key) ?? [];
        const isToday = day.key === todayKey;
        return (
          <div key={day.key} className="card-base flex flex-col gap-tight">
            <div
              className={`type-meta flex items-center justify-between rounded-control px-tight py-1 ${
                // El acento queda reservado para el ícono de evento (una sola cosa
                // destacada por bloque): "hoy" se marca con borde, no relleno.
                isToday ? 'border border-outline-variant font-bold text-on-surface' : ''
              }`}
            >
              <span className="capitalize">{day.date.toLocaleDateString('es-GT', { weekday: 'short' })}</span>
              <span>{day.date.getDate()}</span>
            </div>

            <div className="flex flex-col gap-1">
              {items.length === 0 && (
                <p className="type-meta py-3 text-center">Sin actividad</p>
              )}
              {items.map((item) =>
                item.kind === 'tarea' ? (
                  <Link
                    key={`tarea-${item.id}`}
                    href={item.href}
                    className="flex items-start gap-1.5 rounded-control bg-surface-container-low px-1.5 py-1 transition-colors hover:bg-surface-container"
                  >
                    <span
                      className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-pill ${PRIORIDAD_DOT[item.prioridad] ?? 'bg-outline-variant'}`}
                      aria-hidden="true"
                    />
                    <span className="type-body truncate text-text-primary">{item.titulo}</span>
                  </Link>
                ) : isEventEditable(item.projectId) ? (
                  <button
                    key={`evento-${item.id}`}
                    type="button"
                    onClick={() => onEditEvento(item)}
                    className="flex items-start gap-1.5 rounded-control bg-surface-container-low px-1.5 py-1 text-left transition-colors hover:bg-surface-container"
                  >
                    <EventoIcono modalidad={item.modalidad} />
                    <span className="flex min-w-0 flex-col">
                      <span className="type-body truncate text-text-primary">{item.titulo}</span>
                      <span className="type-meta">{item.horaInicio}</span>
                    </span>
                  </button>
                ) : (
                  <Link
                    key={`evento-${item.id}`}
                    href={item.href}
                    className="flex items-start gap-1.5 rounded-control bg-surface-container-low px-1.5 py-1 transition-colors hover:bg-surface-container"
                  >
                    <EventoIcono modalidad={item.modalidad} />
                    <span className="flex min-w-0 flex-col">
                      <span className="type-body truncate text-text-primary">{item.titulo}</span>
                      <span className="type-meta">{item.horaInicio}</span>
                    </span>
                  </Link>
                ),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
