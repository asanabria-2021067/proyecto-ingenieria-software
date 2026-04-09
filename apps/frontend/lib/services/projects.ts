import { apiFetch } from '@/lib/api/client';
import type { ProyectoDetalleDTO, ProyectoListItemDTO } from '@/lib/dto/project.dto';

export async function getProjectById(id: number): Promise<ProyectoDetalleDTO> {
  return apiFetch<ProyectoDetalleDTO>(`/proyectos/${id}`);
}

export async function searchProjects(q: string): Promise<ProyectoListItemDTO[]> {
  const params = q ? `?q=${encodeURIComponent(q)}` : '';
  return apiFetch<ProyectoListItemDTO[]>(`/proyectos${params}`);
}
