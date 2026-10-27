import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  esErrorDeSesion,
  esErrorTransitorio,
  esperaExponencial,
  reintentarSesionTransitoria,
  REINTENTOS_SESION,
} from '@/lib/api/query-retry';
import { apiFetch, parseRetryAfter } from '@/lib/api/client';

/**
 * IESUC-568 (C2): la sesión (/usuarios/me) distingue 401 de errores
 * transitorios. 429 y fallos de red se reintentan con espera exponencial
 * respetando Retry-After; el 401 y el resto se reportan sin reintentar.
 */

const getMeMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/users', () => ({ getMe: getMeMock }));
vi.mock('@/lib/api/session', () => ({ redirectToLoginOnSessionExpired: vi.fn() }));

import { useCurrentUser } from '@/hooks/use-current-user';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  getMeMock.mockReset();
});

describe('clasificación de errores', () => {
  it('solo el 401 es error de sesión', () => {
    expect(esErrorDeSesion({ statusCode: 401 })).toBe(true);
    for (const error of [{ statusCode: 403 }, { statusCode: 429 }, new TypeError('Failed to fetch'), null]) {
      expect(esErrorDeSesion(error)).toBe(false);
    }
  });

  it('429 y fallos de red son transitorios; 401, 403, 404 y 500 no', () => {
    expect(esErrorTransitorio({ statusCode: 429 })).toBe(true);
    expect(esErrorTransitorio(new TypeError('Failed to fetch'))).toBe(true);
    for (const statusCode of [401, 403, 404, 500]) expect(esErrorTransitorio({ statusCode })).toBe(false);
  });

  it('reintenta un transitorio como mucho REINTENTOS_SESION veces', () => {
    expect(reintentarSesionTransitoria(0, { statusCode: 429 })).toBe(true);
    expect(reintentarSesionTransitoria(REINTENTOS_SESION - 1, { statusCode: 429 })).toBe(true);
    expect(reintentarSesionTransitoria(REINTENTOS_SESION, { statusCode: 429 })).toBe(false);
    expect(reintentarSesionTransitoria(0, { statusCode: 401 })).toBe(false);
  });
});

describe('espera entre reintentos', () => {
  it('sin Retry-After es exponencial (1 s, 2 s, 4 s) con tope de 30 s', () => {
    expect([0, 1, 2, 10].map((n) => esperaExponencial(n, { statusCode: 429 }))).toEqual([1000, 2000, 4000, 30000]);
  });

  it('respeta Retry-After cuando viene', () => {
    expect(esperaExponencial(0, { statusCode: 429, retryAfterMs: 5000 })).toBe(5000);
    expect(esperaExponencial(2, { statusCode: 429, retryAfterMs: 0 })).toBe(0);
  });

  it('parseRetryAfter entiende segundos y fecha HTTP', () => {
    const ahora = Date.parse('2026-10-27T12:00:00Z');
    expect(parseRetryAfter('7', ahora)).toBe(7000);
    expect(parseRetryAfter('Tue, 27 Oct 2026 12:00:10 GMT', ahora)).toBe(10000);
    expect(parseRetryAfter('Tue, 27 Oct 2026 11:59:00 GMT', ahora)).toBe(0);
    expect(parseRetryAfter('pronto', ahora)).toBeNull();
    expect(parseRetryAfter(null, ahora)).toBeNull();
  });

  it('apiFetch adjunta retryAfterMs al error de un 429', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ statusCode: 429, message: 'Too Many Requests' }), {
          status: 429,
          headers: { 'Retry-After': '3' },
        }),
      ),
    );

    await expect(apiFetch('/usuarios/me')).rejects.toMatchObject({ statusCode: 429, retryAfterMs: 3000 });
  });
});

describe('useCurrentUser', () => {
  function envoltorio() {
    const client = new QueryClient();
    return function Envoltorio({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client }, children);
    };
  }

  it('un 429 seguido de éxito termina con la sesión, tras esperar Retry-After', async () => {
    vi.useFakeTimers();
    getMeMock
      .mockRejectedValueOnce(Object.assign(new Error('Too Many Requests'), { statusCode: 429, retryAfterMs: 5000 }))
      .mockResolvedValueOnce({ idUsuario: 7, roles: ['estudiante'] });
    const { result } = renderHook(() => useCurrentUser(), { wrapper: envoltorio() });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(getMeMock).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(getMeMock).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ idUsuario: 7, roles: ['estudiante'] });
  });

  it('un fallo de red persistente se reintenta con espera exponencial y luego queda en error', async () => {
    vi.useFakeTimers();
    getMeMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useCurrentUser(), { wrapper: envoltorio() });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 100);
    });
    expect(getMeMock).toHaveBeenCalledTimes(1 + REINTENTOS_SESION);
    expect(result.current.isError).toBe(true);
  });

  it('un 401 no se reintenta', async () => {
    vi.useFakeTimers();
    getMeMock.mockRejectedValue(Object.assign(new Error('Unauthorized'), { statusCode: 401 }));
    const { result } = renderHook(() => useCurrentUser(), { wrapper: envoltorio() });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getMeMock).toHaveBeenCalledTimes(1);
    expect(result.current.isError).toBe(true);
  });
});
