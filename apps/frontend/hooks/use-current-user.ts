'use client';

import { useQuery } from '@tanstack/react-query';
import { getMe, type UserProfile } from '@/lib/services/users';
import { esperaExponencial, reintentarSesionTransitoria } from '@/lib/api/query-retry';

export function useCurrentUser() {
  return useQuery<UserProfile>({
    queryKey: ['currentUser'],
    queryFn: getMe,
    // IESUC-568 (C2): un 429 o un fallo de red se reintentan con espera
    // exponencial (o Retry-After); un 401 u otro error se reporta enseguida.
    retry: reintentarSesionTransitoria,
    retryDelay: esperaExponencial,
    staleTime: 5 * 60 * 1000,
  });
}

export function isProfileIncomplete(user: UserProfile): boolean {
  return (
    user.perfil?.biografia === null && user.habilidades.length === 0
  );
}

export function isAdminUser(user?: UserProfile | null): boolean {
  return (user?.roles ?? []).some(
    (r) => r.toLowerCase() === 'administrador',
  );
}

export function useIsAdmin(): boolean {
  const { data } = useCurrentUser();
  return isAdminUser(data);
}
