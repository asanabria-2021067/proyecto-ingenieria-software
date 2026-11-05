import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CoordinadorService } from '../src/coordinador/coordinador.service';
import { REGLA_ALCANCE_COORDINADOR } from '../src/coordinador/coordinador-alcance';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const COMPUTACION = { idCarrera: 1, nombreCarrera: 'Computación', facultad: 'Ingeniería' };
const INDUSTRIAL = { idCarrera: 2, nombreCarrera: 'Industrial', facultad: 'Ingeniería' };

/** `roles`: nombres de rol que tiene el actor; `alcance`: filas de alcance_coordinador del actor. */
function makePrisma(roles: string[], alcance: { idCarrera: number | null; facultad: string | null }[] = []) {
  const tx = {
    alcanceCoordinador: { deleteMany: vi.fn(), createMany: vi.fn() },
    bitacoraAuditoria: { create: vi.fn() },
  };
  const prisma = {
    usuarioRolAcceso: {
      findFirst: vi.fn(async ({ where }: { where: { rolAcceso: { nombrePerfil: string } } }) =>
        roles.includes(where.rolAcceso.nombrePerfil) ? { idUsuarioRolAcceso: 1 } : null),
    },
    alcanceCoordinador: { findMany: vi.fn(async () => alcance) },
    carrera: {
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
        const todas = [COMPUTACION, INDUSTRIAL];
        const w = args.where as { idCarrera?: { in: number[] }; facultad?: { in: string[] }; OR?: { idCarrera?: { in: number[] }; facultad?: { in: string[] } }[] };
        if (w.OR) {
          return todas.filter((c) => w.OR!.some((o) => o.idCarrera?.in.includes(c.idCarrera) || o.facultad?.in.includes(c.facultad)));
        }
        if (w.idCarrera) return todas.filter((c) => w.idCarrera!.in.includes(c.idCarrera)).map((c) => ({ nombreCarrera: c.nombreCarrera, ...c }));
        if (w.facultad) return todas.filter((c) => w.facultad!.in.includes(c.facultad));
        return todas;
      }),
    },
    proyecto: { count: vi.fn(async () => 0) },
    usuario: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { prisma, tx };
}

function makeService(prisma: ReturnType<typeof makePrisma>['prisma']) {
  const notifications = { notifyFromTemplate: vi.fn() };
  const service = new CoordinadorService(prisma as unknown as PrismaService, notifications as unknown as NotificationsService);
  return { service, notifications };
}

