import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api/client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '../lib/api/client';
import {
  crearComentarioTarea,
  editarComentarioTarea,
  eliminarComentarioTarea,
  getComentariosTarea,
} from '../lib/services/task-comments';

function lastCall() {
  const calls = (apiFetch as any).mock.calls;
  return calls[calls.length - 1];
}

describe('lib/services/task-comments', () => {
  it('getComentariosTarea: GET anidado con projectId y taskId', async () => {
    (apiFetch as any).mockResolvedValue([]);
    await getComentariosTarea(7, 3);
    expect(lastCall()[0]).toBe('/proyectos/7/tareas/3/comentarios');
  });

  it('crearComentarioTarea: POST anidado, body sin idProyecto/idTarea', async () => {
    (apiFetch as any).mockResolvedValue({ idComentario: 1 });
    await crearComentarioTarea(7, 3, 'hola');
    expect(lastCall()[0]).toBe('/proyectos/7/tareas/3/comentarios');
    expect(lastCall()[1]).toEqual({ method: 'POST', body: JSON.stringify({ contenido: 'hola' }) });
  });

  it('editarComentarioTarea: PATCH anidado con commentId, body sin IDs contextuales', async () => {
    (apiFetch as any).mockResolvedValue({ idComentario: 5 });
    await editarComentarioTarea(7, 3, 5, 'editado');
    expect(lastCall()[0]).toBe('/proyectos/7/tareas/3/comentarios/5');
    expect(lastCall()[1]).toEqual({ method: 'PATCH', body: JSON.stringify({ contenido: 'editado' }) });
  });

  it('eliminarComentarioTarea: DELETE anidado, no responde 204 (devuelve el comentario)', async () => {
    const eliminado = { idComentario: 5, eliminadoEn: '2026-07-23T00:00:00.000Z' };
    (apiFetch as any).mockResolvedValue(eliminado);
    const result = await eliminarComentarioTarea(7, 3, 5);
    expect(lastCall()[0]).toBe('/proyectos/7/tareas/3/comentarios/5');
    expect(lastCall()[1]).toEqual({ method: 'DELETE' });
    expect(result).toEqual(eliminado);
  });

  it('propaga el error enriquecido de apiFetch', async () => {
    const enriched = Object.assign(new Error('No encontrado'), { statusCode: 404 });
    (apiFetch as any).mockRejectedValue(enriched);
    await expect(getComentariosTarea(7, 3)).rejects.toBe(enriched);
  });

  it('nunca llama a las rutas planas retiradas', async () => {
    (apiFetch as any).mockResolvedValue([]);
    await getComentariosTarea(7, 3);
    await crearComentarioTarea(7, 3, 'x');
    await editarComentarioTarea(7, 3, 5, 'y');
    await eliminarComentarioTarea(7, 3, 5);
    for (const call of (apiFetch as any).mock.calls) {
      const path = call[0] as string;
      expect(path.startsWith('/proyectos/7/tareas/3/comentarios')).toBe(true);
      expect(path.startsWith('/tareas/')).toBe(false);
      expect(path.startsWith('/comentarios/tarea/')).toBe(false);
    }
  });
});
