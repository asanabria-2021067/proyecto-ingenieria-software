'use client';

import { useQuery } from '@tanstack/react-query';
import { getMe, type UserProfile } from '@/lib/services/users';

// Un 429 (rate limit) o un fallo de red transitorio no es una sesión inválida: sin reintento el layout
// mandaba a /login y el usuario quedaba atascado en el esqueleto. El resto de errores 4xx (401 ya refresca) no se reintenta.
export function debeReintentarCurrentUser(intentos: number, error: unknown): boolean {
  const status = (error as { statusCode?: number }).statusCode;
  return intentos < 3 && (status === undefined || status === 429 || status >= 500);
}

export function useCurrentUser() {
  return useQuery<UserProfile>({
    queryKey: ['currentUser'],
    queryFn: getMe,
    retry: debeReintentarCurrentUser,
    staleTime: 5 * 60 * 1000,
  });
}

export function isProfileIncomplete(user: UserProfile): boolean {
  return (
    user.perfil?.biografia === null && user.habilidades.length === 0
  );
}

export const PERFIL_POSPUESTO_KEY = 'perfil_asistente_pospuesto';

// Se guarda el id del usuario para que otra cuenta en la misma pestana no herede el aplazamiento.
export function perfilPospuesto(idUsuario: number): boolean {
  try {
    return sessionStorage.getItem(PERFIL_POSPUESTO_KEY) === String(idUsuario);
  } catch {
    return false;
  }
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
