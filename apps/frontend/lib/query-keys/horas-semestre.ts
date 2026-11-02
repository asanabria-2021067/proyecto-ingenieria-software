import type { HorasCentralFiltros } from '@/lib/services/horas-semestre';

export const horasSemestreKeys = {
  all: ['horas-semestre'] as const,
  actual: ['horas-semestre', 'actual'] as const,
  progreso: ['horas-semestre', 'progreso'] as const,
  historial: ['horas-semestre', 'historial'] as const,
  central: (filtros: HorasCentralFiltros) => ['horas-semestre', 'central', filtros] as const,
  totales: (filtros: HorasCentralFiltros) => ['horas-semestre', 'totales', filtros] as const,
  asociaciones: ['horas-semestre', 'asociaciones'] as const,
};
