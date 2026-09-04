'use client';

import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectDetail } from '@/hooks/use-project-detail';

/**
 * Deriva el liderazgo del usuario identificado vía la cookie JWT httpOnly
 * (`useCurrentUser` -> `GET /users/me`, autenticado por esa cookie —
 * `apiFetch` la adjunta con `credentials: 'include'`), comparado contra
 * `Proyecto.creadoPor` (`useProjectDetail`). No existe un rol/tabla
 * distinta de "líder" en el backend (mismo criterio que
 * `TasksContextService.assertProjectLeader`), así que esta es la única
 * fuente de verdad de "isLeader" en el frontend — mismo patrón que
 * `useIsAdmin` (hooks/use-current-user.ts). Reutilizado por `ProjectSidebar`
 * y las pantallas exclusivas del líder (Sprints, Miembros, Bitácora) en vez
 * de repetir la comparación en cada una.
 */
export function useIsProjectLeader(idProyecto: number): boolean {
  const { data: currentUser } = useCurrentUser();
  const { data: proyecto } = useProjectDetail(idProyecto);
  return !!currentUser && !!proyecto && currentUser.idUsuario === proyecto.creador.idUsuario;
}
