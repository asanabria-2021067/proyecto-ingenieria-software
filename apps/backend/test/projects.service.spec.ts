import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { EstadoProyectoCreador } from '../src/projects/dto/update-estado-proyecto.dto';
import { ProjectsService } from '../src/projects/projects.service';

function makePrisma() {
  return {
    proyecto: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    revisionProyecto: {
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    participacionProyecto: { updateMany: vi.fn(), findMany: vi.fn() },
    postulacion: { updateMany: vi.fn(), findMany: vi.fn() },
    rolProyecto: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    requisitoHabilidadRol: { deleteMany: vi.fn(), createMany: vi.fn() },
    proyectoOrganizacion: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: any) => unknown) => cb({
      proyecto: {
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
      },
      revisionProyecto: { findFirst: vi.fn(), create: vi.fn() },
      rolProyecto: { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
      requisitoHabilidadRol: { deleteMany: vi.fn(), createMany: vi.fn() },
      proyectoOrganizacion: { deleteMany: vi.fn(), createMany: vi.fn() },
      participacionProyecto: { updateMany: vi.fn(), findMany: vi.fn() },
      postulacion: { updateMany: vi.fn() },
    })),
  } as any;
}

describe('ProjectsService', () => {
  it('findAll aplica filtros', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findMany.mockResolvedValue([]);
    const service = new ProjectsService(prisma, { isAdmin: vi.fn(), notifyAdmins: vi.fn(), notifyUsers: vi.fn() } as any);

    await service.findAll({ q: 'alpha', habilidadId: 3, organizacionId: 8 });

    const where = prisma.proyecto.findMany.mock.calls[0][0].where;
    expect(where.AND.length).toBeGreaterThan(2);
  });

  it('findOne falla cuando no existe', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = new ProjectsService(prisma, {} as any);
    await expect(service.findOne(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findOneOwner falla si no es dueño', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 99 });
    const service = new ProjectsService(prisma, {} as any);
    await expect(service.findOneOwner(1, 1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findMine calcula agregados de roles', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findMany.mockResolvedValue([
      {
        roles: [
          { idRolProyecto: 1, _count: { postulaciones: 2, participaciones: 1 } },
          { idRolProyecto: 2, _count: { postulaciones: 3, participaciones: 0 } },
        ],
      },
    ]);
    const service = new ProjectsService(prisma, {} as any);
    const result = await service.findMine(1);
    expect(result[0].cantidadPostulaciones).toBe(5);
    expect(result[0].rolesCubiertos).toBe(1);
  });

  it('submitForReview cambia estado y notifica', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, estadoProyecto: EstadoProyecto.BORRADOR, creadoPor: 1 });
    prisma.revisionProyecto.count.mockResolvedValue(0);
    const tx = {
      proyecto: { update: vi.fn() },
      revisionProyecto: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    };
    prisma.$transaction = vi.fn(async (cb: (arg: any) => unknown) => cb(tx));
    const notifications = { notifyAdmins: vi.fn(), isAdmin: vi.fn() } as any;
    const service = new ProjectsService(prisma, notifications);

    const result = await service.submitForReview(1, 1);

    expect(result.estadoProyecto).toBe(EstadoProyecto.EN_REVISION);
    expect(notifications.notifyAdmins).toHaveBeenCalled();
  });

  it('resubmit falla si estado no es observado', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, estadoProyecto: EstadoProyecto.BORRADOR, creadoPor: 1 });
    const service = new ProjectsService(prisma, {} as any);
    await expect(service.resubmit(1, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requestClose falla si no está en progreso', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: 1 });
    const service = new ProjectsService(prisma, {} as any);
    await expect(service.requestClose(1, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approveClosure requiere admin', async () => {
    const prisma = makePrisma();
    const notifications = { isAdmin: vi.fn().mockResolvedValue(false) } as any;
    const service = new ProjectsService(prisma, notifications);
    await expect(service.approveClosure(1, 2)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejectClosure regresa en_progreso', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue({
      idProyecto: 1,
      tituloProyecto: 'P',
      estadoProyecto: EstadoProyecto.EN_SOLICITUD_CIERRE,
      creadoPor: 5,
    });
    const tx = { proyecto: { update: vi.fn() } };
    prisma.$transaction = vi.fn(async (cb: (arg: any) => unknown) => cb(tx));
    const notifications = { isAdmin: vi.fn().mockResolvedValue(true), notifyUsers: vi.fn() } as any;
    const service = new ProjectsService(prisma, notifications);

    const result = await service.rejectClosure(1, 99);

    expect(result.estadoProyecto).toBe(EstadoProyecto.EN_PROGRESO);
    expect(notifications.notifyUsers).toHaveBeenCalled();
  });

  it('changeEstado valida transición', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({
      idProyecto: 1,
      estadoProyecto: EstadoProyecto.EN_PROGRESO,
      creadoPor: 1,
    });
    const service = new ProjectsService(prisma, {} as any);
    await expect(service.changeEstado(1, 1, EstadoProyectoCreador.PUBLICADO)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('findPostulacionesByProject exige ownership', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({
      idProyecto: 2,
      estadoProyecto: EstadoProyecto.PUBLICADO,
      creadoPor: 7,
    });
    const service = new ProjectsService(prisma, {} as any);
    await expect(service.findPostulacionesByProject(2, 1)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
