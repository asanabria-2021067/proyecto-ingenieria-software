'use client';

import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAlternarSeguimiento, useMisSeguimientos } from '@/hooks/use-descubrimiento';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { aviso } from '@/lib/mensajes';

/** Lee mis seguimientos y pinta `BotonSeguir` con el estado actual. */
export function SeguirOrganizacion({ id, nombre }: { id: number; nombre: string }) {
  const { data } = useMisSeguimientos();
  const siguiendo = data?.organizaciones.some((o) => o.idOrganizacion === id) ?? false;
  return <BotonSeguir tipo="organizacion" id={id} nombre={nombre} siguiendo={siguiendo} />;
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
  const alternar = useAlternarSeguimiento();
  const Icono = siguiendo ? BellOff : Bell;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={siguiendo}
      aria-label={`${siguiendo ? 'Dejar de seguir' : 'Seguir'} ${nombre}`}
      disabled={alternar.isPending}
      onClick={() =>
        alternar.mutate(
          { tipo, id, seguir: !siguiendo },
          {
            onSuccess: () =>
              aviso.exito(siguiendo ? `Dejaste de seguir a ${nombre}` : `Sigues a ${nombre}`, siguiendo ? undefined : 'Te avisaremos cuando publique un proyecto.'),
            onError: (err) => aviso.error('No se pudo actualizar el seguimiento', getApiErrorMessage(err, 'general')),
          },
        )
      }
    >
      <Icono aria-hidden="true" />
      {siguiendo ? 'Siguiendo' : 'Seguir'}
    </Button>
  );
}
