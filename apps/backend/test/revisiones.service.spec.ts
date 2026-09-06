import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { RevisionesService } from '../src/revisiones/revisiones.service';
import {
  makeProjectPolicyDouble,
  makeProjectReadPolicyDouble,
  makeProjectTransactionDouble,
} from './helpers/project-policy.double';

/**
 * C039: reclamar/resolver corren dentro del `run` del protocolo; el doble del
 * runner entrega este mismo mock como `tx`, por lo que todas las escrituras
 * de la transición se observan en los delegates raíz.
 */
function makePrisma() {
  return {
    revisionProyecto: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    revisionCierreProyecto: { findMany: vi.fn().mockResolvedValue([{ idRevisionCierre: 2 }]) },
    proyecto: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    usuario: { findUnique: vi.fn() },
    notificacion: { create: vi.fn() },
  };
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
  notifications: Partial<NotificationsService> = {},
) {
  return new RevisionesService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    makeProjectTransactionDouble({ tx: prisma }),
    makeProjectPolicyDouble(),
    makeProjectReadPolicyDouble(),
  );
}

describe('RevisionesService', () => {
  it('findAdminInbox requiere admin', async () => {
    const service = makeService(makePrisma(), { isAdmin: vi.fn().mockResolvedValue(false) });
    await expect(service.findAdminInbox(1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findAdminInbox retorna ambas bandejas', async () => {
    const prisma = makePrisma();
    prisma.revisionProyecto.findMany.mockResolvedValue([{ idRevisionProyecto: 1 }]);
    prisma.proyecto.findMany.mockResolvedValue([{ idProyecto: 2 }]);
    const service = makeService(prisma, {
      isAdmin: vi.fn().mockResolvedValue(true),
      notifyFromTemplate: vi.fn(),
    });
    const result = await service.findAdminInbox(1);
    expect(result.revisionesPendientes).toHaveLength(1);
    expect(result.cierresPendientes).toHaveLength(1);
  });

  it('findByProyecto valida existencia', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma, { isAdmin: vi.fn() });
    await expect(service.findByProyecto(1, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reclamar falla si no hay revisión pendiente', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.EN_REVISION });
    prisma.revisionProyecto.findFirst.mockResolvedValue(null);
    const notifications = {
      isAdmin: vi.fn().mockResolvedValue(true),
      notifyFromTemplate: vi.fn(),
    };
    const service = makeService(prisma, notifications);
    await expect(service.reclamar(1, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolver requiere que el mismo admin haya reclamado', async () => {
    const prisma = makePrisma();
    prisma.revisionProyecto.findFirst.mockResolvedValue({ idRevisionProyecto: 4, idRevisor: 8 });
    const notifications = {
      isAdmin: vi.fn().mockResolvedValue(true),
      notifyFromTemplate: vi.fn(),
    };
    const service = makeService(prisma, notifications);
    await expect(service.resolver(1, 7, { resultado: 'APROBADA' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('resolver actualiza revision y proyecto', async () => {
    const prisma = makePrisma();
    prisma.revisionProyecto.findFirst.mockResolvedValue({ idRevisionProyecto: 4, idRevisor: 7 });
    prisma.revisionProyecto.update.mockResolvedValue({ idRevisionProyecto: 4, estadoRevision: 'APROBADA' });
    prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: 2, tituloProyecto: 'Proyecto' });
    const notifications = {
      isAdmin: vi.fn().mockResolvedValue(true),
      notifyFromTemplate: vi.fn(),
    };
    const service = makeService(prisma, notifications);

    const result = await service.resolver(1, 7, { resultado: 'APROBADA', comentario: '' });

    expect(result.estadoProyecto).toBe(EstadoProyecto.PUBLICADO);
    // C039: la transición escribe sobre el `tx` del run (aquí, el mismo mock).
    expect(prisma.proyecto.update).toHaveBeenCalled();
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith(
      [2],
      'PROYECTO_APROBADO',
      expect.objectContaining({ projectId: 1, revisionId: 4 }),
      prisma,
    );
  });

  it('reclamar falla con estado inválido', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.PUBLICADO });
    const service = makeService(prisma, { isAdmin: vi.fn().mockResolvedValue(true) });
    await expect(service.reclamar(1, 1)).rejects.toBeInstanceOf(BadRequestException);
  });
});
