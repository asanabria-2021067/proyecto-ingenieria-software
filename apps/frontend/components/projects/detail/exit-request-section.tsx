import Link from 'next/link';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SolicitudSalidaAbiertaDto } from '@/lib/types/exit-requests';

interface ExitRequestSectionProps {
  idProyecto: number;
  solicitud: SolicitudSalidaAbiertaDto;
}

/**
 * Banner de acceso a la preparación de salida (F9): único punto de entrada en
 * la UI hacia `/salida/preparacion`, visible solo para el usuario dueño de la
 * solicitud abierta (PREPARACION/PENDIENTE_LIDER) en este proyecto.
 */
export function ExitRequestSection({ idProyecto, solicitud }: ExitRequestSectionProps) {
  const enPreparacion = solicitud.estadoSolicitud === 'PREPARACION';

  return (
    <div
      role="status"
      className="flex flex-col gap-inline rounded-card border border-primary/30 bg-primary/5 px-card py-stack sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-inline">
        <Clock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="type-body font-bold">Tienes una solicitud de salida en curso</p>
          <p className="type-meta">
            {enPreparacion
              ? 'Debes cerrar tus tramos de trabajo pendientes antes de continuar.'
              : 'Tu solicitud está esperando la revisión del líder del proyecto.'}
          </p>
        </div>
      </div>
      <Button
        asChild
        size="sm"
        // `type-meta` y no `text-*`: tailwind-merge descarta el tamaño cuando va
        // junto a `text-on-primary`, y el botón heredaba 16 px.
        className="h-9 shrink-0 gap-micro rounded-md bg-primary px-4 type-meta font-semibold text-on-primary hover:bg-primary/90"
      >
        <Link href={`/dashboard/projects/${idProyecto}/salida/preparacion`}>Ver solicitud de salida</Link>
      </Button>
    </div>
  );
}
