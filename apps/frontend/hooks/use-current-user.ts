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
