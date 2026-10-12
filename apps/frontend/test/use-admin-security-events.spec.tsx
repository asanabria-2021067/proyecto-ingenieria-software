import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../lib/services/admin-security', () => ({ getSecurityEvents: vi.fn() }));

import { useAdminSecurityEvents } from '../hooks/use-admin-security-events';
import { adminSecurityEventsPrefix, adminSecurityEventsQueryKey } from '../lib/query-keys/admin-security';
import { getSecurityEvents } from '../lib/services/admin-security';
import type { SecurityEventsPage, SecurityEventsQuery } from '../lib/types/admin-security';

/** FG02-C02 (T-310). Caché del visor: una entrada por filtros y página, sin datos de otra consulta. */

const pagina = (page: number, ids: number[], total = 45): SecurityEventsPage => ({
  data: ids.map((id) => ({
    id,
    tipo: 'LOGIN_FAILED',
    fecha: '2026-10-11T06:00:00.000Z',
    actor: null,
    cuenta: null,
    origen: { ip: null, ipConfiable: false },
    detalle: {},
  })),
  total,
  page,
  totalPages: Math.ceil(total / 20),
  tipos: ['LOGIN_FAILED'],
});
const VACIA: SecurityEventsPage = { data: [], total: 0, page: 1, totalPages: 0, tipos: [] };

function crearCliente() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

