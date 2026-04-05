import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProyectos, getProyecto, createProyecto } from '@/lib/api';
import { CreateProyectoDto } from '@/types/proyecto';

export const proyectosKeys = {
  all: ['proyectos'] as const,
  detail: (id: number) => ['proyectos', id] as const,
};

export function useProyectos() {
  return useQuery({
    queryKey: proyectosKeys.all,
    queryFn: getProyectos,
  });
}

export function useProyecto(id: number) {
  return useQuery({
    queryKey: proyectosKeys.detail(id),
    queryFn: () => getProyecto(id),
    enabled: !!id,
  });
}

export function useCreateProyecto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProyectoDto) => createProyecto(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: proyectosKeys.all });
    },
  });
}
