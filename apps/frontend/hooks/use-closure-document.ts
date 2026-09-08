'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { closureDocumentGrantQueryKey } from '@/lib/query-keys/closure';
import { fetchClosureDocumentBytes, getClosureDocumentReadGrant } from '@/lib/services/closure';

/**
 * VIEW-20 (F004) — encadena grant → bytes → objectURL local, y REVOCA el
 * objectURL en el cleanup. Reglas duras (`10` §9):
 * - `staleTime: 0`, `gcTime: 0`, `retry: false`: el ticket (300 s) no se
 *   cachea ni se reintenta; al reabrir se pide otro.
 * - Los bytes no se guardan en React Query más allá de la apertura actual.
 * - Nunca hay URL del proveedor: `grant.url` es una ruta del backend.
 */
export function useClosureDocument(idProyecto: number, idDocumento: number, enabled: boolean) {
  const activo =
    enabled &&
    Number.isInteger(idProyecto) &&
    idProyecto > 0 &&
    Number.isInteger(idDocumento) &&
    idDocumento > 0;

  const query = useQuery<Blob>({
    queryKey: closureDocumentGrantQueryKey(idProyecto, idDocumento),
    queryFn: async () => {
      const grant = await getClosureDocumentReadGrant(idProyecto, idDocumento);
      return fetchClosureDocumentBytes(grant.url);
    },
    enabled: activo,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const blob = query.data;

  // El objectURL se deriva del Blob (no se guarda en estado) y se REVOCA en
  // el cleanup del efecto en cuanto cambia el Blob, se cierra el visor o se
  // desmonta el componente. Un objectURL sin revocar retendría el PDF
  // completo en memoria.
  const objectUrl = useMemo(() => (blob && activo ? URL.createObjectURL(blob) : null), [blob, activo]);

  useEffect(() => {
    if (!objectUrl) return;
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  return {
    objectUrl: activo ? objectUrl : null,
    isLoading: activo && (query.isPending || (query.isSuccess && objectUrl == null)),
    isError: query.isError,
    error: query.error,
  };
}
