import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { MetasAsociacionService } from '../src/associations/metas-asociacion.service';

type Junta = { cargo: string; nivelPermiso: string } | null;

const fila = (idUsuario: number, metaBeca: number | null, enRiesgo: boolean, metaExtension: number | null = null) => ({
  idUsuario,
  metaBeca,
  metaExtension,
  enRiesgo,
});

function build(junta: Junta = { cargo: 'PRESIDENTE', nivelPermiso: 'ADMINISTRADOR' }, filas: ReturnType<typeof fila>[] = []) {
  const prisma = {
    juntaAsociacion: {
      findUnique: vi.fn().mockResolvedValue(junta && { ...junta, asociacion: { idAsociacion: 7, nombre: 'AEC', archivada: false } }),
    },
    metaAsociacion: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ idMeta: 3 }),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ idMeta: 3, ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ idMeta: 3, ...data })),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
  const horas = { recorrerTodas: vi.fn().mockResolvedValue({ semestre: {}, filas }) };
  return { prisma, horas, service: new MetasAsociacionService(prisma as never, horas as never) };
}

const NUEVA = { anio: 2026, periodo: 2 as const, tipo: 'BECA' as const, porcentajeObjetivo: 80 };

describe('MetasAsociacionService (MEJ-162)', () => {
  it.each([
    ['Presidente', { cargo: 'PRESIDENTE', nivelPermiso: 'ADMINISTRADOR' }],
    ['Secretario con nivel Editor', { cargo: 'SECRETARIO', nivelPermiso: 'EDITOR' }],
  ])('%s crea, cambia y quita metas', async (_n, junta) => {
    const { prisma, service } = build(junta);
    await expect(service.crear(9, 7, NUEVA)).resolves.toMatchObject({ idAsociacion: 7, porcentajeObjetivo: 80 });
    await expect(service.actualizar(9, 7, 3, 90)).resolves.toMatchObject({ porcentajeObjetivo: 90 });
    await expect(service.eliminar(9, 7, 3)).resolves.toEqual({ idMeta: 3 });
    expect(prisma.metaAsociacion.create.mock.calls[0][0].data).toEqual({ ...NUEVA, idAsociacion: 7 });
  });

  it.each([
    ['Vocal (solo lectura)', { cargo: 'VOCAL', nivelPermiso: 'LECTURA' }],
    ['quien no es de la junta', null],
  ])('%s recibe 403 al crear, cambiar o quitar', async (_n, junta) => {
    const { prisma, service } = build(junta);
    await expect(service.crear(9, 7, NUEVA)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.actualizar(9, 7, 3, 90)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.eliminar(9, 7, 3)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.metaAsociacion.create).not.toHaveBeenCalled();
    expect(prisma.metaAsociacion.update).not.toHaveBeenCalled();
    expect(prisma.metaAsociacion.delete).not.toHaveBeenCalled();
  });

  it('una meta de otra asociación responde 404 al cambiarla o quitarla (id cruzado)', async () => {
    const { prisma, service } = build();
    prisma.metaAsociacion.findFirst.mockResolvedValue(null);
    await expect(service.actualizar(9, 7, 99, 90)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.eliminar(9, 7, 99)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.metaAsociacion.findFirst.mock.calls[0][0].where).toEqual({ idMeta: 99, idAsociacion: 7 });
    expect(prisma.metaAsociacion.update).not.toHaveBeenCalled();
    expect(prisma.metaAsociacion.delete).not.toHaveBeenCalled();
  });

  it('una meta repetida para el mismo semestre y tipo responde 409', async () => {
    const { prisma, service } = build();
    prisma.metaAsociacion.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    await expect(service.crear(9, 7, NUEVA)).rejects.toBeInstanceOf(ConflictException);
  });

  it('el avance cuenta a los estudiantes con meta del tipo que no están en riesgo (regla «al día» del dashboard)', async () => {
    const { prisma, horas, service } = build(undefined, [
      fila(1, 100, false),
      fila(2, 100, false),
      fila(3, 100, true),
      fila(4, 100, true),
      fila(5, null, false), // sin meta de beca: no cuenta
    ]);
    prisma.metaAsociacion.findMany.mockResolvedValue([{ idMeta: 3, tipo: 'BECA', porcentajeObjetivo: 50 }]);
    const res = await service.listar(7, { anio: 2026, periodo: 2 });
    expect(horas.recorrerTodas).toHaveBeenCalledWith({ anio: 2026, periodo: 2, tipo: 'BECA', idAsociacion: 7 });
    expect(res).toEqual({
      semestre: { anio: 2026, periodo: 2 },
      metas: [{ idMeta: 3, tipo: 'BECA', porcentajeObjetivo: 50, avance: { alDia: 2, total: 4, porcentaje: 50 }, cumplida: true }],
    });
  });

  it('por debajo del objetivo no está cumplida; sin estudiantes con meta el avance es 0 y no se da por cumplida', async () => {
    const { prisma, service } = build(undefined, [fila(1, 100, true), fila(2, 100, false)]);
    prisma.metaAsociacion.findMany.mockResolvedValue([{ idMeta: 3, tipo: 'BECA', porcentajeObjetivo: 80 }]);
    expect((await service.listar(7, { anio: 2026, periodo: 2 })).metas[0]).toMatchObject({ avance: { porcentaje: 50 }, cumplida: false });

    const vacio = build(undefined, []);
    vacio.prisma.metaAsociacion.findMany.mockResolvedValue([{ idMeta: 4, tipo: 'EXTENSION', porcentajeObjetivo: 10 }]);
    expect((await vacio.service.listar(7, { anio: 2026, periodo: 2 })).metas[0]).toMatchObject({ avance: { alDia: 0, total: 0, porcentaje: 0 }, cumplida: false });
  });

  it('la meta de extensión usa la meta de extensión de cada estudiante', async () => {
    const { prisma, service } = build(undefined, [fila(1, null, false, 20), fila(2, 100, false, null)]);
    prisma.metaAsociacion.findMany.mockResolvedValue([{ idMeta: 5, tipo: 'EXTENSION', porcentajeObjetivo: 100 }]);
    expect((await service.listar(7, { anio: 2026, periodo: 2 })).metas[0]).toMatchObject({ avance: { alDia: 1, total: 1, porcentaje: 100 }, cumplida: true });
  });

  it('listar filtra por la asociación de la ruta y por el semestre pedido', async () => {
    const { prisma, service } = build();
    await service.listar(7, { anio: 2025, periodo: 1 });
    expect(prisma.metaAsociacion.findMany.mock.calls[0][0].where).toEqual({ idAsociacion: 7, anio: 2025, periodo: 1 });
  });
});
