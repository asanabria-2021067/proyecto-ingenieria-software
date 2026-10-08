'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CALENDAR_DAY_CHIP_CLASS, CalendarMonthGrid } from '@/components/calendar/month-view';
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
import { formatMonthLabel, parseFechaSolo } from '@/lib/calendar/utils';
import type { AdminSprintCalendarItem } from '@/lib/types/admin-sprints';

/**
 * Vista Mes del calendario administrativo de Sprints.
 *
 * Es la MISMA interfaz del calendario del estudiante: la rejilla compartida
 * (`CalendarMonthGrid`, con sus medidas y sus seis semanas), la misma fila de
 * navegación entre meses y la misma distribución en dos columnas. Lo único
 * propio es el contenido: cada día lleva una ficha con CUÁNTAS finalizaciones
 * esperadas caen en él (los nombres no escalan a decenas de proyectos y van
 * en el detalle del día), y la columna lateral muestra ese detalle en vez de
 * las tarjetas del estudiante. Hoy se marca con el acento relleno.
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

  const prefijoMes = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-`;
  let delMes = 0;
  for (const [dia, items] of itemsByDay) if (dia.startsWith(prefijoMes)) delMes += items.length;
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
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-gap gap-y-tight">
        <div className="flex items-center gap-tight">
          <Button
            type="button"
            variant="outline"
            className="h-8 w-8 rounded-control p-0"
            aria-label="Mes anterior"
            onClick={() => mover(-1)}
          >
            ‹
          </Button>
          <h2 className="type-section capitalize text-text-primary" aria-live="polite">
            {formatMonthLabel(cursor.year, cursor.month)}
          </h2>
          <Button
            type="button"
            variant="outline"
            className="h-8 w-8 rounded-control p-0"
            aria-label="Mes siguiente"
            onClick={() => mover(1)}
          >
            ›
          </Button>
        </div>
        <div className="flex items-center gap-gap">
          <span className="type-meta tabular-nums">
            {delMes === 0 ? 'Sin finalizaciones planificadas este mes' : `${contarFinalizaciones(delMes)} este mes`}
          </span>
          <button type="button" onClick={irAHoy} className="type-body font-medium text-primary hover:underline">
            Hoy
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-grid lg:grid-cols-[1fr_320px]">
        <div className="@container/mes min-w-0">
          <CalendarMonthGrid
            year={cursor.year}
            month={cursor.month}
            todayKey={hoy}
            todayTone="accent"
            selectedKey={selectedKey}
            onSelectDay={setSelectedKey}
            getDayLabel={(day) => {
              const items = itemsByDay.get(day.key) ?? [];
              return `${formatDiaLargoConAnio(day.key)}${day.key === hoy ? ', hoy' : ''}, ${
                items.length === 0 ? 'sin finalizaciones planificadas' : contarFinalizaciones(items.length)
              }${items.some((item) => item.situacion === 'PLAN_VENCIDO') ? ', con plan vencido' : ''}`;
            }}
            renderDay={(day) => {
              const items = itemsByDay.get(day.key) ?? [];
              if (items.length === 0) return null;
              const conVencido = items.some((item) => item.situacion === 'PLAN_VENCIDO');
              return (
                <span className={`${CALENDAR_DAY_CHIP_CLASS} tabular-nums`}>
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 shrink-0 rounded-pill ${conVencido ? 'bg-attention' : 'bg-primary'}`}
                  />
                  <span className="truncate">
                    {items.length}
                    {/* La palabra solo cuando la celda tiene ancho para ella. */}
                    <span className="hidden @xl/mes:inline"> {items.length === 1 ? 'Sprint' : 'Sprints'}</span>
                  </span>
                </span>
              );
            }}
          />
        </div>

        {/* Donde el estudiante tiene «Mis Proyectos», el admin ve el día elegido. */}
        <section aria-labelledby="sprints-dia-titulo" aria-live="polite" className="card-base h-fit">
          <h2 id="sprints-dia-titulo" className="type-subtitle text-text-primary">
            {formatDiaLargoConAnio(selectedKey)}
          </h2>
          {delDia.length === 0 ? (
            <p className="type-meta mt-micro">No hay finalizaciones planificadas para este día.</p>
          ) : (
            <>
              <p className="type-meta mt-micro tabular-nums">{contarFinalizaciones(delDia.length)}</p>
              <ul className="mt-stack divide-y divide-outline-variant/50">
                {delDia.map((item) => (
                  <DiaSprintRow key={item.idSprint} item={item} />
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function DiaSprintRow({ item }: { item: AdminSprintCalendarItem }) {
  const dias = describeDiasRestantes(item);
  return (
    <li className="py-inline first:pt-0 last:pb-0">
      <p className="type-body break-words font-semibold text-text-primary">{item.tituloProyecto}</p>
      <p className="mt-micro flex flex-wrap items-center gap-tight">
        <span className="type-body font-medium">Sprint {item.numero}</span>
        <span className={`pill whitespace-nowrap ${SITUACION_SPRINT_TONE[item.situacion]}`}>
          {SITUACION_SPRINT_LABEL_CORTA[item.situacion]}
        </span>
      </p>
      <dl className="mt-tight grid grid-cols-[auto_1fr] gap-x-inline gap-y-micro type-meta">
        <dt>Líder</dt>
        <dd className="font-medium text-text-primary">
          {item.lider.nombre} {item.lider.apellido}
        </dd>
        <dt>Finalización</dt>
        <dd className="font-medium tabular-nums text-text-primary">
          {item.fechaFinPlaneada ? formatDiaConAnio(item.fechaFinPlaneada) : 'Sin fecha'}
          {dias && <span className="font-normal text-text-secondary"> · {dias}</span>}
        </dd>
      </dl>
      <Link
        href={adminProjectHref(item.idProyecto)}
        aria-label={`Ver proyecto ${item.tituloProyecto}`}
        className="type-meta mt-tight inline-flex items-center gap-micro rounded-control font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        Ver proyecto
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </li>
  );
}
