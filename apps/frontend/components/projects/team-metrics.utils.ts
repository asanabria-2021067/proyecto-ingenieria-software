import type { ParticipacionActivaDTO } from '@/lib/dto/member.dto';

/**
 * Cuenta usuarios únicos, no filas: un mismo usuario con dos roles activos
 * aparece dos veces en `equipo` (una fila por participación), pero debe
 * contar como un solo integrante.
 */
export function contarIntegrantesActivos(equipo: ParticipacionActivaDTO[]): number {
  return new Set(equipo.map((p) => p.usuario.idUsuario)).size;
}

/**
 * Suma horasRegistradas por usuario único, no por fila: `findTeam` repite el
 * mismo total agregado del proyecto en cada participación de un mismo
 * usuario (ver comentario en ProjectsService.findTeam), así que sumar fila
 * por fila duplicaría las horas de quien tiene más de un rol activo.
 */
export function sumarHorasAcumuladas(equipo: ParticipacionActivaDTO[]): number {
  const horasPorUsuario = new Map<number, number>();
  for (const participacion of equipo) {
    horasPorUsuario.set(participacion.usuario.idUsuario, participacion.horasRegistradas);
  }
  return [...horasPorUsuario.values()].reduce((total, horas) => total + horas, 0);
}
