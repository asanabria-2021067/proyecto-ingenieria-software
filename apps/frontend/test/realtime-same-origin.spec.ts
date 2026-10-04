import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

const mockIo = vi.fn();
vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => mockIo(...args),
}));

import { realtimeBaseUrl } from '../lib/realtime/socket-url';
import { useRealtimeNotifications } from '../lib/hooks/useRealtimeNotifications';

/**
 * G07-C05 · P2/T12 (HU-157). Con NEXT_PUBLIC_API_URL horneada vacía (variante
 * same-origin) el socket usa el origen de la página: nunca una IP ni :3001.
 * Con una URL explícita se conserva el comportamiento previo a P4.
 */

const PRODUCTION_API = 'http://158.23.57.118:3001';
const IPV4 = /\b\d{1,3}(\.\d{1,3}){3}\b/;

function fakeSocket() {
  return { on: vi.fn(), off: vi.fn(), close: vi.fn(), emit: vi.fn(), timeout: vi.fn() };
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient() }, children);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('T12: base del socket', () => {
  const https = { origin: 'https://uvgenius.example', protocol: 'https:' };
  const http = { origin: 'http://uvgenius.example', protocol: 'http:' };

  it('vacía → mismo origen de la página, sin IP ni :3001', () => {
    const base = realtimeBaseUrl('', https);
    expect(base).toBe('https://uvgenius.example');
    expect(base).not.toContain(':3001');
    expect(base).not.toMatch(IPV4);
  });

  it('URL explícita (legacy) → la misma URL con el esquema ws/wss de la página', () => {
    expect(realtimeBaseUrl(PRODUCTION_API, http)).toBe('ws://158.23.57.118:3001');
    expect(realtimeBaseUrl('https://api.uvgenius.example', https)).toBe('wss://api.uvgenius.example');
  });

  it('sin variable: backend local en desarrollo/test y mismo origen en un build de producción', () => {
    expect(realtimeBaseUrl(undefined, http)).toBe('ws://localhost:3001');
    vi.stubEnv('NODE_ENV', 'production');
    expect(realtimeBaseUrl(undefined, https)).toBe('https://uvgenius.example');
  });
});

describe('T12: useRealtimeNotifications', () => {
  it('same-origin: conecta /notifications en el origen de la página', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    mockIo.mockReturnValue(fakeSocket());

    renderHook(() => useRealtimeNotifications(true), { wrapper });

    const [url, options] = mockIo.mock.calls[0];
    expect(url).toBe(`${window.location.origin}/notifications`);
    expect(url).not.toContain(':3001');
    expect(url).not.toMatch(IPV4);
    expect(options).toMatchObject({ withCredentials: true });
  });

  it('legacy: con NEXT_PUBLIC_API_URL explícita sigue usando esa URL', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', PRODUCTION_API);
    mockIo.mockReturnValue(fakeSocket());

    renderHook(() => useRealtimeNotifications(true), { wrapper });

    expect(mockIo.mock.calls[0][0]).toBe('ws://158.23.57.118:3001/notifications');
  });
});
