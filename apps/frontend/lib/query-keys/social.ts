import type { BuscarUsuariosFiltros } from '@/lib/types/social';

export const amigosQueryKey = () => ['social-amigos'] as const;

export const solicitudesAmistadPendientesQueryKey = () => ['social-solicitudes-pendientes'] as const;

export const siguiendoQueryKey = () => ['social-siguiendo'] as const;

export const seguidoresQueryKey = () => ['social-seguidores'] as const;

export const buscarUsuariosQueryKey = (filtros: BuscarUsuariosFiltros) =>
  ['social-buscar-usuarios', filtros] as const;

export const feedSocialQueryKey = () => ['social-feed'] as const;
