import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api/client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '../lib/api/client';
import {
  attachLabelToTask,
  createLabel,
  deleteLabel,
  detachLabelFromTask,
  getProjectLabels,
  updateLabel,
} from '../lib/services/labels';

function lastCall() {
  const calls = (apiFetch as any).mock.calls;
  return calls[calls.length - 1];
}

describe('lib/services/labels', () => {
  it('getProjectLabels: GET /proyectos/:id/etiquetas', async () => {
    (apiFetch as any).mockResolvedValue([]);
    await getProjectLabels(7);
    expect(lastCall()[0]).toBe('/proyectos/7/etiquetas');
  });

  it('createLabel: POST con body exacto sin normalizar el nombre', async () => {
    (apiFetch as any).mockResolvedValue({ idEtiqueta: 1 });
    const input = { nombreEtiqueta: '  Backend  ', color: '#FF0000' };
    await createLabel(7, input);
    expect(lastCall()[0]).toBe('/proyectos/7/etiquetas');
    expect(lastCall()[1]).toEqual({ method: 'POST', body: JSON.stringify(input) });
  });

  it('updateLabel: PATCH /proyectos/:id/etiquetas/:labelId', async () => {
    (apiFetch as any).mockResolvedValue({ idEtiqueta: 1 });
    await updateLabel(7, 1, { color: '#00FF00' });
    expect(lastCall()[0]).toBe('/proyectos/7/etiquetas/1');
    expect(lastCall()[1]).toEqual({ method: 'PATCH', body: JSON.stringify({ color: '#00FF00' }) });
  });

  it('deleteLabel: DELETE resuelve 204 sin cuerpo', async () => {
    (apiFetch as any).mockResolvedValue(undefined);
    const result = await deleteLabel(7, 1);
    expect(lastCall()[0]).toBe('/proyectos/7/etiquetas/1');
    expect(lastCall()[1]).toEqual({ method: 'DELETE' });
    expect(result).toBeUndefined();
  });

  it('attachLabelToTask: PUT /tareas/:taskId/etiquetas/:labelId, 204 sin cuerpo', async () => {
    (apiFetch as any).mockResolvedValue(undefined);
    const result = await attachLabelToTask(7, 3, 1);
    expect(lastCall()[0]).toBe('/proyectos/7/tareas/3/etiquetas/1');
    expect(lastCall()[1]).toEqual({ method: 'PUT' });
    expect(result).toBeUndefined();
  });

  it('detachLabelFromTask: DELETE /tareas/:taskId/etiquetas/:labelId, 204 sin cuerpo', async () => {
    (apiFetch as any).mockResolvedValue(undefined);
    const result = await detachLabelFromTask(7, 3, 1);
    expect(lastCall()[0]).toBe('/proyectos/7/tareas/3/etiquetas/1');
    expect(lastCall()[1]).toEqual({ method: 'DELETE' });
    expect(result).toBeUndefined();
  });

  it('propaga intacto un 409 por nombre duplicado', async () => {
    const conflict = Object.assign(new Error('Ya existe una etiqueta con ese nombre en el proyecto'), {
      statusCode: 409,
    });
    (apiFetch as any).mockRejectedValue(conflict);
    await expect(createLabel(7, { nombreEtiqueta: 'dup', color: '#000000' })).rejects.toBe(conflict);
  });
});
