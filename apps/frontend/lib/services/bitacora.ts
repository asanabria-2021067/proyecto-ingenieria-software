import { apiFetch } from '@/lib/api/client';
import type { BitacoraPaginadaDto, FiltrosBitacora } from '@/lib/types/bitacora';

function buildQueryString(filtros: FiltrosBitacora): string {
  const params = new URLSearchParams();
  if (filtros.idSprint !== undefined) params.set('idSprint', String(filtros.idSprint));
  if (filtros.idActor !== undefined) params.set('idActor', String(filtros.idActor));
  if (filtros.tipoEvento !== undefined) params.set('tipoEvento', filtros.tipoEvento);
  if (filtros.page !== undefined) params.set('page', String(filtros.page));
  if (filtros.limit !== undefined) params.set('limit', String(filtros.limit));
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** T-164 — `GET /proyectos/:id/bitacora`, exclusivo del líder (BitacoraConsultaService.listEventos). */
export function getProjectBitacora(
  idProyecto: number,
  filtros: FiltrosBitacora = {},
): Promise<BitacoraPaginadaDto> {
  return apiFetch<BitacoraPaginadaDto>(`/proyectos/${idProyecto}/bitacora${buildQueryString(filtros)}`);
}
