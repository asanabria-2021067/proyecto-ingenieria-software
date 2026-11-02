'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getIniciales } from '@/components/projects/available-project-card';
import { useCandidatosOrg, useInvitarMiembro } from '@/hooks/use-organizations';
import { mensajeErrorOrganizacion } from '@/lib/organizations/errors';
import { ROL_DESCRIPCION, ROL_LABEL, rolesQueSePuedenAsignar } from '@/lib/organizations/roles';
import { aviso } from '@/lib/mensajes';
import type { RolOrganizacion, UsuarioOrganizacion } from '@/lib/types/organizations';

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Invita por nombre (candidatos activos) o por correo, con el rol elegido. Lo abre un botón o el menú «Más» de la página. */
export function InvitarDialog({
  idOrganizacion,
  miRol,
  abierto,
  onAbiertoChange,
}: {
  idOrganizacion: number;
  miRol: RolOrganizacion | null;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
}) {
  const asignables = rolesQueSePuedenAsignar(miRol);
  const [consulta, setConsulta] = useState('');
  const [elegido, setElegido] = useState<UsuarioOrganizacion | null>(null);
  const [rol, setRol] = useState<RolOrganizacion>('LECTURA');
  const invitar = useInvitarMiembro(idOrganizacion);
  const { data: candidatos = [], isFetching } = useCandidatosOrg(idOrganizacion, elegido ? '' : consulta);

  const correo = consulta.trim().toLowerCase();
  const porCorreo = !elegido && CORREO.test(correo);
  const puedeEnviar = (elegido !== null || porCorreo) && !invitar.isPending;

  const cerrar = (valor: boolean) => {
    onAbiertoChange(valor);
    if (!valor) {
      setConsulta('');
      setElegido(null);
      setRol('LECTURA');
    }
  };

  const enviar = () =>
    invitar.mutate(
      elegido ? { idUsuario: elegido.idUsuario, rolOrganizacion: rol } : { correo, rolOrganizacion: rol },
      {
        onSuccess: () => {
          aviso.exito('Invitación enviada', 'Vence en 14 días.');
          cerrar(false);
        },
        onError: (err) => aviso.error('No se pudo invitar', mensajeErrorOrganizacion(err)),
      },
    );

  return (
    <Dialog open={abierto} onOpenChange={cerrar}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar a la organización</DialogTitle>
          <DialogDescription>Busca por nombre o escribe un correo. Solo se invita a usuarios activos.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="invitar-busqueda" className="mb-1.5 block text-xs font-black uppercase tracking-widest text-tertiary">
              Nombre o correo
            </label>
            {elegido ? (
              <div className="flex items-center gap-3 rounded-xl border border-primary bg-primary/5 p-2">
                <Avatar className="size-8">
                  {elegido.fotoUrl && <AvatarImage src={elegido.fotoUrl} alt="" />}
                  <AvatarFallback className="text-xs">{getIniciales(elegido.nombre, elegido.apellido)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {elegido.nombre} {elegido.apellido}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setElegido(null)}>
                  Cambiar
                </Button>
              </div>
            ) : (
              <input
                id="invitar-busqueda"
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                autoComplete="off"
                placeholder="Ana Pérez o ana@uvg.edu.gt"
                className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            )}
            {!elegido && candidatos.length > 0 && (
              <ul className="mt-2 max-h-48 divide-y divide-outline-variant/40 overflow-y-auto rounded-xl border border-outline-variant/40" aria-label="Resultados">
                {candidatos.map((c) => (
                  <li key={c.idUsuario}>
                    <button
                      type="button"
                      onClick={() => setElegido(c)}
                      className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-muted"
                    >
                      <Avatar className="size-8">
                        {c.fotoUrl && <AvatarImage src={c.fotoUrl} alt="" />}
                        <AvatarFallback className="text-xs">{getIniciales(c.nombre, c.apellido)}</AvatarFallback>
                      </Avatar>
                      <span className="truncate text-sm">
                        {c.nombre} {c.apellido}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!elegido && !isFetching && consulta.replace(/\s+/g, '').length >= 3 && candidatos.length === 0 && !porCorreo && (
              <p className="mt-2 text-xs text-on-surface-variant">Sin resultados. Escribe el correo completo para invitar directamente.</p>
            )}
          </div>

          <div>
            <label htmlFor="invitar-rol" className="mb-1.5 block text-xs font-black uppercase tracking-widest text-tertiary">
              Rol
            </label>
            <Select value={rol} onValueChange={(v) => setRol(v as RolOrganizacion)}>
              <SelectTrigger id="invitar-rol" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {asignables.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROL_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-on-surface-variant">{ROL_DESCRIPCION[rol]}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => cerrar(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!puedeEnviar} onClick={enviar}>
            {invitar.isPending ? 'Enviando...' : 'Enviar invitación'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
