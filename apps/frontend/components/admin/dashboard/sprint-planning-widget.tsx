'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, CalendarClock, CalendarRange, RotateCw } from 'lucide-react';
import { MiniCalendar } from '@/components/calendar/mini-calendar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminSprintCalendar } from '@/hooks/use-admin-sprint-calendar';
import {
  SITUACION_SPRINT_LABEL,
  SITUACION_SPRINT_TONE,
  countSprintsByPlannedDay,
  describePlannedDay,
  formatDiaCorto,
  formatDiasRestantes,
  pickNextSprintFinalization,
} from '@/lib/admin/sprint-calendar';
import { parseFechaSolo } from '@/lib/calendar/utils';
import type { AdminSprintCalendar, AdminSprintCalendarItem } from '@/lib/types/admin-sprints';

/**
 * Resumen de planificación de Sprints del panel de administración: cuántos
 * Sprints deberían terminar pronto, cuáles ya pasaron su fecha esperada y en
 * qué días caen, sobre el mismo mini calendario del dashboard del estudiante.
 *
 * Todo sale de UNA consulta (`useAdminSprintCalendar`). La fecha que se
 * muestra es la finalización ESPERADA del trabajo, no el cierre formal, y qué
 * Sprint está vencido o vence hoy lo dice el backend: aquí solo se presenta.
 *
 * El widget resuelve sus propios estados de carga, vacío y error para que un
 * fallo suyo no tumbe el resto del panel.
 */
export function AdminSprintPlanningWidget() {
  const tituloId = useId();
  const { data, isLoading, isError, isFetching, refetch } = useAdminSprintCalendar();

  return (
    <section aria-labelledby={tituloId} className="card-base flex h-full flex-col gap-stack xl:gap-inline xl:p-stack">
      <header className="flex items-start gap-inline">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
          <CalendarRange className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 id={tituloId} className="type-subtitle font-semibold text-balance">
            Próximas finalizaciones de Sprint
          </h3>
          <p className="type-meta">Supervisa las fechas esperadas de los Sprints activos.</p>
        </div>
      </header>

      {isLoading ? (
        <SprintPlanningSkeleton />
      ) : isError || !data ? (
        <SprintPlanningError onRetry={() => void refetch()} retrying={isFetching} />
      ) : data.items.length === 0 ? (
        <p className="type-body rounded-control bg-surface-container-low p-stack text-center text-text-secondary">
          No hay Sprints operables para supervisar.
        </p>
      ) : (
        <SprintPlanningContent calendar={data} />
      )}
    </section>
  );
}

function SprintPlanningSkeleton() {
  return (
    <div role="status" aria-label="Cargando la planificación de Sprints" className="flex flex-col gap-stack">
      <Skeleton className="h-20 rounded-control" />
      <Skeleton className="mx-auto h-56 w-full max-w-sm rounded-control" />
      <Skeleton className="h-20 rounded-control" />
    </div>
  );
}

