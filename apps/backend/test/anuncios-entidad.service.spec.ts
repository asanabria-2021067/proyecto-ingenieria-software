import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AnunciosEntidadService } from '../src/anuncios/anuncios-entidad.service';

const DTO = {
  titulo: 'Reunión',
  mensaje: 'Mañana a las 5',
  nivel: 'INFO' as const,
  fechaInicio: '2026-11-02T00:00:00.000Z',
  fechaFin: '2026-11-09T00:00:00.000Z',
};

function build(rol: string | null, orgEstado = 'ACTIVA', junta: { cargo: string; nivelPermiso: string; archivada?: boolean } | null = null) {
  const prisma = {
    organizacion: {
      findUnique: vi.fn().mockResolvedValue({ idOrganizacion: 1, nombreOrganizacion: 'Org', estadoOrganizacion: orgEstado, visibilidad: 'PUBLICA' }),
    },
    usuarioOrganizacion: {
      findUnique: vi.fn().mockResolvedValue(rol ? { rolOrganizacion: rol, estadoMembresia: 'ACTIVA' } : null),
    },
    juntaAsociacion: {
      findUnique: vi.fn().mockResolvedValue(junta && { ...junta, asociacion: { idAsociacion: 3, nombre: 'Aso', archivada: junta.archivada ?? false } }),
    },
    anuncio: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { prisma, service: new AnunciosEntidadService(prisma as never) };
}

describe('AnunciosEntidadService (MEJ-66)', () => {
  it.each(['PROPIETARIO', 'ADMINISTRADOR'])('%s publica en la organizacion con audiencia TODOS y su autor', async (rol) => {
    const { prisma, service } = build(rol);
    await service.crearOrganizacion(9, 1, DTO);
    expect(prisma.anuncio.create.mock.calls[0][0].data).toMatchObject({ idOrganizacion: 1, audiencia: 'TODOS', creadoPor: 9 });
  });

  it.each(['EDITOR', 'LECTURA', 'MIEMBRO'])('%s no publica ni despublica en la organizacion', async (rol) => {
    const { prisma, service } = build(rol);
    await expect(service.crearOrganizacion(9, 1, DTO)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.despublicarOrganizacion(9, 1, 5)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.anuncio.create).not.toHaveBeenCalled();
    expect(prisma.anuncio.updateMany).not.toHaveBeenCalled();
  });

  it('una organizacion archivada no recibe anuncios nuevos y quien no es miembro no los lista', async () => {
    await expect(build('PROPIETARIO', 'INACTIVA').service.crearOrganizacion(9, 1, DTO)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build(null).service.listarOrganizacion(9, 1)).rejects.toBeInstanceOf(ForbiddenException);
    const { service } = build('LECTURA');
    await expect(service.listarOrganizacion(9, 1)).resolves.toEqual([]);
  });

  it('rechaza un rango de fechas invertido', async () => {
    const { service } = build('PROPIETARIO');
    await expect(service.crearOrganizacion(9, 1, { ...DTO, fechaFin: DTO.fechaInicio })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('despublicar solo alcanza anuncios de esa entidad (otro id responde 404)', async () => {
    const { prisma, service } = build('ADMINISTRADOR');
    await service.despublicarOrganizacion(9, 1, 5);
    expect(prisma.anuncio.updateMany).toHaveBeenCalledWith({ where: { idAnuncio: 5, idOrganizacion: 1 }, data: { activo: false } });
    prisma.anuncio.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.despublicarOrganizacion(9, 1, 6)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('en la asociacion publican el Presidente y los Editores; el Vocal (Lectura) no', async () => {
    const presidente = build(null, 'ACTIVA', { cargo: 'PRESIDENTE', nivelPermiso: 'ADMINISTRADOR' });
    await presidente.service.crearAsociacion(9, 3, DTO);
    expect(presidente.prisma.anuncio.create.mock.calls[0][0].data).toMatchObject({ idAsociacion: 3, audiencia: 'TODOS' });

    const tesorero = build(null, 'ACTIVA', { cargo: 'TESORERO', nivelPermiso: 'EDITOR' });
    await expect(tesorero.service.crearAsociacion(9, 3, DTO)).resolves.toBeTruthy();

    const vocal = build(null, 'ACTIVA', { cargo: 'VOCAL', nivelPermiso: 'LECTURA' });
    await expect(vocal.service.crearAsociacion(9, 3, DTO)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(vocal.service.despublicarAsociacion(9, 3, 1)).rejects.toBeInstanceOf(ForbiddenException);

    const ajeno = build(null);
    await expect(ajeno.service.crearAsociacion(9, 3, DTO)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
