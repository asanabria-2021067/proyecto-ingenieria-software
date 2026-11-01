'use client';

import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useResponderInvitacion } from '@/hooks/use-organizations';
import { mensajeErrorOrganizacion } from '@/lib/organizations/errors';
import { getApiErrorStatus } from '@/components/projects/api-error';
import { aviso } from '@/lib/mensajes';

/** Id de la invitación que lleva una notificación `INVITACION_ORGANIZACION`; null en cualquier otro caso. */
export function idInvitacionDeNotificacion(n: {
  tipoNotificacion: string;
  datosJson?: Record<string, unknown> | null;
}): number | null {
  if (n.tipoNotificacion !== 'INVITACION_ORGANIZACION') return null;
  const id = Number(n.datosJson?.invitationId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Aceptar o rechazar sin salir de la campana. `onResuelta` también se llama si la invitación ya no existe
 * (vencida o resuelta en otro lado): la notificación deja de ofrecer botones inútiles.
 */
export function InvitacionAcciones({ idInvitacion, onResuelta }: { idInvitacion: number; onResuelta: () => void }) {
  const responder = useResponderInvitacion();

  const resolver = (aceptar: boolean) =>
    responder.mutate(
      { idInvitacion, aceptar },
      {
        onSuccess: () => {
          aviso.exito(aceptar ? 'Te uniste a la organización' : 'Invitación rechazada');
          onResuelta();
        },
        onError: (err) => {
          aviso.error('No se pudo responder la invitación', mensajeErrorOrganizacion(err));
          if ([404, 409].includes(getApiErrorStatus(err) ?? 0)) onResuelta();
        },
      },
    );

  return (
    <div className="mt-2 flex gap-2 pl-4">
      <Button type="button" size="sm" disabled={responder.isPending} onClick={() => resolver(true)}>
        <Check aria-hidden="true" />
        Aceptar
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={responder.isPending} onClick={() => resolver(false)}>
        <X aria-hidden="true" />
        Rechazar
      </Button>
    </div>
  );
}
