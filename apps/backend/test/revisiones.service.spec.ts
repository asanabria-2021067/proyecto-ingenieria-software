import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { RevisionesService } from '../src/revisiones/revisiones.service';

function makePrisma() {
  return {
    revisionProyecto: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    proyecto: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    usuario: { findUnique: vi.fn() },
    notificacion: { create: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: any) => unknown) => cb({
      revisionProyecto: { update: vi.fn() },
      proyecto: { update: vi.fn(), findUnique: vi.fn() },
      notificacion: { create: vi.fn() },
    })),
  } as any;
}

describe('RevisionesService', () => {
  it('findAdminInbox requiere admin', async () => {
    const service = new RevisionesService(makePrisma(), { isAdmin: vi.fn().mockResolvedValue(false) } as any);
    await expect(service.findAdminInbox(1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findAdminInbox retorna ambas bandejas', async () => {
    const prisma = makePrisma();
    prisma.revisionProyecto.findMany.mockResolvedValue([{ idRevisionProyecto: 1 }]);
    prisma.proyecto.findMany.mockResolvedValue([{ idProyecto: 2 }]);
    const service = new RevisionesService(prisma, { isAdmin: vi.fn().mockResolvedValue(true) } as any);
    const result = await service.findAdminInbox(1);
    expect(result.revisionesPendientes).toHaveLength(1);
    expect(result.cierresPendientes).toHaveLength(1);
  });

  it('findByProyecto valida existencia', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = new RevisionesService(prisma, { isAdmin: vi.fn() } as any);
    await expect(service.findByProyecto(1, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reclamar falla si no hay revisión pendiente', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.EN_REVISION });
    prisma.revisionProyecto.findFirst.mockResolvedValue(null);
    const service = new RevisionesService(prisma, { isAdmin: vi.fn().mockResolvedValue(true) } as any);
    await expect(service.reclamar(1, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolver requiere que el mismo admin haya reclamado', async () => {
    const prisma = makePrisma();
    prisma.revisionProyecto.findFirst.mockResolvedValue({ idRevisionProyecto: 4, idRevisor: 8 });
    const service = new RevisionesService(prisma, { isAdmin: vi.fn().mockResolvedValue(true) } as any);
    await expect(service.resolver(1, 7, { resultado: 'APROBADA' } as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('resolver actualiza revision y proyecto', async () => {
    const prisma = makePrisma();
    prisma.revisionProyecto.findFirst.mockResolvedValue({ idRevisionProyecto: 4, idRevisor: 7 });
    const tx = {
      revisionProyecto: { update: vi.fn().mockResolvedValue({ idRevisionProyecto: 4, estadoRevision: 'APROBADA' }) },
      proyecto: {
        update: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({ creadoPor: 2, tituloProyecto: 'Proyecto' }),
      },
      notificacion: { create: vi.fn() },
    };
    prisma.$transaction = vi.fn(async (cb: (arg: any) => unknown) => cb(tx));
    const service = new RevisionesService(prisma, { isAdmin: vi.fn().mockResolvedValue(true) } as any);

    const result = await service.resolver(1, 7, { resultado: 'APROBADA', comentario: '' } as any);

    expect(result.estadoProyecto).toBe(EstadoProyecto.PUBLICADO);
    expect(tx.proyecto.update).toHaveBeenCalled();
  });

  it('reclamar falla con estado inválido', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.PUBLICADO });
    const service = new RevisionesService(prisma, { isAdmin: vi.fn().mockResolvedValue(true) } as any);
    await expect(service.reclamar(1, 1)).rejects.toBeInstanceOf(BadRequestException);
  });
});
