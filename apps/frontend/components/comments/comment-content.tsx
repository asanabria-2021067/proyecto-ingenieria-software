import Link from 'next/link';
import { segmentarComentario } from '@/lib/mentions/mention-tokens';
import type { MencionComentario } from '@/lib/services/comments';
import { cn } from '@/lib/utils';

interface CommentContentProps {
  contenido: string;
  /** Menciones validadas por el backend; solo ellas se pintan como enlace. */
  menciones?: MencionComentario[];
  currentUserId?: number | null;
  className?: string;
}

/**
 * HU-200 (T-378): texto de un comentario con las menciones resaltadas y
 * enlazadas al perfil del integrante. El nombre mostrado es el VIGENTE (sale
 * de `menciones`), no la etiqueta guardada en el token. Todo se renderiza como
 * texto de React: nunca HTML crudo.
 */
export function CommentContent({ contenido, menciones = [], currentUserId, className }: CommentContentProps) {
  const porId = new Map(menciones.map((m) => [m.usuario.idUsuario, m.usuario]));

  return (
    <p className={cn('whitespace-pre-wrap break-words text-sm text-on-surface-variant', className)}>
      {segmentarComentario(contenido).map((segmento, i) => {
        if (segmento.tipo === 'texto') return <span key={i}>{segmento.texto}</span>;

        const usuario = porId.get(segmento.idUsuario);
        // Un token sin mención validada (no debería ocurrir: el backend lo
        // degrada al guardar) se muestra como texto, sin enlace.
        if (!usuario) return <span key={i}>@{segmento.etiqueta}</span>;

        const nombre = `${usuario.nombre} ${usuario.apellido}`;
        const esYo = currentUserId === usuario.idUsuario;
        return (
          <Link
            key={i}
            href={`/dashboard/personas/${usuario.idUsuario}`}
            data-mention-id={usuario.idUsuario}
            aria-label={esYo ? `Mención a ti (${nombre}), ver perfil` : `Mención a ${nombre}, ver perfil`}
            className={cn(
              'rounded-md px-1 py-px font-semibold no-underline transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              esYo
                ? 'bg-primary text-on-primary hover:bg-primary/90'
                : 'bg-primary/10 text-primary hover:bg-primary/20',
            )}
          >
            @{nombre}
          </Link>
        );
      })}
    </p>
  );
}
