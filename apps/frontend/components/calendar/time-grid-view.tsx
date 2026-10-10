'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import type { CalendarDay } from '@/lib/calendar/utils';
import { agendaItemKey, type AgendaItem } from '@/lib/calendar/agenda';
import { MODALIDAD_ESTILO } from '@/lib/calendar/modalidad';
import { TONO_CLASES } from '@/lib/calendar/paleta';
import {
  HORA_ALTO_PX,
  HORA_INICIAL_VISIBLE,
  layoutDia,
  posicionAhora,
  tonoDeEvento,
  type BloqueEvento,
  type EventoItem,
} from '@/lib/calendar/time-grid';

const HORAS = Array.from({ length: 24 }, (_, h) => h);
const MAX_TODO_EL_DIA = 3;

function etiquetaHora(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

const PRIORIDAD_DOT: Record<string, string> = {
  ALTA: 'bg-status-error',
  MEDIA: 'bg-status-warning',
  BAJA: 'bg-outline-variant',
};

/** Fecha límite de tarea o evento de varios días, en la franja "Todo el día". */
function ChipTodoElDia({ item, onSelectEvento }: { item: AgendaItem; onSelectEvento: (item: EventoItem) => void }) {
  if (item.kind === 'evento') {
    const tono = TONO_CLASES[tonoDeEvento(item)];
    return (
      <button
        type="button"
        onClick={() => onSelectEvento(item)}
        className={`w-full truncate rounded-control border-l-4 px-1.5 py-0.5 text-left text-[11px] font-semibold ${tono.bloque} ${tono.borde}`}
      >
        {item.titulo}
      </button>
    );
  }
  // G01 (UI-01): una fecha límite OCUPADO no tiene prioridad real: punto del color de la persona.
  const punto = item.ocupado && item.compartidoPor ? TONO_CLASES[item.compartidoPor.tono].punto : (PRIORIDAD_DOT[item.prioridad] ?? 'bg-outline-variant');
  const contenido = (
    <>
      <span className={`size-1.5 shrink-0 rounded-pill ${punto}`} aria-hidden="true" />
      <span className="truncate">{item.titulo}</span>
    </>
  );
  const clase =
    'flex w-full items-center gap-1 rounded-control border border-outline-variant/60 bg-surface-container-lowest px-1.5 py-0.5 text-[11px] text-text-primary';
  // Una tarea de un calendario compartido no es navegable (quien la ve puede no ser del proyecto).
  return item.href ? (
    <Link href={item.href} title={`Fecha límite: ${item.titulo}`} className={`${clase} hover:bg-surface-container`}>
      {contenido}
    </Link>
  ) : (
    <span title={`Fecha límite de ${item.compartidoPor?.nombre ?? ''}: ${item.titulo}`} className={clase}>
      {contenido}
    </span>
  );
}

/**
 * En Semana la columna de un día es angosta: si un grupo de eventos
 * solapados necesita más de 2 columnas, se muestra solo la primera (a media
 * columna) y el resto queda en un "+N" que abre el día (como Teams/Outlook).
 * En Día hay espacio para todas las columnas.
 */
function bloquesVisibles(bloques: BloqueEvento[], semana: boolean): BloqueEvento[] {
  if (!semana) return bloques;
  return bloques
    .filter((b) => b.columnas <= 2 || b.columna === 0)
    .map((b) => (b.columnas > 2 ? { ...b, columnas: 2 } : b));
}

function gruposDesbordados(bloques: BloqueEvento[]) {
  const grupos = new Map<number, { grupo: number; top: number; bottom: number; ocultos: number }>();
  for (const b of bloques) {
    if (b.columnas <= 2) continue;
    const g = grupos.get(b.grupo) ?? { grupo: b.grupo, top: b.top, bottom: b.top + b.height, ocultos: 0 };
    g.top = Math.min(g.top, b.top);
    g.bottom = Math.max(g.bottom, b.top + b.height);
    if (b.columna > 0) g.ocultos += 1;
    grupos.set(b.grupo, g);
  }
  return [...grupos.values()].map((g) => ({ grupo: g.grupo, top: g.top, height: g.bottom - g.top, ocultos: g.ocultos }));
}

/**
 * HU-184 (T-324): vista Día/Semana como cuadrícula por horas (maqueta del
 * equipo). Los eventos se ubican por su hora y se reparten en columnas si se
 * solapan; las fechas límite de tareas y los eventos de varios días van en la
 * franja "Todo el día". Hace scroll a las 07:00 al abrir; la línea de "ahora"
 * marca la hora actual en la columna de hoy.
 */
export function TimeGridView({
  days,
  todayKey,
  itemsByDay,
  onSelectEvento,
  onVerDia,
  ahora,
}: {
  days: CalendarDay[];
  todayKey: string;
  itemsByDay: Map<string, AgendaItem[]>;
  onSelectEvento: (item: EventoItem) => void;
  /** Semana: el "+N" de un horario muy cargado abre ese día en la vista Día. */
  onVerDia?: (dayKey: string) => void;
  ahora: Date;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Un poco antes de la hora para que su etiqueta (centrada en la línea) no quede cortada.
    if (scrollRef.current) scrollRef.current.scrollTop = HORA_INICIAL_VISIBLE * HORA_ALTO_PX - 12;
  }, []);

  const columnas = useMemo(
    () =>
      days.map((day) => {
        const items = itemsByDay.get(day.key) ?? [];
        const conHora = items.filter((i): i is EventoItem => i.kind === 'evento' && !i.multiDia);
        const todoElDia = items.filter((i) => i.kind === 'tarea' || i.multiDia);
        return { day, bloques: layoutDia(conHora), todoElDia };
      }),
    [days, itemsByDay],
  );

  const hayTodoElDia = columnas.some((c) => c.todoElDia.length > 0);
  const plantilla = { gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` };
  // G02 (UI-02): en Semana cada día necesita ≥ 96 px; si el contenedor es más
  // angosto, la cuadrícula hace scroll horizontal interno (nunca la página).
  const anchoMinimo = days.length > 1 ? 'min-w-[48rem]' : '';

  return (
    <div className="card-base overflow-hidden p-0">
      <div className={days.length > 1 ? 'overflow-x-auto' : ''} data-testid="cuadricula-semana">
      <div className={`grid border-b border-outline-variant/40 ${anchoMinimo}`} style={plantilla}>
        <div />
        {days.map((day) => {
          const isToday = day.key === todayKey;
          return (
            <div
              key={day.key}
              aria-current={isToday ? 'date' : undefined}
              className={`flex flex-col items-center gap-0.5 border-l border-outline-variant/30 py-tight ${
                isToday ? 'bg-surface-container-low' : ''
              }`}
            >
              <span className="type-meta uppercase">
                {day.date.toLocaleDateString('es-GT', { weekday: 'short' }).replace('.', '')}
              </span>
              <span
                className={`flex size-8 items-center justify-center rounded-pill text-lg font-bold ${
                  isToday ? 'bg-primary text-on-primary' : 'text-text-primary'
                }`}
              >
                {day.date.getDate()}
              </span>
              {isToday && <span className="sr-only">Hoy</span>}
            </div>
          );
        })}
      </div>

      {hayTodoElDia && (
        <div className={`grid border-b border-outline-variant/40 ${anchoMinimo}`} style={plantilla}>
          <div className="type-meta flex items-start justify-end px-1 py-1 text-right leading-tight">Todo el día</div>
          {columnas.map(({ day, todoElDia }) => {
            // G02 (UI-13): en Día hay sitio para todas (con scroll acotado); en
            // Semana, lo que no cabe se abre desde "+N más", que lleva a ese día.
            const limite = days.length === 1 ? todoElDia.length : MAX_TODO_EL_DIA;
            const ocultos = todoElDia.length - limite;
            return (
              <div
                key={day.key}
                className={`flex min-w-0 flex-col gap-0.5 border-l border-outline-variant/30 p-0.5 ${
                  days.length === 1 ? 'max-h-40 overflow-y-auto overscroll-contain' : ''
                }`}
              >
                {todoElDia.slice(0, limite).map((item) => (
                  <ChipTodoElDia key={agendaItemKey(item)} item={item} onSelectEvento={onSelectEvento} />
                ))}
                {ocultos > 0 && (
                  <button
                    type="button"
                    onClick={() => onVerDia?.(day.key)}
                    aria-label={`${ocultos} ${ocultos === 1 ? 'actividad más' : 'actividades más'} de todo el día, ver el día`}
                    className="type-meta w-full rounded-control px-1 text-left hover:bg-surface-container"
                  >
                    +{ocultos} más
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div ref={scrollRef} className={`relative h-[34rem] overflow-y-auto overscroll-contain ${anchoMinimo}`} data-testid="cuadricula-horas">
        <div className="grid" style={{ ...plantilla, height: 24 * HORA_ALTO_PX }}>
          <div className="relative">
            {HORAS.map((h) => (
              <span
                key={h}
                className="type-meta absolute right-1.5 -translate-y-1/2 text-[11px]"
                style={{ top: h * HORA_ALTO_PX }}
              >
                {h > 0 ? etiquetaHora(h) : ''}
              </span>
            ))}
          </div>

          {columnas.map(({ day, bloques }) => {
            const isToday = day.key === todayKey;
            return (
              <div key={day.key} className={`relative border-l border-outline-variant/30 ${isToday ? 'bg-surface-container-low/60' : ''}`}>
                {HORAS.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-outline-variant/25"
                    style={{ top: h * HORA_ALTO_PX }}
                    aria-hidden="true"
                  />
                ))}

                {bloquesVisibles(bloques, days.length > 1).map(({ item, top, height, columna, columnas: total }) => {
                  const tono = TONO_CLASES[tonoDeEvento(item)];
                  const Modalidad = MODALIDAD_ESTILO[item.modalidad].icon;
                  const compacto = height < HORA_ALTO_PX;
                  return (
                    <button
                      key={agendaItemKey(item)}
                      type="button"
                      onClick={() => onSelectEvento(item)}
                      aria-label={`${item.titulo}, ${item.horaInicio} a ${item.horaFin}${
                        // G02 (UI-05): un tramo que termina a las 00:00 lo hace ya en la fecha siguiente.
                        item.horaFin === '00:00' && item.fechaFin > item.fechaInicio ? ' del día siguiente' : ''
                      }${item.compartidoPor ? `, calendario de ${item.compartidoPor.nombre}` : ''}`}
                      className={`absolute overflow-hidden rounded-control border-l-4 px-1.5 text-left shadow-card transition-[filter] hover:brightness-95 ${
                        compacto ? 'py-0.5' : 'py-1'
                      } ${tono.bloque} ${tono.borde} ${item.compartidoPor ? 'border-dashed' : ''}`}
                      style={{
                        top: top + 1,
                        height: height - 2,
                        left: `calc(${(columna / total) * 100}% + 2px)`,
                        width: `calc(${100 / total}% - 4px)`,
                      }}
                    >
                      {compacto ? (
                        // G02 (UI-04): en un bloque corto solo cabe una línea: la hora de inicio y el título.
                        <span className="block truncate text-xs font-bold leading-tight">
                          <span className="font-semibold opacity-90">{item.horaInicio}</span> · {item.titulo}
                        </span>
                      ) : (
                        <>
                          <span className="block truncate text-[11px] font-semibold opacity-90">
                            {item.horaInicio} – {item.horaFin}
                          </span>
                          <span className="block text-xs font-bold leading-tight line-clamp-2">{item.titulo}</span>
                        </>
                      )}
                      {!compacto && (
                        <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] opacity-90">
                          {/* G01 (UI-01): un evento OCUPADO no tiene modalidad real que mostrar. */}
                          {!item.ocupado && <Modalidad className="size-3 shrink-0" aria-hidden="true" />}
                          <span className="truncate">{item.compartidoPor ? item.compartidoPor.nombre : item.projectTitle}</span>
                        </span>
                      )}
                    </button>
                  );
                })}

                {days.length > 1 &&
                  gruposDesbordados(bloques).map(({ grupo, top, height, ocultos }) => (
                    <button
                      key={`mas-${grupo}`}
                      type="button"
                      onClick={() => onVerDia?.(day.key)}
                      aria-label={`${ocultos} eventos más a esta hora, ver el día`}
                      className="absolute flex items-start justify-center rounded-control border border-dashed border-outline-variant bg-surface-container-lowest px-1 py-1 text-xs font-bold text-text-primary shadow-card hover:bg-surface-container"
                      style={{ top: top + 1, height: height - 2, left: 'calc(50% + 2px)', width: 'calc(50% - 4px)' }}
                    >
                      +{ocultos}
                    </button>
                  ))}

                {isToday && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                    style={{ top: posicionAhora(ahora) }}
                    aria-hidden="true"
                  >
                    <span className="-ml-1 size-2 rounded-pill bg-primary" />
                    <span className="h-0.5 flex-1 bg-primary" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}
