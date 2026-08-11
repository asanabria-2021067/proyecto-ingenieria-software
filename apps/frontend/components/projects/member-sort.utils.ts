import type { ParticipacionActivaDTO } from '@/lib/dto/member.dto';

export type MiembroSortKey = 'nombre' | 'rol' | 'estado' | 'tareasActivas' | 'horasRegistradas';
export type SortDirection = 'asc' | 'desc';

const VALOR_ORDENABLE: Record<MiembroSortKey, (m: ParticipacionActivaDTO) => string | number> = {
  nombre: (m) => `${m.usuario.nombre} ${m.usuario.apellido}`.toLowerCase(),
  rol: (m) => m.rolProyecto.nombreRol.toLowerCase(),
  estado: (m) => m.estadoParticipacion,
  tareasActivas: (m) => m.tareasActivas,
  horasRegistradas: (m) => m.horasRegistradas,
};

/** Devuelve una copia ordenada del equipo; nunca muta el arreglo recibido. */
export function ordenarEquipo(
  equipo: ParticipacionActivaDTO[],
  sortKey: MiembroSortKey,
  sortDirection: SortDirection,
): ParticipacionActivaDTO[] {
  const factor = sortDirection === 'asc' ? 1 : -1;
  const obtenerValor = VALOR_ORDENABLE[sortKey];

  return [...equipo].sort((a, b) => {
    const valorA = obtenerValor(a);
    const valorB = obtenerValor(b);
    if (typeof valorA === 'number' && typeof valorB === 'number') {
      return (valorA - valorB) * factor;
    }
    return String(valorA).localeCompare(String(valorB), 'es') * factor;
  });
}
