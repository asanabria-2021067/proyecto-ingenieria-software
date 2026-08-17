import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/services/exit-requests', () => ({
  createExitRequest: vi.fn(),
  getExitPreparationSummary: vi.fn(),
  continueExitPreparation: vi.fn(),
  cancelExitPreparation: vi.fn(),
  approveExitRequest: vi.fn(),
  rejectExitRequest: vi.fn(),
}));

import {
  useApproveExitRequest,
  useCancelExitPreparation,
  useContinueExitPreparation,
  useCreateExitRequest,
  useExitPreparationSummary,
  useRejectExitRequest,
} from '../hooks/use-exit-request';
import { exitPreparationSummaryQueryKey } from '../lib/query-keys/exit-requests';
import { projectSprintsQueryKey } from '../lib/query-keys/sprints';
import { projectTasksQueryKey } from '../lib/query-keys/tasks';
import {
  projectMemberDetailQueryKey,
  projectMembersQueryKey,
  projectTeamSummaryQueryKey,
} from '../lib/query-keys/members';
import {
  approveExitRequest,
  cancelExitPreparation,
  continueExitPreparation,
  createExitRequest,
  getExitPreparationSummary,
  rejectExitRequest,
} from '../lib/services/exit-requests';

// vitest.config.ts solo incluye `test/**/*.spec.ts` (no `.spec.tsx`); este
// archivo evita JSX deliberadamente (createElement), mismo patrón que
// use-project-sprints.spec.ts.
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

function solicitud(overrides: Partial<any> = {}) {
  return {
    idSolicitud: 1,
    idProyecto: 7,
    idUsuario: 3,
    motivo: 'Cambio de proyecto',
    estadoSolicitud: 'PREPARACION',
    solicitadaEn: '2026-01-01T00:00:00.000Z',
    resueltaEn: null,
    resueltaPor: null,
    ...overrides,
  };
}

function summary(overrides: Partial<any> = {}) {
  return {
    solicitud: {
      idSolicitud: 1,
      idProyecto: 7,
      idUsuario: 3,
      estadoSolicitud: 'PREPARACION',
      solicitadaEn: '2026-01-01T00:00:00.000Z',
    },
    blockers: [],
    cantidadBlockers: 0,
    puedeContinuar: true,
    ...overrides,
  };
}

describe('useExitPreparationSummary', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('usa la query key canónica exacta', async () => {
    (getExitPreparationSummary as any).mockResolvedValue(summary());
    const { queryClient, wrapper } = createWrapper();
    renderHook(() => useExitPreparationSummary(7), { wrapper });

    await waitFor(() => {
      expect(queryClient.getQueryState(exitPreparationSummaryQueryKey(7))).toBeDefined();
    });
    expect(exitPreparationSummaryQueryKey(7)).toEqual(['exit-preparation-summary', 7]);
  });

  it('no colisiona con keys de otros dominios', () => {
    expect(exitPreparationSummaryQueryKey(7)).not.toEqual(projectSprintsQueryKey(7));
    expect(exitPreparationSummaryQueryKey(7)).not.toEqual(projectTasksQueryKey(7));
    expect(exitPreparationSummaryQueryKey(7)).not.toEqual(projectMembersQueryKey(7));
  });

  it('no colisiona entre proyectos', () => {
    expect(exitPreparationSummaryQueryKey(17)).not.toEqual(exitPreparationSummaryQueryKey(42));
  });

  it('consulta una sola vez con el projectId correcto', async () => {
    (getExitPreparationSummary as any).mockResolvedValue(summary());
    const { wrapper } = createWrapper();
    renderHook(() => useExitPreparationSummary(7), { wrapper });

    await waitFor(() => expect(getExitPreparationSummary).toHaveBeenCalledTimes(1));
    expect(getExitPreparationSummary).toHaveBeenCalledWith(7);
  });

  it('summary es undefined antes de resolver, con isLoading true', () => {
    (getExitPreparationSummary as any).mockReturnValue(new Promise(() => {}));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useExitPreparationSummary(7), { wrapper });

    expect(result.current.summary).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('expone isError y error cuando la query falla', async () => {
    const boom = new Error('No existe una solicitud de salida en estado PREPARACION');
    (getExitPreparationSummary as any).mockRejectedValue(boom);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useExitPreparationSummary(7), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(boom);
  });

  it('expone el summary resuelto por el service', async () => {
    (getExitPreparationSummary as any).mockResolvedValue(summary({ cantidadBlockers: 2, puedeContinuar: false }));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useExitPreparationSummary(7), { wrapper });

    await waitFor(() => expect(result.current.summary?.cantidadBlockers).toBe(2));
    expect(result.current.summary?.puedeContinuar).toBe(false);
  });

  it.each([0, -1, NaN])('un projectId inválido (%s) no consulta', async (idInvalido) => {
    (getExitPreparationSummary as any).mockResolvedValue(summary());
    const { wrapper } = createWrapper();
    renderHook(() => useExitPreparationSummary(idInvalido), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getExitPreparationSummary).not.toHaveBeenCalled();
  });
});

