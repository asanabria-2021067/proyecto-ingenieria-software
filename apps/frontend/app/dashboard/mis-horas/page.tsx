'use client';

import { PageTitle } from '@/components/ui/page-title';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Clock, Hourglass, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { HoursKpiCard } from '@/components/hours/hours-kpi-card';
import { MyHoursRequirements } from '@/components/hours/my-hours-requirements';
import { MyHoursProjectList } from '@/components/hours/my-hours-project-list';
import { SemestreHorasCard } from '@/components/hours/semestre-horas-card';
import { SemestreHorasHistorial } from '@/components/hours/semestre-horas-historial';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { useMisHoras } from '@/hooks/use-my-hours';
import { formatearHoras } from '@/lib/hours/format';
import type { MisHorasView } from '@/lib/services/users';
import { BotonAyudaTour } from '@/components/ayuda/boton-ayuda-tour';
import { dashboardPage } from '@/components/layout/dashboard-page';

const PASOS_AYUDA = [
  { target: '#tour-horas-semestre', title: 'Horas del semestre', content: 'Declara aquí cuántas horas debes cumplir este semestre.' },
  { target: '#tour-horas-resumen', title: 'Tu resumen', content: 'Registradas, propuestas y acreditadas: cada cifra viene calculada del sistema.' },
  { target: '#tour-horas-proyectos', title: 'Horas por proyecto', content: 'El desglose de lo que llevas en cada proyecto.' },
];

function Encabezado() {
  return (
    <header className="flex items-start justify-between gap-inline">
      <div>
        <PageTitle className="type-display">Mis Horas</PageTitle>
        <p className="type-body mt-micro text-text-secondary">
          Tus horas registradas, propuestas y acreditadas en todos tus proyectos.
        </p>
      </div>
      <BotonAyudaTour pasos={PASOS_AYUDA} />
    </header>
  );
}

function MisHorasSkeleton() {
  return (
    <SkeletonRegion label="Cargando tus horas" className="flex flex-col gap-section">
      <div className="grid gap-grid @2xl/mis-horas:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-card" />
      <div className="flex flex-col gap-inline">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-card" />
        ))}
      </div>
    </SkeletonRegion>
  );
}

function MisHorasError({ error, onRetry, reintentando }: { error: unknown; onRetry: () => void; reintentando: boolean }) {
  return (
    <Empty tone="danger" role="alert">
      <EmptyMedia variant="icon">
        <AlertCircle aria-hidden="true" />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>No pudimos cargar tus horas</EmptyTitle>
        <EmptyDescription>{getApiErrorMessage(error, 'general')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" onClick={onRetry} disabled={reintentando}>
          Reintentar
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function SinHoras() {
  return (
    <Empty tone="muted">
      <EmptyMedia variant="icon">
        <Timer aria-hidden="true" />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>Aún no tienes horas registradas</EmptyTitle>
        <EmptyDescription>
          Registra tiempo en tus tareas o únete a un proyecto para empezar a acumular horas.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex flex-wrap justify-center gap-inline">
        <Button asChild>
          <Link href="/dashboard/mis-tareas">Ir a Mis Tareas</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/proyectos">Explorar Proyectos</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function Contenido({ vista }: { vista: MisHorasView }) {
  const { totales } = vista;
  // Presentación: la nota aparece solo si hay legacy; nunca se suma a las registradas.
  const conLegacy = Number(totales.legacyEnProyectosAbiertos) > 0;

  return (
    <>
      <div id="tour-horas-semestre">
        <SemestreHorasCard editable />
      </div>

      {/* Tres KPI por fila solo si el contenido mide al menos 42rem: con la
          sidebar global abierta, a 768 px quedan ~500 px y no caben. */}
      <section id="tour-horas-resumen" aria-label="Resumen de horas" className="grid gap-grid @2xl/mis-horas:grid-cols-3">
        <HoursKpiCard
          variante="en-linea"
          icon={Clock}
          label="Registradas en proyectos abiertos"
          value={formatearHoras(totales.registradasEnProyectosAbiertos)}
          note={
            conLegacy
              ? `+ ${formatearHoras(totales.legacyEnProyectosAbiertos)} históricas (legacy), mostradas aparte`
              : undefined
          }
        />
        <HoursKpiCard
          variante="en-linea"
          icon={Hourglass}
          label="Propuestas para acreditación"
          value={formatearHoras(totales.propuestasPendientes)}
          note="Pendientes de aprobación al cierre del proyecto"
        />
        <HoursKpiCard
          variante="en-linea"
          icon={CheckCircle2}
          label="Acreditadas en total"
          value={formatearHoras(totales.acreditadas)}
          destacado
        />
      </section>

      <MyHoursRequirements porTipo={vista.porTipo} />

      <div id="tour-horas-proyectos">
        {vista.proyectos.length === 0 ? <SinHoras /> : <MyHoursProjectList proyectos={vista.proyectos} />}
      </div>

      <SemestreHorasHistorial />
    </>
  );
}

/**
 * HU-158 (T-232): «Mis Horas». Vista de solo lectura del desglose que calcula
 * el backend (GET /usuarios/me/horas): aquí no se registra, edita ni acredita
 * nada, y ninguna cifra se suma en el cliente.
 */
export default function MisHorasPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useMisHoras();

  return (
    <div className={dashboardPage('@container/mis-horas flex flex-col gap-section py-section lg:py-page')}>
      <Encabezado />
      {isLoading ? (
        <MisHorasSkeleton />
      ) : isError || !data ? (
        <MisHorasError error={error} onRetry={() => void refetch()} reintentando={isFetching} />
      ) : (
        <Contenido vista={data} />
      )}
    </div>
  );
}
