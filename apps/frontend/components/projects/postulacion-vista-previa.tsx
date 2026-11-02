import { Clock, User } from 'lucide-react';
import { ESTADO_POSTULACION_STYLE } from '@/components/projects/application-status.utils';
import { Tag } from '@/components/ui/tag';

interface Props {
  nombre: string;
  correo: string;
  nombreRol: string;
  justificacion: string;
}

/** La postulación tal como la verá el líder del proyecto en «Postulaciones». */
export function PostulacionVistaPrevia({ nombre, correo, nombreRol, justificacion }: Props) {
  const config = ESTADO_POSTULACION_STYLE.PENDIENTE;
  return (
    <article
      aria-label="Vista previa de tu postulación"
      className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6"
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-container">
            <User className="size-4 text-tertiary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="font-headline text-base font-bold leading-tight text-on-surface">{nombre}</p>
            <p className="truncate text-xs text-tertiary">{correo}</p>
          </div>
        </div>
        <Tag tone={config.tone} className="shrink-0">
          <Clock aria-hidden="true" />
          {config.label}
        </Tag>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-tertiary">Rol solicitado</p>
        <p className="text-sm font-medium text-on-surface">{nombreRol}</p>
      </div>

      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-tertiary">Justificación</p>
        <p className="whitespace-pre-line break-words text-sm leading-relaxed text-on-surface">{justificacion}</p>
      </div>
    </article>
  );
}