/** Promesa que el test resuelve a mano, para observar el estado intermedio. */
function diferida<T>() {
  let resolver!: (valor: T) => void;
  let rechazar!: (error: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

afterEach(() => vi.clearAllMocks());

describe('FG02-C02: adminSecurityEventsQueryKey', () => {
  it('cuelga del prefijo del visor y lleva filtros, tamaño y página', () => {
    expect(adminSecurityEventsQueryKey()).toEqual([
      'admin',
      'eventos-seguridad',
      { tipo: null, desde: null, hasta: null, idUsuario: null },
      20,
      1,
    ]);
    expect(adminSecurityEventsQueryKey().slice(0, 2)).toEqual([...adminSecurityEventsPrefix]);
  });

  it.each([
    [{}, { tipo: undefined, desde: '', hasta: '   ', idUsuario: undefined, page: 1, limit: 20 }],
    [
      { tipo: 'LOGIN_FAILED', idUsuario: 8 },
      { idUsuario: 8, tipo: 'LOGIN_FAILED' },
    ],
    [{ desde: '2026-10-11T00:00:00-06:00' }, { desde: '  2026-10-11T00:00:00-06:00 ' }],
    [{}, { tipo: 'TASK_CREATED', idUsuario: -1, page: 0, limit: 0 }],
    [{ limit: 50 }, { limit: 500 }],
  ] as [SecurityEventsQuery, SecurityEventsQuery][])('%j y %j son la misma consulta', (a, b) => {
    expect(adminSecurityEventsQueryKey(a)).toEqual(adminSecurityEventsQueryKey(b));
  });

  it.each([
    [{ tipo: 'LOGIN_FAILED' }, { tipo: 'ACCOUNT_LOCKED' }],
    [{ idUsuario: 8 }, { idUsuario: 9 }],
    [{ desde: '2026-10-11T06:00:00Z' }, { hasta: '2026-10-11T06:00:00Z' }],
    [{ page: 1 }, { page: 2 }],
    [{ limit: 20 }, { limit: 50 }],
  ] as [SecurityEventsQuery, SecurityEventsQuery][])('%j y %j son consultas distintas', (a, b) => {
    expect(adminSecurityEventsQueryKey(a)).not.toEqual(adminSecurityEventsQueryKey(b));
  });
});

describe('FG02-C02: useAdminSecurityEvents', () => {
  it('pide la página con los filtros normalizados y la guarda bajo su key', async () => {
    vi.mocked(getSecurityEvents).mockResolvedValue(pagina(1, [3, 2, 1]));
    const { queryClient, wrapper } = crearCliente();
    const query = { tipo: 'LOGIN_FAILED', desde: ' 2026-10-11T06:00:00Z ', idUsuario: 8 } as const;

    const { result } = renderHook(() => useAdminSecurityEvents(query), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(getSecurityEvents).mock.calls[0][0]).toEqual({
      tipo: 'LOGIN_FAILED',
      desde: '2026-10-11T06:00:00Z',
      idUsuario: 8,
      page: 1,
      limit: 20,
    });
    expect(vi.mocked(getSecurityEvents).mock.calls[0][1]).toBeInstanceOf(AbortSignal);
    expect(queryClient.getQueryData(adminSecurityEventsQueryKey(query))).toBe(result.current.data);
  });

  it('al cambiar de página mantiene la anterior a la vista, marcada como provisional', async () => {
    const segunda = diferida<SecurityEventsPage>();
    vi.mocked(getSecurityEvents).mockResolvedValueOnce(pagina(1, [3, 2])).mockReturnValueOnce(segunda.promesa);
    const { wrapper } = crearCliente();

    const { result, rerender } = renderHook((props: SecurityEventsQuery) => useAdminSecurityEvents(props), {
      wrapper,
      initialProps: { page: 1 },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ page: 2 });
    expect(result.current.data?.page).toBe(1);
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.isFetching).toBe(true);

    await act(async () => segunda.resolver(pagina(2, [1])));
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data?.page).toBe(2);
  });

  it.each([
    ['el filtro', { tipo: 'ACCOUNT_LOCKED' }],
    ['la cuenta', { idUsuario: 9 }],
    ['el rango', { desde: '2026-10-11T06:00:00Z' }],
    ['el tamaño de página', { limit: 50 }],
  ] as [string, SecurityEventsQuery][])('al cambiar %s NO muestra los resultados de la consulta anterior', async (_nombre, siguiente) => {
    const pendiente = diferida<SecurityEventsPage>();
    vi.mocked(getSecurityEvents).mockResolvedValueOnce(pagina(1, [3, 2])).mockReturnValueOnce(pendiente.promesa);
    const { wrapper } = crearCliente();

    const { result, rerender } = renderHook((props: SecurityEventsQuery) => useAdminSecurityEvents(props), {
      wrapper,
      initialProps: {},
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender(siguiente);
    expect(result.current.data).toBeUndefined();
    expect(result.current.isPlaceholderData).toBe(false);
    expect(result.current.isLoading).toBe(true);

    await act(async () => pendiente.resolver(VACIA));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(VACIA);
  });

  it('un resultado vacío es un éxito, no un error', async () => {
    vi.mocked(getSecurityEvents).mockResolvedValue(VACIA);
    const { wrapper } = crearCliente();
    const { result } = renderHook(() => useAdminSecurityEvents(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current).toMatchObject({ isError: false, data: VACIA });
  });

  it.each([400, 403, 500])('un %i queda como error, sin datos y sin reintentos automáticos', async (statusCode) => {
    vi.mocked(getSecurityEvents).mockRejectedValue(Object.assign(new Error('falló'), { statusCode }));
    const { wrapper } = crearCliente();
    const { result } = renderHook(() => useAdminSecurityEvents(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toMatchObject({ statusCode });
    expect(getSecurityEvents).toHaveBeenCalledTimes(1);
  });

  it('refetch vuelve a pedir la misma consulta y sale del error', async () => {
    vi.mocked(getSecurityEvents)
      .mockRejectedValueOnce(Object.assign(new Error('falló'), { statusCode: 500 }))
      .mockResolvedValueOnce(pagina(1, [1], 1));
    const { wrapper } = crearCliente();
    const { result } = renderHook(() => useAdminSecurityEvents({ tipo: 'LOGIN_FAILED' }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data.map((evento) => evento.id)).toEqual([1]);
    expect(vi.mocked(getSecurityEvents).mock.calls[1][0]).toEqual(vi.mocked(getSecurityEvents).mock.calls[0][0]);
  });

  it('invalidar el prefijo refresca la consulta montada', async () => {
    vi.mocked(getSecurityEvents).mockResolvedValue(pagina(1, [1], 1));
    const { queryClient, wrapper } = crearCliente();
    const { result } = renderHook(() => useAdminSecurityEvents(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: adminSecurityEventsPrefix });
    });
    expect(getSecurityEvents).toHaveBeenCalledTimes(2);
  });

  it('cancela la petición en curso si la consulta deja de usarse', async () => {
    vi.mocked(getSecurityEvents).mockReturnValue(diferida<SecurityEventsPage>().promesa);
    const { queryClient, wrapper } = crearCliente();
    const { unmount } = renderHook(() => useAdminSecurityEvents(), { wrapper });
    await waitFor(() => expect(getSecurityEvents).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(getSecurityEvents).mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(false);

    unmount();
    await act(async () => {
      await queryClient.cancelQueries({ queryKey: adminSecurityEventsPrefix });
    });
    expect(signal.aborted).toBe(true);
  });

  it('con enabled=false no pide nada', () => {
    const { wrapper } = crearCliente();
    renderHook(() => useAdminSecurityEvents({}, false), { wrapper });
    expect(getSecurityEvents).not.toHaveBeenCalled();
  });
});
