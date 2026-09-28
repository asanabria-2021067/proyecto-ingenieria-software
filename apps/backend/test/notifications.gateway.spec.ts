import { describe, expect, it, vi } from 'vitest';
import { GATEWAY_OPTIONS } from '@nestjs/websockets/constants';
import { JwtService } from '@nestjs/jwt';
import { NotificationsGateway } from '../src/notifications/notifications.gateway';
import { WsAuthService } from '../src/ws-auth/ws-auth.service';
import { getFrontendUrl } from '../src/common/utils/cookie';
import type { PrismaService } from '../src/prisma/prisma.service';

function makeGateway() {
  const gateway = new NotificationsGateway(new WsAuthService(new JwtService(), {} as PrismaService));
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  Reflect.set(gateway, 'server', { to });
  return { gateway, to, emit };
}

function makeSocket(overrides: Partial<{ auth: Record<string, unknown> }> = {}) {
  return {
    id: 'socket-1',
    handshake: { auth: overrides.auth ?? {}, headers: {} },
    data: {} as Record<string, unknown>,
    join: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
}

describe('NotificationsGateway', () => {
  describe('handleConnection', () => {
    it('rechaza (desconecta) un cliente sin token', async () => {
      const gateway = new NotificationsGateway({ verifyAsync: vi.fn() } as any);
      const socket = makeSocket();

      await gateway.handleConnection(socket as any);

      expect(socket.disconnect).toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });

    /**
     * T-210 (revisión cruzada): el token de recuperación de contraseña
     * (`tipo: 'reset'`) se firma con el mismo JWT_SECRET que el access
     * token y verifica igual con `verifyAsync` — sin este chequeo, quien
     * tuviera un enlace de recuperación abría un socket autenticado como
     * esa persona y recibía sus notificaciones.
     */
    it('rechaza (desconecta) un token que no es de tipo "access" (p. ej. el de recuperación de contraseña)', async () => {
      const verifyAsync = vi.fn().mockResolvedValue({ sub: 1, correo: 'a@uvg.edu.gt', tipo: 'reset' });
      const gateway = new NotificationsGateway({ verifyAsync } as any);
      const socket = makeSocket({ auth: { token: 'token-de-reset' } });

      await gateway.handleConnection(socket as any);

      expect(socket.disconnect).toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('con un access token válido, une al cliente a su room user:{id} y confirma la conexión', async () => {
      const verifyAsync = vi.fn().mockResolvedValue({ sub: 7, correo: 'a@uvg.edu.gt', tipo: 'access' });
      const gateway = new NotificationsGateway({ verifyAsync } as any);
      const socket = makeSocket({ auth: { token: 'token-valido' } });

      await gateway.handleConnection(socket as any);

      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(socket.join).toHaveBeenCalledWith('user:7');
      expect(socket.data.userId).toBe(7);
      expect(socket.emit).toHaveBeenCalledWith('connected', { userId: 7 });
    });
  });

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
