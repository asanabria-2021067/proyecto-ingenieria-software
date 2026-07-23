import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/services/tasks', () => ({
  getProjectTasks: vi.fn(),
  getProjectTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  updateTaskEstado: vi.fn(),
  assignTask: vi.fn(),
  unassignTask: vi.fn(),
  deleteTask: vi.fn(),
}));

vi.mock('../lib/services/labels', () => ({
  attachLabelToTask: vi.fn(),
  detachLabelFromTask: vi.fn(),
}));

import { useProjectTasks } from '../hooks/use-project-tasks';
import { projectTasksQueryKey } from '../lib/query-keys/tasks';
import {
  assignTask,
  createTask,
  deleteTask,
  getProjectTasks,
  unassignTask,
  updateTask,
  updateTaskEstado,
} from '../lib/services/tasks';
import { attachLabelToTask, detachLabelFromTask } from '../lib/services/labels';

// vitest.config.ts solo incluye `test/**/*.spec.ts` (no `.spec.tsx`); este
// archivo evita JSX deliberadamente (createElement) para no requerir
// modificar esa configuración, prohibido en el alcance de esta tarea.
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

describe('useProjectTasks', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('usa la query key canónica exacta', async () => {
    (getProjectTasks as any).mockResolvedValue([]);
    const { queryClient, wrapper } = createWrapper();
    renderHook(() => useProjectTasks(7), { wrapper });

    await waitFor(() => {
      expect(queryClient.getQueryState(projectTasksQueryKey(7))).toBeDefined();
    });
    expect(projectTasksQueryKey(7)).toEqual(['project-tasks', 7]);
  });

  it('consulta una sola vez con un projectId válido', async () => {
    (getProjectTasks as any).mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useProjectTasks(7), { wrapper });

    await waitFor(() => expect(getProjectTasks).toHaveBeenCalledTimes(1));
    expect(getProjectTasks).toHaveBeenCalledWith(7);
  });

  it('tasks por defecto es [] antes de que resuelva la query', () => {
    (getProjectTasks as any).mockReturnValue(new Promise(() => {}));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectTasks(7), { wrapper });

    expect(result.current.tasks).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('expone isError y error cuando la query falla', async () => {
    const boom = new Error('fallo de red');
    (getProjectTasks as any).mockRejectedValue(boom);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectTasks(7), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(boom);
  });

  it.each([0, -1, NaN])('un projectId inválido (%s) no consulta', async (idInvalido) => {
    (getProjectTasks as any).mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useProjectTasks(idInvalido), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getProjectTasks).not.toHaveBeenCalled();
  });

  it('expone las ocho mutations requeridas', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectTasks(7), { wrapper });

    expect(result.current.crearTarea).toBeDefined();
    expect(result.current.editarTarea).toBeDefined();
    expect(result.current.cambiarEstadoTarea).toBeDefined();
    expect(result.current.asignarTarea).toBeDefined();
    expect(result.current.desasignarTarea).toBeDefined();
    expect(result.current.eliminarTarea).toBeDefined();
    expect(result.current.asociarEtiqueta).toBeDefined();
    expect(result.current.retirarEtiqueta).toBeDefined();
  });

  it('editarTarea usa el projectId del hook y los argumentos exactos', async () => {
    (getProjectTasks as any).mockResolvedValue([]);
    (updateTask as any).mockResolvedValue({ idTarea: 3 });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectTasks(7), { wrapper });

    const input = { tituloTarea: 'nuevo' };
    result.current.editarTarea.mutate({ taskId: 3, input });

    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));
    expect(updateTask).toHaveBeenCalledWith(7, 3, input);
  });

  it('asignarTarea invalida project-tasks al éxito', async () => {
    (getProjectTasks as any).mockResolvedValue([]);
    (assignTask as any).mockResolvedValue({ idTarea: 3 });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useProjectTasks(7), { wrapper });

    result.current.asignarTarea.mutate({ taskId: 3, input: { idUsuario: 9 } });

    await waitFor(() => expect(assignTask).toHaveBeenCalledTimes(1));
    expect(assignTask).toHaveBeenCalledWith(7, 3, { idUsuario: 9 });
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectTasksQueryKey(7) }),
    );
  });

  it('una mutation fallida no invalida como éxito', async () => {
    (getProjectTasks as any).mockResolvedValue([]);
    (deleteTask as any).mockRejectedValue(new Error('403'));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useProjectTasks(7), { wrapper });

    await expect(result.current.eliminarTarea.mutateAsync({ taskId: 3 })).rejects.toThrow('403');
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('eliminarTarea invalida tareas y avance al éxito', async () => {
    (getProjectTasks as any).mockResolvedValue([]);
    (deleteTask as any).mockResolvedValue(undefined);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useProjectTasks(7), { wrapper });

    result.current.eliminarTarea.mutate({ taskId: 3 });

    await waitFor(() => expect(deleteTask).toHaveBeenCalledWith(7, 3));
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project-tasks', 7] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project-avance', 7] });
    });
  });

  it('asociarEtiqueta y retirarEtiqueta usan el projectId del hook e invalidan tareas', async () => {
    (getProjectTasks as any).mockResolvedValue([]);
    (attachLabelToTask as any).mockResolvedValue(undefined);
    (detachLabelFromTask as any).mockResolvedValue(undefined);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useProjectTasks(7), { wrapper });

    result.current.asociarEtiqueta.mutate({ taskId: 3, labelId: 1 });
    await waitFor(() => expect(attachLabelToTask).toHaveBeenCalledWith(7, 3, 1));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project-tasks', 7] }),
    );

    invalidateSpy.mockClear();
    result.current.retirarEtiqueta.mutate({ taskId: 3, labelId: 1 });
    await waitFor(() => expect(detachLabelFromTask).toHaveBeenCalledWith(7, 3, 1));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project-tasks', 7] }),
    );
  });
});
