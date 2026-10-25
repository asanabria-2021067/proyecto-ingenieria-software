import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TEMPLATES } from '../src/notifications/templates/notification.templates';

const base = { meetingId: 7, eventTitle: 'Seguimiento de cierre', fechaInicioTexto: '20 de noviembre de 2026, 10:00', fechaInicioIso: '2026-11-20T16:00:00.000Z' };
const proyecto = { eventId: 41, projectId: 3, projectTitle: 'Huerto UVG' };

describe('HU-195 · plantillas del ciclo de vida de una reunión', () => {
  it('programada nombra solo el proyecto propio del destinatario', () => {
    const t = NOTIFICATION_TEMPLATES.REUNION_PROGRAMADA;
    expect(t.title).toBe('Nueva reunión de Administración');
    expect(t.message({ ...base, ...proyecto })).toBe(
      'Administración convocó a tu equipo de "Huerto UVG" a "Seguimiento de cierre" el 20 de noviembre de 2026, 10:00.',
    );
  });

  it('actualizada da la nueva fecha', () => {
    expect(NOTIFICATION_TEMPLATES.REUNION_ACTUALIZADA.message({ ...base, ...proyecto })).toBe(
      'Cambió la reunión "Seguimiento de cierre" con tu equipo de "Huerto UVG". Ahora es el 20 de noviembre de 2026, 10:00.',
    );
  });

  it('cancelada no menciona ningún proyecto (también la reciben exintegrantes)', () => {
    const mensaje = NOTIFICATION_TEMPLATES.REUNION_CANCELADA.message(base);
    expect(mensaje).toBe('Administración canceló la reunión "Seguimiento de cierre" del 20 de noviembre de 2026, 10:00.');
    expect(mensaje).not.toMatch(/proyecto|equipo/i);
  });
});
