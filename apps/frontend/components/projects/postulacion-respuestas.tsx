import type { RespuestaPostulacion } from '@/types';

/** Respuestas del postulante a las preguntas del rol (MEJ-97); no pinta nada si no hay. */
export function PostulacionRespuestas({ respuestas }: { respuestas?: Pick<RespuestaPostulacion, 'idRespuesta' | 'enunciado' | 'respuesta'>[] }) {
  if (!respuestas?.length) return null;
  return (
    <div className="space-y-3">
      {respuestas.map((r, i) => (
        <div key={r.idRespuesta ?? i}>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-tertiary">{r.enunciado}</p>
          <p className="whitespace-pre-line break-words text-sm leading-relaxed text-on-surface">{r.respuesta}</p>
        </div>
      ))}
    </div>
  );
}
