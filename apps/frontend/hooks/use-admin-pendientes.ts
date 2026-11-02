'use client';

import { useQuery } from '@tanstack/react-query';
import { adminPendientesQueryKey } from '@/lib/query-keys/admin-accounts';
import { getAdminPendientes } from '@/lib/services/admin';

export const useAdminPendientes = () =>
  useQuery({ queryKey: adminPendientesQueryKey, queryFn: getAdminPendientes, refetchInterval: 30 * 1000 });
