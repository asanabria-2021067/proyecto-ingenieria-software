'use client';

import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMisInvitacionesRol, useResponderInvitacionRol } from '@/hooks/use-descubrimiento';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { aviso } from '@/lib/mensajes';

/** MEJ-22: invitaciones directas a un rol dirigidas a mí, con aceptar y rechazar. No pinta nada si no hay. */
export function MisInvitacionesRol() {
  const { data: invitaciones = [] } = useMisInvitacionesRol();
  const responder = useResponderInvitacionRol();

  if (invitaciones.length === 0) return null;

  const resolver = (id: number, aceptar: boolean, rol: string) =>
    responder.mutate(
      { id, aceptar },
      {
        onSuccess: () => aviso.exito(aceptar ? `Ahora participas como ${rol}` : 'Invitación rechazada'),
        onError: (err) => {
          const status = getApiErrorStatus(err);
          const texto = (status === 409 || status === 403) && err instanceof Error && err.message ? err.message : getApiErrorMessage(err, 'general');
          aviso.error('No se pudo responder la invitación', texto);
        },
      },
    );

  return (
    <section aria-labelledby="invitaciones-rol-titulo" className="card-base mb-6">
      <h2 id="invitaciones-rol-titulo" className="type-subtitle mb-3">
        Te invitaron a un rol ({invitaciones.length})
      </h2>
      <ul className="divide-y divide-outline-variant/40">
        {invitaciones.map((inv) => {
          const { rolProyecto: rol } = inv;
          return (
            <li key={inv.idInvitacionRol} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-on-surface">
                  {rol.nombreRol} en{' '}
                  <Link href={`/dashboard/proyectos/${rol.proyecto.idProyecto}`} className="text-primary hover:underline">
                    {rol.proyecto.tituloProyecto}
                  </Link>
                </p>
                <p className="text-xs text-on-surface-variant">
                  {inv.invitadoPor.nombre} {inv.invitadoPor.apellido} te invita.
                  {inv.mensaje ? ` «${inv.mensaje}»` : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" size="sm" disabled={responder.isPending} onClick={() => resolver(inv.idInvitacionRol, true, rol.nombreRol)}>
                  <Check aria-hidden="true" />
                  Aceptar
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={responder.isPending} onClick={() => resolver(inv.idInvitacionRol, false, rol.nombreRol)}>
                  <X aria-hidden="true" />
                  Rechazar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
