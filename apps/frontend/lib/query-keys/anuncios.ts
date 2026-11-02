/** Anuncios vigentes del usuario autenticado (banner del dashboard). */
export const anunciosVigentesQueryKey = ['anuncios', 'vigentes'] as const;

/** Anuncios de una organización o asociación (MEJ-66). */
export const anunciosEntidadQueryKey = (tipo: string, id: number) => ['anuncios', 'entidad', tipo, id] as const;

/** Lista de administración (T-352). */
export const adminAnunciosQueryKey = ['admin', 'anuncios'] as const;
