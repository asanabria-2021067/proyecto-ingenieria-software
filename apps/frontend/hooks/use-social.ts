'use client';

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  amigosQueryKey,
  buscarUsuariosQueryKey,
  feedSocialQueryKey,
  seguidoresQueryKey,
  siguiendoQueryKey,
  solicitudesAmistadPendientesQueryKey,
} from '@/lib/query-keys/social';
import {
  aceptarSolicitudAmistad,
  buscarUsuarios,
  crearSolicitudAmistad,
  dejarDeSeguir,
  eliminarAmistad,
  getAmigos,
  getFeedSocial,
  getSeguidores,
  getSiguiendo,
  getSolicitudesPendientes,
  rechazarSolicitudAmistad,
  seguirUsuario,
} from '@/lib/services/social';

function invalidateSocialQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: amigosQueryKey() });
  queryClient.invalidateQueries({ queryKey: solicitudesAmistadPendientesQueryKey() });
  queryClient.invalidateQueries({ queryKey: ['social-buscar-usuarios'] });
  queryClient.invalidateQueries({ queryKey: feedSocialQueryKey() });
}

export function useAmigos() {
  const query = useQuery({ queryKey: amigosQueryKey(), queryFn: getAmigos });
  return { amigos: query.data ?? [], isLoading: query.isLoading, isError: query.isError };
}

export function useSolicitudesAmistadPendientes() {
  const query = useQuery({
    queryKey: solicitudesAmistadPendientesQueryKey(),
    queryFn: getSolicitudesPendientes,
  });
  return { solicitudes: query.data ?? [], isLoading: query.isLoading, isError: query.isError };
}

export function useSiguiendo() {
  const query = useQuery({ queryKey: siguiendoQueryKey(), queryFn: getSiguiendo });
  return { siguiendo: query.data ?? [], isLoading: query.isLoading, isError: query.isError };
}

export function useSeguidores() {
  const query = useQuery({ queryKey: seguidoresQueryKey(), queryFn: getSeguidores });
  return { seguidores: query.data ?? [], isLoading: query.isLoading, isError: query.isError };
}

export function useBuscarUsuarios(q: string) {
  const enabled = q.trim().length >= 2;
  const query = useQuery({
    queryKey: buscarUsuariosQueryKey(q),
    queryFn: () => buscarUsuarios(q),
    enabled,
  });
  return { resultados: query.data ?? [], isLoading: query.isLoading, isError: query.isError, enabled };
}

export function useFeedSocial() {
  const query = useQuery({ queryKey: feedSocialQueryKey(), queryFn: getFeedSocial });
  return {
    proyectosDeAmigos: query.data?.proyectosDeAmigos ?? [],
    proyectosDeSeguidos: query.data?.proyectosDeSeguidos ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useCrearSolicitudAmistad() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idReceptor: number) => crearSolicitudAmistad(idReceptor),
    onSuccess: () => invalidateSocialQueries(queryClient),
  });
}

export function useAceptarSolicitudAmistad() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idAmistad: number) => aceptarSolicitudAmistad(idAmistad),
    onSuccess: () => invalidateSocialQueries(queryClient),
  });
}

export function useRechazarSolicitudAmistad() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idAmistad: number) => rechazarSolicitudAmistad(idAmistad),
    onSuccess: () => invalidateSocialQueries(queryClient),
  });
}

export function useEliminarAmistad() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idAmistad: number) => eliminarAmistad(idAmistad),
    onSuccess: () => invalidateSocialQueries(queryClient),
  });
}

export function useSeguirUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idSeguido: number) => seguirUsuario(idSeguido),
    onSuccess: () => invalidateSocialQueries(queryClient),
  });
}

export function useDejarDeSeguir() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idSeguido: number) => dejarDeSeguir(idSeguido),
    onSuccess: () => invalidateSocialQueries(queryClient),
  });
}
