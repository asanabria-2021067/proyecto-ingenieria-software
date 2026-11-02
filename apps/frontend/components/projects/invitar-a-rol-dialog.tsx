'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useInvitarARol } from '@/hooks/use-descubrimiento';
import { getMyProjects, getProjectById } from '@/lib/services/projects';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { aviso } from '@/lib/mensajes';

const ABIERTOS = ['PUBLICADO', 'EN_PROGRESO'];
const MAX_MENSAJE = 500;

/**
 * MEJ-22: el líder invita directo a una persona a un rol de uno de sus proyectos abiertos (desde
 * su perfil o desde Personas). Solo muestra proyectos propios publicados o en progreso y roles
 * con cupo; las reglas finales (cupo, duplicados, cuenta activa) las valida el servidor.
 */
export function InvitarARolDialog({ idUsuario, nombre }: { idUsuario: number; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  const [idProyecto, setIdProyecto] = useState('');
  const [idRol, setIdRol] = useState('');
  const [mensaje, setMensaje] = useState('');
  const invitar = useInvitarARol();

  const { data: proyectos = [], isLoading } = useQuery({ queryKey: ['mis-proyectos'], queryFn: getMyProjects, enabled: abierto });
  const abiertos = proyectos.filter((p) => ABIERTOS.includes(p.estadoProyecto));
  const { data: detalle, isLoading: cargandoRoles } = useQuery({
    queryKey: ['proyecto-detalle-invitar', idProyecto],
    queryFn: () => getProjectById(Number(idProyecto)),
    enabled: abierto && idProyecto !== '',
  });
  const roles = detalle?.roles ?? [];

  const cerrar = (valor: boolean) => {
    setAbierto(valor);
    if (!valor) {
      setIdProyecto('');
      setIdRol('');
      setMensaje('');
    }
  };

  const enviar = () =>
    invitar.mutate(
      { idRolProyecto: Number(idRol), idUsuario, mensaje: mensaje.trim() || undefined },
      {
        onSuccess: () => {
          aviso.exito('Invitación enviada', `${nombre} la verá en sus notificaciones y en Mis postulaciones.`);
          cerrar(false);
        },
        onError: (err) => {
          const status = getApiErrorStatus(err);
          const texto = (status === 400 || status === 403 || status === 409) && err instanceof Error && err.message ? err.message : getApiErrorMessage(err, 'general');
          aviso.error('No se pudo invitar', texto);
        },
      },
    );

  return (
    <Dialog open={abierto} onOpenChange={cerrar}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <UserPlus aria-hidden="true" />
          Invitar a un rol
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar a {nombre}</DialogTitle>
          <DialogDescription>Elige el proyecto y el rol. La persona puede aceptar o rechazar.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : abiertos.length === 0 ? (
          <div className="space-y-3 text-sm text-on-surface-variant">
            <p>No tienes proyectos publicados o en progreso donde invitar.</p>
            <Button asChild size="sm">
              <Link href="/dashboard/projects/mine/form">Crear un proyecto</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Select
              value={idProyecto}
              onValueChange={(v) => {
                setIdProyecto(v);
                setIdRol('');
              }}
            >
              <SelectTrigger aria-label="Proyecto">
                <SelectValue placeholder="Elige un proyecto" />
              </SelectTrigger>
              <SelectContent>
                {abiertos.map((p) => (
                  <SelectItem key={p.idProyecto} value={String(p.idProyecto)}>
                    {p.tituloProyecto}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {idProyecto !== '' &&
              (cargandoRoles ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={idRol} onValueChange={setIdRol}>
                  <SelectTrigger aria-label="Rol">
                    <SelectValue placeholder={roles.length ? 'Elige un rol' : 'Este proyecto no tiene roles'} />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.idRolProyecto} value={String(r.idRolProyecto)}>
                        {r.nombreRol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}

            <div>
              <Textarea
                aria-label="Mensaje (opcional)"
                placeholder="Mensaje (opcional)"
                maxLength={MAX_MENSAJE}
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
              />
              <p className="mt-1 text-right text-xs text-on-surface-variant">
                {mensaje.length}/{MAX_MENSAJE}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => cerrar(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={idRol === '' || invitar.isPending} onClick={enviar}>
            Enviar invitación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
