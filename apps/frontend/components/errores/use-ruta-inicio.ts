'use client';

import { useCurrentUser } from '@/hooks/use-current-user';
import { rutaInicioDe } from '@/lib/permissions/ruta-inicio';

export function useRutaInicio(): string {
  const { data: user } = useCurrentUser();
  if (!user) return '/';
  return rutaInicioDe(user);
}
