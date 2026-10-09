'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';
import { CALENDAR_DAY_CHIP_CLASS, CalendarMonthGrid } from '@/components/calendar/month-view';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
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
  selectedKey,
  onSelectDay,
  itemsByDay,
}: {
  /** Día actual `YYYY-MM-DD` según el backend. */
  hoy: string;
  /** Día seleccionado `YYYY-MM-DD`; lo lleva la página porque vive en la URL (`?fecha=`). */
  selectedKey: string;
  onSelectDay: (dia: string) => void;
  /** Sprints (ya filtrados) por día de finalización esperada. */
  itemsByDay: ReadonlyMap<string, AdminSprintCalendarItem[]>;
}) {
  const [cursor, setCursor] = useState(() => mesDe(selectedKey));
  // El mes sigue al día seleccionado (al llegar con `?fecha=`, al elegir un día
  // del mes vecino o al pulsar «Hoy»), pero las flechas lo mueven libremente.
  const [seguido, setSeguido] = useState(selectedKey);
  if (seguido !== selectedKey) {
    setSeguido(selectedKey);
    setCursor(mesDe(selectedKey));
  }

  const prefijoMes = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-`;
  let delMes = 0;
  for (const [dia, items] of itemsByDay) if (dia.startsWith(prefijoMes)) delMes += items.length;
  const delDia = itemsByDay.get(selectedKey) ?? [];

  // Carrusel vertical del día: la lista toma el alto del calendario y, si las
  // tarjetas no caben, se desplaza. Es scroll nativo (rueda, tacto y teclado
  // funcionan solos); las flechas solo aparecen cuando hay algo que mover.
  const listaRef = useRef<HTMLUListElement>(null);
  const [desplazable, setDesplazable] = useState({ arriba: false, abajo: false });
  const medirLista = () => {
    const lista = listaRef.current;
    if (!lista) return;
    setDesplazable({
      arriba: lista.scrollTop > 1,
      abajo: lista.scrollTop + lista.clientHeight < lista.scrollHeight - 1,
    });
  };
  useEffect(() => {
    const lista = listaRef.current;
    if (!lista) return;
    lista.scrollTop = 0;
    // El observador avisa al empezar a observar y cada vez que cambia el alto disponible.
    const observador = new ResizeObserver(medirLista);
    observador.observe(lista);
    return () => observador.disconnect();
  }, [selectedKey, delDia.length]);
  const moverLista = (direccion: 1 | -1) => {
    const lista = listaRef.current;
    lista?.scrollBy({ top: direccion * lista.clientHeight * 0.8 });
  };

  const mover = (delta: number) =>
    setCursor(({ year, month }) => {
      const fecha = new Date(year, month + delta, 1);
      return { year: fecha.getFullYear(), month: fecha.getMonth() };
    });
  const irAHoy = () => {
    // Si hoy ya estaba seleccionado, el mes no se movería solo.
    setCursor(mesDe(hoy));
    onSelectDay(hoy);
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
          <button
            type="button"
            onClick={irAHoy}
            className="type-body inline-flex min-h-8 items-center rounded-control px-tight font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
          >
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
            onSelectDay={onSelectDay}
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

        {/* Donde el estudiante tiene «Mis Proyectos», el admin ve el día elegido:
            una tarjeta con la fecha y, debajo, una tarjeta por Sprint. Desde `lg`
            la columna mide lo mismo que el calendario (capa absoluta: no estira
            la fila) y la lista se desplaza dentro de ese alto. */}
        <section aria-labelledby="sprints-dia-titulo" className="relative min-h-0">
          <div className="flex flex-col gap-gap lg:absolute lg:inset-0">
            <div className="card-base flex shrink-0 items-start justify-between gap-inline" aria-live="polite">
              <div className="min-w-0">
                <h2 id="sprints-dia-titulo" className="type-subtitle text-text-primary">
                  {formatDiaLargoConAnio(selectedKey)}
                </h2>
                {delDia.length > 0 && (
                  <p className="type-meta mt-micro tabular-nums">{contarFinalizaciones(delDia.length)}</p>
                )}
              </div>
              {delDia.length > 0 && (desplazable.arriba || desplazable.abajo) && (
                <div className="flex shrink-0 gap-micro">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 w-8 rounded-control p-0"
                    aria-label="Sprints anteriores"
                    disabled={!desplazable.arriba}
                    onClick={() => moverLista(-1)}
                  >
                    <ChevronUp className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 w-8 rounded-control p-0"
                    aria-label="Sprints siguientes"
                    disabled={!desplazable.abajo}
                    onClick={() => moverLista(1)}
                  >
                    <ChevronDown className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              )}
            </div>

            {/* Día sin Sprints: mismo vacío que «Nada programado ese día» del calendario del estudiante. */}
            {delDia.length === 0 && (
              <Empty className="surface-enter flex-none" aria-live="polite">
                {/* 25 % más pequeño que el vacío del estudiante (64→48 px, 28→21 px, 20→15 px). */}
                <EmptyMedia variant="icon" className="size-12 ring-6">
                  <CalendarDays aria-hidden="true" className="size-[21px]" />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle className="text-[15px]">No hay finalizaciones planificadas para este día.</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}

            {delDia.length > 0 && (
              <ul
                ref={listaRef}
                onScroll={medirLista}
                aria-label={`Sprints que finalizan el ${formatDiaLargoConAnio(selectedKey)}`}
                className="-mx-1 flex flex-col gap-gap px-1 pb-1 motion-safe:scroll-smooth lg:min-h-0 lg:flex-1 lg:snap-y lg:overflow-y-auto lg:overscroll-contain"
              >
                {delDia.map((item) => (
                  <DiaSprintRow key={item.idSprint} item={item} />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function mesDe(dia: string): { year: number; month: number } {
  const fecha = parseFechaSolo(dia);
  return { year: fecha.getFullYear(), month: fecha.getMonth() };
}

/** Tarjeta de un Sprint que finaliza el día elegido: proyecto, Sprint, situación, líder y fecha. */
function DiaSprintRow({ item }: { item: AdminSprintCalendarItem }) {
  const dias = describeDiasRestantes(item);
  return (
    <li className="card-base shrink-0 lg:snap-start">
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
