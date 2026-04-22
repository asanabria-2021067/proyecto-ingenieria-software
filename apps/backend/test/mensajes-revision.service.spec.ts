import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { MensajesRevisionService } from '../src/mensajes-revision/mensajes-revision.service';

function makePrisma() {
  return {
    proyecto: { findUnique: vi.fn() },
    mensajeRevisionProyecto: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    revisionProyecto: { findFirst: vi.fn() },
    usuarioRolAcceso: { findMany: vi.fn() },
  } as any;
}

describe('MensajesRevisionService', () => {
  it('findByProyecto falla si proyecto no existe', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue(null);
    const service = new MensajesRevisionService(prisma, { isAdmin: vi.fn() } as any);
    await expect(service.findByProyecto(1, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findByProyecto retorna mensajes si tiene acceso', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue({
      idProyecto: 1,
      creadoPor: 2,
      estadoProyecto: EstadoProyecto.EN_REVISION,
    });
    prisma.mensajeRevisionProyecto.findMany.mockResolvedValue([{ idMensaje: 1 }]);
    const service = new MensajesRevisionService(prisma, { isAdmin: vi.fn().mockResolvedValue(true) } as any);
    const result = await service.findByProyecto(1, 99);
    expect(result).toEqual([{ idMensaje: 1 }]);
  });

  it('create valida revision relacionada', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue({
      idProyecto: 1,
      creadoPor: 2,
      tituloProyecto: 'P',
      estadoProyecto: EstadoProyecto.EN_REVISION,
    });
    prisma.revisionProyecto.findFirst.mockResolvedValue(null);
    const service = new MensajesRevisionService(prisma, { isAdmin: vi.fn().mockResolvedValue(true), notifyUsers: vi.fn() } as any);
    await expect(
      service.create(1, 2, { contenido: 'hola', idRevision: 99 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create guarda y notifica', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue({
      idProyecto: 1,
      creadoPor: 2,
      tituloProyecto: 'P',
      estadoProyecto: EstadoProyecto.EN_REVISION,
    });
    prisma.mensajeRevisionProyecto.create.mockResolvedValue({ idMensaje: 5 });
    prisma.usuarioRolAcceso.findMany.mockResolvedValue([{ idUsuario: 10 }]);
    const notifications = { isAdmin: vi.fn().mockResolvedValue(true), notifyUsers: vi.fn() } as any;
    const service = new MensajesRevisionService(prisma, notifications);

    const result = await service.create(1, 2, { contenido: ' hola ' });

    expect(result.idMensaje).toBe(5);
    expect(notifications.notifyUsers).toHaveBeenCalled();
  });

  it('markAsRead falla sin acceso', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue({
      idProyecto: 1,
      creadoPor: 2,
      estadoProyecto: EstadoProyecto.BORRADOR,
    });
    const service = new MensajesRevisionService(prisma, { isAdmin: vi.fn().mockResolvedValue(false) } as any);
    await expect(service.markAsRead(1, 3)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
