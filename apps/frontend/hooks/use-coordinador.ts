'use client';

import { useQuery } from '@tanstack/react-query';
import { getMiAlcance } from '@/lib/services/coordinador';

export const coordinadorKeys = {
  miAlcance: ['coordinador', 'mi-alcance'] as const,
  alcanceDe: (idUsuario: number) => ['coordinador', 'alcance', idUsuario] as const,
};

export const useMiAlcance = () => useQuery({ queryKey: coordinadorKeys.miAlcance, queryFn: getMiAlcance });
