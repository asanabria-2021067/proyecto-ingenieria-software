import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/api/client', () => ({ apiFetch: vi.fn() }));
vi.mock('../lib/services/applications', () => ({ updateEstadoPostulacion: vi.fn() }));

import { useProjectPendingPostulations, useResolvePostulacion } from '../hooks/use-project-pending-postulations';
import { projectPendingPostulationsQueryKey } from '../lib/query-keys/applications';
import { projectTeamSummaryQueryKey } from '../lib/query-keys/members';
import { apiFetch } from '../lib/api/client';
import { updateEstadoPostulacion } from '../lib/services/applications';
import type { PostulacionRecibida } from '../types';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

function postulacion(overrides: Partial<PostulacionRecibida> = {}): PostulacionRecibida {
  return {
    idPostulacion: 1,
    justificacion: 'Quiero contribuir con el backend.',
    estadoPostulacion: 'PENDIENTE',
    fechaPostulacion: '2026-01-05T00:00:00.000Z',
    postulante: { idUsuario: 50, nombre: 'Diego', apellido: 'Solís', correo: 'diego@uvg.edu.gt' },
    rolProyecto: { idRolProyecto: 9, nombreRol: 'Backend' },
    ...overrides,
  };
}

afterEach(() => vi.clearAllMocks());

describe('useProjectPendingPostulations', () => {
  it('usa GET /proyectos/:id/miembros/postulaciones-pendientes (B13), no el legacy /postulaciones', async () => {
    (apiFetch as any).mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useProjectPendingPostulations(7), { wrapper });

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/proyectos/7/miembros/postulaciones-pendientes'));
    expect(apiFetch).not.toHaveBeenCalledWith('/proyectos/7/postulaciones');
  });

  it('un idProyecto inválido no consulta', async () => {
    (apiFetch as any).mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useProjectPendingPostulations(-1), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('expone postulaciones=[] por defecto antes de resolver', () => {
    (apiFetch as any).mockReturnValue(new Promise(() => {}));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectPendingPostulations(7), { wrapper });

    expect(result.current.postulaciones).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('expone las postulaciones tal como las devuelve B13, sin transformarlas', async () => {
    const fixture = [postulacion({ idPostulacion: 1 }), postulacion({ idPostulacion: 2 })];
    (apiFetch as any).mockResolvedValue(fixture);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectPendingPostulations(7), { wrapper });

    await waitFor(() => expect(result.current.postulaciones).toHaveLength(2));
    expect(result.current.postulaciones).toEqual(fixture);
  });

  it('preserva isError, error y postulaciones=[] cuando la petición falla', async () => {
    const fallo = new Error('fallo de red');
    (apiFetch as any).mockRejectedValue(fallo);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectPendingPostulations(7), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(fallo);
    expect(result.current.postulaciones).toEqual([]);
  });

  it('cachea la query bajo projectPendingPostulationsQueryKey(idProyecto)', async () => {
    (apiFetch as any).mockResolvedValue([]);
    const { queryClient, wrapper } = createWrapper();
    renderHook(() => useProjectPendingPostulations(99), { wrapper });

    await waitFor(() => {
      expect(
        queryClient.getQueryCache().find({ queryKey: projectPendingPostulationsQueryKey(99) }),
      ).toBeDefined();
    });
  });
});

describe('useResolvePostulacion', () => {
  it('llama updateEstadoPostulacion (endpoint YA EXISTENTE de applications/) con el id y estado exactos', async () => {
    (updateEstadoPostulacion as any).mockResolvedValue({ idPostulacion: 1, estadoPostulacion: 'ACEPTADA' });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useResolvePostulacion(7), { wrapper });

    result.current.mutate({ postulacionId: 1, estadoPostulacion: 'ACEPTADA' });

    await waitFor(() => expect(updateEstadoPostulacion).toHaveBeenCalledTimes(1));
    expect(updateEstadoPostulacion).toHaveBeenCalledWith(1, {
      estadoPostulacion: 'ACEPTADA',
      comentarioResolucion: undefined,
    });
  });

  it('ACEPTADA invalida pending-postulations Y team-summary (aceptar crea/reactiva participación)', async () => {
    (updateEstadoPostulacion as any).mockResolvedValue({ idPostulacion: 1, estadoPostulacion: 'ACEPTADA' });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useResolvePostulacion(7), { wrapper });

    result.current.mutate({ postulacionId: 1, estadoPostulacion: 'ACEPTADA' });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectTeamSummaryQueryKey(7) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectPendingPostulationsQueryKey(7) });
  });

  it('RECHAZADA invalida solo pending-postulations, no team-summary (rechazar no toca el equipo)', async () => {
    (updateEstadoPostulacion as any).mockResolvedValue({ idPostulacion: 1, estadoPostulacion: 'RECHAZADA' });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useResolvePostulacion(7), { wrapper });

    result.current.mutate({ postulacionId: 1, estadoPostulacion: 'RECHAZADA' });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectPendingPostulationsQueryKey(7) }),
    );
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: projectTeamSummaryQueryKey(7) });
  });

  it('un error también reconcilia pending-postulations (para descartar filas fantasma si ya fue resuelta por otro líder)', async () => {
    (updateEstadoPostulacion as any).mockRejectedValue(new Error('Esta postulación ya fue resuelta'));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useResolvePostulacion(7), { wrapper });

    await expect(
      result.current.mutateAsync({ postulacionId: 1, estadoPostulacion: 'ACEPTADA' }),
    ).rejects.toThrow('Esta postulación ya fue resuelta');

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectPendingPostulationsQueryKey(7) });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: projectTeamSummaryQueryKey(7) });
  });
});
