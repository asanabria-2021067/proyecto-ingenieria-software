import { describe, expect, it, vi } from 'vitest';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { DraftInactivityService } from '../src/projects/draft-inactivity.service';
import { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';

describe('Infra', () => {
  it('JwtStrategy validate mapea payload de usuario activo', async () => {
    const prisma = {
      usuario: { findUnique: vi.fn().mockResolvedValue({ estado: 'ACTIVO' }) },
    };
    const strategy = new JwtStrategy(prisma as unknown as PrismaService);
    await expect(strategy.validate({ sub: 7, correo: 'a@uvg.edu' })).resolves.toEqual({
      userId: 7,
      correo: 'a@uvg.edu',
    });
  });

  it('PrismaService lifecycle usa connect/disconnect', async () => {
    const service = new PrismaService();
    const connect = vi.spyOn(service, '$connect').mockResolvedValue();
    const disconnect = vi.spyOn(service, '$disconnect').mockResolvedValue();
    await service.onModuleInit();
    await service.onModuleDestroy();
    expect(connect).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });

  it('DraftInactivityService corre verificación sin lanzar error', async () => {
    const now = new Date();
    const prisma = {
      proyecto: {
        findMany: vi.fn().mockResolvedValue([
          {
            idProyecto: 1,
            tituloProyecto: 'Draft',
            creadoPor: 9,
            fechaActualizacion: new Date(now.getTime() - 22 * 24 * 60 * 60 * 1000),
            fechaCreacion: new Date(now.getTime() - 22 * 24 * 60 * 60 * 1000),
          },
        ]),
        update: vi.fn(),
      },
    };
    const notifications = { notifyFromTemplate: vi.fn() };
    const service = new DraftInactivityService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );

    await (service as unknown as { runDailyCheck: () => Promise<void> }).runDailyCheck();

    expect(prisma.proyecto.update).toHaveBeenCalled();
    expect(notifications.notifyFromTemplate).toHaveBeenCalled();
  });
});
