'use client';

import Link from 'next/link';
import { CheckCircle2, ClipboardCheck, FileWarning, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ClosureRevision } from '@/lib/types/closure';

export interface ClosureStatusBannerProps {
  idProyecto: number;
  estadoProyecto: string;
  /** Última revisión de cierre conocida (opcional): afina el mensaje en `EN_SOLICITUD_CIERRE`. */
  revision?: Pick<ClosureRevision, 'estadoRevision' | 'numeroRevision' | 'comentarioRevisor'> | null;
  /** Solo el líder recibe el enlace a la preparación (`/dashboard/projects/[id]/cierre`). */
  isLeader?: boolean;
  /** Fecha de cierre (proyecto `CERRADO`). */
  fechaCierre?: string | null;
  className?: string;
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * VIEW-13 (F005), compartido con VIEW-01/VIEW-02/VIEW-16 — banner del estado
 * de cierre del proyecto. Deriva TODO del estado del servidor (proyecto y
 * revisión); nunca de un evento realtime. Para `PUBLICADO`/`EN_PROGRESO` no
 * renderiza nada.
 */
export function ClosureStatusBanner({
  idProyecto,
  estadoProyecto,
  revision,
  isLeader = false,
  fechaCierre,
  className = '',
}: ClosureStatusBannerProps) {
  if (estadoProyecto === 'CERRADO') {
    return (
      <div
        role="status"
        className={`flex flex-wrap items-center gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-low px-4 py-3 text-sm text-on-surface ${className}`}
      >
        <CheckCircle2 className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <p>
          <span className="font-semibold">Proyecto cerrado</span>
          {fechaCierre ? ` el ${formatearFecha(fechaCierre)}` : ''}. Esta es la vista histórica de solo lectura.
        </p>
      </div>
    );
  }

  if (estadoProyecto !== 'EN_SOLICITUD_CIERRE') return null;

  const correccion = revision?.estadoRevision === 'CORRECCION_DOCUMENTAL' || revision?.estadoRevision === 'BORRADOR';

  if (correccion) {
    return (
      <div
        role="status"
        className={`flex flex-col gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 sm:flex-row sm:items-center ${className}`}
      >
        <FileWarning className="size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Un administrador solicitó una corrección documental.</p>
          {revision?.comentarioRevisor && <p className="mt-0.5 text-xs">{revision.comentarioRevisor}</p>}
        </div>
        {isLeader && (
          <Button asChild size="sm" className="h-9 rounded-md text-xs font-bold">
            <Link href={`/dashboard/projects/${idProyecto}/cierre`}>Corregir documentos</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-low px-4 py-3 text-sm text-on-surface ${className}`}
    >
      <ClipboardCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Solicitud de cierre en revisión</span>
        {revision?.numeroRevision ? ` (entrega #${revision.numeroRevision})` : ''}. Un administrador la revisará; mientras
        tanto el proyecto no admite cambios.
      </p>
      <Info className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
    </div>
  );
}
