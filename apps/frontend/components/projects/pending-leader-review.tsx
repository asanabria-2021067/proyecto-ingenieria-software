import { Clock } from 'lucide-react';

export interface PendingLeaderReviewProps {
  /** ISO datetime real de `SolicitudSalidaTransicionDto.solicitadaEn` (B7) — nunca inventado. */
  solicitadaEn?: string;
  /** `SolicitudSalidaTransicionDto.motivo` (B7) — solo se muestra si el backend ya lo devolvió. */
  motivo?: string;
}

function formatearFechaSolicitud(fechaIso: string): string {
  return new Date(fechaIso).toLocaleDateString('es-GT', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * F11 — vista de solo lectura para `PENDIENTE_LIDER`. Puramente
 * presentacional: no consulta ningún hook, no conoce B9 (aprobar/rechazar),
 * no ofrece ninguna acción. El icono/badge reutilizan literalmente el mismo
 * `statusConfig` "Pendiente" ya usado en
 * `app/dashboard/mis-postulaciones/page.tsx` (`Clock` + `bg-surface-container
 * text-tertiary`), no una paleta nueva — ni verde de éxito definitivo (la
 * resolución todavía no ocurrió) ni rojo de error (la solicitud funciona
 * correctamente, solo espera revisión).
 */
export function PendingLeaderReview({ solicitadaEn, motivo }: PendingLeaderReviewProps) {
  return (
    <div
      role="status"
      aria-label="Solicitud de salida enviada, esperando revisión del líder del proyecto"
      className="rounded-lg border border-outline-variant bg-surface-container-lowest p-8 text-center shadow-sm md:p-14"
    >
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-primary-container">
        <Clock className="size-7 text-on-primary-container" aria-hidden="true" />
      </div>

      <h2 className="text-2xl font-bold text-on-surface">Solicitud enviada</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-on-surface-variant">
        Tu solicitud está esperando la revisión del líder del proyecto.
      </p>
      <p className="mx-auto mt-1 max-w-md text-xs text-tertiary">
        Mientras el líder revisa tu solicitud, no necesitas realizar ninguna acción adicional.
      </p>

      <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1 text-xs font-semibold text-tertiary">
        <Clock className="size-3.5" aria-hidden="true" />
        Pendiente de revisión
      </span>

      {(solicitadaEn || motivo) && (
        <div className="mx-auto mt-6 max-w-md space-y-3 rounded-md border border-outline-variant/40 bg-surface-container-low p-4 text-left">
          {solicitadaEn && (
            <p className="text-xs text-tertiary">Enviada el {formatearFechaSolicitud(solicitadaEn)}</p>
          )}
          {motivo && (
            <div>
              <p className="text-xs font-semibold text-on-surface">Motivo</p>
              <p className="mt-0.5 text-sm text-on-surface-variant">{motivo}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