describe('useCreateExitRequest', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('invoca el service exactamente una vez con projectId y body correctos', async () => {
    (createExitRequest as any).mockResolvedValue(solicitud());
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateExitRequest(7), { wrapper });

    result.current.mutate({ motivo: 'Cambio de proyecto' });

    await waitFor(() => expect(createExitRequest).toHaveBeenCalledTimes(1));
    expect(createExitRequest).toHaveBeenCalledWith(7, { motivo: 'Cambio de proyecto' });
  });

  it('en éxito invalida exactamente exit-preparation-summary del proyecto', async () => {
    (createExitRequest as any).mockResolvedValue(solicitud());
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateExitRequest(7), { wrapper });

    result.current.mutate({ motivo: 'Cambio de proyecto' });

    await waitFor(() => expect(createExitRequest).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['exit-preparation-summary', 7] }),
    );
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('no invalida caches ajenas (tasks/members)', async () => {
    (createExitRequest as any).mockResolvedValue(solicitud());
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateExitRequest(7), { wrapper });

    result.current.mutate({ motivo: 'Cambio de proyecto' });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(1));
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['project-tasks', 7] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['proyecto-equipo', 7] });
  });

  it('una mutation fallida no invalida como éxito', async () => {
    (createExitRequest as any).mockRejectedValue(new Error('409'));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateExitRequest(7), { wrapper });

    await expect(result.current.mutateAsync({ motivo: 'Cambio de proyecto' })).rejects.toThrow('409');
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useContinueExitPreparation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('invoca el service exactamente una vez con el projectId correcto', async () => {
    (continueExitPreparation as any).mockResolvedValue(solicitud({ estadoSolicitud: 'PENDIENTE_LIDER' }));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useContinueExitPreparation(7), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(continueExitPreparation).toHaveBeenCalledTimes(1));
    expect(continueExitPreparation).toHaveBeenCalledWith(7);
  });

  it('en éxito invalida exactamente exit-preparation-summary del proyecto', async () => {
    (continueExitPreparation as any).mockResolvedValue(solicitud({ estadoSolicitud: 'PENDIENTE_LIDER' }));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useContinueExitPreparation(7), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(continueExitPreparation).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['exit-preparation-summary', 7] }),
    );
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('no sobreinvalida members/team', async () => {
    (continueExitPreparation as any).mockResolvedValue(solicitud({ estadoSolicitud: 'PENDIENTE_LIDER' }));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useContinueExitPreparation(7), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(1));
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['proyecto-equipo', 7] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['proyecto-miembros-resumen', 7] });
  });

  it('una mutation fallida no invalida como éxito', async () => {
    (continueExitPreparation as any).mockRejectedValue(new Error('409'));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useContinueExitPreparation(7), { wrapper });

    await expect(result.current.mutateAsync()).rejects.toThrow('409');
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useCancelExitPreparation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('invoca el service exactamente una vez con el projectId correcto, sin body inventado', async () => {
    (cancelExitPreparation as any).mockResolvedValue(solicitud({ estadoSolicitud: 'CANCELADA' }));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCancelExitPreparation(7), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(cancelExitPreparation).toHaveBeenCalledTimes(1));
    expect(cancelExitPreparation).toHaveBeenCalledWith(7);
  });

  it('en éxito invalida exactamente exit-preparation-summary del proyecto', async () => {
    (cancelExitPreparation as any).mockResolvedValue(solicitud({ estadoSolicitud: 'CANCELADA' }));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCancelExitPreparation(7), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(cancelExitPreparation).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['exit-preparation-summary', 7] }),
    );
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('una mutation fallida no invalida como éxito', async () => {
    (cancelExitPreparation as any).mockRejectedValue(new Error('409'));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCancelExitPreparation(7), { wrapper });

    await expect(result.current.mutateAsync()).rejects.toThrow('409');
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useApproveExitRequest', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('invoca el service exactamente una vez con projectId e idSolicitud correctos', async () => {
    (approveExitRequest as any).mockResolvedValue(solicitud({ estadoSolicitud: 'APROBADA', idUsuario: 9 }));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useApproveExitRequest(7), { wrapper });

    result.current.mutate(1);

    await waitFor(() => expect(approveExitRequest).toHaveBeenCalledTimes(1));
    expect(approveExitRequest).toHaveBeenCalledWith(7, 1);
  });

  it('en éxito invalida exactamente members/team/member-detail del usuario resuelto (cross-domain)', async () => {
    (approveExitRequest as any).mockResolvedValue(solicitud({ estadoSolicitud: 'APROBADA', idUsuario: 9 }));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useApproveExitRequest(7), { wrapper });

    result.current.mutate(1);

    await waitFor(() => expect(approveExitRequest).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(3));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectMembersQueryKey(7) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectTeamSummaryQueryKey(7) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectMemberDetailQueryKey(7, 9) });
  });

  it('no invalida exit-preparation-summary (PENDIENTE_LIDER nunca calificó para ese read-model)', async () => {
    (approveExitRequest as any).mockResolvedValue(solicitud({ estadoSolicitud: 'APROBADA', idUsuario: 9 }));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useApproveExitRequest(7), { wrapper });

    result.current.mutate(1);

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(3));
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: exitPreparationSummaryQueryKey(7) });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['project-tasks', 7] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['project-sprints', 7] });
  });

  it('una mutation fallida no invalida nada como éxito', async () => {
    (approveExitRequest as any).mockRejectedValue(new Error('400'));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useApproveExitRequest(7), { wrapper });

    await expect(result.current.mutateAsync(1)).rejects.toThrow('400');
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useRejectExitRequest', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('invoca el service exactamente una vez con projectId e idSolicitud correctos', async () => {
    (rejectExitRequest as any).mockResolvedValue(solicitud({ estadoSolicitud: 'RECHAZADA', idUsuario: 9 }));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRejectExitRequest(7), { wrapper });

    result.current.mutate(1);

    await waitFor(() => expect(rejectExitRequest).toHaveBeenCalledTimes(1));
    expect(rejectExitRequest).toHaveBeenCalledWith(7, 1);
  });

  it('rechazar no retira participaciones: no invalida members/team en éxito (a diferencia de approve)', async () => {
    (rejectExitRequest as any).mockResolvedValue(solicitud({ estadoSolicitud: 'RECHAZADA', idUsuario: 9 }));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useRejectExitRequest(7), { wrapper });

    await result.current.mutateAsync(1);

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('una mutation fallida no invalida nada', async () => {
    (rejectExitRequest as any).mockRejectedValue(new Error('400'));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useRejectExitRequest(7), { wrapper });

    await expect(result.current.mutateAsync(1)).rejects.toThrow('400');
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
