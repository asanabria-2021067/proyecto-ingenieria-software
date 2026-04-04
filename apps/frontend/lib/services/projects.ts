import apiClient from '@/lib/api/client';
import type { ProyectoDetalleDTO, ProyectoListItemDTO } from '@/lib/dto/project.dto';

export async function getProjectById(id: number): Promise<ProyectoDetalleDTO> {
  const { data } = await apiClient.get<ProyectoDetalleDTO>(`/proyectos/${id}`);
  return data;
}

export async function searchProjects(q: string): Promise<ProyectoListItemDTO[]> {
  const { data } = await apiClient.get<ProyectoListItemDTO[]>('/proyectos', {
    params: { q },
  });
  return data;
}
