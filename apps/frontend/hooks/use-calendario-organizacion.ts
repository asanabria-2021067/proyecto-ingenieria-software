'use client';

import { useQuery } from '@tanstack/react-query';
import { getEventosOrganizacion } from '@/lib/services/calendario-ics';

/** MEJ-34: eventos del mes (`desde`/`hasta` en hora local) de los proyectos de la organización. */
export function useCalendarioOrganizacion(id: number, desde: Date, hasta: Date) {
  return useQuery({
    queryKey: ['organizaciones', id, 'calendario', desde.toISOString(), hasta.toISOString()],
    queryFn: () => getEventosOrganizacion(id, desde, hasta),
  });
}
