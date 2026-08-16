import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/services/sprints', () => ({
  getProjectSprints: vi.fn(),
  startSprint: vi.fn(),
  finalizeSprint: vi.fn(),
  closeSprint: vi.fn(),
}));

import {
  useCloseSprint,
  useFinalizeSprint,
  useProjectSprints,
  useStartSprint,
} from '../hooks/use-project-sprints';
import { projectSprintsQueryKey } from '../lib/query-keys/sprints';
import { closeSprint, finalizeSprint, getProjectSprints, startSprint } from '../lib/services/sprints';

// vitest.config.ts solo incluye `test/**/*.spec.ts` (no `.spec.tsx`); este
// archivo evita JSX deliberadamente (createElement), mismo patrón que
// use-project-tasks.spec.ts.
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

function sprint(overrides: Partial<any> = {}) {
  return {
    idSprint: 1,
    idProyecto: 7,
    numero: 1,
    estado: 'ACTIVO',
    fechaInicio: '2026-01-01T00:00:00.000Z',
    fechaFinalizacionIniciada: null,
    fechaCierre: null,
    ...overrides,
  };
}

describe('useProjectSprints', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('usa la query key canónica exacta', async () => {
    (getProjectSprints as any).mockResolvedValue([]);
    const { queryClient, wrapper } = createWrapper();
    renderHook(() => useProjectSprints(7), { wrapper });

    await waitFor(() => {
      expect(queryClient.getQueryState(projectSprintsQueryKey(7))).toBeDefined();
    });
    expect(projectSprintsQueryKey(7)).toEqual(['project-sprints', 7]);
  });

  it('consulta una sola vez con el projectId correcto', async () => {
    (getProjectSprints as any).mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useProjectSprints(7), { wrapper });

    await waitFor(() => expect(getProjectSprints).toHaveBeenCalledTimes(1));
    expect(getProjectSprints).toHaveBeenCalledWith(7);
  });

  it('sprints por defecto es [] antes de que resuelva la query', () => {
    (getProjectSprints as any).mockReturnValue(new Promise(() => {}));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectSprints(7), { wrapper });

    expect(result.current.sprints).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('expone isError y error cuando la query falla', async () => {
    const boom = new Error('fallo de red');
    (getProjectSprints as any).mockRejectedValue(boom);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectSprints(7), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(boom);
  });

  it.each([0, -1, NaN])('un projectId inválido (%s) no consulta', async (idInvalido) => {
    (getProjectSprints as any).mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useProjectSprints(idInvalido), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getProjectSprints).not.toHaveBeenCalled();
  });

  it('expone la lista resuelta por el service', async () => {
    (getProjectSprints as any).mockResolvedValue([sprint()]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectSprints(7), { wrapper });

    await waitFor(() => expect(result.current.sprints).toHaveLength(1));
    expect(result.current.sprints[0]).toEqual(sprint());
  });
});

describe('useStartSprint', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('invoca el service exactamente una vez con el projectId correcto', async () => {
    (startSprint as any).mockResolvedValue(sprint());
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useStartSprint(7), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(startSprint).toHaveBeenCalledTimes(1));
    expect(startSprint).toHaveBeenCalledWith(7);
  });

  it('en éxito invalida exactamente project-sprints del proyecto', async () => {
    (startSprint as any).mockResolvedValue(sprint());
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useStartSprint(7), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(startSprint).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project-sprints', 7] }),
    );
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('una mutation fallida no invalida como éxito', async () => {
    (startSprint as any).mockRejectedValue(new Error('409'));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useStartSprint(7), { wrapper });

    await expect(result.current.mutateAsync()).rejects.toThrow('409');
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useFinalizeSprint', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('invoca el service exactamente una vez con projectId y sprintId correctos', async () => {
    (finalizeSprint as any).mockResolvedValue(sprint({ estado: 'EN_FINALIZACION' }));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useFinalizeSprint(7), { wrapper });

    result.current.mutate(1);

    await waitFor(() => expect(finalizeSprint).toHaveBeenCalledTimes(1));
    expect(finalizeSprint).toHaveBeenCalledWith(7, 1);
  });

  it('en éxito invalida exactamente project-sprints del proyecto (idProyecto conservado del hook)', async () => {
    (finalizeSprint as any).mockResolvedValue(sprint({ estado: 'EN_FINALIZACION' }));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useFinalizeSprint(7), { wrapper });

    result.current.mutate(1);

    await waitFor(() => expect(finalizeSprint).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project-sprints', 7] }),
    );
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('no invalida caches ajenas (members/tasks)', async () => {
    (finalizeSprint as any).mockResolvedValue(sprint({ estado: 'EN_FINALIZACION' }));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useFinalizeSprint(7), { wrapper });

    result.current.mutate(1);

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(1));
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['project-tasks', 7] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['project-avance', 7] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['proyecto-equipo', 7] });
  });

  it('una mutation fallida no invalida como éxito', async () => {
    (finalizeSprint as any).mockRejectedValue(new Error('409'));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useFinalizeSprint(7), { wrapper });

    await expect(result.current.mutateAsync(1)).rejects.toThrow('409');
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useCloseSprint', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('invoca el service exactamente una vez con projectId y sprintId correctos', async () => {
    (closeSprint as any).mockResolvedValue(sprint({ estado: 'CERRADO' }));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCloseSprint(7), { wrapper });

    result.current.mutate(1);

    await waitFor(() => expect(closeSprint).toHaveBeenCalledTimes(1));
    expect(closeSprint).toHaveBeenCalledWith(7, 1);
  });

  it('en éxito invalida exactamente project-sprints del proyecto (idProyecto conservado del hook)', async () => {
    (closeSprint as any).mockResolvedValue(sprint({ estado: 'CERRADO' }));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCloseSprint(7), { wrapper });

    result.current.mutate(1);

    await waitFor(() => expect(closeSprint).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project-sprints', 7] }),
    );
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('no invalida caches ajenas (members/tasks)', async () => {
    (closeSprint as any).mockResolvedValue(sprint({ estado: 'CERRADO' }));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCloseSprint(7), { wrapper });

    result.current.mutate(1);

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(1));
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['project-tasks', 7] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['project-avance', 7] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['proyecto-equipo', 7] });
  });

  it('una mutation fallida no invalida como éxito', async () => {
    (closeSprint as any).mockRejectedValue(new Error('409'));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCloseSprint(7), { wrapper });

    await expect(result.current.mutateAsync(1)).rejects.toThrow('409');
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
