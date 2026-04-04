'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchProjects } from '@/lib/services/projects';
import type { ProyectoListItemDTO } from '@/lib/dto/project.dto';

export function useProjectSearch(query: string, debounceMs = 300) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  return useQuery<ProyectoListItemDTO[]>({
    queryKey: ['projects-search', debouncedQuery],
    queryFn: () => searchProjects(debouncedQuery),
    enabled: debouncedQuery.trim().length > 0,
    staleTime: 30_000,
  });
}
