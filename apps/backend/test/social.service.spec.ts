import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { EstadoAmistad } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { SocialService } from '../src/social/social.service';

function makePrisma() {
  return {
    amistad: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    seguimiento: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    usuario: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ nombre: 'Ana', apellido: 'Pérez' }),
      findMany: vi.fn(),
    },
    perfilEstudiante: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  const notifications = { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) };
  const service = new SocialService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { service, notifications };
}

describe('SocialService — amistades', () => {
  it('rechaza una solicitud de amistad a uno mismo', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);

    await expect(service.crearSolicitudAmistad(1, 1)).rejects.toThrow(BadRequestException);
    expect(prisma.amistad.create).not.toHaveBeenCalled();
  });

  it('rechaza una solicitud duplicada en el mismo sentido', async () => {
    const prisma = makePrisma();
    prisma.amistad.findUnique
      .mockResolvedValueOnce({ idAmistad: 5, estado: EstadoAmistad.PENDIENTE })
      .mockResolvedValueOnce(null);
    const { service } = makeService(prisma);

    await expect(service.crearSolicitudAmistad(1, 2)).rejects.toThrow(ConflictException);
    expect(prisma.amistad.create).not.toHaveBeenCalled();
  });

  it('rechaza una solicitud si ya son amigos (inversa ACEPTADA)', async () => {
    const prisma = makePrisma();
    prisma.amistad.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ idAmistad: 5, estado: EstadoAmistad.ACEPTADA });
    const { service } = makeService(prisma);

    await expect(service.crearSolicitudAmistad(1, 2)).rejects.toThrow(ConflictException);
  });

  it('acepta automáticamente si existe la inversa PENDIENTE en vez de duplicar', async () => {
    const prisma = makePrisma();
    prisma.amistad.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ idAmistad: 7, idUsuarioSolicitante: 2, idUsuarioReceptor: 1, estado: EstadoAmistad.PENDIENTE });
    prisma.amistad.update.mockResolvedValue({ idAmistad: 7, estado: EstadoAmistad.ACEPTADA });
    const { service, notifications } = makeService(prisma);

    const result = await service.crearSolicitudAmistad(1, 2);

    expect(prisma.amistad.create).not.toHaveBeenCalled();
    expect(prisma.amistad.update).toHaveBeenCalledWith({
      where: { idAmistad: 7 },
      data: { estado: EstadoAmistad.ACEPTADA, fechaResolucion: expect.any(Date) },
    });
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([2], 'AMISTAD_ACEPTADA', expect.any(Object));
    expect(result.estado).toBe(EstadoAmistad.ACEPTADA);
  });

  it('crea una solicitud nueva y notifica al receptor cuando no hay relación previa', async () => {
    const prisma = makePrisma();
    prisma.amistad.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.amistad.create.mockResolvedValue({ idAmistad: 9, estado: EstadoAmistad.PENDIENTE });
    const { service, notifications } = makeService(prisma);

    await service.crearSolicitudAmistad(1, 2);

    expect(prisma.amistad.create).toHaveBeenCalledWith({
      data: { idUsuarioSolicitante: 1, idUsuarioReceptor: 2 },
    });
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([2], 'SOLICITUD_AMISTAD', expect.any(Object));
  });

  it('rechaza resolver una solicitud ajena (no soy el receptor)', async () => {
    const prisma = makePrisma();
    prisma.amistad.findUnique.mockResolvedValue({
      idAmistad: 3,
      idUsuarioSolicitante: 1,
      idUsuarioReceptor: 2,
      estado: EstadoAmistad.PENDIENTE,
    });
    const { service } = makeService(prisma);

    await expect(service.resolverSolicitudAmistad(99, 3, 'aceptar')).rejects.toThrow(ForbiddenException);
    expect(prisma.amistad.update).not.toHaveBeenCalled();
  });

  it('permite al receptor aceptar y notifica al solicitante', async () => {
    const prisma = makePrisma();
    prisma.amistad.findUnique.mockResolvedValue({
      idAmistad: 3,
      idUsuarioSolicitante: 1,
      idUsuarioReceptor: 2,
      estado: EstadoAmistad.PENDIENTE,
    });
    prisma.amistad.update.mockResolvedValue({ idAmistad: 3, estado: EstadoAmistad.ACEPTADA });
    const { service, notifications } = makeService(prisma);

    await service.resolverSolicitudAmistad(2, 3, 'aceptar');

    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([1], 'AMISTAD_ACEPTADA', expect.any(Object));
  });

  it('rechaza resolver una solicitud que ya fue resuelta', async () => {
    const prisma = makePrisma();
    prisma.amistad.findUnique.mockResolvedValue({
      idAmistad: 3,
      idUsuarioSolicitante: 1,
      idUsuarioReceptor: 2,
      estado: EstadoAmistad.ACEPTADA,
    });
    const { service } = makeService(prisma);

    await expect(service.resolverSolicitudAmistad(2, 3, 'aceptar')).rejects.toThrow(ConflictException);
  });

  it('lanza 404 al resolver una solicitud inexistente', async () => {
    const prisma = makePrisma();
    prisma.amistad.findUnique.mockResolvedValue(null);
    const { service } = makeService(prisma);

    await expect(service.resolverSolicitudAmistad(2, 999, 'aceptar')).rejects.toThrow(NotFoundException);
  });

  it('permite eliminar la amistad a cualquiera de los dos usuarios', async () => {
    const prisma = makePrisma();
    prisma.amistad.findUnique.mockResolvedValue({ idAmistad: 3, idUsuarioSolicitante: 1, idUsuarioReceptor: 2 });
    const { service } = makeService(prisma);

    await service.eliminarAmistad(2, 3);
    expect(prisma.amistad.delete).toHaveBeenCalledWith({ where: { idAmistad: 3 } });
  });

  it('rechaza eliminar una amistad de la que no forma parte', async () => {
    const prisma = makePrisma();
    prisma.amistad.findUnique.mockResolvedValue({ idAmistad: 3, idUsuarioSolicitante: 1, idUsuarioReceptor: 2 });
    const { service } = makeService(prisma);

    await expect(service.eliminarAmistad(99, 3)).rejects.toThrow(ForbiddenException);
  });
});

