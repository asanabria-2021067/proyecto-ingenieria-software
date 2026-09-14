'use client';

import { useInfiniteQuery, useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  amigosQueryKey,
  buscarUsuariosQueryKey,
  feedSocialQueryKey,
  perfilUsuarioQueryKey,
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
  getPerfilUsuario,
  getSeguidores,
  getSiguiendo,
  getSolicitudesPendientes,
  rechazarSolicitudAmistad,
  seguirUsuario,
} from '@/lib/services/social';
import type { BuscarUsuariosFiltros } from '@/lib/types/social';

function invalidateSocialQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: amigosQueryKey() });
  queryClient.invalidateQueries({ queryKey: solicitudesAmistadPendientesQueryKey() });
  queryClient.invalidateQueries({ queryKey: ['social-buscar-usuarios'] });
  queryClient.invalidateQueries({ queryKey: feedSocialQueryKey() });
  queryClient.invalidateQueries({ queryKey: ['social-perfil-usuario'] });
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

/**
 * Cada pestaña de Personas es una consulta distinta al servidor, paginada
 * (no se filtra en el navegador una lista ya cargada). Un `q` a medio
 * escribir (1 carácter) se omite del pedido en vez de bloquear la pestaña:
 * el backend exige 2+ caracteres para filtrar por texto.
 */
export function useBuscarUsuarios(filtros: Omit<BuscarUsuariosFiltros, 'page'>) {
  const q = filtros.q?.trim() ?? '';
  const filtrosEfectivos: Omit<BuscarUsuariosFiltros, 'page'> = { ...filtros, q: q.length >= 2 ? q : undefined };

  const query = useInfiniteQuery({
    queryKey: buscarUsuariosQueryKey(filtrosEfectivos),
    queryFn: ({ pageParam }) => buscarUsuarios({ ...filtrosEfectivos, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length + 1 : undefined),
  });

  return {
    resultados: query.data?.pages.flatMap((p) => p.items) ?? [],
    hasMore: Boolean(query.hasNextPage),
    isLoading: query.isLoading,
    isError: query.isError,
    cargarMas: () => query.fetchNextPage(),
    cargandoMas: query.isFetchingNextPage,
  };
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

export function usePerfilUsuario(idUsuario: number) {
  const query = useQuery({
    queryKey: perfilUsuarioQueryKey(idUsuario),
    queryFn: () => getPerfilUsuario(idUsuario),
    enabled: Number.isFinite(idUsuario),
  });
  return { perfil: query.data ?? null, isLoading: query.isLoading, isError: query.isError };
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

/** Forma mínima que necesita `useAccionesAmistad`: tanto `UsuarioBusquedaDto`
 * (resultado de búsqueda) como `UsuarioPerfilDto` (perfil de una persona) la
 * cumplen, así que las tarjetas de la lista y la página de perfil comparten
 * la misma lógica de botones sin duplicarla. */
interface UsuarioConRelacion {
  idUsuario: number;
  esAmigo: boolean;
  solicitudPendiente: { direccion: 'enviada' | 'recibida' } | null;
  loSigo: boolean;
}

export function useAccionesAmistad(usuario: UsuarioConRelacion) {
  const crearSolicitud = useCrearSolicitudAmistad();
  const aceptarSolicitud = useAceptarSolicitudAmistad();
  const eliminarAmistadMutation = useEliminarAmistad();
  const seguir = useSeguirUsuario();
  const dejarDeSeguirMutation = useDejarDeSeguir();

  const amistad = usuario.esAmigo
    ? {
        label: 'Amigos',
        variant: 'outline' as const,
        disabled: eliminarAmistadMutation.isPending,
        onClick: () => eliminarAmistadMutation.mutate(usuario.idUsuario),
      }
    : usuario.solicitudPendiente?.direccion === 'enviada'
      ? { label: 'Solicitud enviada', variant: 'outline' as const, disabled: true, onClick: () => {} }
      : usuario.solicitudPendiente?.direccion === 'recibida'
        ? {
            label: 'Aceptar solicitud',
            variant: 'default' as const,
            disabled: aceptarSolicitud.isPending,
            onClick: () => aceptarSolicitud.mutate(usuario.idUsuario),
          }
        : {
            label: 'Agregar como amigo',
            variant: 'default' as const,
            disabled: crearSolicitud.isPending,
            onClick: () => crearSolicitud.mutate(usuario.idUsuario),
          };

  const seguimiento = usuario.loSigo
    ? { label: 'Siguiendo', disabled: dejarDeSeguirMutation.isPending, onClick: () => dejarDeSeguirMutation.mutate(usuario.idUsuario) }
    : { label: 'Seguir', disabled: seguir.isPending, onClick: () => seguir.mutate(usuario.idUsuario) };

  return { amistad, seguimiento };
}
