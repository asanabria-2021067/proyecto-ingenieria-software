export const amigosQueryKey = () => ['social-amigos'] as const;

export const solicitudesAmistadPendientesQueryKey = () => ['social-solicitudes-pendientes'] as const;

export const siguiendoQueryKey = () => ['social-siguiendo'] as const;

export const seguidoresQueryKey = () => ['social-seguidores'] as const;

export const buscarUsuariosQueryKey = (q: string) => ['social-buscar-usuarios', q] as const;

export const feedSocialQueryKey = () => ['social-feed'] as const;
