import { describe, expect, it, vi } from 'vitest';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { DraftInactivityService } from '../src/projects/draft-inactivity.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Infra', () => {
  it('JwtStrategy validate mapea payload', () => {
    const strategy = new JwtStrategy();
    expect(strategy.validate({ sub: 7, correo: 'a@uvg.edu' })).toEqual({
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
    const notifications = { notifyUsers: vi.fn() };
    const service = new DraftInactivityService(prisma as any, notifications as any);

    await (service as any).runDailyCheck();

    expect(prisma.proyecto.update).toHaveBeenCalled();
    expect(notifications.notifyUsers).toHaveBeenCalled();
  });
});
