'use client';

import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectMembers, type MiembroProyecto } from '@/hooks/use-project-members';
import { useCurrentExitRequest } from '@/hooks/use-exit-request';
import type { ProjectNavActor, ProjectNavContext } from './project-nav-model';

export interface ProjectNavState extends ProjectNavContext {
  tituloProyecto: string | null;
  currentUserId: number | null;
  /** Equipo activo del proyecto: el panel de chat de la sidebar lo necesita para abrir conversaciones. */
  members: MiembroProyecto[];
}

/**
 * HU-154 (T-215): resuelve una sola vez quién mira el proyecto y en qué
 * estado está, para que la sidebar (expandida o colapsada), la navegación
 * móvil y el menú de acciones decidan con los mismos datos.
 *
 * El liderazgo sale exclusivamente de Proyecto.creadoPor comparado con el
 * usuario de la cookie JWT (mismo criterio que hooks/use-is-project-leader.ts);
 * el líder puede además ocupar roles, pero sigue siendo `leader`.
 */
export function useProjectNavContext(idProyecto: number): ProjectNavState {
  const { data: currentUser } = useCurrentUser();
  const { data: proyecto } = useProjectDetail(idProyecto);
  const { members } = useProjectMembers(idProyecto);

  const currentUserId = currentUser?.idUsuario ?? null;
  const isLeader = currentUserId != null && proyecto != null && currentUserId === proyecto.creador.idUsuario;
  const esMiembro = currentUserId != null && members.some((m) => m.idUsuario === currentUserId);
  const actor: ProjectNavActor = isLeader ? 'leader' : esMiembro ? 'participant' : 'visitor';

  // Solo el participante puede tener una solicitud de salida propia.
  const { request: solicitudSalida } = useCurrentExitRequest(idProyecto, { habilitado: actor === 'participant' });

  return {
    idProyecto,
    actor,
    estadoProyecto: proyecto?.estadoProyecto,
    tieneSolicitudSalida: actor === 'participant' && solicitudSalida != null,
    tituloProyecto: proyecto?.tituloProyecto ?? null,
    currentUserId,
    members,
  };
}
