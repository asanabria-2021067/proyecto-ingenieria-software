import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const pushMock = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/services/cuenta', async (original) => ({
  ...(await original<typeof import('@/lib/services/cuenta')>()),
  reportarNoFuiYo: vi.fn(),
}));

import { aviso } from '@/lib/mensajes';
import { reportarNoFuiYo } from '@/lib/services/cuenta';
import { getNotificationLink } from '../lib/services/notifications';
import { NOTIFICATION_TYPE_PRESENTATION } from '../lib/notifications/preference-groups';
import { idSesionDeNotificacion, NoFuiYoAccion } from '../components/profile/no-fui-yo-accion';

function montar() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(NoFuiYoAccion, { idSesion: 'sesion-1' })));
}

beforeEach(() => {
  vi.mocked(reportarNoFuiYo).mockResolvedValue({ cerrada: true, actual: false, cambiarContrasena: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MEJ-82: aviso de nuevo inicio de sesión', () => {
  it('lee el id de sesión solo del tipo NUEVO_INICIO_SESION', () => {
    expect(idSesionDeNotificacion({ tipoNotificacion: 'NUEVO_INICIO_SESION', datosJson: { idSesion: 'abc' } })).toBe('abc');
    expect(idSesionDeNotificacion({ tipoNotificacion: 'NUEVO_INICIO_SESION', datosJson: {} })).toBeNull();
    expect(idSesionDeNotificacion({ tipoNotificacion: 'CUENTA_VERIFICADA', datosJson: { idSesion: 'abc' } })).toBeNull();
  });

  it('los tipos nuevos están en el catálogo de Cuenta y seguridad y enlazan a su pantalla', () => {
    for (const tipo of ['NUEVO_INICIO_SESION', 'SOLICITUD_DESACTIVACION', 'DESACTIVACION_RESUELTA']) {
      expect(NOTIFICATION_TYPE_PRESENTATION[tipo]?.grupo).toBe('cuenta');
    }
    const datos = { idSesion: 'abc' };
    expect(getNotificationLink({ tipoNotificacion: 'NUEVO_INICIO_SESION', datosJson: datos })).toBe('/dashboard/configuracion#sesiones');
    expect(getNotificationLink({ tipoNotificacion: 'SOLICITUD_DESACTIVACION', datosJson: datos })).toBe(
      '/dashboard/admin/solicitudes-desactivacion',
    );
  });

  it('«No fui yo» cierra esa sesión y lleva a cambiar la contraseña', async () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'No fui yo' }));
    await waitFor(() => expect(reportarNoFuiYo).toHaveBeenCalledWith('sesion-1'));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard/configuracion#cambiar-contrasena'));
  });

  it('si la sesión reportada es la de este navegador, va al inicio de sesión', async () => {
    vi.mocked(reportarNoFuiYo).mockResolvedValue({ cerrada: true, actual: true, cambiarContrasena: true });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'No fui yo' }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
  });

  it('si la sesión ya no existe (404) igual lleva a cambiar la contraseña', async () => {
    vi.mocked(reportarNoFuiYo).mockRejectedValue(Object.assign(new Error('x'), { statusCode: 404 }));
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'No fui yo' }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard/configuracion#cambiar-contrasena'));
  });

  it('ante otro error avisa y no navega', async () => {
    vi.mocked(reportarNoFuiYo).mockRejectedValue(Object.assign(new Error('x'), { statusCode: 500 }));
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'No fui yo' }));
    await waitFor(() => expect(aviso.error).toHaveBeenCalled());
    expect(pushMock).not.toHaveBeenCalled();
  });
});
