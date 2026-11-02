'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { asociacionesKeys } from '@/lib/query-keys/asociaciones';
import {
  actualizarAsociacion,
  actualizarJunta,
  asignarJunta,
  crearAsociacion,
  getAsociacionesAdmin,
  getCandidatosParticipantes,
  getEstudiantesAsociacion,
  getMisJuntas,
  getProyectosAsociacion,
  quitarJunta,
  type AsignarJuntaInput,
  type AsociacionInput,
  type CargoJunta,
  type FiltrosAsociacion,
  type NivelPermisoJunta,
} from '@/lib/services/asociaciones';

/** Juntas del usuario: alimenta el cambio de vista Estudiante / Asociación. */
export const useMisJuntas = (enabled = true) =>
  useQuery({ queryKey: asociacionesKeys.misJuntas, queryFn: getMisJuntas, enabled, staleTime: 5 * 60_000, retry: false });

export const useEstudiantesAsociacion = (id: number, filtros: FiltrosAsociacion, enabled = true) =>
  useInfiniteQuery({
    queryKey: asociacionesKeys.estudiantes(id, filtros),
    queryFn: ({ pageParam }) => getEstudiantesAsociacion(id, filtros, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (ultima) => ultima.siguienteCursor ?? undefined,
    enabled,
  });

export const useCandidatosParticipantes = (id: number | null, q: string) =>
  useQuery({
    queryKey: asociacionesKeys.candidatos(id ?? 0, q),
    queryFn: () => getCandidatosParticipantes(id!, q),
    enabled: id !== null,
  });

export const useProyectosAsociacion = (id: number) =>
  useQuery({ queryKey: asociacionesKeys.proyectos(id), queryFn: () => getProyectosAsociacion(id) });

export const useAsociacionesAdmin = (enabled = true) =>
  useQuery({ queryKey: asociacionesKeys.admin, queryFn: getAsociacionesAdmin, enabled });

/** Gestión de asociaciones y juntas (solo admin): todas refrescan la lista y las juntas del usuario. */
export function useAsociacionesAdminMutations() {
  const queryClient = useQueryClient();
  const refrescar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: asociacionesKeys.admin }),
      queryClient.invalidateQueries({ queryKey: asociacionesKeys.misJuntas }),
    ]);
  return {
    crear: useMutation({ mutationFn: (input: AsociacionInput) => crearAsociacion(input), onSuccess: refrescar }),
    editar: useMutation({
      mutationFn: ({ id, input }: { id: number; input: Partial<AsociacionInput> & { archivada?: boolean } }) => actualizarAsociacion(id, input),
      onSuccess: refrescar,
    }),
    asignar: useMutation({
      mutationFn: ({ id, input }: { id: number; input: AsignarJuntaInput }) => asignarJunta(id, input),
      onSuccess: refrescar,
    }),
    cambiar: useMutation({
      mutationFn: ({ id, idUsuario, input }: { id: number; idUsuario: number; input: { cargo?: CargoJunta; nivelPermiso?: NivelPermisoJunta } }) =>
        actualizarJunta(id, idUsuario, input),
      onSuccess: refrescar,
    }),
    quitar: useMutation({
      mutationFn: ({ id, idUsuario }: { id: number; idUsuario: number }) => quitarJunta(id, idUsuario),
      onSuccess: refrescar,
    }),
  };
}
