'use client';

import { useEffect, useRef } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { useClosureDocument } from '@/hooks/use-closure-document';
import uvgSwal from '@/lib/swal';
import type { TipoDocumentoCierre } from '@/lib/types/closure';

export interface ClosureDocumentViewerProps {
  projectId: number;
  documentId: number;
  nombre: string;
  tipo?: TipoDocumentoCierre | null;
  tamanoBytes?: number | null;
  fecha?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TIPO_LABEL: Record<TipoDocumentoCierre, string> = {
  INFORME_AUTOMATICO: 'Generado automáticamente',
  EVIDENCIA_LIDER: 'Evidencia del líder',
  INFORME_OFICIAL_FINAL: 'Informe oficial',
};

export function formatearTamano(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatearFecha(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * VIEW-20 (F004) — visor protegido de un PDF de cierre. Los bytes llegan del
 * backend bajo ticket de un solo uso y se muestran desde un `Blob` local en
 * un `<iframe>`; el objectURL se revoca al cerrar (cleanup del hook).
 *
 * 403 es TERMINAL: el visor se cierra con «Ya no tienes acceso a este
 * documento» y no pide otro grant (caso típico tras `LEADERSHIP_CHANGED`).
 * «Abrir en pestaña nueva» usa el MISMO objectURL; nunca una URL remota.
 * La barra de herramientas del PDF es cromo del navegador: no se implementa.
 */
export function ClosureDocumentViewer({
  projectId,
  documentId,
  nombre,
  tipo,
  tamanoBytes,
  fecha,
  open,
  onOpenChange,
}: ClosureDocumentViewerProps) {
  const { objectUrl, isLoading, isError, error } = useClosureDocument(projectId, documentId, open);
  const status = isError ? getApiErrorStatus(error) : undefined;
  const cerradoPor403 = useRef(false);

  useEffect(() => {
    if (!open) {
      cerradoPor403.current = false;
      return;
    }
    if (status === 403 && !cerradoPor403.current) {
      cerradoPor403.current = true;
      onOpenChange(false);
      void uvgSwal.fire({
        icon: 'warning',
        title: 'Ya no tienes acceso a este documento',
        text: 'Tus permisos sobre el proyecto cambiaron. Vuelve a consultar el proyecto para ver tu estado actual.',
      });
    }
  }, [open, status, onOpenChange]);

  const meta = [
    tipo ? TIPO_LABEL[tipo] : null,
    formatearTamano(tamanoBytes),
    formatearFecha(fecha),
  ].filter((v): v is string => Boolean(v));

  const abrirEnPestana = () => {
    if (!objectUrl) return;
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
  };

  const mensajeError = (() => {
    if (!isError) return null;
    if (status === 404) return 'El documento ya no está disponible.';
    if (status === 503) return 'El documento no está disponible temporalmente. Inténtalo más tarde.';
    return getApiErrorMessage(error, 'closure');
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-label={`Documento ${nombre}`}
        showCloseButton={false}
        className="flex h-[85vh] w-[min(96vw,1100px)] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[80vw]"
      >
        {/* Cabecera */}
        <div className="flex items-start gap-3 border-b border-outline-variant/40 px-5 py-4">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-error"
            aria-hidden="true"
          >
            <FileText className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base font-bold text-on-surface" title={nombre}>
              {nombre}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-tertiary">
              {meta.length > 0 ? meta.join(' · ') : 'Documento de cierre en PDF'}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={abrirEnPestana}
              disabled={!objectUrl}
              className="hidden h-9 gap-1.5 rounded-md border-outline-variant text-xs font-semibold sm:inline-flex"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Abrir en pestaña nueva
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Cerrar visor" className="rounded-md">
                <span aria-hidden="true" className="text-lg leading-none">
                  ×
                </span>
              </Button>
            </DialogClose>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="min-h-0 flex-1 bg-surface-container-low">
          {isLoading && (
            <div className="h-full p-4" aria-busy="true" aria-label="Cargando documento">
              <Skeleton className="h-full w-full rounded-lg" />
            </div>
          )}
          {!isLoading && isError && status !== 403 && (
            <div className="flex h-full items-center justify-center p-6">
              <Empty tone="danger" role="alert" className="max-w-md">
                <EmptyMedia variant="icon">
                  <FileText aria-hidden="true" className="h-7 w-7" />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle className="text-base">No se pudo mostrar el documento</EmptyTitle>
                  <EmptyDescription>{mensajeError}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )}
          {!isLoading && !isError && objectUrl && (
            <>
              <iframe src={objectUrl} title={`Vista previa de ${nombre}`} className="h-full w-full border-0" />
              <p className="sr-only">
                Si el visor embebido no es accesible, usa «Abrir en pestaña nueva» para leer el PDF con tu lector.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="border-t border-outline-variant/40 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={abrirEnPestana}
            disabled={!objectUrl}
            className="h-9 w-full gap-1.5 rounded-md border-outline-variant text-xs font-semibold sm:hidden"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            Abrir en pestaña nueva
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="h-9 w-full rounded-md border-outline-variant text-sm font-semibold sm:w-auto">
              Cerrar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
