import { apiFetch } from '@/lib/api/client';

/**
 * Contrato público de etiqueta — refleja exactamente `LABEL_SELECT` en
 * apps/backend/src/labels/labels.service.ts. `nombreNormalizado` no forma
 * parte de la respuesta pública y no se expone aquí.
 */
export interface LabelDTO {
  idEtiqueta: number;
  nombreEtiqueta: string;
  color: string;
}

/** Body de `POST /proyectos/:projectId/etiquetas` — equivalente a `CreateLabelDto`. */
export interface CreateLabelInput {
  nombreEtiqueta: string;
  color: string;
}

/** Body de `PATCH /proyectos/:projectId/etiquetas/:labelId` — equivalente a `UpdateLabelDto`. */
export interface UpdateLabelInput {
  nombreEtiqueta?: string;
  color?: string;
}

export function getProjectLabels(idProyecto: number): Promise<LabelDTO[]> {
  return apiFetch<LabelDTO[]>(`/proyectos/${idProyecto}/etiquetas`);
}

export function createLabel(idProyecto: number, input: CreateLabelInput): Promise<LabelDTO> {
  return apiFetch<LabelDTO>(`/proyectos/${idProyecto}/etiquetas`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateLabel(
  idProyecto: number,
  idEtiqueta: number,
  input: UpdateLabelInput,
): Promise<LabelDTO> {
  return apiFetch<LabelDTO>(`/proyectos/${idProyecto}/etiquetas/${idEtiqueta}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteLabel(idProyecto: number, idEtiqueta: number): Promise<void> {
  return apiFetch<void>(`/proyectos/${idProyecto}/etiquetas/${idEtiqueta}`, {
    method: 'DELETE',
  });
}

export function attachLabelToTask(
  idProyecto: number,
  idTarea: number,
  idEtiqueta: number,
): Promise<void> {
  return apiFetch<void>(`/proyectos/${idProyecto}/tareas/${idTarea}/etiquetas/${idEtiqueta}`, {
    method: 'PUT',
  });
}

export function detachLabelFromTask(
  idProyecto: number,
  idTarea: number,
  idEtiqueta: number,
): Promise<void> {
  return apiFetch<void>(`/proyectos/${idProyecto}/tareas/${idTarea}/etiquetas/${idEtiqueta}`, {
    method: 'DELETE',
  });
}
