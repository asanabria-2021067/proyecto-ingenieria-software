'use client';

import { useId, useRef, useState } from 'react';
import { ChevronRight, FileText, Loader2, Paperclip, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ClosureDocumentViewer, formatearTamano } from '@/components/closure/closure-document-viewer';
import { validateClosurePdf } from '@/hooks/use-closure';
import type { ClosureRevision, ClosureRevisionDocument, ClosureUploadEnCurso } from '@/lib/types/closure';

export const MAX_EVIDENCIAS = 10;

export interface ClosureDocumentsManagerProps {
  projectId: number;
  revision: ClosureRevision | null | undefined;
  isLoading?: boolean;
  /** Modo lectura (VIEW-14, administrador): sin generar, subir ni quitar. */
  readOnly?: boolean;
  /** Prohibido regenerar el informe en `EN_SOLICITUD_CIERRE` (06 v2 §29). */
  allowGenerate?: boolean;
  /** 503 `CLOSURE_NO_CONFIGURADO`: deshabilita carga y generación con tooltip. */
  storageUnavailable?: boolean;
  onGenerate?: () => void;
  generating?: boolean;
  onUpload?: (file: File) => void;
  uploading?: boolean;
  /** Evidencias subiéndose ahora mismo; aún no son documentos de la entrega. */
  uploads?: ClosureUploadEnCurso[];
  onCancelUpload?: (id: string) => void;
  onDetach?: (documentId: number) => void;
  detachingId?: number | null;
  /** Error de la última operación de documentos (413/422/409…), ya traducido. */
  error?: string | null;
  fechaInforme?: string | null;
}

const STORAGE_REASON = 'El almacenamiento de documentos de cierre no está disponible en este momento.';

function DisabledWithTooltip({ reason, children }: { reason: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{reason}</TooltipContent>
    </Tooltip>
  );
}

/**
 * VIEW-13 (F005) — «Documentos del cierre»: informe automático (+ «Ver
 * informe» con el visor protegido) y evidencias «n de 10» con subida y
 * borrado. Con `readOnly` (F016) solo se ve y se abre; nunca se muta.
 * La subida valida en cliente PDF y ≤ 10 MiB antes de cualquier petición.
 */
