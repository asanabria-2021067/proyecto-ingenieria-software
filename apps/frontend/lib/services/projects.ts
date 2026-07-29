import { apiFetch } from '@/lib/api/client';
import type {
  ProyectoDetalleDTO,
  ProyectoListItemDTO,
  MiProyectoListItemDTO,
  AvanceProyectoDTO,
  RevisionProyectoDTO,
  CreateProjectPayload,
  CreateHitoPayload,
  HitoDTO,
  ResolverRevisionPayload,
} from '@/lib/dto/project.dto';

export async function getProjectById(id: number): Promise<ProyectoDetalleDTO> {
  return apiFetch<ProyectoDetalleDTO>(`/proyectos/${id}`);
}

/**
 * % de avance del proyecto (hitos y tareas). El backend responde 403 si quien
 * consulta no es el líder ni un participante activo del proyecto.
 */
export async function getProjectAvance(id: number): Promise<AvanceProyectoDTO> {
  return apiFetch<AvanceProyectoDTO>(`/proyectos/${id}/avance`);
}

export async function getAdminProjectById(id: number): Promise<ProyectoDetalleDTO> {
  return apiFetch<ProyectoDetalleDTO>(`/proyectos/${id}/admin`);
}

export async function searchProjects(q: string): Promise<ProyectoListItemDTO[]> {
  const params = q ? `?q=${encodeURIComponent(q)}` : '';
  return apiFetch<ProyectoListItemDTO[]>(`/proyectos${params}`);
}

export interface PaginatedProyectosResult {
  data: ProyectoListItemDTO[];
  total: number;
  page: number;
  totalPages: number;
}

export async function getProjectsPaginated(opts: {
  page?: number;
  limit?: number;
  q?: string;
  tipoProyecto?: string;
  modalidad?: string;
}): Promise<PaginatedProyectosResult> {
  const params = new URLSearchParams({
    page: String(opts.page ?? 1),
    limit: String(opts.limit ?? 12),
  });
  if (opts.q) params.set('q', opts.q);
  if (opts.tipoProyecto) params.set('tipoProyecto', opts.tipoProyecto);
  if (opts.modalidad) params.set('modalidad', opts.modalidad);
  return apiFetch<PaginatedProyectosResult>(`/proyectos?${params.toString()}`);
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
    proyecto: { tituloProyecto: string; creadoPor: number; creador: { nombre: string; apellido: string } };
  }>;
  cierresPendientes: Array<{
    idProyecto: number;
    tituloProyecto: string;
    creadoPor: number;
    fechaActualizacion: string | null;
  }>;
  correccionesEnviadas: Array<{
    idProyecto: number;
    tituloProyecto: string;
    creador: { nombre: string; apellido: string };
    revisiones: Array<{ idRevisionProyecto: number; numeroEnvio: number; revisadaEn: string | null }>;
  }>;
}> {
  return apiFetch('/revisiones/admin/bandeja');
}

export async function deleteProject(id: number): Promise<{ mensaje: string }> {
  return apiFetch(`/proyectos/${id}`, { method: 'DELETE' });
}

export async function createHito(idProyecto: number, payload: CreateHitoPayload): Promise<HitoDTO> {
  return apiFetch<HitoDTO>(`/proyectos/${idProyecto}/hitos`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
