import { describe, expect, it, vi } from 'vitest';
import { GATEWAY_OPTIONS } from '@nestjs/websockets/constants';
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

  /**
   * X4 (Parte C): regresión de que incorporar SPRINT_FINALIZATION_STARTED
   * (A4) no alteró la configuración observable del gateway ni reemplazó el
   * evento genérico `notification` ya existente. Lee la metadata REAL que
   * Nest ya consulta en producción (`@WebSocketGateway` la escribe vía
   * `Reflect.defineMetadata` — mismo mecanismo ya usado por
   * project-write-guard.integration.spec.ts para `GUARDS_METADATA`), nunca
   * una constante hardcodeada aparte que pudiera divergir silenciosamente
   * del decorador real.
   */
  describe('configuración del gateway (X4 — no regresión tras SPRINT_FINALIZATION_STARTED)', () => {
    it('namespace permanece "/notifications" y las opciones CORS existentes no cambiaron', () => {
      // `@WebSocketGateway({ cors, namespace })` persiste el objeto de
      // opciones completo bajo GATEWAY_OPTIONS (ver
      // node_modules/@nestjs/websockets/decorators/socket-gateway.decorator.js)
      // — el mismo objeto que Nest lee en producción al montar el gateway.
      const options = Reflect.getMetadata(GATEWAY_OPTIONS, NotificationsGateway);
      expect(options).toMatchObject({
        namespace: '/notifications',
        cors: { origin: '*', credentials: true },
      });
    });

    it('SPRINT_FINALIZATION_STARTED coexiste con "notification" — ninguno reemplaza al otro en la misma sesión del gateway', async () => {
      const { gateway, emit } = makeGateway();

      await gateway.notifyUsers([1], { tituloNotificacion: 'postulación existente' });
      await gateway.notifySprintFinalizationStarted([1], { projectId: 10, sprintId: 20 });
      await gateway.notifyUsers([1], { tituloNotificacion: 'otra notificación existente' });

      const eventosEmitidos = emit.mock.calls.map(([evento]) => evento);
      expect(eventosEmitidos).toEqual(['notification', 'SPRINT_FINALIZATION_STARTED', 'notification']);
      expect(emit).toHaveBeenCalledTimes(3);
    });

    it('la room user:{idUsuario} es idéntica para ambos eventos (mismo mecanismo, sin room dedicada nueva)', async () => {
      const { gateway, to } = makeGateway();

      await gateway.notifyUsers([4], { tituloNotificacion: 'x' });
      await gateway.notifySprintFinalizationStarted([4], { projectId: 1, sprintId: 2 });

      expect(to).toHaveBeenCalledWith('user:4');
      expect(to).toHaveBeenCalledTimes(2);
    });
  });
});
