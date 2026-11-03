'use client';

import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useAlternarSeguimiento, useMisSeguimientos } from '@/hooks/use-descubrimiento';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { aviso } from '@/lib/mensajes';

function useSiguiendoOrg(id: number) {
  const { data } = useMisSeguimientos();
  return data?.organizaciones.some((o) => o.idOrganizacion === id) ?? false;
}

function useAlternarSeguir(tipo: 'organizacion' | 'asociacion', id: number, nombre: string, siguiendo: boolean) {
  const mutacion = useAlternarSeguimiento();
  const alternar = () =>
    mutacion.mutate(
      { tipo, id, seguir: !siguiendo },
      {
        onSuccess: () =>
          aviso.exito(siguiendo ? `Dejaste de seguir a ${nombre}` : `Sigues a ${nombre}`, siguiendo ? undefined : 'Te avisaremos cuando publique un proyecto.'),
        onError: (err) => aviso.error('No se pudo actualizar el seguimiento', getApiErrorMessage(err, 'general')),
      },
    );
  return { alternar, pendiente: mutacion.isPending };
}

/** Lee mis seguimientos y pinta `BotonSeguir` con el estado actual. */
export function SeguirOrganizacion({ id, nombre }: { id: number; nombre: string }) {
  return <BotonSeguir tipo="organizacion" id={id} nombre={nombre} siguiendo={useSiguiendoOrg(id)} />;
}

/** Estado y acción de seguir. Va en la página (siempre montada): en un menú, el ítem se desmonta al elegirlo y los avisos se perderían. */
export function useSeguirOrganizacion(id: number, nombre: string) {
  const siguiendo = useSiguiendoOrg(id);
  return { siguiendo, ...useAlternarSeguir('organizacion', id, nombre, siguiendo) };
}

/** Misma acción que `SeguirOrganizacion`, como ítem de un menú desplegable. */
export function SeguirOrganizacionItem({
  nombre,
  siguiendo,
  pendiente,
  alternar,
}: {
  nombre: string;
  siguiendo: boolean;
  pendiente: boolean;
  alternar: () => void;
}) {
  const Icono = siguiendo ? BellOff : Bell;
  return (
    <DropdownMenuItem disabled={pendiente} aria-label={`${siguiendo ? 'Dejar de seguir' : 'Seguir'} ${nombre}`} onSelect={alternar}>
      <Icono className="size-4" aria-hidden="true" />
      {siguiendo ? 'Siguiendo' : 'Seguir'}
    </DropdownMenuItem>
  );
}

/** MEJ-18: seguir / dejar de seguir una organización o asociación para enterarte de sus proyectos nuevos. */
export function BotonSeguir({
  tipo,
  id,
  nombre,
  siguiendo,
}: {
  tipo: 'organizacion' | 'asociacion';
  id: number;
  nombre: string;
  siguiendo: boolean;
}) {
  const { alternar, pendiente } = useAlternarSeguir(tipo, id, nombre, siguiendo);
  const Icono = siguiendo ? BellOff : Bell;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={siguiendo}
      aria-label={`${siguiendo ? 'Dejar de seguir' : 'Seguir'} ${nombre}`}
      disabled={pendiente}
      onClick={alternar}
    >
      <Icono aria-hidden="true" />
      {siguiendo ? 'Siguiendo' : 'Seguir'}
    </Button>
  );
}
