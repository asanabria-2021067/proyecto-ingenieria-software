import { apiFetch } from '@/lib/api/client';

/**
 * Capa de servicio de roles/participación (ampliación, Secciones 6/8/9/10).
 * Refleja el contrato real del `RolesController`
 * (apps/backend/src/roles/roles.controller.ts), montado en
 * `proyectos/:projectId/roles`. Mismo patrón que `lib/services/labels.ts`.
 */

export type NivelHabilidad = 'BASICO' | 'INTERMEDIO' | 'AVANZADO' | 'EXPERTO';

export interface RoleRequisitoDTO {
  idHabilidad: number;
  nombreHabilidad: string;
  nivelMinimo: string;
  obligatorio: boolean;
}

/** Forma devuelta por `GET /proyectos/:id/roles` para cada rol (con stats + banderas). */
export interface ProjectRoleDTO {
  idRolProyecto: number;
  nombreRol: string;
  descripcionRolProyecto: string | null;
  idCarreraRequerida: number | null;
  carreraRequerida: { idCarrera: number; nombreCarrera: string } | null;
  cupos: number;
  horasSemanalesEstimadas: number | null;
  requisitos: RoleRequisitoDTO[];
  participantesActivos: number;
  cuposDisponibles: number;
  isMine: boolean;
  canLeave: boolean;
}

export interface ProjectRolesResponse {
  isLeader: boolean;
  roles: ProjectRoleDTO[];
}

export interface RoleRequisitoInput {
  idHabilidad: number;
  nivelMinimo: NivelHabilidad;
  obligatorio: boolean;
}

/** Body de `POST /proyectos/:id/roles` — equivalente a `CreateRoleDto`. */
export interface CreateRoleInput {
  nombreRol: string;
  descripcionRolProyecto?: string | null;
  idCarreraRequerida?: number | null;
  cupos: number;
  horasSemanalesEstimadas?: number | null;
  requisitos?: RoleRequisitoInput[];
}

/** Body de `PATCH /proyectos/:id/roles/:roleId` — equivalente a `UpdateRoleDto`. */
export type UpdateRoleInput = Partial<CreateRoleInput>;

export interface SelfAssignResult {
  idParticipacion: number;
  idRolProyecto: number;
  estadoParticipacion: 'ACTIVO';
  yaParticipaba: boolean;
}

export interface LeaveRoleResult {
  idRolProyecto: number;
  estadoParticipacion: 'RETIRADO';
  tareasDesasignadas: number;
}

export function getProjectRoles(idProyecto: number): Promise<ProjectRolesResponse> {
  return apiFetch<ProjectRolesResponse>(`/proyectos/${idProyecto}/roles`);
}

export function createProjectRole(idProyecto: number, input: CreateRoleInput): Promise<ProjectRoleDTO> {
  return apiFetch<ProjectRoleDTO>(`/proyectos/${idProyecto}/roles`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateProjectRole(
  idProyecto: number,
  roleId: number,
  input: UpdateRoleInput,
): Promise<ProjectRoleDTO> {
  return apiFetch<ProjectRoleDTO>(`/proyectos/${idProyecto}/roles/${roleId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteProjectRole(
  idProyecto: number,
  roleId: number,
): Promise<{ idRolProyecto: number; eliminado: boolean }> {
  return apiFetch(`/proyectos/${idProyecto}/roles/${roleId}`, { method: 'DELETE' });
}

/** Autoasignación del líder (Sección 6): "Asignarme a este rol". */
export function selfAssignRole(idProyecto: number, roleId: number): Promise<SelfAssignResult> {
  return apiFetch<SelfAssignResult>(`/proyectos/${idProyecto}/roles/${roleId}/participacion`, {
    method: 'POST',
  });
}

/** Retiro limitado (Sección 10): "Salir de este rol". */
export function leaveRole(idProyecto: number, roleId: number): Promise<LeaveRoleResult> {
  return apiFetch<LeaveRoleResult>(`/proyectos/${idProyecto}/roles/${roleId}/participacion`, {
    method: 'DELETE',
  });
}