function SprintPlanningError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-inline rounded-control bg-surface-container-low p-stack text-center">
      <AlertCircle className="size-6 text-error" aria-hidden="true" />
      <p className="type-body text-text-secondary">No se pudo cargar la planificación de Sprints.</p>
      <Button type="button" variant="outline" size="sm" className="rounded-control" onClick={onRetry} disabled={retrying}>
        <RotateCw className={`size-4 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" />
        Reintentar
      </Button>
    </div>
  );
}

function Metric({ label, value, atencion = false }: { label: string; value: number; atencion?: boolean }) {
  return (
    <div className="min-w-0 px-stack py-inline first:pl-0 last:pr-0 xl:py-tight">
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</dt>
      <dd
        className={`mt-micro font-headline text-3xl font-bold tabular-nums xl:text-2xl ${
          atencion ? 'text-attention-strong dark:text-attention' : 'text-text-primary'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function SprintPlanningContent({ calendar }: { calendar: AdminSprintCalendar }) {
  // El mes inicial y el «hoy» resaltado salen del día que usó el servidor
  // (America/Guatemala), no del reloj del navegador: cerca de la medianoche
  // ambos pueden diferir y el calendario debe coincidir con las métricas.
  const [cursor, setCursor] = useState(() => {
    const hoy = parseFechaSolo(calendar.hoy);
    return { year: hoy.getFullYear(), month: hoy.getMonth() };
  });

  const porDia = useMemo(() => countSprintsByPlannedDay(calendar.items), [calendar.items]);
  const diasMarcados = useMemo(() => new Set(porDia.keys()), [porDia]);
  const proxima = useMemo(() => pickNextSprintFinalization(calendar.items), [calendar.items]);

  const enFinalizacion = calendar.conteos.EN_FINALIZACION;
  const sinFecha = calendar.conteos.SIN_FECHA;

  return (
    <>
      <dl className="grid grid-cols-2 divide-x divide-outline-variant/50 border-y border-outline-variant/50">
        <Metric label="Próximos 7 días" value={calendar.resumen.proximos7Dias} />
        <Metric label="Plan vencido" value={calendar.resumen.planVencido} atencion={calendar.resumen.planVencido > 0} />
      </dl>

      <div className="mx-auto w-full max-w-sm">
        <MiniCalendar
          year={cursor.year}
          month={cursor.month}
          todayKey={calendar.hoy}
          markedDates={diasMarcados}
          markedCounts={porDia}
          getDayLabel={describePlannedDay}
          onPrevMonth={() =>
            setCursor(({ year, month }) => (month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }))
          }
          onNextMonth={() =>
            setCursor(({ year, month }) => (month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }))
          }
        />
      </div>

      {(enFinalizacion > 0 || sinFecha > 0) && (
        <ul className="flex flex-wrap gap-tight" aria-label="Otros Sprints en supervisión">
          {enFinalizacion > 0 && (
            <li className={`pill ${SITUACION_SPRINT_TONE.EN_FINALIZACION}`}>
              {enFinalizacion} en finalización
            </li>
          )}
          {sinFecha > 0 && (
            <li className={`pill ${SITUACION_SPRINT_TONE.SIN_FECHA}`}>{sinFecha} sin fecha planificada</li>
          )}
        </ul>
      )}

      <NextFinalization item={proxima} />

      <Link
        href="/dashboard/admin/sprints"
        className="type-body mt-auto inline-flex min-h-9 items-center justify-center gap-tight self-center rounded-control px-tight font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 xl:text-[0.8125rem]"
      >
        Ver calendario de Sprints
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </>
  );
}

function NextFinalization({ item }: { item: AdminSprintCalendarItem | null }) {
  if (!item || item.fechaFinPlaneada === null || item.diasRestantes === null) {
    return (
      <p className="type-body border-t border-outline-variant/50 pt-stack text-text-secondary">
        No hay finalizaciones próximas.
      </p>
    );
  }

  return (
    <div className="flex items-start gap-inline border-t border-outline-variant/50 pt-stack xl:pt-inline">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
        <CalendarClock className="size-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Próxima finalización</p>
        <p className="mt-micro flex flex-wrap items-center gap-tight">
          <span className="type-body font-semibold">Sprint {item.numero}</span>
          <span className={`pill ${SITUACION_SPRINT_TONE[item.situacion]}`}>
            {SITUACION_SPRINT_LABEL[item.situacion]}
          </span>
        </p>
        <p className="type-body truncate text-text-secondary" title={item.tituloProyecto}>
          {item.tituloProyecto}
        </p>
        <p className="type-meta mt-micro tabular-nums">
          {formatDiaCorto(item.fechaFinPlaneada)} · {formatDiasRestantes(item.diasRestantes)}
        </p>
        <Link
          href={`/dashboard/admin/proyectos/${item.idProyecto}`}
          className="type-meta -mb-tight mt-micro inline-flex items-center gap-micro rounded-control py-tight font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          Ver proyecto
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
