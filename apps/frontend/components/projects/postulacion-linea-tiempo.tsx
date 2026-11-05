import { EVENTO_POSTULACION_LABEL } from '@/components/projects/application-status.utils';
import type { EventoPostulacion } from '@/types';

function formatearFechaHora(iso: string): string {
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guatemala' }).format(new Date(iso));
}

/** MEJ-100: pasos de la postulación (enviada, vista, en revisión, resolución) con su fecha. */
export function PostulacionLineaTiempo({ eventos }: { eventos?: EventoPostulacion[] }) {
  if (!eventos?.length) return null;
  return (
    <ol aria-label="Línea de tiempo de la postulación" className="mb-3 space-y-2 border-l border-outline-variant pl-4">
      {eventos.map((e) => (
        <li key={e.tipo} className="relative text-sm">
          <span aria-hidden="true" className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-primary" />
          <span className="font-semibold text-on-surface">{EVENTO_POSTULACION_LABEL[e.tipo] ?? e.tipo}</span>
          <time dateTime={e.fecha} className="block text-xs text-tertiary">
            {formatearFechaHora(e.fecha)}
          </time>
        </li>
      ))}
    </ol>
  );
}
