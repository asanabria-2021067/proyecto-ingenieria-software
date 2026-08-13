import type { MiembroProyectoResumenDTO } from '@/lib/dto/member.dto';

export type MiembroSortKey = 'nombre' | 'roles' | 'estado' | 'tareasActivas' | 'horasReconocidas';
export type SortDirection = 'asc' | 'desc';

function rolesLabel(miembro: MiembroProyectoResumenDTO): string {
  return miembro.roles.map((rol) => rol.nombreRol).join(', ').toLowerCase();
}

const VALOR_ORDENABLE: Record<MiembroSortKey, (m: MiembroProyectoResumenDTO) => string | number> = {
  nombre: (m) => `${m.nombre} ${m.apellido}`.toLowerCase(),
  roles: (m) => rolesLabel(m),
  estado: (m) => m.estadoParticipacion,
  tareasActivas: (m) => m.tareasActivas,
  horasReconocidas: (m) => m.horasReconocidas,
};

/** Devuelve una copia ordenada de los miembros; nunca muta el arreglo recibido. */
export function ordenarMiembros(
  miembros: MiembroProyectoResumenDTO[],
  sortKey: MiembroSortKey,
  sortDirection: SortDirection,
): MiembroProyectoResumenDTO[] {
  const factor = sortDirection === 'asc' ? 1 : -1;
  const obtenerValor = VALOR_ORDENABLE[sortKey];

  return [...miembros].sort((a, b) => {
    const valorA = obtenerValor(a);
    const valorB = obtenerValor(b);
    if (typeof valorA === 'number' && typeof valorB === 'number') {
      return (valorA - valorB) * factor;
    }
    return String(valorA).localeCompare(String(valorB), 'es') * factor;
  });
}
