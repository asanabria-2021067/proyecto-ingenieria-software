import { apiFetch } from '@/lib/api/client';
import type {
  ApelacionItemDto,
  CreateLeadershipAppealInput,
  LeadershipCandidatesDto,
  LeadershipContextDto,
  LeadershipHistoryItemDto,
  PaginaLiderazgo,
} from '@/lib/types/leadership';

// ─── Parte PARTICIPANTE (VIEW-06 / VIEW-07 / VIEW-17) ─────────────────────────

/** E093 — foto del liderazgo actual; leer no crea nada. */
export function getLeadershipContext(idProyecto: number): Promise<LeadershipContextDto> {
  return apiFetch<LeadershipContextDto>(`/proyectos/${idProyecto}/liderazgo/contexto`);
}

/** E094 — sucesores posibles, anotados con hechos objetivos y SIN ranking. */
export function getLeadershipCandidates(idProyecto: number): Promise<LeadershipCandidatesDto> {
  return apiFetch<LeadershipCandidatesDto>(`/proyectos/${idProyecto}/liderazgo/candidatos`);
}

/** E095 — historial de liderazgo del proyecto, paginado. */
export function getLeadershipHistory(
  idProyecto: number,
  page = 1,
  limit = 20,
): Promise<PaginaLiderazgo<LeadershipHistoryItemDto>> {
  return apiFetch<PaginaLiderazgo<LeadershipHistoryItemDto>>(
    `/proyectos/${idProyecto}/liderazgo/historial?page=${page}&limit=${limit}`,
  );
}

/** E096 — apelaciones del proyecto; `estado` acota, nunca amplía la audiencia. */
export function getLeadershipAppeals(
  idProyecto: number,
  options: { estado?: string; page?: number; limit?: number } = {},
): Promise<PaginaLiderazgo<ApelacionItemDto>> {
  const params = new URLSearchParams();
  params.set('page', String(options.page ?? 1));
  params.set('limit', String(options.limit ?? 20));
  if (options.estado) params.set('estado', options.estado);
  return apiFetch<PaginaLiderazgo<ApelacionItemDto>>(
    `/proyectos/${idProyecto}/liderazgo/apelaciones?${params.toString()}`,
  );
}

// ─── Apelación del líder (VIEW-17, F009) ─────────────────────────────────────

/** E097 — el líder actual solicita que se transfiera su liderazgo. Los TRES campos son obligatorios. */
export function createLeadershipAppeal(
  idProyecto: number,
  input: CreateLeadershipAppealInput,
): Promise<ApelacionItemDto> {
  return apiFetch<ApelacionItemDto>(`/proyectos/${idProyecto}/liderazgo/apelaciones`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** E098 — el autor retira su propia apelación mientras siga liderando. */
export function cancelLeadershipAppeal(idProyecto: number, idApelacion: number): Promise<ApelacionItemDto> {
  return apiFetch<ApelacionItemDto>(`/proyectos/${idProyecto}/liderazgo/apelaciones/${idApelacion}/cancelar`, {
    method: 'POST',
  });
}
