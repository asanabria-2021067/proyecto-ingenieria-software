'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveProject, unsaveProject } from '@/lib/services/projects';

/**
 * Bookmark personal de "Explorar Proyectos" (distinto de postularse). El
 * flag `guardado` viaja en cada proyecto del listado (`/proyectos`), así
 * que el único trabajo de este hook es la mutación + invalidar ese listado.
 */
export function useSaveProject() {
  const queryClient = useQueryClient();
  const invalidateProyectos = () => queryClient.invalidateQueries({ queryKey: ['proyectos'] });

  const guardar = useMutation({
    mutationFn: (idProyecto: number) => saveProject(idProyecto),
    onSuccess: invalidateProyectos,
  });

  const desguardar = useMutation({
    mutationFn: (idProyecto: number) => unsaveProject(idProyecto),
    onSuccess: invalidateProyectos,
  });

  return { guardar, desguardar };
}
