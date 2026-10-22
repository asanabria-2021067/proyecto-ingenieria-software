import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ apiFetch: apiFetchMock }));

import { useCreateChannel, useUpdateChannelMembers } from '../hooks/use-chat';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('canales - hooks y servicios', () => {
  it('useCreateChannel hace POST a /proyectos/:id/canales', async () => {
    apiFetchMock.mockResolvedValue({ idConversacion: 9 });
    const { result } = renderHook(() => useCreateChannel(10), { wrapper });

    await act(() => result.current.mutateAsync({ nombre: 'dev', idsMiembros: [2] }));

    expect(apiFetchMock).toHaveBeenCalledWith('/proyectos/10/canales', {
      method: 'POST',
      body: JSON.stringify({ nombre: 'dev', idsMiembros: [2] }),
    });
  });

  it('useUpdateChannelMembers agrega primero y luego quita uno por uno', async () => {
    apiFetchMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useUpdateChannelMembers(10, 7), { wrapper });

    await act(() => result.current.mutateAsync({ agregar: [3, 4], quitar: [2, 5] }));

    expect(apiFetchMock.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ['/proyectos/10/canales/7/miembros', 'POST'],
      ['/proyectos/10/canales/7/miembros/2', 'DELETE'],
      ['/proyectos/10/canales/7/miembros/5', 'DELETE'],
    ]);
    expect(apiFetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ idsUsuarios: [3, 4] }));
  });

  it('useUpdateChannelMembers no llama al backend si no hay cambios', async () => {
    const { result } = renderHook(() => useUpdateChannelMembers(10, 7), { wrapper });

    await act(() => result.current.mutateAsync({ agregar: [], quitar: [] }));

    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
