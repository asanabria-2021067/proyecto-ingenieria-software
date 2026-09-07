import { apiFetch } from '@/lib/api/client';
import type {
  ApelacionItemDto,
  CreateLeadershipAppealInput,
  DenyAppealInput,
  LeadershipCandidatesDto,
  LeadershipContextDto,
  LeadershipHistoryItemDto,
  PaginaLiderazgo,
  TransferLeadershipInput,
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

// ─── Parte ADMINISTRADOR (VIEW-19, F014) ─────────────────────────────────────

/**
 * E102 — cambio administrativo directo. `expectedLeaderId` es el testigo de
 * concurrencia (CAS): si el líder ya cambió, el backend responde 409 y la UI
 * debe refrescar el contexto; nunca reintentar automáticamente.
 */
export function transferLeadership(idProyecto: number, input: TransferLeadershipInput): Promise<unknown> {
  return apiFetch<unknown>(`/admin/proyectos/${idProyecto}/liderazgo/cambiar`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ─── Bandeja administrativa de apelaciones (VIEW-18, F015) ───────────────────

/** E099 — bandeja global de apelaciones; `estado` acota, nunca amplía. */
export function getAdminAppeals(
  options: { estado?: string; page?: number; limit?: number } = {},
): Promise<PaginaLiderazgo<ApelacionItemDto>> {
  const params = new URLSearchParams();
  params.set('page', String(options.page ?? 1));
  params.set('limit', String(options.limit ?? 20));
  if (options.estado) params.set('estado', options.estado);
  return apiFetch<PaginaLiderazgo<ApelacionItemDto>>(`/admin/liderazgo/apelaciones?${params.toString()}`);
}

/**
 * E100 — aceptar la apelación por el MISMO motor que el cambio directo:
 * exige el `TransferLeadershipDto` completo, incluido `expectedLeaderId`.
 */
export function acceptAppeal(idProyecto: number, idApelacion: number, input: TransferLeadershipInput): Promise<unknown> {
  return apiFetch<unknown>(`/admin/proyectos/${idProyecto}/liderazgo/apelaciones/${idApelacion}/aceptar`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** E101 — denegar con `mensajeResolucion` (no `motivo`), sin tocar el liderazgo. */
export function denyAppeal(idProyecto: number, idApelacion: number, input: DenyAppealInput): Promise<unknown> {
  return apiFetch<unknown>(`/admin/proyectos/${idProyecto}/liderazgo/apelaciones/${idApelacion}/denegar`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
