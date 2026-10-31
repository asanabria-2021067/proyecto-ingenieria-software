import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ProjectsRevisionsService } from '../src/projects/projects-revisions.service';

function makeTx(existente: object | null = null) {
  return {
    proyecto: { findUnique: vi.fn().mockResolvedValue({ tituloProyecto: 'P' }) },
    revisionProyecto: {
      findFirst: vi.fn().mockResolvedValue(existente),
      create: vi.fn().mockResolvedValue({ idRevisionProyecto: 7 }),
    },
  };
}

describe('ProjectsRevisionsService', () => {
  const service = new ProjectsRevisionsService();

  it('buildProjectSnapshot: lee el proyecto por id con titulo y roles con requisitos', async () => {
    const tx = makeTx();
    const r = await service.buildProjectSnapshot(tx as unknown as Prisma.TransactionClient, 4);
    expect(r).toEqual({ tituloProyecto: 'P' });
    const arg = tx.proyecto.findUnique.mock.calls[0][0];
    expect(arg.where).toEqual({ idProyecto: 4 });
    expect(arg.select.tituloProyecto).toBe(true);
    expect(arg.select.roles.select.requisitos.select.habilidad).toBeDefined();
  });

  it('crearRevisionPendiente: rechaza si ya hay una PENDIENTE', async () => {
    const tx = makeTx({ idRevisionProyecto: 1 });
    await expect(
      service.crearRevisionPendiente(tx as unknown as Prisma.TransactionClient, 4, 2, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.revisionProyecto.findFirst).toHaveBeenCalledWith({
      where: { idProyecto: 4, estadoRevision: 'PENDIENTE' },
    });
    expect(tx.revisionProyecto.create).not.toHaveBeenCalled();
  });

  it('crearRevisionPendiente: crea PENDIENTE con el snapshot cuando existe', async () => {
    const tx = makeTx();
    await service.crearRevisionPendiente(tx as unknown as Prisma.TransactionClient, 4, 2, { a: 1 });
    expect(tx.revisionProyecto.create).toHaveBeenCalledWith({
      data: { idProyecto: 4, numeroEnvio: 2, estadoRevision: 'PENDIENTE', snapshotProyecto: { a: 1 } },
    });
  });

  it('crearRevisionPendiente: sin snapshot omite la clave', async () => {
    const tx = makeTx();
    await service.crearRevisionPendiente(tx as unknown as Prisma.TransactionClient, 4, 1, null);
    expect(tx.revisionProyecto.create).toHaveBeenCalledWith({
      data: { idProyecto: 4, numeroEnvio: 1, estadoRevision: 'PENDIENTE' },
    });
  });
});