describe('CoordinadorService.miAlcance', () => {
  it('el coordinador recibe sus carreras y la regla de ayuda', async () => {
    const { prisma } = makePrisma(['coordinador_academico'], [{ idCarrera: 1, facultad: null }]);
    const { service } = makeService(prisma);
    const r = await service.miAlcance(5);
    expect(r).toEqual({ todas: false, carreras: [{ idCarrera: 1, nombreCarrera: 'Computación', facultad: 'Ingeniería' }], regla: REGLA_ALCANCE_COORDINADOR });
  });

  it('una facultad asignada aporta todas sus carreras', async () => {
    const { prisma } = makePrisma(['coordinador_academico'], [{ idCarrera: null, facultad: 'Ingeniería' }]);
    const r = await makeService(prisma).service.miAlcance(5);
    expect(r.carreras.map((c) => c.idCarrera).sort()).toEqual([1, 2]);
  });

  it('un coordinador sin alcance no tiene carreras', async () => {
    const { prisma } = makePrisma(['coordinador_academico']);
    const r = await makeService(prisma).service.miAlcance(5);
    expect(r).toMatchObject({ todas: false, carreras: [] });
  });

  it('el administrador no tiene restricción', async () => {
    const { prisma } = makePrisma(['administrador']);
    expect(await makeService(prisma).service.miAlcance(1)).toEqual({ todas: true, carreras: [], regla: REGLA_ALCANCE_COORDINADOR });
  });

  it('otro rol recibe 403', async () => {
    const { prisma } = makePrisma(['estudiante']);
    await expect(makeService(prisma).service.miAlcance(9)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('CoordinadorService.pendientes', () => {
  it('cuenta revisiones y cierres filtrados al alcance y excluyendo lo propio', async () => {
    const { prisma } = makePrisma(['coordinador_academico'], [{ idCarrera: 1, facultad: null }]);
    prisma.proyecto.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    const r = await makeService(prisma).service.pendientes(5);
    expect(r).toEqual({ total: 5, items: [{ clave: 'revisiones', total: 3 }, { clave: 'cierres', total: 2 }] });
    for (const [args] of prisma.proyecto.count.mock.calls as unknown as [{ where: Record<string, unknown> }][]) {
      expect(args.where.OR).toHaveLength(3);
      expect(args.where.creadoPor).toEqual({ not: 5 });
    }
  });

  it('los cierres cuentan todo proyecto EN_SOLICITUD_CIERRE del alcance, igual que el panel del admin', async () => {
    const { prisma } = makePrisma(['coordinador_academico'], [{ idCarrera: 1, facultad: null }]);
    await makeService(prisma).service.pendientes(5);
    const { where } = (prisma.proyecto.count.mock.calls as unknown as [{ where: Record<string, unknown> }][])[1][0];
    expect(where.estadoProyecto).toBe('EN_SOLICITUD_CIERRE');
    expect(where.revisionesCierre).toBeUndefined();
  });

  it('el coordinador sin alcance filtra con una lista vacía de carreras', async () => {
    const { prisma } = makePrisma(['coordinador_academico']);
    await makeService(prisma).service.pendientes(5);
    const { where } = (prisma.proyecto.count.mock.calls as unknown as [{ where: { OR: { idCarrera?: { in: number[] } }[] } }][])[0][0];
    expect(where.OR[0].idCarrera).toEqual({ in: [] });
  });

  it('el administrador cuenta todo sin filtro de alcance', async () => {
    const { prisma } = makePrisma(['administrador']);
    await makeService(prisma).service.pendientes(1);
    for (const [args] of prisma.proyecto.count.mock.calls as unknown as [{ where: Record<string, unknown> }][]) {
      expect(args.where.OR).toBeUndefined();
      expect(args.where.creadoPor).toBeUndefined();
    }
  });
});

describe('CoordinadorService.guardarAlcance y leerAlcance', () => {
  const dto = { carreraIds: [1], facultades: [] as string[] };

  it('solo un administrador asigna o lee el alcance', async () => {
    const { prisma } = makePrisma(['coordinador_academico'], [{ idCarrera: 1, facultad: null }]);
    const { service } = makeService(prisma);
    await expect(service.guardarAlcance(5, 5, dto)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.leerAlcance(5, 5)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza un usuario inexistente o sin el rol coordinador', async () => {
    const { prisma } = makePrisma(['administrador']);
    const { service } = makeService(prisma);
    prisma.usuario.findUnique.mockResolvedValueOnce(null);
    await expect(service.guardarAlcance(1, 7, dto)).rejects.toBeInstanceOf(NotFoundException);
    prisma.usuario.findUnique.mockResolvedValueOnce({ rolesAcceso: [] });
    await expect(service.guardarAlcance(1, 7, dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza carreras o facultades inexistentes sin escribir', async () => {
    const { prisma } = makePrisma(['administrador']);
    prisma.usuario.findUnique.mockResolvedValue({ rolesAcceso: [{ idUsuarioRolAcceso: 1 }] });
    const { service } = makeService(prisma);
    await expect(service.guardarAlcance(1, 7, { carreraIds: [99], facultades: [] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.guardarAlcance(1, 7, { carreraIds: [], facultades: ['Nada'] })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('al cambiar el alcance reemplaza filas, deja bitácora y avisa al coordinador', async () => {
    const { prisma, tx } = makePrisma(['administrador']);
    prisma.usuario.findUnique.mockResolvedValue({ rolesAcceso: [{ idUsuarioRolAcceso: 1 }] });
    const { service, notifications } = makeService(prisma);
    await service.guardarAlcance(1, 7, dto);
    expect(tx.alcanceCoordinador.deleteMany).toHaveBeenCalledWith({ where: { idUsuario: 7 } });
    expect(tx.alcanceCoordinador.createMany).toHaveBeenCalledWith({ data: [{ idUsuario: 7, idCarrera: 1, asignadoPor: 1 }] });
    expect(tx.bitacoraAuditoria.create).toHaveBeenCalledTimes(1);
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([7], 'ALCANCE_COORDINADOR', { carreras: ['Computación'], facultades: [] }, tx);
  });

  it('guardar el mismo alcance no escribe ni avisa', async () => {
    const { prisma } = makePrisma(['administrador']);
    prisma.alcanceCoordinador.findMany.mockResolvedValue([{ idCarrera: 1, facultad: null }]);
    prisma.usuario.findUnique.mockResolvedValue({ rolesAcceso: [{ idUsuarioRolAcceso: 1 }] });
    const { service, notifications } = makeService(prisma);
    const r = await service.guardarAlcance(1, 7, dto);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    expect(r.carreraIds).toEqual([1]);
  });
});
