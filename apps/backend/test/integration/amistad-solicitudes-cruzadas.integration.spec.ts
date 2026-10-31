import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { createIntegrationUser } from './setup/fixtures';
import { SocialService } from '../../src/social/social.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';

/**
 * RTF-3.2: dos solicitudes cruzadas simultaneas (A->B y B->A) deben dejar una
 * sola fila de amistad (indice unico sobre el par no ordenado) y ninguna de las
 * dos puede terminar en 500: la perdedora responde 409 o, si ve la fila de la
 * otra ya confirmada, acepta la solicitud inversa.
 */
describeIntegration('SocialService — solicitudes de amistad cruzadas simultaneas (BD real)', () => {
  let prisma: PrismaClient;
  let service: SocialService;
  const userIds: number[] = [];

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    const notifications = { notifyFromTemplate: async () => undefined } as unknown as NotificationsService;
    service = new SocialService(prisma as unknown as PrismaService, notifications);
  });

  afterEach(async () => {
    await prisma.amistad.deleteMany({
      where: { OR: [{ idUsuarioSolicitante: { in: userIds } }, { idUsuarioReceptor: { in: userIds } }] },
    });
    await prisma.usuario.deleteMany({ where: { idUsuario: { in: userIds } } });
    userIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('deja una sola fila y ningun 500 al cruzarse dos solicitudes', async () => {
    for (let ronda = 0; ronda < 10; ronda += 1) {
      const a = await createIntegrationUser(prisma);
      const b = await createIntegrationUser(prisma);
      userIds.push(a.idUsuario, b.idUsuario);

      const resultados = await Promise.allSettled([
        service.crearSolicitudAmistad(a.idUsuario, b.idUsuario),
        service.crearSolicitudAmistad(b.idUsuario, a.idUsuario),
      ]);

      for (const r of resultados) {
        if (r.status === 'rejected') {
          expect((r.reason as { getStatus?: () => number }).getStatus?.()).toBe(409);
        }
      }
      const filas = await prisma.amistad.findMany({
        where: {
          OR: [
            { idUsuarioSolicitante: a.idUsuario, idUsuarioReceptor: b.idUsuario },
            { idUsuarioSolicitante: b.idUsuario, idUsuarioReceptor: a.idUsuario },
          ],
        },
      });
      expect(filas).toHaveLength(1);
    }
  });

  it('el indice rechaza directamente la fila inversa duplicada', async () => {
    const a = await createIntegrationUser(prisma);
    const b = await createIntegrationUser(prisma);
    userIds.push(a.idUsuario, b.idUsuario);
    await prisma.amistad.create({ data: { idUsuarioSolicitante: a.idUsuario, idUsuarioReceptor: b.idUsuario } });

    await expect(
      prisma.amistad.create({ data: { idUsuarioSolicitante: b.idUsuario, idUsuarioReceptor: a.idUsuario } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
