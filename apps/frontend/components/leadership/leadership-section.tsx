'use client';

import { useState } from 'react';
import { Crown, History, ScrollText } from 'lucide-react';
import { HoursKpiCard } from '@/components/hours/hours-kpi-card';
import { LeadershipCard, LeadershipHistoryTable } from '@/components/leadership/leadership-card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { LeadershipAppealSheet } from '@/components/leadership/leadership-appeal-sheet';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useLeadershipAppealMutations,
  useLeadershipAppeals,
  useLeadershipContext,
  useLeadershipHistory,
} from '@/hooks/use-leadership';
import uvgSwal from '@/lib/swal';
import type { ApelacionItemDto } from '@/lib/types/leadership';

/** Fecha corta para las marcas de la apelación pendiente. */
function formatearFechaCorta(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * S7 (VIEW-06, F008) — contexto de liderazgo del proyecto, con su propia
 * entrada en la barra del proyecto. Para el LÍDER la
 * acción es «Apelar cambio de liderazgo» (F009 monta el sheet en este
 * slot); transferir es exclusivo del administrador (VIEW-19) y nunca se
 * ofrece aquí. Un miembro no recibe ninguna acción.
 */
export function LeadershipSection({
  idProyecto,
  isLeader,
  idUsuarioActual,
}: {
  idProyecto: number;
  isLeader: boolean;
  idUsuarioActual: number | null;
}) {
  const contexto = useLeadershipContext(idProyecto);
  const historial = useLeadershipHistory(idProyecto, 1);
  const apelaciones = useLeadershipAppeals(idProyecto, 'PENDIENTE', 1);
  // F009: el sheet de apelación se monta en el slot previsto por F008 y la
  // apelación pendiente propia puede cancelarse mientras se siga liderando.
  const [apelacionAbierta, setApelacionAbierta] = useState(false);
  const { cancel } = useLeadershipAppealMutations(idProyecto);
  const onApelar = isLeader ? () => setApelacionAbierta(true) : undefined;

  const cancelarApelacion = async (pendiente: ApelacionItemDto) => {
    const { isConfirmed } = await uvgSwal.fire({
      icon: 'warning',
      title: '¿Cancelar la apelación?',
      text: 'Se retirará tu solicitud de cambio de liderazgo. Podrás enviar otra más adelante.',
      showCancelButton: true,
      confirmButtonText: 'Sí, cancelar',
      cancelButtonText: 'Volver',
    });
    if (!isConfirmed) return;
    cancel.mutate(
      { idApelacion: pendiente.idApelacion },
      {
        onError: (err) =>
          void uvgSwal.fire({ icon: 'error', title: 'No se pudo cancelar', text: getApiErrorMessage(err, 'leadership') }),
      },
    );
  };

  const appealSlot = (pendiente: ApelacionItemDto | null) =>
    pendiente && isLeader && idUsuarioActual != null && pendiente.liderSolicitante.idUsuario === idUsuarioActual ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={cancel.isPending}
        onClick={() => void cancelarApelacion(pendiente)}
        className="mt-stack h-8 w-full rounded-md border-error/40 text-xs font-semibold text-error hover:bg-error/10 hover:text-error"
      >
        {cancel.isPending ? 'Cancelando…' : 'Cancelar apelación'}
      </Button>
    ) : null;

  const pendiente = apelaciones.data?.items[0] ?? null;
  const estado = contexto.data?.estadoProyecto;
  const estadoPermiteApelar = estado === 'PUBLICADO' || estado === 'EN_PROGRESO';
  const motivoBloqueo = pendiente
    ? 'Ya existe una apelación pendiente para este proyecto.'
    : !estadoPermiteApelar
      ? 'El estado actual del proyecto no permite apelar el liderazgo.'
      : null;

  const botonApelar = (
    <Button
      type="button"
      onClick={onApelar}
      disabled={motivoBloqueo != null || !onApelar}
      className="h-9 w-full gap-1.5 rounded-md text-xs font-bold sm:w-auto"
    >
      Apelar cambio de liderazgo
    </Button>
  );

  const action = isLeader
    ? motivoBloqueo
      ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} aria-label={motivoBloqueo} className="inline-flex w-full rounded-md sm:w-auto">
                {botonApelar}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{motivoBloqueo}</TooltipContent>
          </Tooltip>
        )
      : botonApelar
    : undefined;

  if (contexto.isError) return null;

  const lider = contexto.data?.liderActual;
  const cambios = historial.data?.items ?? [];

  return (
    <div className="flex flex-col gap-section">
      {isLeader && (
        <LeadershipAppealSheet projectId={idProyecto} open={apelacionAbierta} onOpenChange={setApelacionAbierta} />
      )}

      {/* Mini-resumen con datos que ya entrega el backend (sin cálculos nuevos). */}
      <section aria-label="Resumen de liderazgo" className="grid grid-cols-1 gap-grid @xl/project:grid-cols-3">
        <HoursKpiCard
          variante="en-linea"
          icon={Crown}
          label="Líder actual"
          value={lider ? `${lider.nombre} ${lider.apellido}` : '—'}
          isLoading={contexto.isPending}
        />
        <HoursKpiCard
          variante="en-linea"
          icon={ScrollText}
          label="Apelaciones pendientes"
          value={apelaciones.isError ? '—' : String(apelaciones.data?.total ?? 0)}
          isLoading={apelaciones.isPending}
        />
        <HoursKpiCard
          variante="en-linea"
          icon={History}
          label="Cambios de liderazgo"
          value={historial.isError ? '—' : String(historial.data?.total ?? 0)}
          isLoading={historial.isPending}
        />
      </section>

      {/* Liderazgo actual (2/3) + apelaciones pendientes (1/3). */}
      <div className="grid grid-cols-1 gap-grid @4xl/project:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <LeadershipCard
          context={contexto.data}
          history={historial.data?.items}
          isLoading={contexto.isPending}
          action={action}
          showHistory={false}
        />
        <section aria-labelledby="apelaciones-pendientes-title" className="card-base flex flex-col">
          <h2
            id="apelaciones-pendientes-title"
            className="flex items-center gap-tight type-subtitle font-semibold text-text-primary"
          >
            <ScrollText className="size-5 shrink-0 text-text-primary" aria-hidden="true" />
            Apelaciones pendientes
          </h2>
          {apelaciones.isPending ? (
            <Skeleton className="mt-stack h-24 w-full rounded-control" />
          ) : apelaciones.isError ? (
            <p className="type-meta mt-stack">No fue posible consultar las apelaciones.</p>
          ) : pendiente ? (
            <div className="mt-stack rounded-control bg-surface-container-low p-stack">
              <dl className="grid gap-inline">
                <div>
                  <dt className="type-meta">Solicitante</dt>
                  <dd className="text-sm font-semibold text-text-primary">
                    {pendiente.liderSolicitante.nombre} {pendiente.liderSolicitante.apellido}
                  </dd>
                </div>
                <div>
                  <dt className="type-meta">Candidato propuesto</dt>
                  <dd className="text-sm font-semibold text-text-primary">
                    {pendiente.candidatoPropuesto.nombre} {pendiente.candidatoPropuesto.apellido}
                  </dd>
                </div>
                <div>
                  <dt className="type-meta">Asunto</dt>
                  <dd className="text-sm text-text-primary">{pendiente.asunto}</dd>
                </div>
              </dl>
              <p className="type-meta mt-inline">
                Enviada el {formatearFechaCorta(pendiente.creadaEn)} · pendiente de resolución administrativa
              </p>
              {appealSlot?.(pendiente)}
            </div>
          ) : (
            <Empty tone="flush" className="py-6 md:py-8">
              <EmptyMedia variant="subtle">
                <ScrollText aria-hidden="true" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle className="type-subtitle">No hay apelaciones pendientes.</EmptyTitle>
                <EmptyDescription>
                  Cuando se solicite un cambio de liderazgo, aparecerá aquí mientras la administración lo resuelve.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </section>
      </div>

      {/* Historial como sección propia, ya no un enlace plegable suelto. */}
      <section aria-labelledby="historial-liderazgo-title" className="flex flex-col gap-stack">
        <div className="flex flex-wrap items-baseline justify-between gap-inline">
          <h2 id="historial-liderazgo-title" className="type-section text-text-primary">
            Historial de liderazgo
          </h2>
          {!historial.isPending && !historial.isError && (
            <span className="type-meta">
              {historial.data?.total === 1 ? '1 cambio registrado' : `${historial.data?.total ?? 0} cambios registrados`}
            </span>
          )}
        </div>
        <div className="card-base overflow-hidden p-0">
          {historial.isPending ? (
            <div className="p-card">
              <Skeleton className="h-24 w-full rounded-control" />
            </div>
          ) : historial.isError ? (
            <p className="type-meta p-card">No fue posible consultar el historial de liderazgo.</p>
          ) : cambios.length === 0 ? (
            <Empty tone="flush" className="px-card py-6 md:px-card md:py-8">
              <EmptyMedia variant="subtle">
                <History aria-hidden="true" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle className="type-subtitle">Sin cambios de liderazgo registrados.</EmptyTitle>
                <EmptyDescription>Cada cambio de líder queda registrado aquí con su fecha, origen y motivo.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <LeadershipHistoryTable items={cambios} />
          )}
        </div>
      </section>
    </div>
  );
}
