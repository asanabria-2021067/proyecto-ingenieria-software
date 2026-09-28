'use client';

import { Check, Clock, X } from 'lucide-react';
import { aviso, confirmar } from '@/lib/mensajes';
import { useApproveExitRequest, useRejectExitRequest } from '@/hooks/use-exit-request';
import type { PendingLeaderReviewDto } from '@/lib/types/exit-requests';

/**
 * F14 — badge y acciones de resolución de UNA `SolicitudSalidaProyecto`
 * `PENDIENTE_LIDER` (B9), asociada presentacionalmente a su miembro por
 * `idUsuario` (F14.1: el padre hace
 * `pendingExitRequests.find(r => r.idUsuario === member.idUsuario)` — este
 * archivo nunca decide a quién pertenece una solicitud, solo la presenta).
 *
 * `ExitRequestBadge` y `ExitRequestActions` viven en el mismo archivo porque
 * son la misma pieza de dominio repartida en dos celdas de la fila (nombre y
 * detalle, ver Pantalla F14): solo `ExitRequestActions` posee el estado de
 * mutation/dialog. Ninguna de las dos vuelve a consultar TeamSummary — el
 * padre ya resuelve `miembro`/`request` y se los pasa hechos.
 */
export function ExitRequestBadge({ request }: { request: PendingLeaderReviewDto | undefined }) {
  if (!request) {
    return null;
  }

  return (
    <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
      <Clock aria-hidden="true" className="h-3 w-3" />
      Salida pendiente
    </span>
  );
}

type AccionSalida = 'APROBAR' | 'RECHAZAR';

export function ExitRequestActions({
  request,
  idProyecto,
  nombreCompleto,
}: {
  request: PendingLeaderReviewDto;
  idProyecto: number;
  nombreCompleto: string;
}) {
  const aprobar = useApproveExitRequest(idProyecto);
  const rechazar = useRejectExitRequest(idProyecto);

  const enCurso = aprobar.isPending || rechazar.isPending;

  async function resolver(accion: AccionSalida) {
    const mutation = accion === 'APROBAR' ? aprobar : rechazar;
    const confirmado = await confirmar({
      titulo: accion === 'APROBAR' ? `¿Aprobar la salida de ${nombreCompleto}?` : `¿Rechazar la solicitud de salida de ${nombreCompleto}?`,
      descripcion:
        accion === 'APROBAR'
          ? `${nombreCompleto} deja de participar en el proyecto.`
          : `${nombreCompleto} continúa participando en el proyecto.`,
      textoAccion: accion === 'APROBAR' ? 'Aprobar salida' : 'Rechazar salida',
      destructiva: accion === 'APROBAR',
    });
    if (!confirmado) return;

    mutation.mutate(request.idSolicitud, {
      onSuccess: () => aviso.exito(accion === 'APROBAR' ? 'Salida aprobada' : 'Salida rechazada'),
      onError: (error: any) =>
        aviso.error('No se pudo resolver la solicitud de salida', error?.message),
    });
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        onClick={() => void resolver('RECHAZAR')}
        disabled={enCurso}
        aria-label={`Rechazar solicitud de salida de ${nombreCompleto}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold text-error transition-colors hover:bg-error-container disabled:opacity-50"
      >
        <X aria-hidden="true" className="h-3.5 w-3.5" />
        Rechazar salida
      </button>
      <button
        type="button"
        onClick={() => void resolver('APROBAR')}
        disabled={enCurso}
        aria-label={`Aprobar solicitud de salida de ${nombreCompleto}`}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <Check aria-hidden="true" className="h-3.5 w-3.5" />
        Aprobar salida
      </button>
    </div>
  );
}
