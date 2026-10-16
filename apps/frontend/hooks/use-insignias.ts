'use client';

import { useQuery } from '@tanstack/react-query';
import { misInsigniasQueryKey } from '@/lib/query-keys/insignias';
import { getMisInsignias } from '@/lib/services/insignias';

/** HU-190: insignias del usuario autenticado. `enabled` evita la llamada para administradores. */
export function useMisInsignias(enabled = true) {
  return useQuery({
    queryKey: misInsigniasQueryKey,
    queryFn: getMisInsignias,
    enabled,
    // Se otorgan en segundo plano tras otras acciones: se relee al entrar a la vista.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
