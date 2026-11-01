'use client';

import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OrgAvatar } from '@/components/organizations/org-avatar';
import { useMisInvitacionesOrg, useResponderInvitacion } from '@/hooks/use-organizations';
import { mensajeErrorOrganizacion } from '@/lib/organizations/errors';
import { aviso } from '@/lib/mensajes';
import { ROL_LABEL } from '@/lib/organizations/roles';

function diasRestantes(venceEn: string): number {
  return Math.max(0, Math.ceil((new Date(venceEn).getTime() - Date.now()) / 86_400_000));
}

/** Invitaciones vigentes dirigidas a mí, con aceptar y rechazar. No pinta nada si no hay. */
export function MisInvitaciones() {
  const { data: invitaciones = [] } = useMisInvitacionesOrg();
  const responder = useResponderInvitacion();

  if (invitaciones.length === 0) return null;

  const resolver = (idInvitacion: number, aceptar: boolean, nombre: string) =>
    responder.mutate(
      { idInvitacion, aceptar },
      {
        onSuccess: () => aviso.exito(aceptar ? `Ahora eres miembro de ${nombre}` : 'Invitación rechazada'),
        onError: (err) => aviso.error('No se pudo responder la invitación', mensajeErrorOrganizacion(err)),
      },
    );

  return (
    <section aria-labelledby="invitaciones-titulo" className="card-base mb-6">
      <h2 id="invitaciones-titulo" className="type-subtitle mb-3">
        Invitaciones pendientes ({invitaciones.length})
      </h2>
      <ul className="divide-y divide-outline-variant/40">
        {invitaciones.map((inv) => {
          const nombre = inv.organizacion.nombreOrganizacion;
          const dias = diasRestantes(inv.venceEn);
          return (
            <li key={inv.idInvitacion} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <OrgAvatar nombre={nombre} logoUrl={inv.organizacion.logoUrl} className="size-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-on-surface">{nombre}</p>
                <p className="text-xs text-on-surface-variant">
                  {inv.invitadoPor.nombre} {inv.invitadoPor.apellido} te invita como {ROL_LABEL[inv.rolOrganizacion]} -{' '}
                  {dias === 1 ? 'vence en 1 día' : `vence en ${dias} días`}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={responder.isPending}
                  onClick={() => resolver(inv.idInvitacion, true, nombre)}
                >
                  <Check aria-hidden="true" />
                  Aceptar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={responder.isPending}
                  onClick={() => resolver(inv.idInvitacion, false, nombre)}
                >
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
