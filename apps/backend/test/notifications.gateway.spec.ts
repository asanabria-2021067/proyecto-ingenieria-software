import { describe, expect, it, vi } from 'vitest';
import { NotificationsGateway } from '../src/notifications/notifications.gateway';

function makeGateway() {
  const gateway = new NotificationsGateway({} as any);
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  (gateway as any).server = { to };
  return { gateway, to, emit };
}

describe('NotificationsGateway', () => {
  describe('notifyUsers (evento genérico existente)', () => {
    it('emite "notification" a la room user:{idUsuario} de cada destinatario', async () => {
      const { gateway, to, emit } = makeGateway();

      await gateway.notifyUsers([1, 2], { tituloNotificacion: 'x' });

      expect(to).toHaveBeenCalledWith('user:1');
      expect(to).toHaveBeenCalledWith('user:2');
      expect(emit).toHaveBeenCalledWith('notification', { tituloNotificacion: 'x' });
      expect(emit).toHaveBeenCalledTimes(2);
    });
  });

  describe('notifySprintFinalizationStarted (A4)', () => {
    it('emite literalmente el evento SPRINT_FINALIZATION_STARTED', async () => {
      const { gateway, emit } = makeGateway();

      await gateway.notifySprintFinalizationStarted([5], { projectId: 10, sprintId: 20 });

      expect(emit).toHaveBeenCalledWith('SPRINT_FINALIZATION_STARTED', {
        projectId: 10,
        sprintId: 20,
      });
    });

    it('el payload incluye projectId y sprintId', async () => {
      const { gateway, emit } = makeGateway();

      await gateway.notifySprintFinalizationStarted([5], { projectId: 42, sprintId: 99 });

      const [, payload] = emit.mock.calls[0];
      expect(payload).toEqual({ projectId: 42, sprintId: 99 });
    });

    it('usa el mismo mecanismo de rooms user:{idUsuario} que notifyUsers, uno por destinatario', async () => {
      const { gateway, to, emit } = makeGateway();

      await gateway.notifySprintFinalizationStarted([7, 8, 9], { projectId: 1, sprintId: 2 });

      expect(to).toHaveBeenCalledWith('user:7');
      expect(to).toHaveBeenCalledWith('user:8');
      expect(to).toHaveBeenCalledWith('user:9');
      expect(emit).toHaveBeenCalledTimes(3);
    });

    it('con lista vacía de destinatarios no emite nada', async () => {
      const { gateway, emit } = makeGateway();

      await gateway.notifySprintFinalizationStarted([], { projectId: 1, sprintId: 2 });

      expect(emit).not.toHaveBeenCalled();
    });
  });
});
