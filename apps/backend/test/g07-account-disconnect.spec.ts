import { ForbiddenException, Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { PrismaService as PrismaServiceToken } from '../src/prisma/prisma.service';
import { AdminService } from '../src/admin/admin.service';
import { ChatGateway } from '../src/chat/chat.gateway';
import { NotificationsGateway } from '../src/notifications/notifications.gateway';
import { WsAuthService } from '../src/ws-auth/ws-auth.service';
import { ACCOUNT_ACCESS_REVOKED } from '../src/ws-auth/account-access.events';

/**
 * G07-C04 · OWASP25-C025 (A07:2025). Cuando un admin deja una cuenta en
 * BLOQUEADO o INACTIVO, sus sockets abiertos (notificaciones y chat) se
 * cierran: el acceso realtime no sobrevive al estado HTTP. AdminService solo
 * emite un evento interno por el EventEmitter global; no conoce los gateways.
 * Las conexiones nuevas ya las rechaza la política del handshake (C01–C03).
 */

function adminSetup(estadoActual: string, options: { esAdminCaller?: boolean; events?: Pick<EventEmitter2, 'emit'> } = {}) {
  const create = vi.fn().mockResolvedValue({});
  const persona = { idUsuario: 5, nombre: 'Ana', apellido: 'Pérez', correo: 'ana@uvg.edu.gt', fechaCreacion: new Date('2026-01-01T00:00:00Z'), rolesAcceso: [] };
  const prisma = {
    usuarioRolAcceso: { findFirst: vi.fn().mockResolvedValue(options.esAdminCaller === false ? null : { idUsuario: 1 }) },
    usuario: {
      findUnique: vi.fn().mockResolvedValue({ ...persona, estado: estadoActual }),
      update: vi.fn(async ({ data }: { data: { estado: string } }) => ({ ...persona, estado: data.estado })),
    },
    bitacoraAuditoria: { create },
  };
  const events = options.events ?? { emit: vi.fn() };
  const admin = new AdminService(prisma as unknown as PrismaService, new JwtService({}), undefined, events as EventEmitter2);
  return { admin, events, create };
}

function fakeServer() {
  const disconnectSockets = vi.fn();
  const inRoom = vi.fn(() => ({ disconnectSockets }));
  return { server: { in: inRoom }, inRoom, disconnectSockets };
}

describe('G07-C04: desconexión realtime al bloquear o inactivar', () => {
  describe('AdminService emite el revocado solo al perder el estado ACTIVO', () => {
    it.each([
      ['ACTIVO', 'BLOQUEADO'],
      ['ACTIVO', 'INACTIVO'],
      ['BLOQUEADO', 'INACTIVO'],
    ])('%s → %s emite una vez con la cuenta afectada', async (anterior, nuevo) => {
      const { admin, events } = adminSetup(anterior);

      await admin.updateUsuarioEstado(1, 5, nuevo as 'BLOQUEADO');

      expect(events.emit).toHaveBeenCalledTimes(1);
      expect(events.emit).toHaveBeenCalledWith(ACCOUNT_ACCESS_REVOKED, { idUsuario: 5 });
    });

    it('reactivar una cuenta no emite nada', async () => {
      const { admin, events } = adminSetup('BLOQUEADO');
      await admin.updateUsuarioEstado(1, 5, 'ACTIVO');
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('sin cambio real no emite nada', async () => {
      const { admin, events } = adminSetup('BLOQUEADO');
      await admin.updateUsuarioEstado(1, 5, 'BLOQUEADO');
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('sin rol admin se rechaza antes de emitir', async () => {
      const { admin, events } = adminSetup('ACTIVO', { esAdminCaller: false });
      await expect(admin.updateUsuarioEstado(2, 5, 'BLOQUEADO')).rejects.toBeInstanceOf(ForbiddenException);
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('conserva el evento de seguridad USER_STATUS_CHANGED de G05', async () => {
      const { admin, create } = adminSetup('ACTIVO');
      await admin.updateUsuarioEstado(1, 5, 'BLOQUEADO');
      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0][0].data).toMatchObject({ accion: 'USER_STATUS_CHANGED', idObjeto: '5' });
    });

    it('sin emisor (instancias manuales) el cambio de estado funciona igual', async () => {
      const prismaAdmin = adminSetup('ACTIVO');
      const admin = new AdminService(
        (prismaAdmin.admin as unknown as { prisma: PrismaService }).prisma,
        new JwtService({}),
      );
      await expect(admin.updateUsuarioEstado(1, 5, 'BLOQUEADO')).resolves.toMatchObject({ estado: 'BLOQUEADO' });
    });
  });

  describe('cada gateway cierra solo los sockets de esa cuenta', () => {
    it.each([
      ['NotificationsGateway', () => new NotificationsGateway({} as WsAuthService)],
      ['ChatGateway', () => new ChatGateway({} as WsAuthService, {} as PrismaService)],
    ])('%s desconecta la room user:{id} y nada más', (_nombre, make) => {
      const gateway = make();
      const { server, inRoom, disconnectSockets } = fakeServer();
      Reflect.set(gateway, 'server', server);

      gateway.disconnectAccount({ idUsuario: 5 });

      expect(inRoom).toHaveBeenCalledTimes(1);
      expect(inRoom).toHaveBeenCalledWith('user:5');
      expect(disconnectSockets).toHaveBeenCalledWith(true);
    });
  });

  describe('cableado real con el EventEmitter de Nest', () => {
    let context: INestApplicationContext | null = null;

    afterEach(async () => {
      await context?.close();
      context = null;
    });

    it('un solo emit de AdminService llega a los dos gateways', async () => {
      @Module({
        imports: [EventEmitterModule.forRoot()],
        providers: [
          NotificationsGateway,
          ChatGateway,
          { provide: WsAuthService, useValue: {} },
          { provide: PrismaServiceToken, useValue: {} },
        ],
      })
      class RealtimeFixtureModule {}

      context = await NestFactory.createApplicationContext(RealtimeFixtureModule, { logger: false });
      const notifications = fakeServer();
      const chat = fakeServer();
      Reflect.set(context.get(NotificationsGateway), 'server', notifications.server);
      Reflect.set(context.get(ChatGateway), 'server', chat.server);

      const { admin } = adminSetup('ACTIVO', { events: context.get(EventEmitter2) });
      await admin.updateUsuarioEstado(1, 5, 'BLOQUEADO');

      expect(notifications.inRoom).toHaveBeenCalledWith('user:5');
      expect(notifications.disconnectSockets).toHaveBeenCalledWith(true);
      expect(chat.inRoom).toHaveBeenCalledWith('user:5');
      expect(chat.disconnectSockets).toHaveBeenCalledWith(true);
    });
  });
});
