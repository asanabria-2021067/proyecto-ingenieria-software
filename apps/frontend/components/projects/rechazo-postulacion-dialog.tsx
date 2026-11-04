'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { MOTIVO_RECHAZO_LABEL } from '@/components/projects/application-status.utils';
import type { MotivoRechazo } from '@/types';

interface Props {
  nombrePostulante: string;
  pendiente?: boolean;
  onConfirmar: (datos: { motivoRechazo: MotivoRechazo; comentarioResolucion?: string }) => void;
  onCerrar: () => void;
}

/** MEJ-99: se monta solo mientras se rechaza (así cada apertura empieza vacía). Rechazar exige un motivo de la lista; con «Otro motivo» el comentario también es obligatorio. */
export function RechazoPostulacionDialog({ nombrePostulante, pendiente = false, onConfirmar, onCerrar }: Props) {
  const [motivo, setMotivo] = useState<MotivoRechazo | ''>('');
  const [comentario, setComentario] = useState('');
  const [intento, setIntento] = useState(false);

  const error = !motivo
    ? 'Elige un motivo.'
    : motivo === 'OTRO' && !comentario.trim()
      ? 'Con «Otro motivo» el comentario es obligatorio.'
      : null;

  const confirmar = () => {
    setIntento(true);
    if (error || !motivo) return;
    onConfirmar({ motivoRechazo: motivo, comentarioResolucion: comentario.trim() || undefined });
  };

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !pendiente && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rechazar postulación</DialogTitle>
          <DialogDescription>
            {nombrePostulante} verá el motivo en «Mis postulaciones». Elige el que mejor lo describe.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={motivo} onValueChange={(v) => setMotivo(v as MotivoRechazo)} aria-label="Motivo del rechazo">
          {(Object.entries(MOTIVO_RECHAZO_LABEL) as [MotivoRechazo, string][]).map(([valor, etiqueta]) => (
            <label key={valor} className="flex cursor-pointer items-center gap-2 text-sm text-on-surface">
              <RadioGroupItem value={valor} />
              {etiqueta}
            </label>
          ))}
        </RadioGroup>

        <div>
          <label htmlFor="rechazo-comentario" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-tertiary">
            Comentario {motivo === 'OTRO' ? '(obligatorio)' : '(opcional)'}
          </label>
          <Textarea
            id="rechazo-comentario"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Puedes dejar un mensaje al postulante..."
          />
          <p className="mt-1 text-right text-xs text-tertiary">{comentario.length}/500</p>
        </div>

        {intento && error && (
          <p role="alert" className="text-xs text-error">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={confirmar} disabled={pendiente}>
            {pendiente ? 'Guardando...' : 'Sí, rechazar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
