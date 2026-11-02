'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTransferirOrganizacion } from '@/hooks/use-organizations';
import { mensajeErrorOrganizacion } from '@/lib/organizations/errors';
import { ROL_LABEL } from '@/lib/organizations/roles';
import { aviso } from '@/lib/mensajes';
import type { MiembroOrganizacion } from '@/lib/types/organizations';

/** El diálogo es la confirmación: pasa a Administrador quien transfiere, y el nuevo propietario debe ser miembro activo. */
export function TransferirDialog({
  idOrganizacion,
  miembros,
  idUsuarioActual,
  abierto,
  onAbiertoChange: setAbierto,
}: {
  idOrganizacion: number;
  miembros: MiembroOrganizacion[];
  idUsuarioActual: number | null;
  /** Lo abre un ítem del menú «Más» de la página. */
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
}) {
  const [elegido, setElegido] = useState('');
  const transferir = useTransferirOrganizacion(idOrganizacion);
  const destinos = miembros.filter((m) => m.idUsuario !== idUsuarioActual);
  const destino = destinos.find((m) => String(m.idUsuario) === elegido);

  const confirmar = () => {
    if (!destino) return;
    transferir.mutate(destino.idUsuario, {
      onSuccess: () => {
        aviso.exito('Propiedad transferida', `${destino.nombre} ${destino.apellido} es ahora propietario.`);
        setAbierto(false);
        setElegido('');
      },
      onError: (err) => aviso.error('No se pudo transferir', mensajeErrorOrganizacion(err)),
    });
  };

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir la propiedad</DialogTitle>
          <DialogDescription>
            Solo puede haber un propietario. Al confirmar, tú pasas a ser Administrador y no podrás deshacerlo: solo el
            nuevo propietario podría devolvértela.
          </DialogDescription>
        </DialogHeader>
        <div>
          <label htmlFor="transferir-destino" className="mb-1.5 block text-xs font-black uppercase tracking-widest text-tertiary">
            Nuevo propietario
          </label>
          <Select value={elegido} onValueChange={setElegido}>
            <SelectTrigger id="transferir-destino" className="w-full">
              <SelectValue placeholder="Elige a un miembro" />
            </SelectTrigger>
            <SelectContent>
              {destinos.map((m) => (
                <SelectItem key={m.idUsuario} value={String(m.idUsuario)}>
                  {m.nombre} {m.apellido} - {ROL_LABEL[m.rolOrganizacion]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={!destino || transferir.isPending} onClick={confirmar}>
            {transferir.isPending ? 'Transfiriendo...' : 'Transferir propiedad'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
