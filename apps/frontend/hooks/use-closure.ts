'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CLOSURE_DOCUMENT_MAX_BYTES } from '@/components/projects/api-error';
import { projectPendingPostulationsQueryKey } from '@/lib/query-keys/applications';
import {
  closeReadinessPrefix,
  closeReadinessQueryKey,
  closureDraftQueryKey,
  closureRevisionPrefix,
  closureRevisionQueryKey,
  closureRevisionsPrefix,
  closureRevisionsQueryKey,
} from '@/lib/query-keys/closure';
import { projectDetailQueryKey } from '@/lib/query-keys/project';
import {
  detachClosureDocument,
  generateAutoReport,
  getCloseReadiness,
  getClosureRevision,
  getClosureRevisions,
  prepareClosure,
  requestClose,
  reserveClosureDocument,
  resubmitClosure,
  uploadClosureDocument,
} from '@/lib/services/closure';
import type {
  ClosureUploadEnCurso,
  CloseReadinessSummary,
  ClosureDeliveryInput,
  ClosureDraft,
  ClosurePhase,
  ClosureRevision,
  ClosureRevisionsPage,
} from '@/lib/types/closure';

function isValidId(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Validación EN CLIENTE antes de subir (`10` §9): tipo PDF y tamaño
 * ≤ 10 485 760 B. Devuelve el mensaje de rechazo o `null` si es válido.
 * Evita el viaje al servidor; el backend revalida de todos modos.
 */
export function validateClosurePdf(file: File): string | null {
  const esPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!esPdf) return 'Solo se admiten archivos PDF.';
  if (file.size > CLOSURE_DOCUMENT_MAX_BYTES) {
    const mib = (file.size / 1_048_576).toFixed(1);
    return `El archivo pesa ${mib} MiB y supera el límite de 10 MiB.`;
  }
  if (file.size === 0) return 'El archivo está vacío.';
  return null;
}

/**
 * Una carga abortada por el usuario no es un fallo que deba anunciarse: el
 * `fetch` cancelado lanza `AbortError` igual que si hubiera reventado.
 */
export function esUploadCancelado(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'AbortError';
}

/**
 * Borrador de cierre. En fase REQUEST se crea/recupera con `POST
 * …/cierre/preparacion` (idempotente). En fase RESUBMIT el borrador ya
 * existe (lo creó la corrección documental): se toma de las revisiones sin
 * volver a «preparar».
 */
export function useClosureDraft(idProyecto: number, phase: ClosurePhase, enabled = true) {
  return useQuery<ClosureDraft | null>({
    queryKey: closureDraftQueryKey(idProyecto),
    queryFn: async () => {
      if (phase === 'REQUEST') return prepareClosure(idProyecto);
      const page = await getClosureRevisions(idProyecto, 1, 5);
      const borrador = page.items.find((r) => r.estadoRevision === 'BORRADOR');
      return borrador
        ? {
            idRevisionCierre: borrador.idRevisionCierre,
            numeroRevision: borrador.numeroRevision,
            estadoRevision: borrador.estadoRevision,
          }
        : null;
    },
    enabled: enabled && isValidId(idProyecto),
    retry: false,
  });
}

export function useCloseReadiness(idProyecto: number, phase: ClosurePhase, enabled = true) {
  return useQuery<CloseReadinessSummary>({
    queryKey: closeReadinessQueryKey(idProyecto, phase),
    queryFn: () => getCloseReadiness(idProyecto, phase),
    enabled: enabled && isValidId(idProyecto),
    retry: false,
  });
}

export function useClosureRevision(idProyecto: number, numero: number | null | undefined, enabled = true) {
  return useQuery<ClosureRevision>({
    queryKey: closureRevisionQueryKey(idProyecto, numero ?? 0),
    queryFn: () => getClosureRevision(idProyecto, numero as number),
    enabled: enabled && isValidId(idProyecto) && numero != null && isValidId(numero),
    retry: false,
  });
}

export function useClosureRevisions(idProyecto: number, page = 1, enabled = true) {
  return useQuery<ClosureRevisionsPage>({
    queryKey: closureRevisionsQueryKey(idProyecto, page),
    queryFn: () => getClosureRevisions(idProyecto, page),
    enabled: enabled && isValidId(idProyecto),
    retry: false,
  });
}

