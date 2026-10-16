'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { SafeExternalLink } from '@/components/profile/safe-external-link';
import { useLinkPreview } from '@/hooks/use-chat';
import { safeExternalHref } from '@/lib/security/safe-url';

/** Primera URL http(s) del texto, sin la puntuacion final; null si no hay o es demasiado larga. */
export function firstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  const url = match[0].replace(/[.,;:!?)\]}]+$/, '');
  return url.length <= 2048 && safeExternalHref(url) ? url : null;
}

interface LinkPreviewCardProps {
  idProyecto: number;
  idConversacion: number;
  contenido: string;
}

/** Tarjeta de vista previa de la primera URL de un mensaje. Carga solo al entrar en pantalla; falla en silencio. */
export function LinkPreviewCard({ idProyecto, idConversacion, contenido }: LinkPreviewCardProps) {
  const url = firstUrl(contenido);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  const { data } = useLinkPreview(idProyecto, idConversacion, url && visible ? url : null);

  useEffect(() => {
    if (!url || visible || !ref.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [url, visible]);

  if (!url) return null;
  const hayContenido = data && (data.titulo || data.descripcion);
  if (!hayContenido) return <div ref={ref} aria-hidden="true" />;

  return (
    <SafeExternalLink
      url={data.url}
      className="mt-2 flex max-w-full items-stretch gap-2 overflow-hidden rounded-lg border border-outline-variant bg-surface text-on-surface no-underline transition-colors hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:bg-surface-container-low"
    >
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-2 py-1.5">
        {data.sitio && <span className="truncate text-[10px] uppercase tracking-wide text-tertiary">{data.sitio}</span>}
        {data.titulo && <span className="line-clamp-2 break-words text-xs font-semibold">{data.titulo}</span>}
        {data.descripcion && <span className="line-clamp-2 break-words text-[11px] text-tertiary">{data.descripcion}</span>}
        <span className="sr-only">Abre en una pestaña nueva</span>
      </span>
      <ExternalLink aria-hidden="true" className="mr-2 size-3 shrink-0 self-center text-tertiary" />
    </SafeExternalLink>
  );
}
