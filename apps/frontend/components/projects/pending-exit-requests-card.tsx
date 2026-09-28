'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PROJECT_ACTION_BUTTON_CLASS } from '@/components/projects/project-action-button';

/**
 * F14.2 — entry point de navegación desde Miembros hacia la vista dedicada de
 * solicitudes de salida, mismo patrón que `PendingPostulationsCard` (F13.1).
 * El listado y su contador viven en `/miembros/solicitudes-salida`.
 */
export function PendingExitRequestsCard({ idProyecto }: { idProyecto: number }) {
  return (
    <Button asChild className={PROJECT_ACTION_BUTTON_CLASS}>
      <Link
        href={`/dashboard/proyectos/${idProyecto}/miembros/solicitudes-salida`}
        aria-label="Ver solicitudes de salida pendientes"
      >
        Solicitudes de salida
      </Link>
    </Button>
  );
}
