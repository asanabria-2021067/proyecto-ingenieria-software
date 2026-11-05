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

/** Tarjeta de vista previa ya resuelta (sitio, título, descripción); la usan el chat y los enlaces de una tarea. */
export function LinkPreviewView({
  url,
  sitio,
  titulo,
  descripcion,
  icono,
}: {
  url: string;
  sitio?: string | null;
  titulo?: string | null;
  descripcion?: string | null;
  /** Icono propio del tipo de enlace; por defecto el de enlace externo. */
  icono?: React.ReactNode;
}) {
  return (
    <SafeExternalLink
      url={url}
      className="mt-2 flex max-w-full items-stretch gap-2 overflow-hidden rounded-lg border border-outline-variant bg-surface text-on-surface no-underline transition-colors hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:bg-surface-container-low"
    >
      {icono && <span className="ml-2 flex shrink-0 items-center text-primary">{icono}</span>}
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-2 py-1.5">
        {sitio && <span className="truncate text-[10px] uppercase tracking-wide text-tertiary">{sitio}</span>}
        {titulo && <span className="line-clamp-2 break-words text-xs font-semibold">{titulo}</span>}
        {descripcion && <span className="line-clamp-2 break-words text-[11px] text-tertiary">{descripcion}</span>}
        <span className="sr-only">Abre en una pestaña nueva</span>
      </span>
      <ExternalLink aria-hidden="true" className="mr-2 size-3 shrink-0 self-center text-tertiary" />
    </SafeExternalLink>
  );
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

  return <LinkPreviewView url={data.url} sitio={data.sitio} titulo={data.titulo} descripcion={data.descripcion} />;
}
