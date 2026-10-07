import { describe, expect, it } from 'vitest';
import { getNotificationLink } from '../lib/services/notifications';

describe('notificación CALENDARIO_COMPARTIDO (HU-184)', () => {
  it('lleva al calendario, donde se activa el calendario compartido', () => {
    expect(
      getNotificationLink({ tipoNotificacion: 'CALENDARIO_COMPARTIDO', datosJson: { ownerId: 1, ownerName: 'Carlos Mendoza' } }),
    ).toBe('/dashboard/calendario');
  });
});
