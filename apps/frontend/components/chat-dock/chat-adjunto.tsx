'use client';

import { useState } from 'react';
import { Download, FileImage, FileSpreadsheet, FileText, Loader2, Presentation } from 'lucide-react';
import { toast } from 'sonner';
import { useAttachmentThumbnail } from '@/hooks/use-chat';
import { categoriaAdjunto, formatearTamano, type CategoriaAdjunto } from '@/lib/chat-adjuntos';
import { getAttachmentUrl } from '@/lib/services/chat';
import type { ChatAdjunto } from '@/lib/types/chat';

const ETIQUETA: Record<CategoriaAdjunto, string> = {
  imagen: 'Imagen',
  pdf: 'PDF',
  word: 'Word',
  excel: 'Excel',
  powerpoint: 'PowerPoint',
};

const ICONO = {
  imagen: FileImage,
  pdf: FileText,
  word: FileText,
  excel: FileSpreadsheet,
  powerpoint: Presentation,
} satisfies Record<CategoriaAdjunto, unknown>;

export function AdjuntoIcono({ mime, className }: { mime: string; className?: string }) {
  const Icono = ICONO[categoriaAdjunto(mime)];
  return <Icono className={className ?? 'size-5'} aria-hidden="true" />;
}

export function etiquetaAdjunto(mime: string): string {
  return ETIQUETA[categoriaAdjunto(mime)];
}

/** Pide la URL firmada (vive ~60 s) justo al hacer clic y dispara la descarga. */
export async function descargarAdjunto(idProyecto: number, idConversacion: number, adjunto: ChatAdjunto) {
  try {
    const { url } = await getAttachmentUrl(idProyecto, idConversacion, adjunto.idAdjunto);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = adjunto.nombreOriginal;
    enlace.rel = 'noopener noreferrer';
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
  } catch {
    toast.error('No se pudo descargar el archivo. Intenta de nuevo.');
  }
}

interface ChatAdjuntoChipProps {
  adjunto: ChatAdjunto;
  idProyecto: number;
  idConversacion: number;
}

export function ChatAdjuntoChip({ adjunto, idProyecto, idConversacion }: ChatAdjuntoChipProps) {
  const [descargando, setDescargando] = useState(false);
  const esImagen = categoriaAdjunto(adjunto.mime) === 'imagen';
  const miniatura = useAttachmentThumbnail(idProyecto, idConversacion, adjunto.idAdjunto, esImagen);

  const descargar = async () => {
    setDescargando(true);
    await descargarAdjunto(idProyecto, idConversacion, adjunto);
    setDescargando(false);
  };

  return (
    <div className="space-y-1.5">
      {esImagen && miniatura.data && (
        // eslint-disable-next-line @next/next/no-img-element -- data: local
        <img src={miniatura.data} alt={adjunto.nombreOriginal} loading="lazy" className="max-h-44 max-w-full rounded-lg object-cover" />
      )}
      <div className="flex items-center gap-2 rounded-lg bg-surface-container-lowest p-2 text-on-surface">
        <AdjuntoIcono mime={adjunto.mime} className="size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold" title={adjunto.nombreOriginal}>{adjunto.nombreOriginal}</p>
          <p className="text-[11px] text-tertiary">
            {etiquetaAdjunto(adjunto.mime)} · {formatearTamano(adjunto.tamanoBytes)}
          </p>
        </div>
        <button
          type="button"
          onClick={descargar}
          disabled={descargando}
          aria-label={`Descargar ${adjunto.nombreOriginal}`}
          className="rounded-md p-1.5 text-text-secondary hover:bg-on-surface/10 hover:text-text-primary disabled:opacity-50"
        >
          {descargando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
