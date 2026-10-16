'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConversationFiles } from '@/hooks/use-chat';
import { formatearTamano } from '@/lib/chat-adjuntos';
import type { ChatArchivo } from '@/lib/types/chat';
import { AdjuntoIcono, descargarAdjunto, etiquetaAdjunto } from './chat-adjunto';

interface ChatFilesListProps {
  idProyecto: number;
  idConversacion: number;
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' });
}

function FilaArchivo({ archivo, idProyecto, idConversacion }: { archivo: ChatArchivo } & ChatFilesListProps) {
  const [descargando, setDescargando] = useState(false);
  const descargar = async () => {
    setDescargando(true);
    await descargarAdjunto(idProyecto, idConversacion, archivo);
    setDescargando(false);
  };
  return (
    <li className="flex items-center gap-2 rounded-lg border border-outline-variant p-2 text-sm">
      <AdjuntoIcono mime={archivo.mime} className="size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold" title={archivo.nombreOriginal}>{archivo.nombreOriginal}</p>
        <p className="text-xs text-tertiary">
          {etiquetaAdjunto(archivo.mime)} · {formatearTamano(archivo.tamanoBytes)} · {archivo.remitente.nombre} {archivo.remitente.apellido} · {formatFecha(archivo.creadoEn)}
        </p>
      </div>
      <button
        type="button"
        onClick={descargar}
        disabled={descargando}
        aria-label={`Descargar ${archivo.nombreOriginal}`}
        className="rounded-control p-1.5 text-text-secondary hover:bg-on-surface/10 hover:text-text-primary disabled:opacity-50"
      >
        {descargando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
      </button>
    </li>
  );
}

export function ChatFilesList({ idProyecto, idConversacion }: ChatFilesListProps) {
  const { archivos, hasMore, isLoading, isError, cargarMas, cargandoMas } = useConversationFiles(idProyecto, idConversacion, true);

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-tertiary" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Cargando archivos…
      </p>
    );
  }
  if (isError) {
    return <p role="alert" className="text-sm text-error">No se pudieron cargar los archivos. Intenta de nuevo.</p>;
  }
  if (archivos.length === 0) {
    return <p className="text-sm text-tertiary">Todavía no se han compartido archivos en esta conversación.</p>;
  }
  return (
    <>
      <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
        {archivos.map((a) => (
          <FilaArchivo key={a.idAdjunto} archivo={a} idProyecto={idProyecto} idConversacion={idConversacion} />
        ))}
      </ul>
      {hasMore && (
        <Button type="button" variant="outline" size="sm" onClick={cargarMas} disabled={cargandoMas} className="self-center">
          {cargandoMas ? 'Cargando…' : 'Cargar más'}
        </Button>
      )}
    </>
  );
}
