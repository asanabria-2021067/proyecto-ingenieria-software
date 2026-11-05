import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Radix Switch usa ResizeObserver, ausente en jsdom.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const getHorarioMock = vi.hoisted(() => vi.fn());
const updateHorarioMock = vi.hoisted(() => vi.fn());
const getClaveMock = vi.hoisted(() => vi.fn());
const guardarSuscripcionMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/notifications', () => ({
  horarioSilencioQueryKey: ['horario-silencio'],
  getHorarioSilencio: (...args: unknown[]) => getHorarioMock(...args),
  updateHorarioSilencio: (...args: unknown[]) => updateHorarioMock(...args),
  getClavePush: (...args: unknown[]) => getClaveMock(...args),
  guardarSuscripcionPush: (...args: unknown[]) => guardarSuscripcionMock(...args),
  borrarSuscripcionPush: vi.fn(),
}));
vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn() } }));

import { HorarioSilencioSection } from '../components/profile/horario-silencio-section';
import { PushSection } from '../components/profile/push-section';
import { claveABytes } from '../lib/push';

function conCliente(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, ui));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('HorarioSilencioSection', () => {
  const guardado = { activo: false, horaInicio: '22:00', horaFin: '07:00', zona: 'America/Guatemala', enSilencio: false };

  it('carga el horario, deja editarlo y lo guarda en hora de Guatemala', async () => {
    getHorarioMock.mockResolvedValue(guardado);
    updateHorarioMock.mockResolvedValue({ ...guardado, activo: true, horaFin: '06:30' });
    conCliente(createElement(HorarioSilencioSection));

    const interruptor = await screen.findByRole('switch', { name: 'Activar horario de silencio' });
    expect(screen.getByText(/Hora de Guatemala/)).toBeInTheDocument();
    expect(screen.getByLabelText('Desde')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardar horario' })).toBeDisabled();

    fireEvent.click(interruptor);
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '06:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horario' }));
    await waitFor(() => expect(updateHorarioMock).toHaveBeenCalledWith({ activo: true, horaInicio: '22:00', horaFin: '06:30' }));
  });

  it('avisa cuando ya esta dentro del horario', async () => {
    getHorarioMock.mockResolvedValue({ ...guardado, activo: true, enSilencio: true });
    conCliente(createElement(HorarioSilencioSection));
    expect(await screen.findByText('En silencio ahora')).toBeInTheDocument();
  });

  it('si falla la carga ofrece reintentar', async () => {
    getHorarioMock.mockRejectedValue(new Error('x'));
    conCliente(createElement(HorarioSilencioSection));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar tu horario de silencio.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('PushSection', () => {
  const pedirPermiso = vi.fn();
  const suscripcion = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'pk', auth: 'ak' } }) };
  const registro = { pushManager: { getSubscription: vi.fn(), subscribe: vi.fn() } };

  beforeEach(() => {
    pedirPermiso.mockResolvedValue('granted');
    registro.pushManager.getSubscription.mockResolvedValue(null);
    registro.pushManager.subscribe.mockResolvedValue(suscripcion);
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'default', requestPermission: pedirPermiso }));
    vi.stubGlobal('PushManager', class {});
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(undefined), register: vi.fn().mockResolvedValue(registro), ready: Promise.resolve(registro) },
    });
    getClaveMock.mockResolvedValue({ clave: 'BPkA-_w' });
    guardarSuscripcionMock.mockResolvedValue({ suscrito: true });
  });

  it('no pide permiso al entrar: solo al pulsar el boton', async () => {
    conCliente(createElement(PushSection));
    const boton = await screen.findByRole('button', { name: 'Activar notificaciones del navegador' });
    expect(pedirPermiso).not.toHaveBeenCalled();

    fireEvent.click(boton);
    await waitFor(() => expect(pedirPermiso).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(guardarSuscripcionMock).toHaveBeenCalledWith({ endpoint: suscripcion.endpoint, p256dh: 'pk', auth: 'ak' }));
    expect(await screen.findByRole('button', { name: 'Desactivar en este dispositivo' })).toBeInTheDocument();
  });

  it('con el permiso bloqueado explica como habilitarlo y no ofrece el boton', async () => {
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'denied', requestPermission: pedirPermiso }));
    conCliente(createElement(PushSection));
    expect(await screen.findByText(/permiso está bloqueado/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar notificaciones del navegador' })).not.toBeInTheDocument();
  });

  it('sin llaves VAPID en el servidor no ofrece activar', async () => {
    getClaveMock.mockResolvedValue({ clave: null });
    conCliente(createElement(PushSection));
    expect(await screen.findByText(/no están disponibles en este momento/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar notificaciones del navegador' })).not.toBeInTheDocument();
  });
});

describe('claveABytes', () => {
  it('decodifica base64url sin relleno', () => {
    expect(Array.from(claveABytes('AQID'))).toEqual([1, 2, 3]);
    expect(Array.from(claveABytes('-_8'))).toEqual([251, 255]);
  });
});
