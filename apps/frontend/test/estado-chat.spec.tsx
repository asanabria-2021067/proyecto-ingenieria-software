import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Radix RadioGroup usa ResizeObserver, ausente en jsdom.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const getMiEstadoMock = vi.hoisted(() => vi.fn());
const setMiEstadoMock = vi.hoisted(() => vi.fn());
const clearMiEstadoMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/chat', () => ({
  getMiEstado: (...args: unknown[]) => getMiEstadoMock(...args),
  setMiEstado: (...args: unknown[]) => setMiEstadoMock(...args),
  clearMiEstado: (...args: unknown[]) => clearMiEstadoMock(...args),
}));

import { calcularVenceEn, EstadoIndicador, MiEstadoBoton } from '../components/chat-dock/estado-chat';
import { miEstadoChatQueryKey } from '../lib/query-keys/chat';
import type { ChatEstado } from '../lib/types/chat';

function renderConCliente(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidar = vi.spyOn(client, 'invalidateQueries');
  const utils = render(createElement(QueryClientProvider, { client }, ui));
  return { client, invalidar, ...utils };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('calcularVenceEn', () => {
  const ahora = new Date(2026, 9, 16, 15, 30, 0);

  it('suma minutos para 30m, 1h y 4h', () => {
    expect(calcularVenceEn('30m', ahora)).toBe(new Date(ahora.getTime() + 30 * 60_000).toISOString());
    expect(calcularVenceEn('1h', ahora)).toBe(new Date(ahora.getTime() + 60 * 60_000).toISOString());
    expect(calcularVenceEn('4h', ahora)).toBe(new Date(ahora.getTime() + 240 * 60_000).toISOString());
  });

  it('hoy vence a la medianoche local y nunca devuelve null', () => {
    expect(calcularVenceEn('hoy', ahora)).toBe(new Date(2026, 9, 17).toISOString());
    expect(calcularVenceEn('nunca', ahora)).toBeNull();
  });
});

describe('EstadoIndicador', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-16T12:00:00.000Z') }));

  it('muestra icono con texto para un estado fijo y el texto libre para el personalizado', () => {
    const { rerender } = render(<EstadoIndicador estado={{ tipo: 'EN_CLASE', texto: null, venceEn: null }} />);
    expect(screen.getByText('En clase')).toBeInTheDocument();
    rerender(<EstadoIndicador estado={{ tipo: 'PERSONALIZADO', texto: 'Estudiando', venceEn: null }} />);
    expect(screen.getByText('Estudiando')).toBeInTheDocument();
  });

  it('no renderiza nada sin estado', () => {
    const { container } = render(<EstadoIndicador estado={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('oculta un estado ya vencido, incluso justo en el limite', () => {
    const { container } = render(<EstadoIndicador estado={{ tipo: 'OCUPADO', texto: null, venceEn: '2026-10-16T12:00:00.000Z' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lo oculta cuando vence el timer, sin refetch', () => {
    const estado: ChatEstado = { tipo: 'OCUPADO', texto: null, venceEn: '2026-10-16T12:00:30.000Z' };
    render(<EstadoIndicador estado={estado} />);
    expect(screen.getByText('Ocupado')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(29_999));
    expect(screen.getByText('Ocupado')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Ocupado')).not.toBeInTheDocument();
  });
});

describe('MiEstadoBoton (selector)', () => {
  it('sin estado ofrece definirlo; guarda un estado fijo sin caducidad y refresca caches', async () => {
    getMiEstadoMock.mockResolvedValue(null);
    setMiEstadoMock.mockResolvedValue({ tipo: 'EN_CLASE', texto: null, venceEn: null });
    const { client, invalidar } = renderConCliente(<MiEstadoBoton />);

    fireEvent.click(await screen.findByRole('button', { name: 'Definir mi estado' }));
    fireEvent.click(screen.getByRole('radio', { name: 'En clase' }));
    expect(screen.queryByLabelText('Texto del estado')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(setMiEstadoMock).toHaveBeenCalledWith({ tipo: 'EN_CLASE', venceEn: null }));
    await waitFor(() => expect(client.getQueryData(miEstadoChatQueryKey)).toMatchObject({ tipo: 'EN_CLASE' }));
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['chats-global'] });
  });

  it('el personalizado exige texto, lo recorta y envia la caducidad elegida', async () => {
    getMiEstadoMock.mockResolvedValue(null);
    setMiEstadoMock.mockResolvedValue({ tipo: 'PERSONALIZADO', texto: 'Estudiando', venceEn: 'x' });
    renderConCliente(<MiEstadoBoton />);

    fireEvent.click(await screen.findByRole('button', { name: 'Definir mi estado' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Personalizado' }));
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Texto del estado'), { target: { value: '  Estudiando  ' } });
    fireEvent.change(screen.getByLabelText('Borrar estado después de'), { target: { value: '1h' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(setMiEstadoMock).toHaveBeenCalledTimes(1));
    const payload = setMiEstadoMock.mock.calls[0][0];
    expect(payload).toMatchObject({ tipo: 'PERSONALIZADO', texto: 'Estudiando' });
    expect(Date.parse(payload.venceEn)).toBeGreaterThan(Date.now());
  });

  it('con estado vigente muestra Limpiar estado y lo borra del cache', async () => {
    getMiEstadoMock.mockResolvedValue({ tipo: 'OCUPADO', texto: null, venceEn: null });
    clearMiEstadoMock.mockResolvedValue(undefined);
    const { client } = renderConCliente(<MiEstadoBoton />);

    fireEvent.click(await screen.findByRole('button', { name: 'Mi estado: Ocupado. Cambiar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar estado' }));

    await waitFor(() => expect(clearMiEstadoMock).toHaveBeenCalled());
    await waitFor(() => expect(client.getQueryData(miEstadoChatQueryKey)).toBeNull());
  });
});
