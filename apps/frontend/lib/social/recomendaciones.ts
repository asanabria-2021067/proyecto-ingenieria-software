import type { UsuarioBusquedaDto } from '@/lib/types/social';

export type MotivoRecomendacion = Pick<UsuarioBusquedaDto, 'amigosEnComun' | 'mismaCarrera'>;

export function formatMotivoRecomendacion({ amigosEnComun, mismaCarrera }: MotivoRecomendacion): string {
  const partes: string[] = [];

  if (amigosEnComun > 0) {
    partes.push(amigosEnComun === 1 ? '1 amigo en común' : `${amigosEnComun} amigos en común`);
  }

  if (mismaCarrera) {
    partes.push('de tu carrera');
  }

  return partes.join(' · ');
}

export function seleccionarRecomendaciones(
  items: UsuarioBusquedaDto[],
  limite = 6,
): UsuarioBusquedaDto[] {
  return items
    .filter((u) => !u.esAmigo && !u.solicitudPendiente)
    .sort((a, b) => b.amigosEnComun - a.amigosEnComun || Number(b.mismaCarrera) - Number(a.mismaCarrera))
    .slice(0, limite);
}
