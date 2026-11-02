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
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    anuncioCierre: { upsert: vi.fn().mockResolvedValue({}) },
    usuarioOrganizacion: { findMany: vi.fn().mockResolvedValue([]) },
    perfilEstudiante: { findUnique: vi.fn().mockResolvedValue(null) },
    asociacionCarrera: { findMany: vi.fn().mockResolvedValue([]) },
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
      OR: [
        { idOrganizacion: null, idAsociacion: null, audiencia: { in: ['TODOS', 'ESTUDIANTES'] } },
        { idOrganizacion: { in: [] } },
        { idAsociacion: { in: [] } },
      ],
      cierres: { none: { idUsuario: 7 } },
    });
  });

  it('vigentes: quien no es estudiante solo ve los anuncios para TODOS', async () => {
    const { prisma, service } = build(false);
    await service.findVigentes(8, AHORA);
    expect(prisma.anuncio.findMany.mock.calls[0][0].where.OR[0].audiencia).toEqual({ in: ['TODOS'] });
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
    prisma.anuncio.findFirst.mockResolvedValue({
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
    expect(prisma.anuncio.updateMany).toHaveBeenCalledWith({
      where: { idAnuncio: 3, idOrganizacion: null, idAsociacion: null },
      data: { activo: false },
    });
  });

  it('administracion no edita ni despublica anuncios de una organizacion o asociacion (404)', async () => {
    const { prisma, service } = build();
    prisma.anuncio.findFirst.mockResolvedValue(null);
    prisma.anuncio.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.despublicar(3)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update(3, { titulo: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.anuncio.updateMany.mock.calls[0][0].where).toMatchObject({ idOrganizacion: null, idAsociacion: null });
    expect(prisma.anuncio.update).not.toHaveBeenCalled();
  });

  it('vigentes incluye los de las organizaciones del usuario y las asociaciones de su carrera, con su origen', async () => {
    const { prisma, service } = build(true);
    prisma.usuarioOrganizacion.findMany.mockResolvedValue([{ idOrganizacion: 4 }]);
    prisma.perfilEstudiante.findUnique.mockResolvedValue({ idCarrera: 2 });
    prisma.asociacionCarrera.findMany.mockResolvedValue([{ idAsociacion: 9 }]);
    prisma.anuncio.findMany.mockResolvedValue([
      { idAnuncio: 1, nivel: 'INFO', fechaInicio: AHORA, organizacion: { nombreOrganizacion: 'Robotica' }, asociacion: null },
      { idAnuncio: 2, nivel: 'INFO', fechaInicio: AHORA, organizacion: null, asociacion: null },
    ]);
    const res = await service.findVigentes(7, AHORA);
    expect(prisma.usuarioOrganizacion.findMany.mock.calls[0][0].where).toEqual({ idUsuario: 7, estadoMembresia: 'ACTIVA' });
    expect(prisma.asociacionCarrera.findMany.mock.calls[0][0].where).toEqual({ idCarrera: 2, asociacion: { archivada: false } });
    expect(prisma.anuncio.findMany.mock.calls[0][0].where.OR).toEqual([
      { idOrganizacion: null, idAsociacion: null, audiencia: { in: ['TODOS', 'ESTUDIANTES'] } },
      { idOrganizacion: { in: [4] } },
      { idAsociacion: { in: [9] } },
    ]);
    expect(res.map((a) => [a.idAnuncio, a.origen])).toEqual([[2, null], [1, 'Robotica']]);
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
