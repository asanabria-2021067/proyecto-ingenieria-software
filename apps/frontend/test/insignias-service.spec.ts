import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/api/client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '../lib/api/client';
import { useMisInsignias } from '../hooks/use-insignias';
import { misInsigniasQueryKey } from '../lib/query-keys/insignias';
import { getMisInsignias } from '../lib/services/insignias';

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

describe('servicio y hook de insignias (HU-190, T-348)', () => {
  it('getMisInsignias llama GET /insignias/me', async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);

    await getMisInsignias();

    expect(apiFetch).toHaveBeenCalledWith('/insignias/me');
  });

  it('useMisInsignias lee y cachea bajo misInsigniasQueryKey', async () => {
    const lista = [{ clave: 'tareas' }];
    vi.mocked(apiFetch).mockResolvedValue(lista);
    const { queryClient, wrapper: w } = wrapper();

    const { result } = renderHook(() => useMisInsignias(), { wrapper: w });

    await waitFor(() => expect(result.current.data).toEqual(lista));
    expect(queryClient.getQueryData(misInsigniasQueryKey)).toEqual(lista);
  });

  it('con enabled=false (administrador) no llama a la API', () => {
    vi.mocked(apiFetch).mockClear();
    const { wrapper: w } = wrapper();

    renderHook(() => useMisInsignias(false), { wrapper: w });

    expect(apiFetch).not.toHaveBeenCalled();
  });
});
