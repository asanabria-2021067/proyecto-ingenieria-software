import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProjectsService } from '../src/projects/projects.service';

function makePrisma() {
  return {
    proyecto: { findFirst: vi.fn() },
    participacionProyecto: { findMany: vi.fn() },
    tarea: { findMany: vi.fn() },
  } as any;
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new ProjectsService(
    prisma,
    { isAdmin: vi.fn(), notifyAdminsFromTemplate: vi.fn(), notifyFromTemplate: vi.fn() } as any,
    {} as any,
  );
}

const USUARIO = {
  idUsuario: 2,
  nombre: 'Ana',
  apellido: 'Pérez',
  correo: 'ana@example.com',
  fotoUrl: null,
};

describe('ProjectsService.findTeamMemberDetail', () => {
  it('rechaza cuando el proyecto no existe', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);

    await expect(service.findTeamMemberDetail(999, 2, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rechaza a quien no es líder del proyecto', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 99 });
    const service = makeService(prisma);

    await expect(service.findTeamMemberDetail(1, 2, 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // Ninguna consulta de participaciones/tareas debe ejecutarse tras el 403.
    expect(prisma.participacionProyecto.findMany).not.toHaveBeenCalled();
  });

  it('rechaza cuando idUsuario nunca participó en el proyecto', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.participacionProyecto.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    await expect(service.findTeamMemberDetail(1, 2, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.tarea.findMany).not.toHaveBeenCalled();
  });

  it('devuelve participaciones (activas e históricas) y el historial de tareas del integrante para el líder', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.participacionProyecto.findMany.mockResolvedValue([
      {
        idParticipacion: 10,
        estadoParticipacion: 'ACTIVO',
        fechaIngreso: new Date('2026-01-05T00:00:00.000Z'),
        fechaSalida: null,
        rolProyecto: { idRolProyecto: 5, nombreRol: 'Desarrollador' },
        usuario: USUARIO,
      },
      {
        idParticipacion: 4,
        estadoParticipacion: 'RETIRADO',
        fechaIngreso: new Date('2025-06-01T00:00:00.000Z'),
        fechaSalida: new Date('2025-12-01T00:00:00.000Z'),
        rolProyecto: { idRolProyecto: 3, nombreRol: 'Diseñador' },
        usuario: USUARIO,
      },
    ]);
    prisma.tarea.findMany.mockResolvedValue([
      {
        idTarea: 100,
        tituloTarea: 'Diseñar wireframes',
        estadoTarea: 'HECHO',
        prioridad: 'ALTA',
        fechaCreacion: new Date('2026-01-10T12:00:00.000Z'),
        fechaLimite: new Date('2026-01-20T00:00:00.000Z'),
        actualizadaEn: new Date('2026-01-19T09:00:00.000Z'),
        tiempoEstimadoHoras: 8,
        horasReales: { toNumber: () => 7.5 },
        asignaciones: [
          {
            fechaAsignacion: new Date('2026-01-10T12:00:00.000Z'),
            desasignadaEn: new Date('2026-01-19T09:00:00.000Z'),
          },
        ],
      },
      {
        idTarea: 101,
        tituloTarea: 'Implementar formulario',
        estadoTarea: 'EN_PROGRESO',
        prioridad: 'MEDIA',
        fechaCreacion: new Date('2026-02-01T00:00:00.000Z'),
        fechaLimite: null,
        actualizadaEn: null,
        tiempoEstimadoHoras: null,
        horasReales: null,
        asignaciones: [
          { fechaAsignacion: new Date('2026-02-01T00:00:00.000Z'), desasignadaEn: null },
        ],
      },
    ]);
    const service = makeService(prisma);

    const detalle = await service.findTeamMemberDetail(1, 2, 1);

    expect(detalle.usuario).toEqual(USUARIO);
    expect(detalle.participaciones).toEqual([
      expect.objectContaining({ idParticipacion: 10, estadoParticipacion: 'ACTIVO', fechaSalida: null }),
      expect.objectContaining({ idParticipacion: 4, estadoParticipacion: 'RETIRADO', fechaSalida: '2025-12-01' }),
    ]);
    expect(detalle.tareas).toHaveLength(2);
    expect(detalle.tareas[0]).toMatchObject({
      idTarea: 100,
      estadoTarea: 'HECHO',
      tiempoEstimadoHoras: 8,
      horasReales: 7.5,
      desasignadaEn: expect.any(Date),
    });
    expect(detalle.tareas[1]).toMatchObject({
      idTarea: 101,
      estadoTarea: 'EN_PROGRESO',
      tiempoEstimadoHoras: null,
      horasReales: null,
      desasignadaEn: null,
    });

    expect(prisma.tarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          idProyecto: 1,
          eliminadoEn: null,
          asignaciones: { some: { idUsuario: 2 } },
        }),
      }),
    );
  });
});
