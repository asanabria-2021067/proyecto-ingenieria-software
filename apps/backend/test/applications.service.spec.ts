import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationsService } from '../src/applications/applications.service';

function makePrisma() {
  return {
    usuario: { findUnique: vi.fn() },
    rolProyecto: { findUnique: vi.fn() },
    participacionProyecto: { count: vi.fn() },
    postulacion: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  } as any;
}

describe('ApplicationsService', () => {
  it('create crea postulación válida', async () => {
    const prisma = makePrisma();
    prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 1 });
    prisma.rolProyecto.findUnique.mockResolvedValue({
      idRolProyecto: 2,
      cupos: 3,
      proyecto: { estadoProyecto: EstadoProyecto.PUBLICADO },
    });
    prisma.postulacion.findFirst.mockResolvedValue(null);
    prisma.postulacion.create.mockResolvedValue({ idPostulacion: 10 });
    const service = new ApplicationsService(prisma, { notifyUsers: vi.fn() } as any);

    const result = await service.create({
      idUsuarioPostulante: 1,
      idRolProyecto: 2,
      justificacion: 'Quiero aportar',
    });

    expect(result).toEqual({ idPostulacion: 10 });
  });

  it('create falla si usuario no existe', async () => {
    const prisma = makePrisma();
    prisma.usuario.findUnique.mockResolvedValue(null);
    const service = new ApplicationsService(prisma, {} as any);
    await expect(service.create({ idUsuarioPostulante: 1, idRolProyecto: 2, justificacion: '' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('create falla por cupos en en_progreso', async () => {
    const prisma = makePrisma();
    prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 1 });
    prisma.rolProyecto.findUnique.mockResolvedValue({
      idRolProyecto: 2,
      cupos: 1,
      proyecto: { estadoProyecto: EstadoProyecto.EN_PROGRESO },
    });
    prisma.participacionProyecto.count.mockResolvedValue(1);
    const service = new ApplicationsService(prisma, {} as any);
    await expect(service.create({ idUsuarioPostulante: 1, idRolProyecto: 2, justificacion: '' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('findAll y findMine delegan en prisma', async () => {
    const prisma = makePrisma();
    prisma.postulacion.findMany.mockResolvedValue([]);
    const service = new ApplicationsService(prisma, {} as any);
    await service.findAll();
    await service.findMine(1);
    expect(prisma.postulacion.findMany).toHaveBeenCalledTimes(2);
  });

  it('findOne falla si no existe', async () => {
    const prisma = makePrisma();
    prisma.postulacion.findUnique.mockResolvedValue(null);
    const service = new ApplicationsService(prisma, {} as any);
    await expect(service.findOne(1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateEstado valida resolutor y notifica', async () => {
    const prisma = makePrisma();
    prisma.postulacion.findUnique.mockResolvedValue({
      idPostulacion: 1,
      idRolProyecto: 2,
      idUsuarioPostulante: 4,
      estadoPostulacion: 'PENDIENTE',
      rolProyecto: { nombreRol: 'Backend', proyecto: { creadoPor: 9, idProyecto: 99, tituloProyecto: 'X' } },
    });
    prisma.postulacion.update.mockResolvedValue({ idPostulacion: 1, estadoPostulacion: 'ACEPTADA' });
    const notifications = { notifyUsers: vi.fn() } as any;
    const service = new ApplicationsService(prisma, notifications);

    const result = await service.updateEstado(
      1,
      { estadoPostulacion: 'ACEPTADA', comentarioResolucion: '' } as any,
      9,
    );

    expect(result.estadoPostulacion).toBe('ACEPTADA');
    expect(notifications.notifyUsers).toHaveBeenCalled();
  });

  it('updateEstado falla si no es creador', async () => {
    const prisma = makePrisma();
    prisma.postulacion.findUnique.mockResolvedValue({
      idPostulacion: 1,
      estadoPostulacion: 'PENDIENTE',
      rolProyecto: { proyecto: { creadoPor: 99 } },
    });
    const service = new ApplicationsService(prisma, {} as any);
    await expect(service.updateEstado(1, { estadoPostulacion: 'RECHAZADA' } as any, 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
