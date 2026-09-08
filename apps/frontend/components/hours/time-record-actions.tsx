'use client';

import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { RegistroTiempoTareaDTO } from '@/lib/types/tasks';

export interface TimeRecordActionsProps {
  record: RegistroTiempoTareaDTO;
  /** Flags del servidor (`TaskHoursSummary.puedeEditar/puedeRevocar`): mandan sobre cualquier inferencia local. */
  puedeEditar: boolean;
  puedeRevocar: boolean;
  onEdit: (record: RegistroTiempoTareaDTO) => void;
  onRevoke: (record: RegistroTiempoTareaDTO) => void;
  revoking?: boolean;
  /** Motivo mostrado en el Tooltip cuando la acción está deshabilitada. */
  disabledReason?: string;
}

const DEFAULT_REASON = 'Esta acción no está disponible: el Sprint ya no admite cambios de horas.';

function DisabledAction({ label, reason, icon }: { label: string; reason: string; icon: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-primary/60">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            aria-label={label}
            className="h-8 gap-1.5 rounded-md border-outline-variant text-xs font-semibold"
          >
            {icon}
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

/**
 * VIEW-04 — Editar / Revocar de UNA fila propia. Se renderiza solo en filas
 * del propio usuario; el estado disabled sale de los flags del servidor.
 */
export function TimeRecordActions({
  record,
  puedeEditar,
  puedeRevocar,
  onEdit,
  onRevoke,
  revoking = false,
  disabledReason = DEFAULT_REASON,
}: TimeRecordActionsProps) {
  const editLabel = 'Editar';
  const revokeLabel = 'Revocar';

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {puedeEditar ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onEdit(record)}
          aria-label={`Editar registro de ${record.horas} h del ${record.fecha}`}
          className="h-8 gap-1.5 rounded-md border-outline-variant text-xs font-semibold"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          {editLabel}
        </Button>
      ) : (
        <DisabledAction label={editLabel} reason={disabledReason} icon={<Pencil className="size-3.5" aria-hidden="true" />} />
      )}
      {puedeRevocar ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={revoking}
          onClick={() => onRevoke(record)}
          aria-label={`Revocar registro de ${record.horas} h del ${record.fecha}`}
          className="h-8 gap-1.5 rounded-md border-error/40 text-xs font-semibold text-error hover:bg-error/10 hover:text-error"
        >
          {revoking ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="size-3.5" aria-hidden="true" />
          )}
          {revokeLabel}
        </Button>
      ) : (
        <DisabledAction label={revokeLabel} reason={disabledReason} icon={<Trash2 className="size-3.5" aria-hidden="true" />} />
      )}
    </div>
  );
}
