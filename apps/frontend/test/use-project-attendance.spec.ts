import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/services/attendance', () => ({
  getProjectActivities: vi.fn(),
  getProjectActivity: vi.fn(),
  createActivity: vi.fn(),
  markAttendance: vi.fn(),
}));

import {
  useProjectActivity,
  useProjectAttendanceMutations,
} from '../hooks/use-project-attendance';
import { projectActivitiesQueryKey, projectActivityDetailQueryKey } from '../lib/query-keys/attendance';
import { getProjectActivity, markAttendance } from '../lib/services/attendance';
import type { ActividadDetalle } from '../lib/types/attendance';

// vitest.config.ts solo incluye `test/**/*.spec.ts` (sin JSX); mismo
// criterio que use-project-tasks.spec.ts.
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

function detalle(overrides: Partial<ActividadDetalle> = {}): ActividadDetalle {
  return {
    idActividad: 3,
    idProyecto: 7,
    tituloActividad: 'Reunión semanal',
    tipoActividad: 'REUNION',
    fechaActividad: '2026-01-15',
    horasValor: 1.5,
    creadoPor: 1,
    creadoEn: '2026-01-10T00:00:00.000Z',
    integrantes: [
      { idUsuario: 10, nombre: 'Ana', apellido: 'Pérez', fotoUrl: null, asistio: false, confirmadoEn: null },
    ],
    ...overrides,
  };
}

describe('useProjectAttendanceMutations — marcarAsistencia: optimismo y rollback', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('marca asistio:true en la caché de detalle de inmediato, sin esperar el PATCH', async () => {
    (getProjectActivity as any).mockResolvedValue(detalle());
    (markAttendance as any).mockReturnValue(new Promise(() => {})); // nunca resuelve
    const { wrapper, queryClient } = createWrapper();
    const detailHook = renderHook(() => useProjectActivity(7, 3), { wrapper });
    await waitFor(() => expect(detailHook.result.current.actividad?.integrantes).toHaveLength(1));

    const { result } = renderHook(() => useProjectAttendanceMutations(7), { wrapper });
    result.current.marcarAsistencia.mutate({ idActividad: 3, idUsuario: 10, input: { asistio: true } });

    await waitFor(() => {
      const cache = queryClient.getQueryData<ActividadDetalle>(projectActivityDetailQueryKey(7, 3));
      expect(cache?.integrantes[0].asistio).toBe(true);
    });
  });

  it('un PATCH fallido revierte la caché de detalle exactamente al snapshot previo', async () => {
    const original = detalle();
    (getProjectActivity as any).mockResolvedValue(original);
    (markAttendance as any).mockRejectedValue(new Error('no eres el líder'));
    const { wrapper, queryClient } = createWrapper();
    const detailHook = renderHook(() => useProjectActivity(7, 3), { wrapper });
    await waitFor(() => expect(detailHook.result.current.actividad?.integrantes).toHaveLength(1));

    const { result } = renderHook(() => useProjectAttendanceMutations(7), { wrapper });
    await expect(
      result.current.marcarAsistencia.mutateAsync({ idActividad: 3, idUsuario: 10, input: { asistio: true } }),
    ).rejects.toThrow('no eres el líder');

    const cache = queryClient.getQueryData<ActividadDetalle>(projectActivityDetailQueryKey(7, 3));
    expect(cache?.integrantes[0].asistio).toBe(false);
  });

  it('éxito invalida la lista de actividades y el detalle', async () => {
    (getProjectActivity as any).mockResolvedValue(detalle());
    (markAttendance as any).mockResolvedValue({
      idAsistencia: 1,
      idActividad: 3,
      idUsuario: 10,
      asistio: true,
      confirmadoPor: 1,
      confirmadoEn: '2026-01-15T10:00:00.000Z',
      idRegistroHoras: 5,
    });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const detailHook = renderHook(() => useProjectActivity(7, 3), { wrapper });
    await waitFor(() => expect(detailHook.result.current.actividad?.integrantes).toHaveLength(1));

    const { result } = renderHook(() => useProjectAttendanceMutations(7), { wrapper });
    result.current.marcarAsistencia.mutate({ idActividad: 3, idUsuario: 10, input: { asistio: true } });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectActivitiesQueryKey(7) });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectActivityDetailQueryKey(7, 3) });
    });
  });
});
