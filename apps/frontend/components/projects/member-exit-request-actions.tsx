'use client';

import { useState } from 'react';
import { Check, Clock, X } from 'lucide-react';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import uvgSwal from '@/lib/swal';
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
  const [accionConfirmar, setAccionConfirmar] = useState<AccionSalida | null>(null);

  const enCurso = aprobar.isPending || rechazar.isPending;

  function cancelarConfirmacion() {
    if (enCurso) return;
    setAccionConfirmar(null);
  }

  function confirmar() {
    if (!accionConfirmar) return;
    const mutation = accionConfirmar === 'APROBAR' ? aprobar : rechazar;

    mutation.mutate(request.idSolicitud, {
      onSuccess: () => {
        setAccionConfirmar(null);
        uvgSwal.fire({
          icon: 'success',
          title: accionConfirmar === 'APROBAR' ? 'Salida aprobada' : 'Salida rechazada',
          timer: 2000,
        });
      },
      onError: (error: any) => {
        setAccionConfirmar(null);
        uvgSwal.fire({
          icon: 'error',
          title: 'No se pudo resolver la solicitud de salida',
          text: error?.message || 'Ocurrió un error inesperado.',
        });
      },
    });
  }

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => setAccionConfirmar('RECHAZAR')}
          disabled={enCurso}
          aria-label={`Rechazar solicitud de salida de ${nombreCompleto}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold text-error transition-colors hover:bg-error-container disabled:opacity-50"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
          Rechazar salida
        </button>
        <button
          type="button"
          onClick={() => setAccionConfirmar('APROBAR')}
          disabled={enCurso}
          aria-label={`Aprobar solicitud de salida de ${nombreCompleto}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Check aria-hidden="true" className="h-3.5 w-3.5" />
          Aprobar salida
        </button>
      </div>

      <ConfirmActionDialog
        open={accionConfirmar !== null}
        title={accionConfirmar === 'APROBAR' ? 'Aprobar salida' : 'Rechazar salida'}
        description={
          accionConfirmar === 'APROBAR'
            ? `¿Confirmas que apruebas la salida de ${nombreCompleto} del proyecto? Esta acción no se puede deshacer.`
            : `¿Confirmas que rechazas la solicitud de salida de ${nombreCompleto}?`
        }
        actionLabel={accionConfirmar === 'APROBAR' ? 'Sí, aprobar salida' : 'Sí, rechazar salida'}
        variant={accionConfirmar === 'RECHAZAR' ? 'destructive' : 'default'}
        isPending={enCurso}
        onConfirm={confirmar}
        onCancel={cancelarConfirmacion}
      />
    </>
  );
}
