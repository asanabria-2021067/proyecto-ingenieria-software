'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { darDeBajaIntegrante, MOTIVO_BAJA_MAX, MOTIVO_BAJA_MIN } from '@/lib/services/equipo';
import uvgSwal from '@/lib/swal';

interface Props {
  idProyecto: number;
  integrante: { idUsuario: number; nombre: string; apellido: string } | null;
  onClose: () => void;
}

// El 403 trae el motivo real del backend (permiso, alcance, baja a un administrador): no se reemplaza por uno genérico.
function mensajeError(error: unknown): string {
  if (getApiErrorStatus(error) === 403) {
    return (error as Error).message || 'No tienes permiso para dar de baja a este integrante.';
  }
  return getApiErrorMessage(error, 'general');
}

/** Baja de un integrante con motivo obligatorio. Solo administración y coordinación: el líder no la ve. */
export function BajaIntegranteDialog({ idProyecto, integrante, onClose }: Props) {
  const queryClient = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const limpio = motivo.replace(/\s+/g, ' ').trim();
  const valido = limpio.length >= MOTIVO_BAJA_MIN && limpio.length <= MOTIVO_BAJA_MAX;
  const nombre = integrante ? `${integrante.nombre} ${integrante.apellido}` : '';

  const baja = useMutation({
    mutationFn: () => darDeBajaIntegrante(idProyecto, integrante!.idUsuario, limpio),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries();
      void uvgSwal.fire({
        icon: 'success',
        title: 'Integrante dado de baja',
        text: `${r.tareasSinAsignar} ${r.tareasSinAsignar === 1 ? 'tarea quedó' : 'tareas quedaron'} sin asignar.`,
        timer: 2500,
        showConfirmButton: false,
      });
      setMotivo('');
      onClose();
    },
  });

  const cerrar = () => {
    if (baja.isPending) return;
    setMotivo('');
    baja.reset();
    onClose();
  };

  return (
    <Dialog open={integrante !== null} onOpenChange={(abierto) => !abierto && cerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dar de baja a {nombre}</DialogTitle>
          <DialogDescription>
            Pierde el acceso de escritura al proyecto y sus tareas abiertas quedan sin asignar. Las horas ya registradas se
            conservan. Se avisa a la persona y queda en la bitácora.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-tight">
          <Label htmlFor="motivo-baja">Motivo de la baja (obligatorio)</Label>
          <Textarea
            id="motivo-baja"
            value={motivo}
            maxLength={MOTIVO_BAJA_MAX}
            aria-describedby="motivo-baja-ayuda"
            onChange={(e) => setMotivo(e.target.value)}
          />
          <p id="motivo-baja-ayuda" className="type-meta">
            Entre {MOTIVO_BAJA_MIN} y {MOTIVO_BAJA_MAX} caracteres. {limpio.length}/{MOTIVO_BAJA_MAX}
          </p>
          {baja.isError && (
            <p role="alert" className="type-meta text-error">
              {mensajeError(baja.error)}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={baja.isPending} onClick={cerrar}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={!valido || baja.isPending} onClick={() => baja.mutate()}>
            {baja.isPending ? 'Procesando...' : 'Dar de baja'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
