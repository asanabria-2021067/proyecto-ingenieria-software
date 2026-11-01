'use client';

import { Check, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getIniciales } from '@/components/projects/available-project-card';
import {
  useCancelarInvitacion,
  useInvitacionesOrg,
  useResolverSolicitud,
  useSolicitudesOrg,
} from '@/hooks/use-organizations';
import { mensajeErrorOrganizacion } from '@/lib/organizations/errors';
import { ROL_LABEL } from '@/lib/organizations/roles';
import { aviso } from '@/lib/mensajes';
import type { UsuarioOrganizacion } from '@/lib/types/organizations';

function Persona({ usuario, detalle }: { usuario: UsuarioOrganizacion; detalle: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Avatar className="size-10">
        {usuario.fotoUrl && <AvatarImage src={usuario.fotoUrl} alt="" />}
        <AvatarFallback className="text-xs font-bold">{getIniciales(usuario.nombre, usuario.apellido)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-on-surface">
          {usuario.nombre} {usuario.apellido}
        </p>
        <p className="text-xs text-on-surface-variant">{detalle}</p>
      </div>
    </div>
  );
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' });

/** Solicitudes de unirse (aceptar entra como Lectura) e invitaciones enviadas aún vigentes. */
export function OrgPendientes({ idOrganizacion, archivada }: { idOrganizacion: number; archivada: boolean }) {
  const { data: solicitudes = [] } = useSolicitudesOrg(idOrganizacion);
  const { data: invitaciones = [] } = useInvitacionesOrg(idOrganizacion);
  const resolver = useResolverSolicitud(idOrganizacion);
  const cancelar = useCancelarInvitacion(idOrganizacion);

  const resolverSolicitud = (idSolicitud: number, aceptar: boolean) =>
    resolver.mutate(
      { idSolicitud, aceptar },
      {
        onSuccess: () => aviso.exito(aceptar ? 'Solicitud aceptada' : 'Solicitud rechazada'),
        onError: (err) => aviso.error('No se pudo resolver la solicitud', mensajeErrorOrganizacion(err)),
      },
    );

  return (
    <div className="space-y-8">
      <section aria-labelledby="solicitudes-titulo">
        <h3 id="solicitudes-titulo" className="type-subtitle mb-3">
          Solicitudes para unirse ({solicitudes.length})
        </h3>
        {solicitudes.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No hay solicitudes pendientes.</p>
        ) : (
          <ul className="divide-y divide-outline-variant/40">
            {solicitudes.map((s) => (
              <li key={s.idSolicitud} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Persona usuario={s.usuario} detalle={`Solicitó el ${fecha(s.creadaEn)}; entraría como Lectura`} />
                {!archivada && (
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" size="sm" disabled={resolver.isPending} onClick={() => resolverSolicitud(s.idSolicitud, true)}>
                      <Check aria-hidden="true" />
                      Aceptar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={resolver.isPending}
                      onClick={() => resolverSolicitud(s.idSolicitud, false)}
                    >
                      <X aria-hidden="true" />
                      Rechazar
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="invitaciones-enviadas-titulo">
        <h3 id="invitaciones-enviadas-titulo" className="type-subtitle mb-3">
          Invitaciones enviadas ({invitaciones.length})
        </h3>
        {invitaciones.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No hay invitaciones pendientes.</p>
        ) : (
          <ul className="divide-y divide-outline-variant/40">
            {invitaciones.map((inv) => (
              <li key={inv.idInvitacion} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Persona
                  usuario={inv.invitado}
                  detalle={`Como ${ROL_LABEL[inv.rolOrganizacion]}; vence el ${fecha(inv.venceEn)}`}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={cancelar.isPending}
                  onClick={() =>
                    cancelar.mutate(inv.idInvitacion, {
                      onSuccess: () => aviso.exito('Invitación cancelada'),
                      onError: (err) => aviso.error('No se pudo cancelar', mensajeErrorOrganizacion(err)),
                    })
                  }
                >
                  Cancelar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
