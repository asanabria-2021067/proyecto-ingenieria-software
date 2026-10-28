import { describe, expect, it } from 'vitest';
import { getNotificationLink, idUsuarioSeguro, linkCalendarioCompartido } from '../lib/services/notifications';

describe('notificación CALENDARIO_COMPARTIDO (HU-184, G03-C11 UI-40)', () => {
  it('lleva al calendario con el propietario validado en la URL para activarlo', () => {
    expect(
      getNotificationLink({ tipoNotificacion: 'CALENDARIO_COMPARTIDO', datosJson: { ownerId: 1, ownerName: 'Carlos Mendoza' } }),
    ).toBe('/dashboard/calendario?compartido=1');
  });

  it('una notificación antigua sin ownerId sigue abriendo el calendario', () => {
    expect(getNotificationLink({ tipoNotificacion: 'CALENDARIO_COMPARTIDO', datosJson: { ownerName: 'Carlos' } })).toBe('/dashboard/calendario');
    expect(getNotificationLink({ tipoNotificacion: 'CALENDARIO_COMPARTIDO', datosJson: {} })).toBe('/dashboard/calendario');
  });

  it.each([['abc'], [-1], [0], [1.5], ['1 OR 1=1'], ['12; DROP'], [null], [{ id: 1 }], ['9007199254740993']])(
    'un ownerId no válido (%s) nunca entra en la URL',
    (ownerId) => {
      expect(linkCalendarioCompartido(ownerId)).toBe('/dashboard/calendario');
      expect(idUsuarioSeguro(ownerId)).toBeNull();
    },
  );

  it('acepta el id como número o como texto de dígitos', () => {
    expect(idUsuarioSeguro(42)).toBe(42);
    expect(idUsuarioSeguro('42')).toBe(42);
    expect(linkCalendarioCompartido('42')).toBe('/dashboard/calendario?compartido=42');
  });
});

describe('notificaciones de reuniones de Administración (HU-195)', () => {
  const programada = { meetingId: 12, eventId: 41, projectId: 3, projectTitle: 'Huerto UVG', eventTitle: 'Seguimiento', fechaInicioTexto: 'x', fechaInicioIso: '2026-11-20T16:00:00.000Z' };

  it.each(['REUNION_PROGRAMADA', 'REUNION_ACTUALIZADA'])('%s abre el calendario, sin ids del aviso en la URL', (tipoNotificacion) => {
    expect(getNotificationLink({ tipoNotificacion, datosJson: programada })).toBe('/dashboard/calendario');
  });

  it('REUNION_CANCELADA abre el calendario aunque el evento ya no exista (el aviso no trae proyecto)', () => {
    expect(getNotificationLink({ tipoNotificacion: 'REUNION_CANCELADA', datosJson: { meetingId: 12, eventTitle: 'Seguimiento', fechaInicioTexto: 'x', fechaInicioIso: 'y' } })).toBe('/dashboard/calendario');
  });

  it('los demás tipos conservan su destino (o ninguno)', () => {
    expect(getNotificationLink({ tipoNotificacion: 'RECORDATORIO_EVENTO', datosJson: { eventId: 41, projectId: 3 } })).toBeNull();
    expect(getNotificationLink({ tipoNotificacion: 'POSTULACION_RESUELTA', datosJson: {} })).toBe('/dashboard/mis-postulaciones');
  });
});
