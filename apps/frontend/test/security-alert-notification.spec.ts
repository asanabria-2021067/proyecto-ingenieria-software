import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { getNotificationLink } from '../lib/services/notifications';

/**
 * G05-C13 · OWASP25-C038 (HU-157). La notificación ALERTA_SEGURIDAD se
 * renderiza como texto seguro (título y mensaje del backend, solo conteos)
 * y enlaza a la gestión de usuarios del admin; nunca se muestra su
 * `datosJson` y un contenido con HTML no se interpreta. Los tipos previos
 * conservan su enlace.
 */

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
});

vi.mock('../hooks/use-notifications', () => ({
  useNotificaciones: vi.fn(),
  useConteoNoLeidas: vi.fn(),
  useMarcarLeida: vi.fn(),
  useMarcarTodasLeidas: vi.fn(),
}));

import { NotificationsBell } from '../components/layout/notifications-bell';
import { useConteoNoLeidas, useMarcarLeida, useMarcarTodasLeidas, useNotificaciones } from '../hooks/use-notifications';

function mockHooks(notificaciones: unknown[]) {
  vi.mocked(useNotificaciones).mockReturnValue({ data: notificaciones } as never);
  vi.mocked(useConteoNoLeidas).mockReturnValue({ data: { total: notificaciones.length } } as never);
  vi.mocked(useMarcarLeida).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  vi.mocked(useMarcarTodasLeidas).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
}

const alerta = (overrides: Record<string, unknown> = {}) => ({
  idNotificacion: 90,
  idUsuario: 1,
  tipoNotificacion: 'ALERTA_SEGURIDAD',
  tituloNotificacion: 'Alerta de seguridad',
  mensajeNotificacion:
    'Se registraron 37 intentos de acceso fallidos o bloqueos de cuenta en los últimos 10 minutos. Revisa los eventos de seguridad y el estado de las cuentas.',
  datosJson: { eventos: 37, ventanaMinutos: 10 },
  creadaEn: new Date().toISOString(),
  leidaEn: null,
  ...overrides,
});

describe('G05-C13: notificación de alerta de seguridad', () => {
  afterEach(() => cleanup());

  it('enlaza a la gestión de usuarios del admin', () => {
    expect(getNotificationLink(alerta())).toBe('/dashboard/admin/usuarios');
  });

  it('los tipos anteriores conservan su destino', () => {
    expect(getNotificationLink({ tipoNotificacion: 'SOLICITUD_RECUPERACION_CONTRASENA', datosJson: { solicitudId: 1 } })).toBe(
      '/dashboard/admin/solicitudes-recuperacion',
    );
    expect(getNotificationLink({ tipoNotificacion: 'POSTULACION_RESUELTA', datosJson: { projectId: 1 } })).toBe(
      '/dashboard/mis-postulaciones',
    );
    expect(getNotificationLink({ tipoNotificacion: 'NUEVA_POSTULACION', datosJson: { projectId: 4 } })).toBe(
      '/dashboard/proyectos/4/postulaciones',
    );
  });

  it('se renderiza en la campana con título y mensaje, sin datosJson', () => {
    mockHooks([alerta()]);
    render(createElement(NotificationsBell));
    fireEvent.click(screen.getByRole('button', { name: /Notificaciones/ }));

    const enlace = screen.getByRole('link', { name: /Alerta de seguridad/ });
    expect(enlace).toHaveAttribute('href', '/dashboard/admin/usuarios');
    expect(screen.getByText(/37 intentos de acceso fallidos/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('ventanaMinutos');
  });

  it('un contenido con HTML se muestra como texto, nunca se interpreta', () => {
    mockHooks([
      alerta({
        tituloNotificacion: 'Alerta <img src=x onerror="alert(1)">',
        mensajeNotificacion: '<script>alert(1)</script>',
        datosJson: { eventos: 1, ventanaMinutos: 10, ip: '203.0.113.9' },
      }),
    ]);
    const { container } = render(createElement(NotificationsBell));
    fireEvent.click(screen.getByRole('button', { name: /Notificaciones/ }));

    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(container.ownerDocument.body.textContent).not.toContain('203.0.113.9');
  });
});