describe('SocialService — seguimientos', () => {
  it('rechaza seguirse a uno mismo', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);

    await expect(service.seguirUsuario(1, 1)).rejects.toThrow(BadRequestException);
  });

  it('rechaza seguir dos veces al mismo usuario', async () => {
    const prisma = makePrisma();
    prisma.seguimiento.findUnique.mockResolvedValue({ idSeguimiento: 1 });
    const { service } = makeService(prisma);

    await expect(service.seguirUsuario(1, 2)).rejects.toThrow(ConflictException);
  });

  it('crea el seguimiento y notifica al seguido', async () => {
    const prisma = makePrisma();
    prisma.seguimiento.findUnique.mockResolvedValue(null);
    prisma.seguimiento.create.mockResolvedValue({ idSeguimiento: 1, idSeguidor: 1, idSeguido: 2 });
    const { service, notifications } = makeService(prisma);

    await service.seguirUsuario(1, 2);

    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([2], 'NUEVO_SEGUIDOR', expect.any(Object));
  });
});

describe('SocialService — buscarUsuarios', () => {
  it('rechaza búsquedas de menos de 2 caracteres', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);

    await expect(service.buscarUsuarios(1, { q: 'a' })).rejects.toThrow(BadRequestException);
  });

  it('sin q ni filtros no consulta la base de datos y devuelve vacío', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);

    const resultado = await service.buscarUsuarios(1, {});

    expect(resultado).toEqual([]);
    expect(prisma.usuario.findMany).not.toHaveBeenCalled();
  });

  it('excluye al propio usuario del resultado', async () => {
    const prisma = makePrisma();
    prisma.usuario.findMany.mockResolvedValue([]);
    const { service } = makeService(prisma);

    await service.buscarUsuarios(1, { q: 'ana' });

    expect(prisma.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: expect.arrayContaining([{ idUsuario: { not: 1 } }]) },
      }),
    );
  });

  it('filtra por misma carrera usando el perfil del usuario actual', async () => {
    const prisma = makePrisma();
    prisma.perfilEstudiante.findUnique.mockResolvedValue({ idCarrera: 7 });
    prisma.perfilEstudiante.findMany.mockResolvedValue([{ idUsuario: 2 }, { idUsuario: 3 }]);
    prisma.usuario.findMany.mockResolvedValue([]);
    const { service } = makeService(prisma);

    await service.buscarUsuarios(1, { carrera: true });

    expect(prisma.perfilEstudiante.findUnique).toHaveBeenCalledWith({
      where: { idUsuario: 1 },
      select: { idCarrera: true },
    });
    expect(prisma.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: expect.arrayContaining([{ idUsuario: { in: [2, 3] } }]) },
      }),
    );
  });

  it('no filtra por carrera si el usuario actual no tiene carrera asignada', async () => {
    const prisma = makePrisma();
    prisma.perfilEstudiante.findUnique.mockResolvedValue({ idCarrera: null });
    prisma.usuario.findMany.mockResolvedValue([]);
    const { service } = makeService(prisma);

    await service.buscarUsuarios(1, { carrera: true });

    expect(prisma.perfilEstudiante.findMany).not.toHaveBeenCalled();
    expect(prisma.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: expect.arrayContaining([{ idUsuario: { in: [] } }]) },
      }),
    );
  });

  it('filtra por habilidades e intereses combinables (AND entre tipos)', async () => {
    const prisma = makePrisma();
    prisma.usuario.findMany.mockResolvedValue([]);
    const { service } = makeService(prisma);

    await service.buscarUsuarios(1, { habilidades: [4, 5], intereses: [9] });

    expect(prisma.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            { habilidades: { some: { idHabilidad: { in: [4, 5] } } } },
            { intereses: { some: { idInteres: { in: [9] } } } },
          ]),
        },
      }),
    );
  });
});

describe('SocialService — getAmigosDeAmigosIds', () => {
  it('devuelve vacío si el usuario no tiene amigos directos', async () => {
    const prisma = makePrisma();
    prisma.amistad.findMany.mockResolvedValue([]);
    const { service } = makeService(prisma);

    const resultado = await service.getAmigosDeAmigosIds(1);

    expect(resultado).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('excluye al propio usuario y a los amigos directos del resultado de 2 saltos', async () => {
    const prisma = makePrisma();
    prisma.amistad.findMany.mockResolvedValue([
      { idUsuarioSolicitante: 1, idUsuarioReceptor: 2 },
    ]);
    prisma.$queryRaw.mockResolvedValue([{ idUsuario: 1 }, { idUsuario: 2 }, { idUsuario: 3 }]);
    const { service } = makeService(prisma);

    const resultado = await service.getAmigosDeAmigosIds(1);

    expect(resultado).toEqual([3]);
  });
});