export function ClosureDocumentsManager({
  projectId,
  revision,
  isLoading = false,
  readOnly = false,
  allowGenerate = true,
  storageUnavailable = false,
  onGenerate,
  generating = false,
  onUpload,
  uploading = false,
  uploads = [],
  onCancelUpload,
  onDetach,
  detachingId = null,
  error,
  fechaInforme,
}: ClosureDocumentsManagerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [visor, setVisor] = useState<ClosureRevisionDocument | null>(null);

  if (isLoading || revision === undefined) {
    return <Skeleton className="h-56 w-full rounded-xl" aria-busy="true" aria-label="Cargando documentos del cierre" />;
  }

  const documentos = revision?.documentosEnviados ?? [];
  const informe = documentos.find((d) => d.tipoDocumento === 'INFORME_AUTOMATICO') ?? null;
  const evidencias = documentos.filter((d) => d.tipoDocumento === 'EVIDENCIA_LIDER');
  const puedeMutar = !readOnly && revision != null && (revision.puedeEditar ?? true);
  const cupoLleno = evidencias.length + uploads.length >= MAX_EVIDENCIAS;

  const elegirArchivo = (file: File | undefined) => {
    if (!file) return;
    const rechazo = validateClosurePdf(file);
    if (rechazo) {
      setLocalError(rechazo);
      return;
    }
    setLocalError(null);
    onUpload?.(file);
  };

  const mensajeError = localError ?? error ?? null;

  const botonSubir = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={!puedeMutar || storageUnavailable || uploading || cupoLleno}
      onClick={() => inputRef.current?.click()}
      aria-controls={inputId}
      className="h-9 gap-1.5 rounded-md border-outline-variant text-xs font-semibold"
    >
      {uploading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
      {uploading ? 'Subiendo…' : 'Añadir PDF'}
    </Button>
  );

  const botonGenerar = (
    <Button
      type="button"
      size="sm"
      disabled={!puedeMutar || storageUnavailable || generating || !allowGenerate}
      onClick={onGenerate}
      className="h-9 gap-1.5 rounded-md text-xs font-bold"
    >
      {generating ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Upload className="size-3.5" aria-hidden="true" />}
      {generating ? 'Generando…' : informe ? 'Regenerar informe' : 'Generar informe'}
    </Button>
  );

  return (
    <section
      className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm"
      aria-labelledby="closure-docs-title"
    >
      <h2 id="closure-docs-title" className="text-sm font-bold text-on-surface">
        Documentos del cierre
      </h2>
      <p className="mt-0.5 text-xs text-tertiary">
        {readOnly ? 'Documentación entregada por el líder.' : 'Genera y adjunta la documentación requerida.'}
      </p>

      {/* Informe automático */}
      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-outline-variant/40 p-3 sm:flex-row sm:items-center">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
          <FileText className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-on-surface">Informe automático</p>
          <p className="text-xs text-tertiary">
            {informe
              ? `${informe.nombreArchivo}${formatearTamano(informe.tamanoBytes) ? ` · ${formatearTamano(informe.tamanoBytes)}` : ''}`
              : 'Generado con base en la información del proyecto.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {informe && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setVisor(informe)}
              className="h-9 gap-1.5 rounded-md border-primary/40 text-xs font-semibold text-primary hover:bg-primary/5 hover:text-primary"
            >
              <FileText className="size-3.5" aria-hidden="true" />
              Ver informe
            </Button>
          )}
          {!readOnly && allowGenerate && (
            storageUnavailable ? (
              <DisabledWithTooltip reason={STORAGE_REASON}>{botonGenerar}</DisabledWithTooltip>
            ) : !puedeMutar ? (
              <DisabledWithTooltip reason="Esta entrega ya no admite cambios.">{botonGenerar}</DisabledWithTooltip>
            ) : (
              botonGenerar
            )
          )}
        </div>
      </div>

      {/* Evidencias */}
      <div className="mt-3 rounded-xl border border-outline-variant/40 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
            <Paperclip className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-on-surface">Evidencias</p>
            <p className="text-xs text-tertiary">Adjunta capturas, reportes y material de respaldo (PDF, máximo 10 MiB cada uno).</p>
          </div>
          <span className="text-sm font-bold text-on-surface" aria-label={`${evidencias.length} de ${MAX_EVIDENCIAS} evidencias`}>
            {evidencias.length} de {MAX_EVIDENCIAS}
            <ChevronRight className="ml-1 inline size-4 text-tertiary" aria-hidden="true" />
          </span>
          {!readOnly && (
            <>
              <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                aria-label="Seleccionar evidencia en PDF"
                onChange={(e) => {
                  elegirArchivo(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {storageUnavailable ? (
                <DisabledWithTooltip reason={STORAGE_REASON}>{botonSubir}</DisabledWithTooltip>
              ) : cupoLleno ? (
                <DisabledWithTooltip reason={`Ya adjuntaste el máximo de ${MAX_EVIDENCIAS} evidencias.`}>{botonSubir}</DisabledWithTooltip>
              ) : !puedeMutar ? (
                <DisabledWithTooltip reason="Esta entrega ya no admite cambios.">{botonSubir}</DisabledWithTooltip>
              ) : (
                botonSubir
              )}
            </>
          )}
        </div>

        {(uploads.length > 0 || evidencias.length > 0) && (
          <ul className="mt-3 divide-y divide-outline-variant/30 border-t border-outline-variant/30" aria-label="Evidencias adjuntas">
            {!readOnly &&
              uploads.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2 py-2 text-sm" aria-label={`Evidencia en curso: ${u.nombreArchivo}`}>
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-on-surface" title={u.nombreArchivo}>
                    {u.nombreArchivo}
                  </span>
                  {/* Barra indeterminada: `fetch` no expone el progreso de
                      subida, así que se muestra actividad, nunca un porcentaje
                      inventado. */}
                  <span
                    role="progressbar"
                    aria-label={`Subiendo ${u.nombreArchivo}`}
                    className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-surface-container-high"
                  >
                    <span className="block h-full w-1/3 animate-pulse rounded-full bg-primary" />
                  </span>
                </span>
                {formatearTamano(u.tamanoBytes) && (
                  <Badge variant="outline" className="text-[10px] text-tertiary">
                    {formatearTamano(u.tamanoBytes)}
                  </Badge>
                )}
                <span className="text-xs text-tertiary">Subiendo…</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onCancelUpload?.(u.id)}
                  aria-label={`Cancelar la subida de ${u.nombreArchivo}`}
                  className="h-8 gap-1 text-xs font-semibold text-error hover:bg-error/10 hover:text-error"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Cancelar
                  </Button>
                </li>
              ))}
            {evidencias.map((doc) => (
              <li key={doc.idDocumentoCierre} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <FileText className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-on-surface" title={doc.nombreArchivo}>
                  {doc.nombreArchivo}
                </span>
                {formatearTamano(doc.tamanoBytes) && (
                  <Badge variant="outline" className="text-[10px] text-tertiary">
                    {formatearTamano(doc.tamanoBytes)}
                  </Badge>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisor(doc)}
                  aria-label={`Ver ${doc.nombreArchivo}`}
                  className="h-8 text-xs font-semibold text-primary hover:text-primary"
                >
                  Ver
                </Button>
                {!readOnly && puedeMutar && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={detachingId === doc.idDocumentoCierre}
                    onClick={() => onDetach?.(doc.idDocumentoCierre)}
                    aria-label={`Quitar ${doc.nombreArchivo}`}
                    className="h-8 gap-1 text-xs font-semibold text-error hover:bg-error/10 hover:text-error"
                  >
                    {detachingId === doc.idDocumentoCierre ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    )}
                    Quitar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {mensajeError && (
        <p role="alert" className="mt-3 text-xs text-error">
          {mensajeError}
        </p>
      )}

      {visor && (
        <ClosureDocumentViewer
          projectId={projectId}
          documentId={visor.idDocumentoCierre}
          nombre={visor.nombreArchivo}
          tipo={visor.tipoDocumento}
          tamanoBytes={visor.tamanoBytes}
          fecha={visor.tipoDocumento === 'INFORME_AUTOMATICO' ? fechaInforme ?? null : null}
          open
          onOpenChange={(open) => {
            if (!open) setVisor(null);
          }}
        />
      )}
    </section>
  );
}
