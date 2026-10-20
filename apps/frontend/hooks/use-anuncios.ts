'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminAnunciosQueryKey, anunciosVigentesQueryKey } from '@/lib/query-keys/anuncios';
import {
  cerrarAnuncio,
  createAnuncio,
  despublicarAnuncio,
  getAnunciosAdmin,
  getAnunciosVigentes,
  updateAnuncio,
  type UpdateAnuncioInput,
} from '@/lib/services/anuncios';

/** Anuncios vigentes del usuario; el banner muestra el primero (el backend ya los ordena). */
export function useAnunciosVigentes(enabled = true) {
  return useQuery({
    queryKey: anunciosVigentesQueryKey,
    queryFn: getAnunciosVigentes,
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export function useCerrarAnuncio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cerrarAnuncio,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: anunciosVigentesQueryKey }),
  });
}

export function useAdminAnuncios(enabled = true) {
  return useQuery({ queryKey: adminAnunciosQueryKey, queryFn: getAnunciosAdmin, enabled });
}

/** Crear, editar y despublicar: todos refrescan la lista de administración y el banner. */
export function useAnunciosAdminMutations() {
  const queryClient = useQueryClient();
  const refrescar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: adminAnunciosQueryKey }),
      queryClient.invalidateQueries({ queryKey: anunciosVigentesQueryKey }),
    ]);
  return {
    crear: useMutation({ mutationFn: createAnuncio, onSuccess: refrescar }),
    editar: useMutation({
      mutationFn: ({ id, input }: { id: number; input: UpdateAnuncioInput }) => updateAnuncio(id, input),
      onSuccess: refrescar,
    }),
    despublicar: useMutation({ mutationFn: despublicarAnuncio, onSuccess: refrescar }),
  };
}
