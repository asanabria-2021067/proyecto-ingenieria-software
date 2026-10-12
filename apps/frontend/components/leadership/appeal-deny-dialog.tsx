'use client';

import { useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useDenyAppeal } from '@/hooks/use-leadership';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import uvgSwal from '@/lib/swal';
import { MENSAJE_RESOLUCION_MAX, type ApelacionItemDto } from '@/lib/types/leadership';

/**
 * Confirmación de «Denegar» una apelación de liderazgo (VIEW-18, F015): exige
 * `mensajeResolucion`, no cambia el liderazgo y trata el 409 «ya resuelta»
 * como aviso, no como error. Vivía dentro de la bandeja; se extrajo tal cual
 * para la vista de revisión.
 */
export function AppealDenyDialog({
  apelacion,
  open,
  onOpenChange,
}: {
  apelacion: ApelacionItemDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState<string | null>(null);
  const deny = useDenyAppeal();
  const valido = mensaje.trim().length > 0 && mensaje.length <= MENSAJE_RESOLUCION_MAX;

  const cerrar = (siguiente: boolean) => {
    if (!siguiente) {
      setMensaje('');
      setError(null);
      deny.reset();
    }
    onOpenChange(siguiente);
  };

  const confirmar = () => {
    if (!apelacion || !valido || deny.isPending) return;
    setError(null);
    deny.mutate(
      { idProyecto: apelacion.idProyecto, idApelacion: apelacion.idApelacion, input: { mensajeResolucion: mensaje.trim() } },
      {
        onSuccess: () => {
          cerrar(false);
          void uvgSwal.fire({ icon: 'success', title: 'Apelación denegada', timer: 2000, showConfirmButton: false });
        },
        onError: (err) => {
          if (getApiErrorStatus(err) === 409) {
            cerrar(false);
            void uvgSwal.fire({ icon: 'info', title: 'La apelación ya fue resuelta', text: getApiErrorMessage(err, 'admin') });
            return;
          }
          setError(getApiErrorMessage(err, 'admin'));
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>Denegar apelación</DialogTitle>
          <DialogDescription>
            El liderazgo no cambia. El mensaje de resolución se muestra al líder solicitante.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor={`${id}-mensaje`} className="text-xs font-semibold text-on-surface">
            Mensaje de resolución <span aria-hidden="true">*</span>
          </Label>
          <Textarea
            id={`${id}-mensaje`}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            maxLength={MENSAJE_RESOLUCION_MAX}
            required
            aria-required="true"
            rows={4}
            autoFocus
            placeholder="Explica por qué se deniega la apelación…"
            className="mt-1 text-sm"
          />
          <p className="mt-1 text-right text-[11px] text-tertiary" aria-live="polite">
            {mensaje.length}/{MENSAJE_RESOLUCION_MAX}
          </p>
          {error && (
            <p role="alert" className="text-xs text-error">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => cerrar(false)} disabled={deny.isPending} className="rounded-lg">
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={confirmar}
            disabled={!valido || deny.isPending}
            className="gap-1.5 rounded-lg bg-error text-on-error hover:bg-error/90"
          >
            {deny.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Denegar apelación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
