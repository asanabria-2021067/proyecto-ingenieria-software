import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/services/projects', () => ({
  createHito: vi.fn(),
}));

import { useProjectMilestones } from '../hooks/use-project-milestones';
import { createHito } from '../lib/services/projects';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

describe('useProjectMilestones', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('crearHito llama al servicio con el idProyecto del hook y el payload', async () => {
    (createHito as any).mockResolvedValue({ idHito: 1 });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectMilestones(7), { wrapper });

    result.current.crearHito.mutate({ tituloHito: 'Entrega de MVP' });
    await waitFor(() =>
      expect(createHito).toHaveBeenCalledWith(7, { tituloHito: 'Entrega de MVP' }),
    );
  });

  it('crear invalida la query ["project", idProyecto]', async () => {
    (createHito as any).mockResolvedValue({ idHito: 1 });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useProjectMilestones(7), { wrapper });

    result.current.crearHito.mutate({ tituloHito: 'Entrega de MVP' });
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project', 7] }),
    );
  });

  it('un fallo no invalida la query', async () => {
    (createHito as any).mockRejectedValue(new Error('403'));
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useProjectMilestones(7), { wrapper });

    await expect(
      result.current.crearHito.mutateAsync({ tituloHito: 'X' }),
    ).rejects.toThrow('403');
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('propaga el error enriquecido sin transformarlo', async () => {
    const enriched = Object.assign(new Error('No eres el líder de este proyecto'), {
      statusCode: 403,
    });
    (createHito as any).mockRejectedValue(enriched);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectMilestones(7), { wrapper });

    await expect(
      result.current.crearHito.mutateAsync({ tituloHito: 'X' }),
    ).rejects.toBe(enriched);
  });
});
