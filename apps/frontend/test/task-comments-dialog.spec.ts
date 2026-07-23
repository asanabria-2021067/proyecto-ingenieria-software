import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 1 } }),
}));

vi.mock('../lib/services/task-comments', () => ({
  getComentariosTarea: vi.fn(),
  crearComentarioTarea: vi.fn(),
  eliminarComentarioTarea: vi.fn(),
}));

import { TaskCommentsDialog } from '../components/projects/task-comments-dialog';
import { getComentariosTarea, crearComentarioTarea, eliminarComentarioTarea } from '../lib/services/task-comments';
import { projectTasksQueryKey, taskCommentsQueryKey } from '../lib/query-keys/tasks';
import type { TareaDTO } from '../lib/dto/project.dto';

// Defecto preexistente de la Tarea 36 (fixture incompleto para TareaDTO,
// invisible en tiempo de ejecución pero detectado por `tsc --noEmit`):
// corregido aquí como parte del baseline de typecheck de la Tarea 37.
const tarea: TareaDTO = {
  idTarea: 55,
  idHito: null,
  tituloTarea: 'Revisar PR',
  descripcionTarea: null,
  estadoTarea: 'POR_HACER',
  prioridad: 'MEDIA',
  fechaLimite: null,
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

describe('TaskCommentsDialog — integración de caché (Tarea 36)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('consulta los comentarios con taskCommentsQueryKey(idProyecto, idTarea)', async () => {
    (getComentariosTarea as any).mockResolvedValue([]);
    const { wrapper, queryClient } = createWrapper();

    render(
      createElement(TaskCommentsDialog, {
        tarea,
        idProyecto: 7,
        open: true,
        onOpenChange: () => {},
      }),
      { wrapper },
    );

    await waitFor(() =>
      expect(queryClient.getQueryState(taskCommentsQueryKey(7, 55))).toBeDefined(),
    );
    expect(getComentariosTarea).toHaveBeenCalledWith(7, 55);
  });

  it('crear comentario exitoso invalida comentarios y project-tasks', async () => {
    (getComentariosTarea as any).mockResolvedValue([]);
    (crearComentarioTarea as any).mockResolvedValue({ idComentario: 1 });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      createElement(TaskCommentsDialog, {
        tarea,
        idProyecto: 7,
        open: true,
        onOpenChange: () => {},
      }),
      { wrapper },
    );

    const textarea = await screen.findByPlaceholderText('Escribe un comentario...');
    fireEvent.change(textarea, { target: { value: 'hola equipo' } });
    fireEvent.click(screen.getByRole('button', { name: /comentar/i }));

    await waitFor(() => expect(crearComentarioTarea).toHaveBeenCalledWith(7, 55, 'hola equipo'));
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: taskCommentsQueryKey(7, 55) });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectTasksQueryKey(7) });
    });
  });

  it('eliminar comentario exitoso invalida comentarios y project-tasks', async () => {
    (getComentariosTarea as any).mockResolvedValue([
      {
        idComentario: 9,
        idAutor: 1,
        contenido: 'mi comentario',
        creadoEn: '2026-01-01T00:00:00.000Z',
        editadoEn: null,
        autor: { idUsuario: 1, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
      },
    ]);
    (eliminarComentarioTarea as any).mockResolvedValue({ idComentario: 9 });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      createElement(TaskCommentsDialog, {
        tarea,
        idProyecto: 7,
        open: true,
        onOpenChange: () => {},
      }),
      { wrapper },
    );

    const deleteBtn = await screen.findByRole('button', { name: /eliminar comentario/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => expect(eliminarComentarioTarea).toHaveBeenCalledWith(7, 55, 9));
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: taskCommentsQueryKey(7, 55) });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectTasksQueryKey(7) });
    });
  });

  it('un fallo al crear no invalida como éxito', async () => {
    (getComentariosTarea as any).mockResolvedValue([]);
    (crearComentarioTarea as any).mockRejectedValue(new Error('403'));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      createElement(TaskCommentsDialog, {
        tarea,
        idProyecto: 7,
        open: true,
        onOpenChange: () => {},
      }),
      { wrapper },
    );

    const textarea = await screen.findByPlaceholderText('Escribe un comentario...');
    fireEvent.change(textarea, { target: { value: 'hola' } });
    fireEvent.click(screen.getByRole('button', { name: /comentar/i }));

    await waitFor(() => expect(crearComentarioTarea).toHaveBeenCalledTimes(1));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('nunca invalida con las claves genéricas antiguas', async () => {
    (getComentariosTarea as any).mockResolvedValue([]);
    (crearComentarioTarea as any).mockResolvedValue({ idComentario: 1 });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      createElement(TaskCommentsDialog, {
        tarea,
        idProyecto: 7,
        open: true,
        onOpenChange: () => {},
      }),
      { wrapper },
    );

    const textarea = await screen.findByPlaceholderText('Escribe un comentario...');
    fireEvent.change(textarea, { target: { value: 'hola' } });
    fireEvent.click(screen.getByRole('button', { name: /comentar/i }));

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
    for (const call of invalidateSpy.mock.calls) {
      const key = (call[0] as { queryKey: unknown[] }).queryKey;
      expect(key).not.toEqual(['project', 7]);
      expect(key[0]).not.toBe('tarea-comentarios');
      expect(key[0]).not.toBe('tasks');
      expect(key[0]).not.toBe('tareas');
    }
  });
});
