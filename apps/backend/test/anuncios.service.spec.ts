import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  AnunciosService,
  ANUNCIO_RANGO_MESSAGE,
  ordenarPorImportancia,
} from '../src/anuncios/anuncios.service';

const AHORA = new Date('2026-10-16T12:00:00.000Z');

function build(esEstudiante = true) {
  const prisma = {
    anuncio: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ idAnuncio: 1 }),
      findUnique: vi.fn(),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
    },
    anuncioCierre: { upsert: vi.fn().mockResolvedValue({}) },
    usuarioRolAcceso: {
      findFirst: vi.fn().mockResolvedValue(esEstudiante ? { idUsuarioRolAcceso: 1 } : null),
    },
  };
  return { prisma, service: new AnunciosService(prisma as never) };
}

describe('AnunciosService', () => {
  it('ordena URGENTE > ADVERTENCIA > INFO y, a igual nivel, el mas reciente primero', () => {
    const d = (n: number) => new Date(2026, 9, n);
    const orden = ordenarPorImportancia([
      { idAnuncio: 1, nivel: 'INFO' as const, fechaInicio: d(20) },
      { idAnuncio: 2, nivel: 'URGENTE' as const, fechaInicio: d(1) },
      { idAnuncio: 3, nivel: 'ADVERTENCIA' as const, fechaInicio: d(5) },
      { idAnuncio: 4, nivel: 'ADVERTENCIA' as const, fechaInicio: d(9) },
    ]);
    expect(orden.map((a) => a.idAnuncio)).toEqual([2, 4, 3, 1]);
  });

  it('vigentes: filtra por activo, fechas, audiencia del estudiante y cierres propios', async () => {
    const { prisma, service } = build(true);
    await service.findVigentes(7, AHORA);
    expect(prisma.anuncio.findMany.mock.calls[0][0].where).toEqual({
      activo: true,
      fechaInicio: { lte: AHORA },
      fechaFin: { gt: AHORA },
      audiencia: { in: ['TODOS', 'ESTUDIANTES'] },
      cierres: { none: { idUsuario: 7 } },
    });
  });

  it('vigentes: quien no es estudiante solo ve los anuncios para TODOS', async () => {
    const { prisma, service } = build(false);
    await service.findVigentes(8, AHORA);
    expect(prisma.anuncio.findMany.mock.calls[0][0].where.audiencia).toEqual({ in: ['TODOS'] });
  });

  it('crear rechaza fechaFin igual o anterior a fechaInicio', async () => {
    const { prisma, service } = build();
    const base = { titulo: 't', mensaje: 'm', nivel: 'INFO', audiencia: 'TODOS' } as const;
    for (const fechaFin of ['2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z']) {
      await expect(
        service.create({ ...base, fechaInicio: '2026-10-02T00:00:00.000Z', fechaFin }),
      ).rejects.toThrow(new BadRequestException(ANUNCIO_RANGO_MESSAGE));
    }
    expect(prisma.anuncio.create).not.toHaveBeenCalled();
  });

  it('editar valida el rango contra las fechas ya guardadas', async () => {
    const { prisma, service } = build();
    prisma.anuncio.findUnique.mockResolvedValue({
      fechaInicio: new Date('2026-10-10T00:00:00.000Z'),
      fechaFin: new Date('2026-10-20T00:00:00.000Z'),
    });
    await expect(service.update(1, { fechaFin: '2026-10-09T00:00:00.000Z' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.update(1, { titulo: 'nuevo' })).resolves.toBeTruthy();
  });

  it('despublicar pone activo=false', async () => {
    const { prisma, service } = build();
    await service.despublicar(3);
    expect(prisma.anuncio.update).toHaveBeenCalledWith({ where: { idAnuncio: 3 }, data: { activo: false } });
  });

  it('cerrar registra el cierre del usuario y es idempotente (upsert)', async () => {
    const { prisma, service } = build();
    await service.cerrar(7, 1, AHORA);
    expect(prisma.anuncioCierre.upsert).toHaveBeenCalledWith({
      where: { idAnuncio_idUsuario: { idAnuncio: 1, idUsuario: 7 } },
      create: { idAnuncio: 1, idUsuario: 7 },
      update: {},
    });
  });

  it('cerrar un anuncio no vigente o de otra audiencia responde 404', async () => {
    const { prisma, service } = build(false);
    prisma.anuncio.findFirst.mockResolvedValue(null);
    await expect(service.cerrar(7, 99, AHORA)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.anuncioCierre.upsert).not.toHaveBeenCalled();
  });
});
