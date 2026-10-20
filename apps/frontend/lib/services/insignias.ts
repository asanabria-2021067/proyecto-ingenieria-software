import { apiFetch } from '@/lib/api/client';
import type { InsigniaDto } from '@/lib/types/insignias';

/** `GET /insignias/me` — las 7 insignias con el avance del usuario autenticado. */
export function getMisInsignias(): Promise<InsigniaDto[]> {
  return apiFetch<InsigniaDto[]>('/insignias/me');
}
