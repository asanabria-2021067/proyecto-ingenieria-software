'use client';

import { useQuery } from '@tanstack/react-query';
import { adminCuentasPendientesQueryKey } from '@/lib/query-keys/admin-accounts';
import { getCuentasPendientes, type AdminCuentasPendientesResponse } from '@/lib/services/admin';

export function useCuentasPendientes(enabled = true) {
  return useQuery<AdminCuentasPendientesResponse>({
    queryKey: adminCuentasPendientesQueryKey,
    queryFn: getCuentasPendientes,
    enabled,
    refetchInterval: 30 * 1000,
    staleTime: 0,
  });
}
