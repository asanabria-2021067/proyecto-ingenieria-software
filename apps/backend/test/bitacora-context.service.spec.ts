import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service';
import { BitacoraContextService } from '../src/bitacora/bitacora-context.service';

function makePrisma(proyecto: unknown) {
  return {
    proyecto: { findFirst: vi.fn().mockResolvedValue(proyecto) },
  } as unknown as PrismaService;
}

describe('BitacoraContextService.assertProjectLeader', () => {
  it('no lanza cuando el actor es el creador del proyecto', async () => {
    const prisma = makePrisma({ idProyecto: 5, creadoPor: 9, eliminadoEn: null });
    const service = new BitacoraContextService(prisma);

    await expect(service.assertProjectLeader(5, 9)).resolves.toBeUndefined();
  });

  it('lanza ForbiddenException cuando el actor no es el líder', async () => {
    const prisma = makePrisma({ idProyecto: 5, creadoPor: 9, eliminadoEn: null });
    const service = new BitacoraContextService(prisma);

    await expect(service.assertProjectLeader(5, 3)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lanza NotFoundException cuando el proyecto no existe o está eliminado', async () => {
    const prisma = makePrisma(null);
    const service = new BitacoraContextService(prisma);

    await expect(service.assertProjectLeader(5, 9)).rejects.toBeInstanceOf(NotFoundException);
  });
});
