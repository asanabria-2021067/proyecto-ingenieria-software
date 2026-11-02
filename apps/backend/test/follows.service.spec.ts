import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { FollowsService } from '../src/follows/follows.service';

function crear() {
  const prisma = {
    organizacion: { findUnique: vi.fn() },
    usuarioOrganizacion: { findUnique: vi.fn().mockResolvedValue(null) },
    asociacion: { findUnique: vi.fn(), findMany: vi.fn() },
    seguimientoEntidad: { upsert: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({ count: 1 }), findMany: vi.fn() },
  };
  return { prisma, service: new FollowsService(prisma as never) };
}

const ORG = { idOrganizacion: 3, nombreOrganizacion: 'Robotica', estadoOrganizacion: 'ACTIVA' };

describe('FollowsService', () => {
  it('sigue una organización pública aunque no sea miembro', async () => {
    const { prisma, service } = crear();
    prisma.organizacion.findUnique.mockResolvedValue({ ...ORG, visibilidad: 'PUBLICA' });
    await expect(service.seguirOrganizacion(10, 3)).resolves.toEqual({ idOrganizacion: 3, siguiendo: true });
    expect(prisma.seguimientoEntidad.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { idUsuario: 10, idOrganizacion: 3 } }),
    );
  });

  it('una organización privada ajena responde como inexistente y no se sigue', async () => {
    const { prisma, service } = crear();
    prisma.organizacion.findUnique.mockResolvedValue({ ...ORG, visibilidad: 'PRIVADA' });
    await expect(service.seguirOrganizacion(10, 3)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.seguimientoEntidad.upsert).not.toHaveBeenCalled();
  });

  it('un miembro sí sigue su organización privada', async () => {
    const { prisma, service } = crear();
    prisma.organizacion.findUnique.mockResolvedValue({ ...ORG, visibilidad: 'PRIVADA' });
    prisma.usuarioOrganizacion.findUnique.mockResolvedValue({ rolOrganizacion: 'LECTURA', estadoMembresia: 'ACTIVA' });
    await expect(service.seguirOrganizacion(10, 3)).resolves.toMatchObject({ siguiendo: true });
  });

  it('no sigue asociaciones archivadas ni inexistentes', async () => {
    const { prisma, service } = crear();
    prisma.asociacion.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ archivada: true });
    await expect(service.seguirAsociacion(10, 1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.seguirAsociacion(10, 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.seguimientoEntidad.upsert).not.toHaveBeenCalled();
  });

  it('sigue una asociación activa y dejar de seguir nunca se bloquea', async () => {
    const { prisma, service } = crear();
    prisma.asociacion.findUnique.mockResolvedValue({ archivada: false });
    await expect(service.seguirAsociacion(10, 1)).resolves.toEqual({ idAsociacion: 1, siguiendo: true });
    await expect(service.dejarAsociacion(10, 1)).resolves.toEqual({ idAsociacion: 1, siguiendo: false });
    await expect(service.dejarOrganizacion(10, 3)).resolves.toEqual({ idOrganizacion: 3, siguiendo: false });
    expect(prisma.seguimientoEntidad.deleteMany).toHaveBeenCalledWith({ where: { idUsuario: 10, idOrganizacion: 3 } });
  });

  it('el catálogo marca cuáles asociaciones ya sigue el usuario', async () => {
    const { prisma, service } = crear();
    prisma.asociacion.findMany.mockResolvedValue([
      { idAsociacion: 1, nombre: 'A', logoUrl: null, descripcion: null, carreras: [{ carrera: { nombreCarrera: 'Computacion' } }], seguidores: [{ idSeguimientoEntidad: 9 }] },
      { idAsociacion: 2, nombre: 'B', logoUrl: null, descripcion: null, carreras: [], seguidores: [] },
    ]);
    const catalogo = await service.catalogoAsociaciones(10);
    expect(catalogo.map((a) => [a.idAsociacion, a.siguiendo, a.carreras])).toEqual([
      [1, true, ['Computacion']],
      [2, false, []],
    ]);
    expect(prisma.asociacion.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { archivada: false } }));
  });

  it('mios separa organizaciones y asociaciones', async () => {
    const { prisma, service } = crear();
    prisma.seguimientoEntidad.findMany.mockResolvedValue([
      { organizacion: { idOrganizacion: 3, nombreOrganizacion: 'R', logoUrl: null }, asociacion: null },
      { organizacion: null, asociacion: { idAsociacion: 1, nombre: 'A', logoUrl: null } },
    ]);
    const mios = await service.misSeguimientos(10);
    expect(mios.organizaciones).toHaveLength(1);
    expect(mios.asociaciones).toHaveLength(1);
  });
});
