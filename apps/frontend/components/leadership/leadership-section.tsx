'use client';

import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { LeadershipCard } from '@/components/leadership/leadership-card';
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
        className="mt-2 h-8 w-full rounded-md border-error/40 text-xs font-semibold text-error hover:bg-error/10 hover:text-error"
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

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      {isLeader && (
        <LeadershipAppealSheet projectId={idProyecto} open={apelacionAbierta} onOpenChange={setApelacionAbierta} />
      )}
      <LeadershipCard
        context={contexto.data}
        history={historial.data?.items}
        isLoading={contexto.isPending}
        action={action}
      />
      <section
        aria-labelledby="apelaciones-pendientes-title"
        className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm"
      >
        <h2 id="apelaciones-pendientes-title" className="flex items-center gap-2 text-base font-bold text-on-surface">
          <ScrollText className="size-4 text-primary" aria-hidden="true" />
          Apelaciones pendientes
        </h2>
        {apelaciones.isPending ? (
          <Skeleton className="mt-3 h-20 w-full rounded-lg" />
        ) : apelaciones.isError ? (
          <p className="mt-3 text-xs text-tertiary">No fue posible consultar las apelaciones.</p>
        ) : pendiente ? (
          <div className="mt-3 space-y-2 rounded-lg border border-outline-variant/40 bg-surface-container-low p-3 text-xs">
            <p className="text-tertiary">
              Solicitante{' '}
              <span className="block text-sm font-semibold text-on-surface">
                {pendiente.liderSolicitante.nombre} {pendiente.liderSolicitante.apellido}
              </span>
            </p>
            <p className="text-tertiary">
              Candidato propuesto{' '}
              <span className="block text-sm font-semibold text-on-surface">
                {pendiente.candidatoPropuesto.nombre} {pendiente.candidatoPropuesto.apellido}
              </span>
            </p>
            <p className="text-tertiary">
              Asunto <span className="block text-sm text-on-surface">{pendiente.asunto}</span>
            </p>
            <p className="text-[11px] text-tertiary">Enviada el {formatearFechaCorta(pendiente.creadaEn)} · pendiente de resolución administrativa</p>
            {appealSlot?.(pendiente)}
          </div>
        ) : (
          <p className="mt-3 text-sm italic text-tertiary">No hay apelaciones pendientes.</p>
        )}
      </section>
    </div>
  );
}
