'use client';

import { useCurrentUser, isAdminUser } from '@/hooks/use-current-user';

export function useRutaInicio(): string {
  const { data: user } = useCurrentUser();
  if (!user) return '/';
  return isAdminUser(user) ? '/dashboard/admin' : '/dashboard';
}
