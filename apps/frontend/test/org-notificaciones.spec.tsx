import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { getNotificationLink } from '@/lib/services/notifications';

const estado = vi.hoisted(() => ({
  notificaciones: [] as unknown[],
  responder: vi.fn(),
  marcarLeida: vi.fn(),
}));

vi.mock('@/hooks/use-notifications', () => ({
  useNotificaciones: () => ({ data: estado.notificaciones }),
  useConteoNoLeidas: () => ({ data: { total: estado.notificaciones.length } }),
  useMarcarLeida: () => ({ mutate: estado.marcarLeida, isPending: false }),
  useMarcarTodasLeidas: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-organizations', () => ({
  useResponderInvitacion: () => ({ mutate: estado.responder, isPending: false }),
}));
vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() } }));

import { NotificationsBell } from '@/components/layout/notifications-bell';
import { idInvitacionDeNotificacion } from '@/components/organizations/invitacion-acciones';

const notificacion = (tipoNotificacion: string, datosJson: Record<string, unknown> | null, leidaEn: string | null = null) => ({
  idNotificacion: 31,
  idUsuario: 1,
  tipoNotificacion,
  tituloNotificacion: 'Te invitaron a una organización',
  mensajeNotificacion: 'Ana te invitó a "Robotica" como Editor.',
  datosJson,
  creadaEn: new Date().toISOString(),
  leidaEn,
});

describe('enlaces de notificaciones de organizacion', () => {
  it('la invitacion lleva al listado, donde tambien se responde', () => {
    expect(getNotificationLink({ tipoNotificacion: 'INVITACION_ORGANIZACION', datosJson: { organizationId: 4 } })).toBe(
      '/dashboard/organizaciones',
    );
  });

  it('solicitud y cambios llevan a la organizacion; sin id valido, al listado', () => {
    for (const tipo of ['SOLICITUD_UNIRSE_ORGANIZACION', 'ORGANIZACION_ACTUALIZADA']) {
      expect(getNotificationLink({ tipoNotificacion: tipo, datosJson: { organizationId: 4 } })).toBe('/dashboard/organizaciones/4');
      expect(getNotificationLink({ tipoNotificacion: tipo, datosJson: { organizationId: 'x/../y' } })).toBe('/dashboard/organizaciones');
    }
  });

  it('idInvitacionDeNotificacion solo acepta enteros positivos del tipo correcto', () => {
    expect(idInvitacionDeNotificacion(notificacion('INVITACION_ORGANIZACION', { invitationId: 9 }))).toBe(9);
    expect(idInvitacionDeNotificacion(notificacion('INVITACION_ORGANIZACION', { invitationId: '9' }))).toBe(9);
    expect(idInvitacionDeNotificacion(notificacion('INVITACION_ORGANIZACION', { invitationId: -1 }))).toBeNull();
    expect(idInvitacionDeNotificacion(notificacion('INVITACION_ORGANIZACION', null))).toBeNull();
    expect(idInvitacionDeNotificacion(notificacion('ORGANIZACION_ACTUALIZADA', { invitationId: 9 }))).toBeNull();
  });
});

describe('campana: invitaciones a organizaciones', () => {
  beforeEach(() => {
    estado.responder.mockReset();
    estado.marcarLeida.mockReset();
  });
  afterEach(() => cleanup());

  const abrirCampana = () => fireEvent.click(screen.getByRole('button', { name: /Notificaciones/ }));

  it('una invitacion sin leer ofrece aceptar y rechazar', () => {
    estado.notificaciones = [notificacion('INVITACION_ORGANIZACION', { invitationId: 9, organizationId: 4 })];
    render(<NotificationsBell onlyIcon />);
    abrirCampana();

    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    expect(estado.responder).toHaveBeenCalledWith({ idInvitacion: 9, aceptar: true }, expect.any(Object));

    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    expect(estado.responder).toHaveBeenLastCalledWith({ idInvitacion: 9, aceptar: false }, expect.any(Object));
  });

  it('al resolverse, la notificacion se marca como leida', () => {
    estado.notificaciones = [notificacion('INVITACION_ORGANIZACION', { invitationId: 9 })];
    estado.responder.mockImplementation((_vars, opciones) => opciones.onSuccess());
    render(<NotificationsBell onlyIcon />);
    abrirCampana();

    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    expect(estado.marcarLeida).toHaveBeenCalledWith(31);
  });

  it('una invitacion ya leida no vuelve a ofrecer botones', () => {
    estado.notificaciones = [notificacion('INVITACION_ORGANIZACION', { invitationId: 9 }, new Date().toISOString())];
    render(<NotificationsBell onlyIcon />);
    abrirCampana();

    expect(screen.queryByRole('button', { name: 'Aceptar' })).toBeNull();
  });

  it('otras notificaciones no muestran los botones', () => {
    estado.notificaciones = [notificacion('ORGANIZACION_ACTUALIZADA', { organizationId: 4 })];
    render(<NotificationsBell onlyIcon />);
    abrirCampana();

    expect(screen.queryByRole('button', { name: 'Aceptar' })).toBeNull();
  });
});
