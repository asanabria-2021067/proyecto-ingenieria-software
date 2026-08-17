import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/services/sprints', () => ({
  getProjectSprints: vi.fn(),
  startSprint: vi.fn(),
  finalizeSprint: vi.fn(),
  closeSprint: vi.fn(),
  getSprintDetail: vi.fn(),
  getSprintClosingSummary: vi.fn(),
  adjustSprintHours: vi.fn(),
}));

import {
  useAdjustSprintHours,
  useCloseSprint,
  useFinalizeSprint,
  useProjectSprints,
  useSprintClosingSummary,
  useSprintDetail,
  useStartSprint,
} from '../hooks/use-project-sprints';
import {
  projectSprintsQueryKey,
  sprintClosingSummaryQueryKey,
  sprintDetailQueryKey,
} from '../lib/query-keys/sprints';
import {
  adjustSprintHours,
  closeSprint,
  finalizeSprint,
  getProjectSprints,
  getSprintClosingSummary,
  getSprintDetail,
  startSprint,
} from '../lib/services/sprints';

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

function sprintDetail(overrides: Partial<any> = {}) {
  return {
    idSprint: 1,
    idProyecto: 7,
    numero: 1,
    estado: 'CERRADO',
    fechaInicio: '2026-01-01T00:00:00.000Z',
    fechaFinalizacionIniciada: '2026-01-10T00:00:00.000Z',
    fechaCierre: '2026-01-12T00:00:00.000Z',
    cerradoPor: 3,
    tareas: [],
    hitos: [],
    ...overrides,
  };
}

describe('useSprintDetail (F4)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('usa la query key canónica exacta, distinta por proyecto y por Sprint', () => {
    expect(sprintDetailQueryKey(7, 1)).toEqual(['sprint-detail', 7, 1]);
    expect(sprintDetailQueryKey(7, 1)).not.toEqual(sprintDetailQueryKey(8, 1));
    expect(sprintDetailQueryKey(7, 1)).not.toEqual(sprintDetailQueryKey(7, 2));
    expect(sprintDetailQueryKey(7, 1)).not.toEqual(projectSprintsQueryKey(7));
  });

  it('consulta una sola vez con projectId y sprintId correctos', async () => {
    (getSprintDetail as any).mockResolvedValue(sprintDetail());
    const { wrapper } = createWrapper();
    renderHook(() => useSprintDetail(7, 1), { wrapper });

    await waitFor(() => expect(getSprintDetail).toHaveBeenCalledTimes(1));
    expect(getSprintDetail).toHaveBeenCalledWith(7, 1);
  });

  it.each([
    [0, 1],
    [7, 0],
    [-1, 1],
    [7, NaN],
  ])('con projectId=%s / sprintId=%s inválidos no consulta', async (idProyecto, idSprint) => {
    (getSprintDetail as any).mockResolvedValue(sprintDetail());
    const { wrapper } = createWrapper();
    renderHook(() => useSprintDetail(idProyecto, idSprint), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getSprintDetail).not.toHaveBeenCalled();
  });

  it('expone el detalle resuelto por el service', async () => {
    (getSprintDetail as any).mockResolvedValue(sprintDetail({ numero: 4 }));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSprintDetail(7, 1), { wrapper });

    await waitFor(() => expect(result.current.detail?.numero).toBe(4));
  });

  it('detail es undefined antes de resolver, con isLoading true', () => {
    (getSprintDetail as any).mockReturnValue(new Promise(() => {}));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSprintDetail(7, 1), { wrapper });

    expect(result.current.detail).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('expone isError y error cuando la query falla', async () => {
    const boom = new Error('404');
    (getSprintDetail as any).mockRejectedValue(boom);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSprintDetail(7, 1), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(boom);
  });
});

function closingSummary(overrides: Partial<any> = {}) {
  return {
    idProyecto: 7,
    idSprint: 1,
    participantes: [],
    ...overrides,
  };
}

