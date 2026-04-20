'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getNotificaciones,
  getConteoNoLeidas,
  marcarLeida,
  marcarTodasLeidas,
} from '@/lib/services/notifications';

export function useNotificaciones() {
  return useQuery({
    queryKey: ['notificaciones'],
    queryFn: getNotificaciones,
    staleTime: 30 * 1000,
  });
}

export function useConteoNoLeidas() {
  return useQuery({
    queryKey: ['notificaciones', 'conteo'],
    queryFn: getConteoNoLeidas,
    refetchInterval: 30 * 1000,
    staleTime: 0,
  });
}

export function useMarcarLeida() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: marcarLeida,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
    },
  });
}

export function useMarcarTodasLeidas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: marcarTodasLeidas,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
    },
  });
}
