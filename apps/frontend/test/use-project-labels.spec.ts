import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/services/labels', () => ({
  getProjectLabels: vi.fn(),
  createLabel: vi.fn(),
  updateLabel: vi.fn(),
  deleteLabel: vi.fn(),
}));

import { useProjectLabels, projectLabelsQueryKey } from '../hooks/use-project-labels';
import { projectTasksQueryKey } from '../lib/query-keys/tasks';
import {
  getProjectLabels,
  createLabel,
  updateLabel,
  deleteLabel,
} from '../lib/services/labels';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

describe('useProjectLabels', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('usa la query key exacta ["project-labels", idProyecto]', async () => {
    (getProjectLabels as any).mockResolvedValue([]);
    const { queryClient, wrapper } = createWrapper();
    renderHook(() => useProjectLabels(7), { wrapper });

    await waitFor(() => {
      expect(queryClient.getQueryState(projectLabelsQueryKey(7))).toBeDefined();
    });
    expect(projectLabelsQueryKey(7)).toEqual(['project-labels', 7]);
  });

  it('consulta con un idProyecto válido', async () => {
    (getProjectLabels as any).mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useProjectLabels(7), { wrapper });
    await waitFor(() => expect(getProjectLabels).toHaveBeenCalledWith(7));
  });

  it('un idProyecto inválido no consulta', async () => {
    (getProjectLabels as any).mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useProjectLabels(0), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getProjectLabels).not.toHaveBeenCalled();
  });

  it('expone el catálogo con valor por defecto []', () => {
    (getProjectLabels as any).mockReturnValue(new Promise(() => {}));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectLabels(7), { wrapper });
    expect(result.current.labels).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('createLabel llama al servicio con el projectId del hook', async () => {
    (getProjectLabels as any).mockResolvedValue([]);
    (createLabel as any).mockResolvedValue({ idEtiqueta: 1 });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectLabels(7), { wrapper });

    result.current.createLabel.mutate({ nombreEtiqueta: 'Urgente', color: '#FF0000' });
    await waitFor(() => expect(createLabel).toHaveBeenCalledWith(7, { nombreEtiqueta: 'Urgente', color: '#FF0000' }));
  });

  it('updateLabel llama al servicio con labelId e input', async () => {
    (getProjectLabels as any).mockResolvedValue([]);
    (updateLabel as any).mockResolvedValue({ idEtiqueta: 1 });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectLabels(7), { wrapper });

    result.current.updateLabel.mutate({ labelId: 3, input: { color: '#00FF00' } });
    await waitFor(() => expect(updateLabel).toHaveBeenCalledWith(7, 3, { color: '#00FF00' }));
  });

  it('deleteLabel llama al servicio con labelId', async () => {
    (getProjectLabels as any).mockResolvedValue([]);
    (deleteLabel as any).mockResolvedValue(undefined);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectLabels(7), { wrapper });

    result.current.deleteLabel.mutate({ labelId: 3 });
    await waitFor(() => expect(deleteLabel).toHaveBeenCalledWith(7, 3));
  });

  it('crear invalida project-labels (sin invalidar tareas)', async () => {
    (getProjectLabels as any).mockResolvedValue([]);
    (createLabel as any).mockResolvedValue({ idEtiqueta: 1 });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useProjectLabels(7), { wrapper });

    result.current.createLabel.mutate({ nombreEtiqueta: 'X', color: '#000000' });
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectLabelsQueryKey(7) }),
    );
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: projectTasksQueryKey(7) });
  });

  it('editar invalida project-labels y project-tasks', async () => {
    (getProjectLabels as any).mockResolvedValue([]);
    (updateLabel as any).mockResolvedValue({ idEtiqueta: 1 });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useProjectLabels(7), { wrapper });

    result.current.updateLabel.mutate({ labelId: 1, input: { color: '#111111' } });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectLabelsQueryKey(7) });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectTasksQueryKey(7) });
    });
  });

  it('eliminar invalida project-labels y project-tasks', async () => {
    (getProjectLabels as any).mockResolvedValue([]);
    (deleteLabel as any).mockResolvedValue(undefined);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useProjectLabels(7), { wrapper });

    result.current.deleteLabel.mutate({ labelId: 1 });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectLabelsQueryKey(7) });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectTasksQueryKey(7) });
    });
  });

  it('un fallo no invalida como éxito', async () => {
    (getProjectLabels as any).mockResolvedValue([]);
    (createLabel as any).mockRejectedValue(new Error('409'));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useProjectLabels(7), { wrapper });

    await expect(
      result.current.createLabel.mutateAsync({ nombreEtiqueta: 'X', color: '#000000' }),
    ).rejects.toThrow('409');
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('propaga el error enriquecido sin transformarlo', async () => {
    (getProjectLabels as any).mockResolvedValue([]);
    const enriched = Object.assign(new Error('Ya existe una etiqueta con ese nombre en el proyecto'), {
      statusCode: 409,
    });
    (createLabel as any).mockRejectedValue(enriched);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectLabels(7), { wrapper });

    await expect(
      result.current.createLabel.mutateAsync({ nombreEtiqueta: 'X', color: '#000000' }),
    ).rejects.toBe(enriched);
  });

  it('no implementa actualización optimista: labels no cambia antes de que resuelva la mutation', async () => {
    (getProjectLabels as any).mockResolvedValue([{ idEtiqueta: 1, nombreEtiqueta: 'A', color: '#fff' }]);
    let resolveCreate: (value: unknown) => void = () => {};
    (createLabel as any).mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectLabels(7), { wrapper });

    await waitFor(() => expect(result.current.labels).toHaveLength(1));

    result.current.createLabel.mutate({ nombreEtiqueta: 'B', color: '#000000' });
    expect(result.current.labels).toHaveLength(1);
    resolveCreate({ idEtiqueta: 2 });
  });
});
