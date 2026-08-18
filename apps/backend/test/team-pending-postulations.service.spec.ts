import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { ApplicationsService } from '../src/applications/applications.service';
import type { ExitRequestsService } from '../src/exit-requests/exit-requests.service';
import { TeamService } from '../src/team/team.service';

function makePrisma() {
  return {
    proyecto: { findFirst: vi.fn() },
  };
}

function makeApplications(postulaciones: unknown[] = []) {
  return {
    findAll: vi.fn().mockResolvedValue(postulaciones),
  };
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
  applications: ReturnType<typeof makeApplications> = makeApplications(),
) {
  return new TeamService(
    prisma as unknown as PrismaService,
    applications as unknown as ApplicationsService,
    { getPendingLeaderReviews: vi.fn() } as unknown as ExitRequestsService,
  );
}

function postulacion(
  idPostulacion: number,
  idProyecto: number,
  estadoPostulacion: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA' = 'PENDIENTE',
) {
  return {
    idPostulacion,
    estadoPostulacion,
    fechaPostulacion: new Date(`2026-01-${String(idPostulacion).padStart(2, '0')}T00:00:00.000Z`),
    postulante: {
      idUsuario: 100 + idPostulacion,
      nombre: `Postulante ${idPostulacion}`,
      apellido: 'Apellido',
      correo: `postulante${idPostulacion}@example.com`,
    },
    rolProyecto: {
      idRolProyecto: 200 + idPostulacion,
      nombreRol: `Rol ${idPostulacion}`,
      proyecto: {
        idProyecto,
        tituloProyecto: `Proyecto ${idProyecto}`,
      },
    },
  };
}

describe('TeamService.getPendingPostulations', () => {
  it('devuelve únicamente postulaciones PENDIENTE del proyecto solicitado', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 10 });
    const applications = makeApplications([
      postulacion(1, 1, 'PENDIENTE'),
      postulacion(2, 1, 'ACEPTADA'),
      postulacion(3, 1, 'RECHAZADA'),
      postulacion(4, 2, 'PENDIENTE'),
    ]);
    const service = makeService(prisma, applications);

    const result = await service.getPendingPostulations(1, 10);

    expect(result.map((p) => p.idPostulacion)).toEqual([1]);
    expect(result.every((p) => p.estadoPostulacion === 'PENDIENTE')).toBe(true);
  });

  it('excluye postulaciones PENDIENTE de otros proyectos usando rolProyecto.proyecto.idProyecto', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 10 });
    const applications = makeApplications([
      postulacion(1, 1, 'PENDIENTE'),
      postulacion(2, 2, 'PENDIENTE'),
    ]);
    const service = makeService(prisma, applications);

    const result = await service.getPendingPostulations(1, 10);

    expect(result.map((p) => p.idPostulacion)).toEqual([1]);
    expect(result.some((p) => p.rolProyecto.proyecto.idProyecto === 2)).toBe(false);
  });

  it('refleja inmediatamente cambios de estado provenientes de ApplicationsService', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 10 });
    const applications = {
      findAll: vi
        .fn()
        .mockResolvedValueOnce([postulacion(1, 1, 'PENDIENTE')])
        .mockResolvedValueOnce([postulacion(1, 1, 'ACEPTADA')]),
    };
    const service = makeService(prisma, applications);

    const primeraLectura = await service.getPendingPostulations(1, 10);
    const segundaLectura = await service.getPendingPostulations(1, 10);

    expect(primeraLectura.map((p) => p.idPostulacion)).toEqual([1]);
    expect(segundaLectura).toEqual([]);
    expect(applications.findAll).toHaveBeenCalledTimes(2);
  });

  it('devuelve [] cuando el proyecto no tiene postulaciones pendientes', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 10 });
    const applications = makeApplications([
      postulacion(1, 1, 'ACEPTADA'),
      postulacion(2, 1, 'RECHAZADA'),
      postulacion(3, 2, 'PENDIENTE'),
    ]);
    const service = makeService(prisma, applications);

    await expect(service.getPendingPostulations(1, 10)).resolves.toEqual([]);
  });

  it('usa ApplicationsService.findAll como fuente de verdad y no consulta Prisma.postulacion desde Team', async () => {
    const prisma = makePrisma() as ReturnType<typeof makePrisma> & {
      postulacion?: { findMany: ReturnType<typeof vi.fn> };
    };
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 10 });
    prisma.postulacion = { findMany: vi.fn() };
    const applications = makeApplications([postulacion(1, 1, 'PENDIENTE')]);
    const service = makeService(prisma, applications);

    await service.getPendingPostulations(1, 10);

    expect(applications.findAll).toHaveBeenCalledTimes(1);
    expect(applications.findAll).toHaveBeenCalledWith();
    expect(prisma.postulacion.findMany).not.toHaveBeenCalled();
  });

  it('rechaza si el proyecto no existe y no llama ApplicationsService.findAll', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const applications = makeApplications([postulacion(1, 1, 'PENDIENTE')]);
    const service = makeService(prisma, applications);

    await expect(service.getPendingPostulations(1, 10)).rejects.toBeInstanceOf(NotFoundException);
    expect(applications.findAll).not.toHaveBeenCalled();
  });

  it('rechaza si el actor no es líder y no llama ApplicationsService.findAll', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 99 });
    const applications = makeApplications([postulacion(1, 1, 'PENDIENTE')]);
    const service = makeService(prisma, applications);

    await expect(service.getPendingPostulations(1, 10)).rejects.toBeInstanceOf(ForbiddenException);
    expect(applications.findAll).not.toHaveBeenCalled();
  });
});
