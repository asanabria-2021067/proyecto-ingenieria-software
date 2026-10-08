'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  SITUACION_SPRINT_LABEL_CORTA,
  SITUACION_SPRINT_TONE,
  adminProjectHref,
  contarFinalizaciones,
  describeDiasRestantes,
  formatDiaConAnio,
  formatDiaLargoConAnio,
} from '@/lib/admin/sprint-calendar';
import { formatMonthLabel, getMonthMatrix, parseFechaSolo, WEEKDAY_LABELS_ES } from '@/lib/calendar/utils';
import type { AdminSprintCalendarItem } from '@/lib/types/admin-sprints';

/**
 * Vista Mes del calendario administrativo de Sprints.
 *
 * Usa la misma rejilla que el calendario del estudiante (`getMonthMatrix`,
 * lunes a domingo, seis semanas), pero cada día muestra solo CUÁNTAS
 * finalizaciones esperadas caen en él: con decenas de proyectos, los nombres
 * no caben en una celda y van en el detalle del día, debajo.
 *
 * «Hoy» es el día que usó el servidor (Guatemala), no el del navegador, y qué
 * Sprint está vencido lo dice su `situacion`: aquí no se compara ninguna fecha.
 * Cambiar de mes no pide nada: todo sale del mismo payload.
 */
