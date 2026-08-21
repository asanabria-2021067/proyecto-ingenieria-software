'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { projectMemberDetailQueryKey } from '@/lib/query-keys/members';
import type { DetalleIntegranteProyectoDTO } from '@/lib/dto/member-detail.dto';

function isValidId(id: number): boolean {
  return Number.isInteger(id) && id > 0;
}

/**
 * `GET /proyectos/:id/equipo/:idUsuario` — exclusivo del líder del proyecto
 * (guard de liderazgo sobre quien consulta, de membresía sobre `idUsuario`).
 * Un 403/404 del backend se refleja en `isError`/`error`; la página consumidora
 * decide cómo mostrarlo, este hook no lo reinterpreta.
 */
export function useProjectMemberDetail(idProyecto: number, idUsuario: number) {
  const enabled = isValidId(idProyecto) && isValidId(idUsuario);

  return useQuery<DetalleIntegranteProyectoDTO>({
    queryKey: projectMemberDetailQueryKey(idProyecto, idUsuario),
    queryFn: () =>
      apiFetch<DetalleIntegranteProyectoDTO>(`/proyectos/${idProyecto}/equipo/${idUsuario}`),
    enabled,
    retry: false,
  });
}
