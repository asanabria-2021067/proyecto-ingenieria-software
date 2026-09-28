'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PROJECT_ACTION_BUTTON_CLASS } from '@/components/projects/project-action-button';

/**
 * F13.1 — entry point de navegación desde Miembros hacia la vista dedicada.
 * El listado y su contador viven en `/miembros/postulaciones`; aquí solo queda
 * el acceso, con el mismo botón de acción que «Ver proyecto».
 */
export function PendingPostulationsCard({ idProyecto }: { idProyecto: number }) {
  return (
    <Button asChild className={PROJECT_ACTION_BUTTON_CLASS}>
      <Link
        href={`/dashboard/proyectos/${idProyecto}/miembros/postulaciones`}
        aria-label="Ver postulaciones pendientes"
      >
        Postulaciones pendientes
        {/* Flecha: lleva a otra vista, no ejecuta una acción aquí. */}
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </Button>
  );
}
