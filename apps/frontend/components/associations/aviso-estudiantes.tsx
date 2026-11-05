'use client';

import { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useDestinatariosAviso, useEnviarAviso } from '@/hooks/use-asociaciones';
import { aviso } from '@/lib/mensajes';
import type { FiltrosAsociacion } from '@/lib/services/asociaciones';

const MAX_MENSAJE = 500;

/** Las reglas del envío (límite diario, lista cambiada, demasiados destinatarios) llegan con texto para la persona. */
function mensajeError(error: unknown): string {
  const status = getApiErrorStatus(error);
  if ((status === 400 || status === 403 || status === 409 || status === 429) && error instanceof Error && error.message) return error.message;
  return getApiErrorMessage(error, 'general');
}

function DialogoAviso({ idAsociacion, filtros, onClose }: { idAsociacion: number; filtros: FiltrosAsociacion; onClose: () => void }) {
  const [mensaje, setMensaje] = useState('');
  const destinatarios = useDestinatariosAviso(idAsociacion, filtros, true);
  const enviar = useEnviarAviso(idAsociacion);
  const cantidad = destinatarios.data?.cantidad;
  const maximo = destinatarios.data?.maximo ?? 0;
  const excede = cantidad !== undefined && cantidad > maximo;
  const puedeEnviar = !!mensaje.trim() && !!cantidad && !excede && !enviar.isPending;

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent>
        <form
          noValidate
          className="flex flex-col gap-stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!puedeEnviar || cantidad === undefined) return;
            enviar.mutate(
              { mensaje: mensaje.trim(), filtros, cantidadEsperada: cantidad },
              {
                onSuccess: (r) => {
                  aviso.exito('Aviso enviado', `Llegó a ${r.destinatarios} ${r.destinatarios === 1 ? 'estudiante' : 'estudiantes'}.`);
                  onClose();
                },
                onError: (error) => aviso.error('No se pudo enviar el aviso', mensajeError(error)),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Enviar aviso a estos estudiantes</DialogTitle>
            <DialogDescription>
              Llega como notificación y como anuncio en el dashboard de quienes están en la lista filtrada. No se envía por correo.
            </DialogDescription>
          </DialogHeader>

          <p role="status" aria-live="polite" className="type-body font-semibold text-text-primary">
            {destinatarios.isLoading
              ? 'Calculando a cuántos estudiantes se enviará...'
              : destinatarios.isError
                ? 'No pudimos calcular los destinatarios.'
                : excede
                  ? `La lista tiene ${cantidad} estudiantes y el máximo es ${maximo}. Acota los filtros.`
                  : cantidad === 0
                    ? 'Ningún estudiante coincide con los filtros actuales.'
                    : `Se enviará a ${cantidad} ${cantidad === 1 ? 'estudiante' : 'estudiantes'}.`}
          </p>

          <div>
            <Label htmlFor="aviso-mensaje">Mensaje</Label>
            <Textarea
              id="aviso-mensaje"
              maxLength={MAX_MENSAJE}
              rows={4}
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              aria-describedby="aviso-contador"
            />
            <p id="aviso-contador" className="type-meta mt-micro tabular-nums">
              {mensaje.length} / {MAX_MENSAJE}
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!puedeEnviar}>
              {enviar.isPending ? 'Enviando...' : cantidad ? `Enviar a ${cantidad} ${cantidad === 1 ? 'estudiante' : 'estudiantes'}` : 'Enviar aviso'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** MEJ-161: aviso a la lista filtrada. El botón solo lo ven Presidente y Editores; el backend lo vuelve a exigir. */
export function AvisoEstudiantes({ idAsociacion, filtros, puedeEnviar }: { idAsociacion: number; filtros: FiltrosAsociacion; puedeEnviar: boolean }) {
  const [abierto, setAbierto] = useState(false);
  if (!puedeEnviar) return null;
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAbierto(true)}>
        <Megaphone aria-hidden="true" />
        Enviar aviso a estos estudiantes
      </Button>
      {abierto && <DialogoAviso idAsociacion={idAsociacion} filtros={filtros} onClose={() => setAbierto(false)} />}
    </>
  );
}
