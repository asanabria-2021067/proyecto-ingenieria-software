import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/services/users', () => ({ getMisHoras: vi.fn() }));

import { useMisHoras } from '../hooks/use-my-hours';
import { misHorasQueryKey } from '../lib/query-keys/hours';
import { getMisHoras, type MisHorasView } from '../lib/services/users';

const vista = { idUsuario: 7, totales: { registradasEnProyectosAbiertos: '12.50' } } as unknown as MisHorasView;

/** QueryClient con el mismo `staleTime` global de la app (60 s) que el hook debe anular. */
function crearCliente() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useMisHoras', () => {
  afterEach(() => {
    focusManager.setFocused(undefined);
    vi.clearAllMocks();
  });

  it('lee Mis Horas bajo la key estable ["mis-horas"]', async () => {
    vi.mocked(getMisHoras).mockResolvedValue(vista);
    const { queryClient, wrapper } = crearCliente();

    const { result } = renderHook(() => useMisHoras(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(vista);
    expect(misHorasQueryKey).toEqual(['mis-horas']);
    expect(queryClient.getQueryData(['mis-horas'])).toBe(vista);
  });

  it('congela las opciones de frescura: staleTime 0, refetch al montar siempre y al volver el foco', async () => {
    vi.mocked(getMisHoras).mockResolvedValue(vista);
    const { queryClient, wrapper } = crearCliente();

    renderHook(() => useMisHoras(), { wrapper });

    await waitFor(() => expect(getMisHoras).toHaveBeenCalledTimes(1));
    const [observador] = queryClient.getQueryCache().find({ queryKey: misHorasQueryKey })!.observers;
    expect(observador.options).toMatchObject({
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
    });
  });

  it('vuelve a pedir las horas al montar otra vez aunque haya datos en caché y el staleTime global sea de 60 s', async () => {
    vi.mocked(getMisHoras).mockResolvedValue(vista);
    const { wrapper } = crearCliente();

    const primera = renderHook(() => useMisHoras(), { wrapper });
    await waitFor(() => expect(primera.result.current.isSuccess).toBe(true));
    primera.unmount();

    const segunda = renderHook(() => useMisHoras(), { wrapper });
    // Muestra el dato en caché de inmediato y lo refresca igualmente.
    expect(segunda.result.current.data).toBe(vista);
    await waitFor(() => expect(getMisHoras).toHaveBeenCalledTimes(2));
  });

  it('vuelve a pedir las horas cuando la pestaña recupera el foco', async () => {
    vi.mocked(getMisHoras).mockResolvedValue(vista);
    const { wrapper } = crearCliente();

    const { result } = renderHook(() => useMisHoras(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(getMisHoras).toHaveBeenCalledTimes(2));
  });

  it('propaga el error del servicio para que la página muestre su estado de error', async () => {
    const error = Object.assign(new Error('Error del servidor'), { statusCode: 500 });
    vi.mocked(getMisHoras).mockRejectedValue(error);
    const { wrapper } = crearCliente();

    const { result } = renderHook(() => useMisHoras(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();
  });

  it('solo lee: no invalida el dashboard, las horas de tareas ni ninguna otra key', async () => {
    vi.mocked(getMisHoras).mockResolvedValue(vista);
    const { queryClient, wrapper } = crearCliente();
    queryClient.setQueryData(['dashboard-stats'], { horasAcreditadas: '22.25' });
    queryClient.setQueryData(['taskHours', 101], []);
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMisHoras(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidar).not.toHaveBeenCalled();
    expect(queryClient.getQueryState(['dashboard-stats'])!.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(['taskHours', 101])!.isInvalidated).toBe(false);
  });
});
