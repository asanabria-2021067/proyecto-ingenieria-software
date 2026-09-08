import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { TipoNotificacion } from '@prisma/client';
import { NotificationsService } from '../src/notifications/notifications.service';
import { NotificationsGateway } from '../src/notifications/notifications.gateway';
import { PrismaService } from '../src/prisma/prisma.service';

function makePrisma() {
  const prisma = {
    notificacion: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
    },
    usuarioRolAcceso: { findFirst: vi.fn(), findMany: vi.fn() },
    participacionProyecto: { findMany: vi.fn() },
  };
  return prisma as typeof prisma & PrismaService;
}

describe('NotificationsService', () => {
  it('findAll usa filtro opcional', async () => {
    const prisma = makePrisma();
    prisma.notificacion.findMany.mockResolvedValue([]);
    const service = new NotificationsService(prisma);
    await service.findAll(1);
    expect(prisma.notificacion.findMany).toHaveBeenCalled();
  });

  it('getUnreadCount retorna total', async () => {
    const prisma = makePrisma();
    prisma.notificacion.count.mockResolvedValue(5);
    const service = new NotificationsService(prisma);
    await expect(service.getUnreadCount(1)).resolves.toEqual({ total: 5 });
  });

  it('markAsRead falla si no existe', async () => {
    const prisma = makePrisma();
    prisma.notificacion.findUnique.mockResolvedValue(null);
    const service = new NotificationsService(prisma);
    await expect(service.markAsRead(1, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('markAsRead falla por permisos', async () => {
    const prisma = makePrisma();
    prisma.notificacion.findUnique.mockResolvedValue({ idUsuario: 2, leidaEn: null });
    const service = new NotificationsService(prisma);
    await expect(service.markAsRead(1, 1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('markAllAsRead retorna conteo', async () => {
    const prisma = makePrisma();
    prisma.notificacion.updateMany.mockResolvedValue({ count: 4 });
    const service = new NotificationsService(prisma);
    await expect(service.markAllAsRead(1)).resolves.toEqual({ actualizadas: 4 });
  });

  it('notifyAdmins consulta admins y crea notificaciones', async () => {
    const prisma = makePrisma();
    prisma.usuarioRolAcceso.findMany.mockResolvedValue([{ idUsuario: 1 }, { idUsuario: 2 }]);
    const service = new NotificationsService(prisma);
    await service.notifyAdmins({
      tipoNotificacion: TipoNotificacion.PROYECTO_ACTUALIZADO,
      tituloNotificacion: 't',
    });
    expect(prisma.notificacion.createMany).toHaveBeenCalled();
  });

  it('notifyAdminsFromTemplate usa templates de proyecto', async () => {
    const prisma = makePrisma();
    prisma.usuarioRolAcceso.findMany.mockResolvedValue([{ idUsuario: 1 }]);
    const service = new NotificationsService(prisma);

    await service.notifyAdminsFromTemplate('PROYECTO_EN_REVISION', {
      projectTitle: 'Proyecto X',
      projectId: 10,
      numeroEnvio: 1,
    });

    expect(prisma.notificacion.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          idUsuario: 1,
          tipoNotificacion: 'PROYECTO_EN_REVISION',
          tituloNotificacion: 'Proyecto enviado a revisión',
        }),
      ],
      skipDuplicates: false,
    });
  });

  it('notifyProjectActiveParticipants excluye autor', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 8 }]);
    const service = new NotificationsService(prisma);
    await service.notifyProjectActiveParticipants(
      1,
      2,
      { tipoNotificacion: TipoNotificacion.COMENTARIO_PROYECTO, tituloNotificacion: 'x' },
    );
    expect(prisma.notificacion.createMany).toHaveBeenCalled();
  });

  describe('notifySprintFinalizationStarted (A4)', () => {
    /**
     * NotificationsService exige un NotificationsGateway real (clase con
     * campos privados: un objeto literal nunca es estructuralmente
     * compatible con ese tipo, de ahí el `any` original). En vez de
     * falsear el tipo, se instancia el gateway real — JwtService también
     * se construye real, su constructor no exige configuración para estos
     * tests — y se espía notifySprintFinalizationStarted con vi.spyOn
     * (completamente tipado). El único campo que Nest solo asigna en
     * arranque real es `server` (un Server de socket.io); para simular
     * "socket conectado" sin construir un Server real se usa
     * `Reflect.set`, que no requiere anotar `any` en ningún punto de este
     * archivo — cero `any` nuevos.
     */
    function makeConnectedGateway() {
      const gateway = new NotificationsGateway(new JwtService());
      Reflect.set(gateway, 'server', {});
      vi.spyOn(gateway, 'notifySprintFinalizationStarted').mockResolvedValue(undefined);
      return gateway;
    }

    function makeDisconnectedGateway() {
      // Instancia real sin `server` asignado (tal como queda antes de que
      // Nest complete el arranque real): this.gateway?.server es undefined.
      return new NotificationsGateway(new JwtService());
    }

    it('destinatarios = participantes ACTIVO del proyecto, excluyendo al autor', async () => {
      const prisma = makePrisma();
      prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 8 }, { idUsuario: 9 }]);
      const gateway = makeConnectedGateway();
      const service = new NotificationsService(prisma, gateway);

      await service.notifySprintFinalizationStarted(1, 2, { projectId: 1, sprintId: 5 });

      expect(prisma.participacionProyecto.findMany).toHaveBeenCalledWith({
        where: {
          estadoParticipacion: 'ACTIVO',
          idUsuario: { not: 2 },
          rolProyecto: { idProyecto: 1 },
        },
        distinct: ['idUsuario'],
        select: { idUsuario: true },
      });
      expect(gateway.notifySprintFinalizationStarted).toHaveBeenCalledWith(
        [8, 9],
        { projectId: 1, sprintId: 5 },
      );
    });

    it('no persiste ninguna fila de Notificacion (señal realtime pura, no bandeja)', async () => {
      const prisma = makePrisma();
      prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 8 }]);
      const gateway = makeConnectedGateway();
      const service = new NotificationsService(prisma, gateway);

      await service.notifySprintFinalizationStarted(1, 2, { projectId: 1, sprintId: 5 });

      expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
    });

    it('sin gateway.server disponible, no intenta emitir', async () => {
      const prisma = makePrisma();
      prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 8 }]);
      const gateway = makeDisconnectedGateway();
      const service = new NotificationsService(prisma, gateway);

      await expect(
        service.notifySprintFinalizationStarted(1, 2, { projectId: 1, sprintId: 5 }),
      ).resolves.toBeUndefined();
    });
  });

  describe('notifySprintClosed (A9.1)', () => {
    function makeConnectedGateway() {
      const gateway = new NotificationsGateway(new JwtService());
      Reflect.set(gateway, 'server', {});
      vi.spyOn(gateway, 'notifySprintClosed').mockResolvedValue(undefined);
      return gateway;
    }

    function makeDisconnectedGateway() {
      return new NotificationsGateway(new JwtService());
    }

    it('destinatarios = participantes ACTIVO del proyecto, excluyendo al autor (mismo criterio que START)', async () => {
      const prisma = makePrisma();
      prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 8 }, { idUsuario: 9 }]);
      const gateway = makeConnectedGateway();
      const service = new NotificationsService(prisma, gateway);

      await service.notifySprintClosed(1, 2, { projectId: 1, sprintId: 5 });

      expect(prisma.participacionProyecto.findMany).toHaveBeenCalledWith({
        where: {
          estadoParticipacion: 'ACTIVO',
          idUsuario: { not: 2 },
          rolProyecto: { idProyecto: 1 },
        },
        distinct: ['idUsuario'],
        select: { idUsuario: true },
      });
      expect(gateway.notifySprintClosed).toHaveBeenCalledWith([8, 9], { projectId: 1, sprintId: 5 });
    });

    it('no persiste ninguna fila de Notificacion (señal realtime pura, no bandeja)', async () => {
      const prisma = makePrisma();
      prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 8 }]);
      const gateway = makeConnectedGateway();
      const service = new NotificationsService(prisma, gateway);

      await service.notifySprintClosed(1, 2, { projectId: 1, sprintId: 5 });

      expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
    });

    it('sin gateway.server disponible, no intenta emitir', async () => {
      const prisma = makePrisma();
      prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 8 }]);
      const gateway = makeDisconnectedGateway();
      const service = new NotificationsService(prisma, gateway);

      await expect(
        service.notifySprintClosed(1, 2, { projectId: 1, sprintId: 5 }),
      ).resolves.toBeUndefined();
    });
  });

  describe('notifyTaskHoursLogged (HU-142 / T-171)', () => {
    function makeConnectedGateway() {
      const gateway = new NotificationsGateway(new JwtService());
      Reflect.set(gateway, 'server', {});
      vi.spyOn(gateway, 'notifyTaskHoursLogged').mockResolvedValue(undefined);
      return gateway;
    }

    function makeDisconnectedGateway() {
      return new NotificationsGateway(new JwtService());
    }

    it('destinatarios = participantes ACTIVO del proyecto, excluyendo al autor (mismo criterio que los eventos de Sprint)', async () => {
      const prisma = makePrisma();
      prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 8 }, { idUsuario: 9 }]);
      const gateway = makeConnectedGateway();
      const service = new NotificationsService(prisma, gateway);

      await service.notifyTaskHoursLogged(1, 2, { projectId: 1, taskId: 20, idAsignacion: 30 });

      expect(prisma.participacionProyecto.findMany).toHaveBeenCalledWith({
        where: {
          estadoParticipacion: 'ACTIVO',
          idUsuario: { not: 2 },
          rolProyecto: { idProyecto: 1 },
        },
        distinct: ['idUsuario'],
        select: { idUsuario: true },
      });
      expect(gateway.notifyTaskHoursLogged).toHaveBeenCalledWith(
        [8, 9],
        { projectId: 1, taskId: 20, idAsignacion: 30 },
      );
    });

    it('no persiste ninguna fila de Notificacion (señal realtime pura, no bandeja)', async () => {
      const prisma = makePrisma();
      prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 8 }]);
      const gateway = makeConnectedGateway();
      const service = new NotificationsService(prisma, gateway);

      await service.notifyTaskHoursLogged(1, 2, { projectId: 1, taskId: 20, idAsignacion: 30 });

      expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
    });

    it('sin gateway.server disponible, no intenta emitir', async () => {
      const prisma = makePrisma();
      prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 8 }]);
      const gateway = makeDisconnectedGateway();
      const service = new NotificationsService(prisma, gateway);

      await expect(
        service.notifyTaskHoursLogged(1, 2, { projectId: 1, taskId: 20, idAsignacion: 30 }),
      ).resolves.toBeUndefined();
    });
  });
});
