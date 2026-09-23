import { apiFetch } from '@/lib/api/client';
import type { GlobalSearchResponseDTO } from '@/lib/dto/global-search.dto';

export async function searchGlobal(q: string): Promise<GlobalSearchResponseDTO> {
  return apiFetch<GlobalSearchResponseDTO>(`/busqueda?q=${encodeURIComponent(q)}`);
}
