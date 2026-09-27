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
        className={`flex flex-wrap items-center gap-inline rounded-card border border-outline-variant/40 bg-surface-container-low px-stack py-inline type-body ${className}`}
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
        className={`flex flex-col gap-inline rounded-card border border-outline-variant/40 bg-status-warning px-stack py-inline type-body text-on-status-warning sm:flex-row sm:items-center ${className}`}
      >
        <FileWarning className="size-5 shrink-0 text-on-status-warning" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Un administrador solicitó una corrección documental.</p>
          {revision?.comentarioRevisor && <p className="mt-micro text-meta">{revision.comentarioRevisor}</p>}
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
      className={`flex flex-wrap items-center gap-inline rounded-card border border-outline-variant/40 bg-surface-container-low px-stack py-inline type-body ${className}`}
    >
      <ClipboardCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Solicitud de cierre en revisión</span>
        {revision?.numeroRevision ? ` (entrega #${revision.numeroRevision})` : ''}. Un administrador la revisará; mientras
        tanto el proyecto no admite cambios.
      </p>
      <Info className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
    </div>
  );
}