export function SprintMonthView({
  hoy,
  itemsByDay,
}: {
  /** Día actual `YYYY-MM-DD` según el backend. */
  hoy: string;
  /** Sprints (ya filtrados) por día de finalización esperada. */
  itemsByDay: ReadonlyMap<string, AdminSprintCalendarItem[]>;
}) {
  const [cursor, setCursor] = useState(() => {
    const fecha = parseFechaSolo(hoy);
    return { year: fecha.getFullYear(), month: fecha.getMonth() };
  });
  // Se entra con hoy seleccionado, tenga o no finalizaciones: nunca se salta
  // sola a una fecha pasada solo porque tenga datos.
  const [selectedKey, setSelectedKey] = useState(hoy);

  // La rejilla compartida siempre trae seis semanas; una semana entera del mes
  // siguiente no aporta nada aquí y empuja el detalle del día fuera de pantalla.
  const weeks = getMonthMatrix(cursor.year, cursor.month).filter((week) => week.some((day) => day.inCurrentMonth));
  const delMes = weeks
    .flat()
    .filter((day) => day.inCurrentMonth)
    .reduce((suma, day) => suma + (itemsByDay.get(day.key)?.length ?? 0), 0);
  const delDia = itemsByDay.get(selectedKey) ?? [];

  const mover = (delta: number) =>
    setCursor(({ year, month }) => {
      const fecha = new Date(year, month + delta, 1);
      return { year: fecha.getFullYear(), month: fecha.getMonth() };
    });
  const irAHoy = () => {
    const fecha = parseFechaSolo(hoy);
    setCursor({ year: fecha.getFullYear(), month: fecha.getMonth() });
    setSelectedKey(hoy);
  };

  return (
    <div className="flex flex-col gap-section">
      <section aria-label="Calendario mensual de finalizaciones" className="card-base p-stack sm:p-card">
        <div className="mb-stack flex flex-wrap items-center justify-between gap-inline">
          <div className="flex items-center gap-tight">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-control"
              aria-label="Mes anterior"
              onClick={() => mover(-1)}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <h2 className="type-section min-w-40 text-center" aria-live="polite">
              {formatMonthLabel(cursor.year, cursor.month)}
            </h2>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-control"
              aria-label="Mes siguiente"
              onClick={() => mover(1)}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="font-medium text-primary" onClick={irAHoy}>
              Hoy
            </Button>
          </div>
          <p className="type-meta tabular-nums">
            {delMes === 0 ? 'Sin finalizaciones planificadas este mes' : `${contarFinalizaciones(delMes)} este mes`}
          </p>
        </div>

        <div className="mb-micro grid grid-cols-7 gap-micro" aria-hidden="true">
          {WEEKDAY_LABELS_ES.map((label, i) => (
            <div key={i} className="py-micro text-center text-xs font-semibold uppercase text-text-secondary">
              {label}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-micro">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-micro">
              {week.map((day) => {
                const items = itemsByDay.get(day.key) ?? [];
                const isToday = day.key === hoy;
                const isSelected = day.key === selectedKey;
                const conVencido = items.some((item) => item.situacion === 'PLAN_VENCIDO');
                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => setSelectedKey(day.key)}
                    aria-current={isToday ? 'date' : undefined}
                    aria-pressed={isSelected}
                    aria-label={`${formatDiaLargoConAnio(day.key)}${isToday ? ', hoy' : ''}, ${
                      items.length === 0 ? 'sin finalizaciones planificadas' : contarFinalizaciones(items.length)
                    }${conVencido ? ', con plan vencido' : ''}`}
                    data-count={items.length || undefined}
                    className={`flex min-h-14 flex-col items-stretch rounded-control border p-micro text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 sm:p-tight ${
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : `hover:bg-surface-container ${day.inCurrentMonth ? 'bg-surface-container-lowest' : ''} ${
                            day.inCurrentMonth ? 'border-outline-variant/40' : 'border-outline-variant/20'
                          }`
                    } ${day.inCurrentMonth ? 'text-text-primary' : 'text-text-disabled'}`}
                  >
                    <span
                      className={`flex size-6 items-center justify-center self-end rounded-pill text-xs font-medium tabular-nums ${
                        isToday ? 'bg-accent font-bold text-on-accent' : ''
                      }`}
                    >
                      {day.date.getDate()}
                    </span>
                    {items.length > 0 && (
                      <span className="mt-auto flex items-center gap-micro text-xs font-semibold tabular-nums text-text-primary">
                        <span
                          aria-hidden="true"
                          className={`size-2 shrink-0 rounded-pill ${conVencido ? 'bg-attention' : 'bg-primary'}`}
                        />
                        {items.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <ul className="mt-stack flex flex-wrap gap-x-stack gap-y-micro type-meta" aria-label="Leyenda">
          <li className="flex items-center gap-micro">
            <span aria-hidden="true" className="size-2 rounded-pill bg-primary" />
            Finalizaciones planificadas
          </li>
          <li className="flex items-center gap-micro">
            <span aria-hidden="true" className="size-2 rounded-pill bg-attention" />
            Incluye un plan vencido
          </li>
        </ul>
      </section>

      <section aria-labelledby="sprints-dia-titulo" aria-live="polite">
        <div className="mb-stack flex flex-wrap items-baseline justify-between gap-x-inline gap-y-micro">
          <h2 id="sprints-dia-titulo" className="type-section">
            {formatDiaLargoConAnio(selectedKey)}
          </h2>
          {delDia.length > 0 && <p className="type-meta tabular-nums">{contarFinalizaciones(delDia.length)}</p>}
        </div>
        {delDia.length === 0 ? (
          <p className="type-body rounded-control bg-surface-container-low px-stack py-inline text-text-secondary">
            No hay finalizaciones planificadas para este día.
          </p>
        ) : (
          <ul className="card-base divide-y divide-outline-variant/50 overflow-hidden p-0">
            {delDia.map((item) => (
              <DiaSprintRow key={item.idSprint} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DiaSprintRow({ item }: { item: AdminSprintCalendarItem }) {
  const dias = describeDiasRestantes(item);
  return (
    <li className="flex flex-wrap items-center gap-x-stack gap-y-tight px-stack py-stack sm:px-card">
      <div className="min-w-0 flex-1 basis-64">
        <p className="type-body break-words font-semibold">{item.tituloProyecto}</p>
        <p className="mt-micro flex flex-wrap items-center gap-tight">
          <span className="type-body font-medium">Sprint {item.numero}</span>
          <span className={`pill whitespace-nowrap ${SITUACION_SPRINT_TONE[item.situacion]}`}>
            {SITUACION_SPRINT_LABEL_CORTA[item.situacion]}
          </span>
        </p>
      </div>
      <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-inline gap-y-micro type-meta">
        <dt>Líder</dt>
        <dd className="font-medium text-text-primary">
          {item.lider.nombre} {item.lider.apellido}
        </dd>
        <dt>Finalización esperada</dt>
        <dd className="font-medium tabular-nums text-text-primary">
          {item.fechaFinPlaneada ? formatDiaConAnio(item.fechaFinPlaneada) : 'Sin fecha'}
          {dias && <span className="font-normal text-text-secondary"> · {dias}</span>}
        </dd>
      </dl>
      <Link
        href={adminProjectHref(item.idProyecto)}
        aria-label={`Ver proyecto ${item.tituloProyecto}`}
        className="type-meta -my-tight inline-flex min-h-11 shrink-0 items-center gap-micro rounded-control font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        Ver proyecto
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </li>
  );
}
