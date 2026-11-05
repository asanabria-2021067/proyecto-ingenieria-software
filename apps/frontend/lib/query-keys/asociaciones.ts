import type { FiltrosAsociacion } from '@/lib/services/asociaciones';

export const asociacionesKeys = {
  misJuntas: ['asociaciones', 'mis-juntas'] as const,
  estudiantes: (id: number, filtros: FiltrosAsociacion) => ['asociaciones', id, 'estudiantes', filtros] as const,
  metas: (id: number) => ['asociaciones', id, 'metas'] as const,
  destinatarios: (id: number, filtros: FiltrosAsociacion) => ['asociaciones', id, 'destinatarios-aviso', filtros] as const,
  proyectos: (id: number) => ['asociaciones', id, 'proyectos'] as const,
  candidatos: (id: number, q: string) => ['asociaciones', id, 'candidatos-participantes', q] as const,
  admin: ['admin', 'asociaciones'] as const,
};
