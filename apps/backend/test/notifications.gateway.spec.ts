import { describe, expect, it, vi } from 'vitest';
import { GATEWAY_OPTIONS } from '@nestjs/websockets/constants';
import { JwtService } from '@nestjs/jwt';
import { NotificationsGateway } from '../src/notifications/notifications.gateway';
import { getFrontendUrl } from '../src/common/utils/cookie';

function makeGateway() {
  const gateway = new NotificationsGateway(new JwtService());
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  Reflect.set(gateway, 'server', { to });
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

  describe('notifySprintClosed (A9.1)', () => {
    it('emite literalmente el evento SPRINT_CLOSED', async () => {
      const { gateway, emit } = makeGateway();

      await gateway.notifySprintClosed([5], { projectId: 10, sprintId: 20 });

      expect(emit).toHaveBeenCalledWith('SPRINT_CLOSED', { projectId: 10, sprintId: 20 });
    });

    it('el payload incluye projectId y sprintId', async () => {
      const { gateway, emit } = makeGateway();

      await gateway.notifySprintClosed([5], { projectId: 42, sprintId: 99 });

      const [, payload] = emit.mock.calls[0];
      expect(payload).toEqual({ projectId: 42, sprintId: 99 });
    });

    it('usa el mismo mecanismo de rooms user:{idUsuario} que notifySprintFinalizationStarted, uno por destinatario', async () => {
      const { gateway, to, emit } = makeGateway();

      await gateway.notifySprintClosed([7, 8, 9], { projectId: 1, sprintId: 2 });

      expect(to).toHaveBeenCalledWith('user:7');
      expect(to).toHaveBeenCalledWith('user:8');
      expect(to).toHaveBeenCalledWith('user:9');
      expect(emit).toHaveBeenCalledTimes(3);
    });

    it('con lista vacía de destinatarios no emite nada', async () => {
      const { gateway, emit } = makeGateway();

      await gateway.notifySprintClosed([], { projectId: 1, sprintId: 2 });

      expect(emit).not.toHaveBeenCalled();
    });

    it('SPRINT_CLOSED coexiste con SPRINT_FINALIZATION_STARTED y "notification" — ninguno reemplaza a otro', async () => {
      const { gateway, emit } = makeGateway();

      await gateway.notifyUsers([1], { tituloNotificacion: 'x' });
      await gateway.notifySprintFinalizationStarted([1], { projectId: 10, sprintId: 20 });
      await gateway.notifySprintClosed([1], { projectId: 10, sprintId: 20 });

      const eventosEmitidos = emit.mock.calls.map(([evento]) => evento);
      expect(eventosEmitidos).toEqual(['notification', 'SPRINT_FINALIZATION_STARTED', 'SPRINT_CLOSED']);
    });
  });

  describe('notifyTaskHoursLogged (HU-142 / T-171)', () => {
    it('emite literalmente el evento TASK_HOURS_LOGGED', async () => {
      const { gateway, emit } = makeGateway();

      await gateway.notifyTaskHoursLogged([5], { projectId: 10, taskId: 20, idAsignacion: 30 });

      expect(emit).toHaveBeenCalledWith('TASK_HOURS_LOGGED', { projectId: 10, taskId: 20, idAsignacion: 30 });
    });

    it('el payload incluye projectId, taskId e idAsignacion', async () => {
      const { gateway, emit } = makeGateway();

      await gateway.notifyTaskHoursLogged([5], { projectId: 42, taskId: 99, idAsignacion: 7 });

      const [, payload] = emit.mock.calls[0];
      expect(payload).toEqual({ projectId: 42, taskId: 99, idAsignacion: 7 });
    });

    it('usa el mismo mecanismo de rooms user:{idUsuario} que los demás eventos de Sprint, uno por destinatario', async () => {
      const { gateway, to, emit } = makeGateway();

      await gateway.notifyTaskHoursLogged([7, 8, 9], { projectId: 1, taskId: 2, idAsignacion: 3 });

      expect(to).toHaveBeenCalledWith('user:7');
      expect(to).toHaveBeenCalledWith('user:8');
      expect(to).toHaveBeenCalledWith('user:9');
      expect(emit).toHaveBeenCalledTimes(3);
    });

    it('con lista vacía de destinatarios no emite nada', async () => {
      const { gateway, emit } = makeGateway();

      await gateway.notifyTaskHoursLogged([], { projectId: 1, taskId: 2, idAsignacion: 3 });

      expect(emit).not.toHaveBeenCalled();
    });

    it('TASK_HOURS_LOGGED coexiste con SPRINT_CLOSED y "notification" — ninguno reemplaza a otro', async () => {
      const { gateway, emit } = makeGateway();

      await gateway.notifyUsers([1], { tituloNotificacion: 'x' });
      await gateway.notifySprintClosed([1], { projectId: 10, sprintId: 20 });
      await gateway.notifyTaskHoursLogged([1], { projectId: 10, taskId: 20, idAsignacion: 30 });

      const eventosEmitidos = emit.mock.calls.map(([evento]) => evento);
      expect(eventosEmitidos).toEqual(['notification', 'SPRINT_CLOSED', 'TASK_HOURS_LOGGED']);
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
        // `origin: '*'` + `credentials: true` es una combinación inválida
        // para el navegador (nunca funcionó con cookies) — el gateway usa
        // el mismo FRONTEND_URL que el CORS REST, no un origen fijo.
        cors: { origin: getFrontendUrl(), credentials: true },
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