describe('useSprintClosingSummary (F5)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('usa la query key canónica exacta, distinta por proyecto y por Sprint', () => {
    expect(sprintClosingSummaryQueryKey(7, 1)).toEqual(['sprint-closing-summary', 7, 1]);
    expect(sprintClosingSummaryQueryKey(7, 1)).not.toEqual(sprintClosingSummaryQueryKey(8, 1));
    expect(sprintClosingSummaryQueryKey(7, 1)).not.toEqual(sprintClosingSummaryQueryKey(7, 2));
    expect(sprintClosingSummaryQueryKey(7, 1)).not.toEqual(sprintDetailQueryKey(7, 1));
  });

  it('consulta una sola vez con projectId y sprintId correctos', async () => {
    (getSprintClosingSummary as any).mockResolvedValue(closingSummary());
    const { wrapper } = createWrapper();
    renderHook(() => useSprintClosingSummary(7, 1), { wrapper });

    await waitFor(() => expect(getSprintClosingSummary).toHaveBeenCalledTimes(1));
    expect(getSprintClosingSummary).toHaveBeenCalledWith(7, 1);
  });

  it.each([
    [0, 1],
    [7, 0],
    [-1, 1],
    [7, NaN],
  ])('con projectId=%s / sprintId=%s inválidos no consulta', async (idProyecto, idSprint) => {
    (getSprintClosingSummary as any).mockResolvedValue(closingSummary());
    const { wrapper } = createWrapper();
    renderHook(() => useSprintClosingSummary(idProyecto, idSprint), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getSprintClosingSummary).not.toHaveBeenCalled();
  });

  it('expone el summary resuelto por el service', async () => {
    (getSprintClosingSummary as any).mockResolvedValue(
      closingSummary({ participantes: [{ idUsuario: 1 }] }),
    );
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSprintClosingSummary(7, 1), { wrapper });

    await waitFor(() => expect(result.current.summary?.participantes).toHaveLength(1));
  });

  it('summary es undefined antes de resolver, con isLoading true', () => {
    (getSprintClosingSummary as any).mockReturnValue(new Promise(() => {}));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSprintClosingSummary(7, 1), { wrapper });

    expect(result.current.summary).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('expone isError y error cuando la query falla', async () => {
    const boom = new Error('403');
    (getSprintClosingSummary as any).mockRejectedValue(boom);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSprintClosingSummary(7, 1), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(boom);
  });
});

describe('useAdjustSprintHours (F5)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('invoca el service con projectId, sprintId, idParticipacion y el payload correctos', async () => {
    (adjustSprintHours as any).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAdjustSprintHours(7, 1), { wrapper });

    result.current.mutate({ idParticipacion: 51, horasAprobadas: 12, justificacionAjuste: 'Ajuste válido' });

    await waitFor(() => expect(adjustSprintHours).toHaveBeenCalledTimes(1));
    expect(adjustSprintHours).toHaveBeenCalledWith(7, 1, 51, {
      horasAprobadas: 12,
      justificacionAjuste: 'Ajuste válido',
    });
  });

  it('permite omitir justificacionAjuste (igualdad, sin ajuste)', async () => {
    (adjustSprintHours as any).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAdjustSprintHours(7, 1), { wrapper });

    result.current.mutate({ idParticipacion: 51, horasAprobadas: 10 });

    await waitFor(() => expect(adjustSprintHours).toHaveBeenCalledWith(7, 1, 51, { horasAprobadas: 10 }));
  });

  it('en éxito invalida exactamente sprint-closing-summary del proyecto/Sprint', async () => {
    (adjustSprintHours as any).mockResolvedValue({});
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useAdjustSprintHours(7, 1), { wrapper });

    result.current.mutate({ idParticipacion: 51, horasAprobadas: 10 });

    await waitFor(() => expect(adjustSprintHours).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sprint-closing-summary', 7, 1] }),
    );
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('no invalida sprint-detail ni otras caches ajenas', async () => {
    (adjustSprintHours as any).mockResolvedValue({});
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useAdjustSprintHours(7, 1), { wrapper });

    result.current.mutate({ idParticipacion: 51, horasAprobadas: 10 });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(1));
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['sprint-detail', 7, 1] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['project-sprints', 7] });
  });

  it('una mutation fallida no invalida como éxito', async () => {
    (adjustSprintHours as any).mockRejectedValue(new Error('400'));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useAdjustSprintHours(7, 1), { wrapper });

    await expect(
      result.current.mutateAsync({ idParticipacion: 51, horasAprobadas: 12 }),
    ).rejects.toThrow('400');
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
