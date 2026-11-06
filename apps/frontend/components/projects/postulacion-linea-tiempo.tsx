import { EVENTO_POSTULACION_LABEL } from '@/components/projects/application-status.utils';
import type { EventoPostulacion } from '@/types';

/** Único formateador de fechas de la pantalla: es-GT y zona de Guatemala, para que pie y línea de tiempo coincidan. */
export function formatearFechaPostulacion(iso: string, conHora = false): string {
  return new Intl.DateTimeFormat('es-GT', conHora
    ? { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guatemala' }
    : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Guatemala' }).format(new Date(iso));
}

const EVENTOS_RESOLUCION = ['ACEPTADA', 'RECHAZADA', 'RETIRADA'];

/** Fechas del pie de la tarjeta, leídas de la línea de tiempo; `fechaPostulacion` solo si falta el evento ENVIADA. */
export function fechasPostulacion(p: { fechaPostulacion: string; eventos?: EventoPostulacion[] }) {
  return {
    enviada: p.eventos?.find((e) => e.tipo === 'ENVIADA')?.fecha ?? p.fechaPostulacion,
    resuelta: p.eventos?.find((e) => EVENTOS_RESOLUCION.includes(e.tipo))?.fecha,
  };
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
            {formatearFechaPostulacion(e.fecha, true)}
          </time>
        </li>
      ))}
    </ol>
  );
}
