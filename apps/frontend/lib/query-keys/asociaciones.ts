import type { FiltrosAsociacion } from '@/lib/services/asociaciones';

export const asociacionesKeys = {
  misJuntas: ['asociaciones', 'mis-juntas'] as const,
  estudiantes: (id: number, filtros: FiltrosAsociacion) => ['asociaciones', id, 'estudiantes', filtros] as const,
  proyectos: (id: number) => ['asociaciones', id, 'proyectos'] as const,
  admin: ['admin', 'asociaciones'] as const,
};
