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
      className="mb-5 flex flex-col gap-3 rounded-xl border border-sky-400/40 bg-sky-400/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-sky-400/25"
    >
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 size-5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold text-on-surface">Tienes una solicitud de salida en curso</p>
          <p className="text-xs leading-relaxed text-on-surface-variant">
            {enPreparacion
              ? 'Debes cerrar tus tramos de trabajo pendientes antes de continuar.'
              : 'Tu solicitud está esperando la revisión del líder del proyecto.'}
          </p>
        </div>
      </div>
      <Button
        asChild
        size="sm"
        className="shrink-0 gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
      >
        <Link href={`/dashboard/projects/${idProyecto}/salida/preparacion`}>Ver solicitud de salida</Link>
      </Button>
    </div>
  );
}
