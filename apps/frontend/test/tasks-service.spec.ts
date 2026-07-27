import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api/client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '../lib/api/client';
import {
  assignTask,
  createTask,
  deleteTask,
  getProjectTask,
  getProjectTasks,
  unassignTask,
  updateTask,
  updateTaskEstado,
} from '../lib/services/tasks';

function lastCall() {
  const calls = (apiFetch as any).mock.calls;
  return calls[calls.length - 1];
}

describe('lib/services/tasks', () => {
  it('getProjectTasks: GET /proyectos/:id/tareas', async () => {
    (apiFetch as any).mockResolvedValue([]);
    const result = await getProjectTasks(7);
    expect(lastCall()[0]).toBe('/proyectos/7/tareas');
    expect(lastCall()[1]).toBeUndefined();
    expect(result).toEqual([]);
  });

  it('getProjectTask: GET /proyectos/:id/tareas/:taskId', async () => {
    (apiFetch as any).mockResolvedValue({ idTarea: 3 });
    await getProjectTask(7, 3);
    expect(lastCall()[0]).toBe('/proyectos/7/tareas/3');
  });

  it('createTask: POST con body exacto, sin projectId/taskId', async () => {
    (apiFetch as any).mockResolvedValue({ idTarea: 1 });
    const input = { tituloTarea: 'x', fechaLimite: '2030-01-01', prioridad: 'ALTA' as const };
    await createTask(7, input);
    expect(lastCall()[0]).toBe('/proyectos/7/tareas');
    expect(lastCall()[1]).toEqual({ method: 'POST', body: JSON.stringify(input) });
  });

  it('updateTask: PATCH con body exacto', async () => {
    (apiFetch as any).mockResolvedValue({ idTarea: 3 });
    const input = { tituloTarea: 'nuevo', idHito: null };
    await updateTask(7, 3, input);
    expect(lastCall()[0]).toBe('/proyectos/7/tareas/3');
    expect(lastCall()[1]).toEqual({ method: 'PATCH', body: JSON.stringify(input) });
  });

  it('updateTaskEstado: PATCH /estado', async () => {
    (apiFetch as any).mockResolvedValue({ idTarea: 3 });
    await updateTaskEstado(7, 3, { estadoTarea: 'EN_PROGRESO' });
    expect(lastCall()[0]).toBe('/proyectos/7/tareas/3/estado');
    expect(lastCall()[1]).toEqual({ method: 'PATCH', body: JSON.stringify({ estadoTarea: 'EN_PROGRESO' }) });
  });

  it('assignTask: POST /asignar', async () => {
    (apiFetch as any).mockResolvedValue({ idTarea: 3 });
    await assignTask(7, 3, { idUsuario: 9 });
    expect(lastCall()[0]).toBe('/proyectos/7/tareas/3/asignar');
    expect(lastCall()[1]).toEqual({ method: 'POST', body: JSON.stringify({ idUsuario: 9 }) });
  });

  it('unassignTask: DELETE /asignar resuelve 204 sin cuerpo', async () => {
    (apiFetch as any).mockResolvedValue(undefined);
    const result = await unassignTask(7, 3);
    expect(lastCall()[0]).toBe('/proyectos/7/tareas/3/asignar');
    expect(lastCall()[1]).toEqual({ method: 'DELETE' });
    expect(result).toBeUndefined();
  });

  it('deleteTask: DELETE /proyectos/:id/tareas/:taskId resuelve 204 sin cuerpo', async () => {
    (apiFetch as any).mockResolvedValue(undefined);
    const result = await deleteTask(7, 3);
    expect(lastCall()[0]).toBe('/proyectos/7/tareas/3');
    expect(lastCall()[1]).toEqual({ method: 'DELETE' });
    expect(result).toBeUndefined();
  });

  it('propaga el error enriquecido de apiFetch sin sustituirlo', async () => {
    const enriched = Object.assign(new Error('a, b'), { statusCode: 400, details: ['a', 'b'] });
    (apiFetch as any).mockRejectedValue(enriched);
    await expect(getProjectTasks(7)).rejects.toBe(enriched);
  });

  it('no llama ninguna ruta antigua sin contextualizar por proyecto', async () => {
    (apiFetch as any).mockResolvedValue([]);
    await getProjectTasks(7);
    await getProjectTask(7, 3);
    for (const call of (apiFetch as any).mock.calls) {
      expect(call[0]).toMatch(/^\/proyectos\/7\/tareas/);
    }
  });
});
