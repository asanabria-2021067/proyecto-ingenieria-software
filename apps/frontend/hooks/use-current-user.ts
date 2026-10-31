'use client';

import { useQuery } from '@tanstack/react-query';
import { getMe, type UserProfile } from '@/lib/services/users';

export function useCurrentUser() {
  return useQuery<UserProfile>({
    queryKey: ['currentUser'],
    queryFn: getMe,
    retry: false,
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
