'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchGlobal } from '@/lib/services/global-search';
import type { GlobalSearchResponseDTO } from '@/lib/dto/global-search.dto';

export function useGlobalSearch(query: string, debounceMs = 300) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  const result = useQuery<GlobalSearchResponseDTO>({
    queryKey: ['global-search', debouncedQuery],
    queryFn: () => searchGlobal(debouncedQuery),
    enabled: debouncedQuery.trim().length > 0,
    staleTime: 30_000,
  });

  // El usuario sigue escribiendo (esperando el debounce): ni hay datos frescos
  // ni hay un fetch en curso todavía, así que un consumidor que solo mire
  // `isFetching` mostraría "sin resultados" antes de haber preguntado.
  return { ...result, isDebouncing: query !== debouncedQuery };
}
