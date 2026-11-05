import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { HabilidadConfirmacionesService } from '../src/perfil-portafolio/habilidad-confirmaciones.service';

function build() {
  const prisma = {
    usuario: { findFirst: vi.fn().mockResolvedValue({ idUsuario: 2 }) },
    proyecto: { findFirst: vi.fn().mockResolvedValue({ idProyecto: 9 }) },
    usuarioHabilidad: {
      findUnique: vi.fn().mockResolvedValue({ idUsuarioHabilidad: 1 }),
      findMany: vi.fn().mockResolvedValue([
        { nivelHabilidad: 'AVANZADO', habilidad: { idHabilidad: 3, nombreHabilidad: 'TypeScript' } },
        { nivelHabilidad: 'BASICO', habilidad: { idHabilidad: 4, nombreHabilidad: 'SQL' } },
      ]),
    },
    confirmacionHabilidad: {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      groupBy: vi.fn().mockResolvedValue([{ idHabilidad: 3, _count: { _all: 2 } }]),
      findMany: vi.fn().mockResolvedValue([{ idHabilidad: 4 }]),
    },
  };
  return { prisma, service: new HabilidadConfirmacionesService(prisma as never) };
}

describe('HabilidadConfirmacionesService', () => {
  it('confirma la habilidad de un companero con proyecto compartido (activo o completado)', async () => {
    const { prisma, service } = build();
    await expect(service.confirmar(1, 2, 3)).resolves.toEqual({ ok: true });
    expect(prisma.confirmacionHabilidad.create).toHaveBeenCalledWith({ data: { idUsuario: 2, idHabilidad: 3, idConfirmador: 1 } });
    const where = prisma.proyecto.findFirst.mock.calls[0][0].where;
    expect(where.eliminadoEn).toBeNull();
    expect(JSON.stringify(where.AND)).toContain('COMPLETADO');
  });

  it('nadie confirma las propias habilidades', async () => {
    const { prisma, service } = build();
    await expect(service.confirmar(2, 2, 3)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.confirmacionHabilidad.create).not.toHaveBeenCalled();
  });

  it('sin proyecto compartido responde 403 y no escribe', async () => {
    const { prisma, service } = build();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    await expect(service.confirmar(1, 2, 3)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.confirmacionHabilidad.create).not.toHaveBeenCalled();
  });

  it('una persona fuera del directorio o sin esa habilidad responde 404', async () => {
    const a = build();
    a.prisma.usuario.findFirst.mockResolvedValue(null);
    await expect(a.service.confirmar(1, 2, 3)).rejects.toBeInstanceOf(NotFoundException);
    const b = build();
    b.prisma.usuarioHabilidad.findUnique.mockResolvedValue(null);
    await expect(b.service.confirmar(1, 2, 3)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('una segunda confirmacion de la misma habilidad (restriccion unica) responde 409', async () => {
    const { prisma, service } = build();
    prisma.confirmacionHabilidad.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(service.confirmar(1, 2, 3)).rejects.toBeInstanceOf(ConflictException);
  });

  it('retirar borra solo la confirmacion propia y 404 si no existia', async () => {
    const { prisma, service } = build();
    await service.retirar(1, 2, 3);
    expect(prisma.confirmacionHabilidad.deleteMany).toHaveBeenCalledWith({ where: { idUsuario: 2, idHabilidad: 3, idConfirmador: 1 } });
    prisma.confirmacionHabilidad.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.retirar(1, 2, 3)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listar muestra el conteo por habilidad y solo ofrece confirmar lo no confirmado', async () => {
    const { service } = build();
    const filas = await service.listar(1, 2);
    expect(filas).toEqual([
      { idHabilidad: 3, nombre: 'TypeScript', nivel: 'AVANZADO', confirmaciones: 2, confirmadaPorMi: false, puedoConfirmar: true },
      { idHabilidad: 4, nombre: 'SQL', nivel: 'BASICO', confirmaciones: 0, confirmadaPorMi: true, puedoConfirmar: false },
    ]);
  });

  it('en el perfil propio nada es confirmable', async () => {
    const { service } = build();
    const filas = await service.listar(2, 2);
    expect(filas.every((f) => !f.puedoConfirmar)).toBe(true);
  });
});