/**
 * Mutations del ciclo de preparación (VIEW-13). Invalidaciones según `10`
 * §6.4: los documentos y el informe invalidan la revisión y el readiness;
 * el envío invalida además el borrador, las revisiones y el detalle del
 * proyecto (y las postulaciones, porque el envío las auto-rechaza).
 */
export function useClosureMutations(idProyecto: number) {
  const queryClient = useQueryClient();

  const invalidateDocs = () => {
    queryClient.invalidateQueries({ queryKey: closureRevisionPrefix(idProyecto) });
    queryClient.invalidateQueries({ queryKey: closeReadinessPrefix(idProyecto) });
  };

  const invalidateDelivery = () => {
    queryClient.invalidateQueries({ queryKey: closureDraftQueryKey(idProyecto) });
    queryClient.invalidateQueries({ queryKey: closeReadinessPrefix(idProyecto) });
    queryClient.invalidateQueries({ queryKey: closureRevisionsPrefix(idProyecto) });
    queryClient.invalidateQueries({ queryKey: closureRevisionPrefix(idProyecto) });
    queryClient.invalidateQueries({ queryKey: projectDetailQueryKey(idProyecto) });
    queryClient.invalidateQueries({ queryKey: projectPendingPostulationsQueryKey(idProyecto) });
  };

  const generate = useMutation({
    mutationFn: ({ revisionId }: { revisionId: number }) => generateAutoReport(idProyecto, { revisionId }),
    onSuccess: invalidateDocs,
  });

  // reserva → multipart {ticket, file} → backend. Máximo 2 reservas vivas por
  // actor y revisión (RESERVA_NO_DISPONIBLE).
  /**
   * Cargas vivas. `fetch` no informa del progreso de subida, así que no se
   * inventa un porcentaje: se expone QUÉ se está subiendo para que la vista lo
   * muestre, y un `AbortController` por carga para poder cancelarla.
   */
  const [uploads, setUploads] = useState<ClosureUploadEnCurso[]>([]);
  const abortsRef = useRef(new Map<string, AbortController>());

  const upload = useMutation({
    mutationFn: async ({ revisionId, file }: { revisionId: number; file: File }) => {
      const id = `${Date.now()}-${file.name}`;
      const controller = new AbortController();
      abortsRef.current.set(id, controller);
      setUploads((prev) => [...prev, { id, nombreArchivo: file.name, tamanoBytes: file.size }]);
      try {
        const grant = await reserveClosureDocument(idProyecto, { revisionId, nombreArchivo: file.name }, controller.signal);
        return await uploadClosureDocument(grant, file, controller.signal);
      } finally {
        abortsRef.current.delete(id);
        setUploads((prev) => prev.filter((u) => u.id !== id));
      }
    },
    onSuccess: invalidateDocs,
  });

  /**
   * Cancela una carga en curso. Aborta la petición; la fila desaparece por el
   * `finally` del propio `mutationFn`, no por una limpieza aparte.
   *
   * La reserva que el backend ya hubiera creado NO se libera aquí: solo se
   * vincula al terminar la carga, así que no hay nada que desvincular y el
   * servidor la caduca solo (§25, 10 min). Por eso tras varias cancelaciones
   * seguidas puede aparecer el aviso de reservas abiertas.
   */
  const cancelUpload = (id: string) => {
    abortsRef.current.get(id)?.abort();
  };

  const detach = useMutation({
    mutationFn: ({ documentId, revisionId }: { documentId: number; revisionId: number }) =>
      detachClosureDocument(idProyecto, documentId, revisionId),
    onSuccess: invalidateDocs,
  });

  const submit = useMutation({
    mutationFn: ({ phase, input }: { phase: ClosurePhase; input: ClosureDeliveryInput }) =>
      phase === 'RESUBMIT' ? resubmitClosure(idProyecto, input) : requestClose(idProyecto, input),
    onSuccess: invalidateDelivery,
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: closureDraftQueryKey(idProyecto) });
    queryClient.invalidateQueries({ queryKey: closeReadinessPrefix(idProyecto) });
    queryClient.invalidateQueries({ queryKey: closureRevisionPrefix(idProyecto) });
  };

  return { generate, upload, uploads, cancelUpload, detach, submit, refreshAll };
}
