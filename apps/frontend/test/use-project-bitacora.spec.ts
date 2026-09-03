import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/services/bitacora', () => ({
  getProjectBitacora: vi.fn(),
}));

import { useProjectBitacora } from '../hooks/use-project-bitacora';
import { projectBitacoraQueryKey } from '../lib/query-keys/bitacora';
import { getProjectBitacora } from '../lib/services/bitacora';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

function paginado(overrides: Record<string, unknown> = {}) {
  return { data: [], total: 0, page: 1, totalPages: 0, ...overrides };
}

describe('useProjectBitacora', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('usa la query key canónica, incluyendo los filtros activos', async () => {
    (getProjectBitacora as any).mockResolvedValue(paginado());
    const { queryClient, wrapper } = createWrapper();
    const filtros = { page: 1, limit: 20 };

    renderHook(() => useProjectBitacora(7, filtros), { wrapper });

    await waitFor(() => {
      expect(queryClient.getQueryState(projectBitacoraQueryKey(7, filtros))).toBeDefined();
    });
    expect(projectBitacoraQueryKey(7, filtros)).toEqual(['project-bitacora', 7, filtros]);
  });

  it('llama a getProjectBitacora con idProyecto y los filtros exactos', async () => {
    (getProjectBitacora as any).mockResolvedValue(paginado());
    const { wrapper } = createWrapper();
    const filtros = { idSprint: 3, idActor: 9, tipoEvento: 'SPRINT_STARTED' as const, page: 2, limit: 20 };

    renderHook(() => useProjectBitacora(7, filtros), { wrapper });

    await waitFor(() => {
      expect(getProjectBitacora).toHaveBeenCalledWith(7, filtros);
    });
  });

  it('expone eventos/total/totalPages con defaults seguros mientras no hay datos', () => {
    (getProjectBitacora as any).mockResolvedValue(paginado());
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useProjectBitacora(7, { page: 1, limit: 20 }), { wrapper });

    expect(result.current.eventos).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.totalPages).toBe(0);
  });

  it('no dispara la query con un idProyecto inválido (0, negativo o no entero)', () => {
    (getProjectBitacora as any).mockResolvedValue(paginado());
    const { wrapper } = createWrapper();

    renderHook(() => useProjectBitacora(0, { page: 1, limit: 20 }), { wrapper });

    expect(getProjectBitacora).not.toHaveBeenCalled();
  });

  it('no dispara la query cuando habilitado=false, aunque idProyecto sea válido', () => {
    (getProjectBitacora as any).mockResolvedValue(paginado());
    const { wrapper } = createWrapper();

    renderHook(() => useProjectBitacora(7, { page: 1, limit: 20 }, false), { wrapper });

    expect(getProjectBitacora).not.toHaveBeenCalled();
  });

  it('habilitado=true (default) dispara la query normalmente', async () => {
    (getProjectBitacora as any).mockResolvedValue(paginado());
    const { wrapper } = createWrapper();

    renderHook(() => useProjectBitacora(7, { page: 1, limit: 20 }, true), { wrapper });

    await waitFor(() => {
      expect(getProjectBitacora).toHaveBeenCalled();
    });
  });

  it('refleja los datos resueltos (eventos, total, totalPages) una vez cargados', async () => {
    const respuesta = paginado({
      data: [{ idAuditoria: 1, tipoEvento: 'TASK_CREATED' }],
      total: 1,
      page: 1,
      totalPages: 1,
    });
    (getProjectBitacora as any).mockResolvedValue(respuesta);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useProjectBitacora(7, { page: 1, limit: 20 }), { wrapper });

    await waitFor(() => {
      expect(result.current.eventos).toEqual(respuesta.data);
    });
    expect(result.current.total).toBe(1);
    expect(result.current.totalPages).toBe(1);
  });
});
