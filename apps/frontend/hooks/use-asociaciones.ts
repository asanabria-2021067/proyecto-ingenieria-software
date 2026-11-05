'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { asociacionesKeys } from '@/lib/query-keys/asociaciones';
import {
  actualizarAsociacion,
  actualizarJunta,
  actualizarMetaAsociacion,
  asignarJunta,
  contarDestinatariosAviso,
  crearAsociacion,
  crearMetaAsociacion,
  eliminarMetaAsociacion,
  enviarAvisoAsociacion,
  getAsociacionesAdmin,
  getCandidatosParticipantes,
  getEstudiantesAsociacion,
  getMetasAsociacion,
  getMisJuntas,
  getProyectosAsociacion,
  quitarJunta,
  type AsignarJuntaInput,
  type AsociacionInput,
  type AvisoAsociacionInput,
  type CrearMetaInput,
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

export const useMetasAsociacion = (id: number) =>
  useQuery({ queryKey: asociacionesKeys.metas(id), queryFn: () => getMetasAsociacion(id) });

/** Crear, cambiar o quitar una meta refresca la lista con su avance. */
export function useMetasAsociacionMutations(id: number) {
  const queryClient = useQueryClient();
  const refrescar = () => queryClient.invalidateQueries({ queryKey: asociacionesKeys.metas(id) });
  return {
    crear: useMutation({ mutationFn: (input: CrearMetaInput) => crearMetaAsociacion(id, input), onSuccess: refrescar }),
    cambiar: useMutation({
      mutationFn: ({ idMeta, porcentajeObjetivo }: { idMeta: number; porcentajeObjetivo: number }) =>
        actualizarMetaAsociacion(id, idMeta, porcentajeObjetivo),
      onSuccess: refrescar,
    }),
    quitar: useMutation({ mutationFn: (idMeta: number) => eliminarMetaAsociacion(id, idMeta), onSuccess: refrescar }),
  };
}

export const useDestinatariosAviso = (id: number, filtros: FiltrosAsociacion, enabled: boolean) =>
  useQuery({
    queryKey: asociacionesKeys.destinatarios(id, filtros),
    queryFn: () => contarDestinatariosAviso(id, filtros),
    enabled,
    gcTime: 0,
  });

export const useEnviarAviso = (id: number) =>
  useMutation({ mutationFn: (input: AvisoAsociacionInput) => enviarAvisoAsociacion(id, input) });

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
