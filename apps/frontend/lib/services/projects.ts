import { apiFetch } from '@/lib/api/client';
import type {
  ProyectoDetalleDTO,
  ProyectoListItemDTO,
  MiProyectoListItemDTO,
  RevisionProyectoDTO,
  CreateProjectPayload,
  ResolverRevisionPayload,
} from '@/lib/dto/project.dto';

export async function getProjectById(id: number): Promise<ProyectoDetalleDTO> {
  return apiFetch<ProyectoDetalleDTO>(`/proyectos/${id}`);
}

export async function searchProjects(q: string): Promise<ProyectoListItemDTO[]> {
  const params = q ? `?q=${encodeURIComponent(q)}` : '';
  return apiFetch<ProyectoListItemDTO[]>(`/proyectos${params}`);
}

export async function getMyProjectById(id: number): Promise<ProyectoDetalleDTO> {
  return apiFetch<ProyectoDetalleDTO>(`/proyectos/${id}/owner`);
}

/** Lista todos mis proyectos (todos los estados). Requiere JWT. */
export async function getMyProjects(): Promise<MiProyectoListItemDTO[]> {
  return apiFetch<MiProyectoListItemDTO[]>('/proyectos/mine');
}

/** Lista proyectos donde participo activamente o históricamente. */
export async function getContributorProjects(): Promise<MiProyectoListItemDTO[]> {
  return apiFetch<MiProyectoListItemDTO[]>('/proyectos/contributor');
}

export async function createProject(
  payload: CreateProjectPayload,
): Promise<{ idProyecto: number; estadoProyecto: string; tituloProyecto: string }> {
  return apiFetch('/proyectos', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateProject(
  id: number,
  payload: Partial<CreateProjectPayload>,
): Promise<{ idProyecto: number; estadoProyecto: string }> {
  return apiFetch(`/proyectos/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function submitProjectForReview(
  id: number,
): Promise<{ idProyecto: number; estadoProyecto: string }> {
  return apiFetch(`/proyectos/${id}/enviar-revision`, { method: 'POST' });
}

export async function resubmitProject(
  id: number,
): Promise<{ idProyecto: number; estadoProyecto: string; numeroEnvio: number }> {
  return apiFetch(`/proyectos/${id}/reenviar`, { method: 'POST' });
}

export async function requestProjectClosure(
  id: number,
): Promise<{ idProyecto: number; estadoProyecto: string }> {
  return apiFetch(`/proyectos/${id}/solicitar-cierre`, { method: 'POST' });
}

export async function approveProjectClosure(
  id: number,
): Promise<{ idProyecto: number; estadoProyecto: string }> {
  return apiFetch(`/proyectos/${id}/aprobar-cierre`, { method: 'POST' });
}

export async function rejectProjectClosure(
  id: number,
): Promise<{ idProyecto: number; estadoProyecto: string }> {
  return apiFetch(`/proyectos/${id}/rechazar-cierre`, { method: 'POST' });
}

export async function getProjectRevisions(
  idProyecto: number,
): Promise<RevisionProyectoDTO[]> {
  return apiFetch<RevisionProyectoDTO[]>(`/revisiones/proyectos/${idProyecto}`);
}

export async function reclamarRevision(
  idProyecto: number,
): Promise<{ idRevisionProyecto: number; estadoRevision: string; idRevisor: number }> {
  return apiFetch(`/revisiones/proyectos/${idProyecto}/reclamar`, { method: 'POST' });
}

export async function resolverRevision(
  idProyecto: number,
  payload: ResolverRevisionPayload,
): Promise<{ revision: RevisionProyectoDTO; estadoProyecto: string }> {
  return apiFetch(`/revisiones/proyectos/${idProyecto}/resolver`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getAdminReviewInbox(): Promise<{
  revisionesPendientes: Array<{
    idRevisionProyecto: number;
    idProyecto: number;
    numeroEnvio: number;
    enviadaEn: string;
    idRevisor: number | null;
    proyecto: { tituloProyecto: string; creadoPor: number };
  }>;
  cierresPendientes: Array<{
    idProyecto: number;
    tituloProyecto: string;
    creadoPor: number;
    fechaActualizacion: string | null;
  }>;
}> {
  return apiFetch('/revisiones/admin/bandeja');
}
