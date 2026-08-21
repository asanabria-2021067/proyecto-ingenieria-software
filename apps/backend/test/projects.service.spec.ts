import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { Cache } from 'cache-manager';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { EstadoProyectoCreador } from '../src/projects/dto/update-estado-proyecto.dto';
import { ProjectsService } from '../src/projects/projects.service';

function makePrisma() {
  const defaultTx = {
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
  };

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
    participacionProyecto: { updateMany: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    postulacion: { updateMany: vi.fn(), findMany: vi.fn() },
    rolProyecto: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    requisitoHabilidadRol: { deleteMany: vi.fn(), createMany: vi.fn() },
    proyectoOrganizacion: { deleteMany: vi.fn(), createMany: vi.fn() },
    // A11: usado exclusivamente por assertNoOperableSprint (requestClose /
    // changeEstado -> CERRADO). Por defecto sin Sprint operable
    // (mockResolvedValue(null)), para que los tests preexistentes de este
    // archivo que nunca configuran este mock sigan pasando sin cambios.
    sprint: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (cb: (tx: typeof defaultTx) => unknown) => cb(defaultTx)),
  };
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
  notifications: Partial<NotificationsService> = {},
) {
  return new ProjectsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    {} as unknown as Cache,
  );
}

describe('ProjectsService', () => {
  it('findAll aplica filtros', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findMany.mockResolvedValue([]);
    const service = makeService(prisma, {
      isAdmin: vi.fn(),
      notifyAdminsFromTemplate: vi.fn(),
      notifyFromTemplate: vi.fn(),
    });

    await service.findAll({ q: 'alpha', habilidadId: 3, organizacionId: 8 });

    const where = prisma.proyecto.findMany.mock.calls[0][0].where as { AND: unknown[] };
    expect(where.AND.length).toBeGreaterThan(2);
  });

  it('findOne falla cuando no existe', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);
    await expect(service.findOne(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findOneOwner falla si no es dueño', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 99 });
    const service = makeService(prisma);
    await expect(service.findOneOwner(1, 1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('getAvance falla cuando el proyecto no existe', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);
    await expect(service.getAvance(999, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getAvance permite al líder ver el avance', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({
      creadoPor: 1,
      // El estado de un hito se deriva de sus tareas (idHito), no de un campo
      // estadoHito estático: la tarea HECHO pertenece al único hito, que
      // queda 100% completo; la POR_HACER no pertenece a ningún hito.
      tareas: [{ estadoTarea: 'HECHO', idHito: 1 }, { estadoTarea: 'POR_HACER', idHito: null }],
      hitos: [{ idHito: 1 }],
    });
    const service = makeService(prisma);
    const result = await service.getAvance(1, 1);
    expect(result.tareas.porcentaje).toBe(50);
    expect(result.hitos.porcentaje).toBe(100);
  });

  it('getAvance permite a un participante activo ver el avance', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({
      creadoPor: 9,
      tareas: [],
      hitos: [],
    });
    prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
    const service = makeService(prisma);
    const result = await service.getAvance(1, 2);
    expect(result.tareas.porcentaje).toBe(0);
    expect(prisma.participacionProyecto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ idUsuario: 2, estadoParticipacion: 'ACTIVO' }),
      }),
    );
  });

  it('getAvance rechaza a quien no es líder ni participante', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ creadoPor: 9, tareas: [], hitos: [] });
    prisma.participacionProyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);
    await expect(service.getAvance(1, 2)).rejects.toBeInstanceOf(ForbiddenException);
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
    const service = makeService(prisma);
    const result = await service.findMine(1);
    expect(result[0].cantidadPostulaciones).toBe(5);
    expect(result[0].rolesCubiertos).toBe(1);
  });

  it('findMine calcula el avance por hitos y tareas, y no falla sin ninguno de los dos', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findMany.mockResolvedValue([
      {
        roles: [],
        // Hito 1 (idHito 1) queda 100% completo (su única tarea está HECHO);
        // hito 2 (idHito 2) queda pendiente (su única tarea sigue POR_HACER).
        tareas: [{ estadoTarea: 'HECHO', idHito: 1 }, { estadoTarea: 'POR_HACER', idHito: 2 }],
        hitos: [{ idHito: 1 }, { idHito: 2 }],
      },
      { roles: [] },
    ]);
    const service = makeService(prisma);
    const result = await service.findMine(1);
    expect(result[0].avanceProyecto).toEqual({
      tareas: { porcentaje: 50, total: 2, porHacer: 1, enProgreso: 0, hecho: 1 },
      hitos: { porcentaje: 50, total: 2, pendiente: 1, enProgreso: 0, completado: 1 },
    });
    expect(result[1].avanceProyecto).toEqual({
      tareas: { porcentaje: 0, total: 0, porHacer: 0, enProgreso: 0, hecho: 0 },
      hitos: { porcentaje: 0, total: 0, pendiente: 0, enProgreso: 0, completado: 0 },
    });
  });

  it('submitForReview cambia estado y notifica', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, estadoProyecto: EstadoProyecto.BORRADOR, creadoPor: 1 });
    prisma.revisionProyecto.count.mockResolvedValue(0);
    const tx = {
      proyecto: {
        findUnique: vi.fn().mockResolvedValue({
          tituloProyecto: 'Proyecto',
          descripcionProyecto: 'Descripcion',
          objetivosProyecto: 'Objetivos',
          tipoProyecto: 'ACADEMICO',
          modalidadProyecto: 'PRESENCIAL',
          ubicacionProyecto: null,
          contextoAcademico: null,
          urlRecursoExterno: null,
          fechaInicio: null,
          fechaFinEstimada: null,
          roles: [],
        }),
        update: vi.fn(),
      },
      revisionProyecto: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    };
    prisma.$transaction = vi.fn(async (cb: (arg: typeof tx) => unknown) => cb(tx)) as typeof prisma.$transaction;
    const notifications = { notifyAdminsFromTemplate: vi.fn(), isAdmin: vi.fn() };
    const service = makeService(prisma, notifications);

    const result = await service.submitForReview(1, 1);

    expect(result.estadoProyecto).toBe(EstadoProyecto.EN_REVISION);
    expect(notifications.notifyAdminsFromTemplate).toHaveBeenCalled();
  });

  it('resubmit falla si estado no es observado', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, estadoProyecto: EstadoProyecto.BORRADOR, creadoPor: 1 });
    const service = makeService(prisma);
    await expect(service.resubmit(1, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requestClose falla si no está en progreso', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: 1 });
    const service = makeService(prisma);
    await expect(service.requestClose(1, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approveClosure requiere admin', async () => {
    const prisma = makePrisma();
    const notifications = { isAdmin: vi.fn().mockResolvedValue(false) };
    const service = makeService(prisma, notifications);
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
    prisma.$transaction = vi.fn(async (cb: (arg: typeof tx) => unknown) => cb(tx)) as typeof prisma.$transaction;
    const notifications = { isAdmin: vi.fn().mockResolvedValue(true), notifyFromTemplate: vi.fn() };
    const service = makeService(prisma, notifications);

    const result = await service.rejectClosure(1, 99);

    expect(result.estadoProyecto).toBe(EstadoProyecto.EN_PROGRESO);
    expect(notifications.notifyFromTemplate).toHaveBeenCalled();
  });

  it('changeEstado valida transición', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({
      idProyecto: 1,
      estadoProyecto: EstadoProyecto.EN_PROGRESO,
      creadoPor: 1,
    });
    const service = makeService(prisma);
    await expect(service.changeEstado(1, 1, EstadoProyectoCreador.PUBLICADO)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  describe('A11 — assertNoOperableSprint (Decisión Bloqueante #2)', () => {
    function proyectoEnProgreso(overrides: Record<string, unknown> = {}) {
      return { idProyecto: 1, estadoProyecto: EstadoProyecto.EN_PROGRESO, creadoPor: 1, ...overrides };
    }

    describe('requestClose', () => {
      it('caso 1: Sprint ACTIVO — rechaza con ConflictException y mensaje explícito, sin ejecutar la transición', async () => {
        const prisma = makePrisma();
        prisma.proyecto.findFirst.mockResolvedValue(proyectoEnProgreso());
        prisma.sprint.findFirst.mockResolvedValue({ idSprint: 99 });
        const service = makeService(prisma);

        await expect(service.requestClose(1, 1)).rejects.toBeInstanceOf(ConflictException);
        await expect(service.requestClose(1, 1)).rejects.toThrow(
          'Debes cerrar el Sprint actual antes de solicitar el cierre del proyecto',
        );
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('caso 2: Sprint EN_FINALIZACION — rechaza igual, sin ejecutar la transición', async () => {
        const prisma = makePrisma();
        prisma.proyecto.findFirst.mockResolvedValue(proyectoEnProgreso());
        prisma.sprint.findFirst.mockResolvedValue({ idSprint: 99 });
        const service = makeService(prisma);

        await expect(service.requestClose(1, 1)).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('caso 3: solo existe Sprint CERRADO — no bloquea, requestClose continúa con su comportamiento previo', async () => {
        const prisma = makePrisma();
        prisma.proyecto.findFirst.mockResolvedValue(proyectoEnProgreso());
        // La consulta de assertNoOperableSprint ya filtra por
        // estado IN (ACTIVO, EN_FINALIZACION): un proyecto con un Sprint
        // CERRADO simplemente no matchea esa consulta -> null, exactamente
        // el mock por defecto de makePrisma().
        prisma.sprint.findFirst.mockResolvedValue(null);
        const tx = {
          proyecto: {
            update: vi.fn().mockResolvedValue({
              idProyecto: 1,
              estadoProyecto: EstadoProyecto.EN_SOLICITUD_CIERRE,
              tituloProyecto: 'P',
            }),
          },
        };
        prisma.$transaction = vi.fn(async (cb: (arg: typeof tx) => unknown) => cb(tx)) as typeof prisma.$transaction;
        const notifications = { notifyAdminsFromTemplate: vi.fn() };
        const service = makeService(prisma, notifications);

        const result = await service.requestClose(1, 1);

        expect(result.estadoProyecto).toBe(EstadoProyecto.EN_SOLICITUD_CIERRE);
        expect(notifications.notifyAdminsFromTemplate).toHaveBeenCalled();
      });

      it('caso 4: sin ningún Sprint — no bloquea, requestClose continúa con su comportamiento previo', async () => {
        const prisma = makePrisma();
        prisma.proyecto.findFirst.mockResolvedValue(proyectoEnProgreso());
        prisma.sprint.findFirst.mockResolvedValue(null);
        const tx = {
          proyecto: {
            update: vi.fn().mockResolvedValue({
              idProyecto: 1,
              estadoProyecto: EstadoProyecto.EN_SOLICITUD_CIERRE,
              tituloProyecto: 'P',
            }),
          },
        };
        prisma.$transaction = vi.fn(async (cb: (arg: typeof tx) => unknown) => cb(tx)) as typeof prisma.$transaction;
        const notifications = { notifyAdminsFromTemplate: vi.fn() };
        const service = makeService(prisma, notifications);

        const result = await service.requestClose(1, 1);

        expect(result.estadoProyecto).toBe(EstadoProyecto.EN_SOLICITUD_CIERRE);
      });

      it('aislamiento: la consulta de Sprint operable está acotada por idProyecto + estado IN (ACTIVO, EN_FINALIZACION)', async () => {
        const prisma = makePrisma();
        prisma.proyecto.findFirst.mockResolvedValue(proyectoEnProgreso({ idProyecto: 7 }));
        prisma.sprint.findFirst.mockResolvedValue(null);
        const tx = { proyecto: { update: vi.fn().mockResolvedValue({ tituloProyecto: 'P' }) } };
        prisma.$transaction = vi.fn(async (cb: (arg: typeof tx) => unknown) => cb(tx)) as typeof prisma.$transaction;
        const service = makeService(prisma, { notifyAdminsFromTemplate: vi.fn() });

        await service.requestClose(7, 1);

        expect(prisma.sprint.findFirst).toHaveBeenCalledWith({
          where: { idProyecto: 7, estado: { in: ['ACTIVO', 'EN_FINALIZACION'] } },
          select: { idSprint: true },
        });
      });
    });

    describe('changeEstado -> CERRADO (transición real que persiste EstadoProyecto.CERRADO)', () => {
      it('Sprint ACTIVO bloquea la transición a CERRADO, sin persistir el nuevo estado', async () => {
        const prisma = makePrisma();
        prisma.proyecto.findFirst.mockResolvedValue(proyectoEnProgreso());
        prisma.sprint.findFirst.mockResolvedValue({ idSprint: 99 });
        const service = makeService(prisma);

        await expect(
          service.changeEstado(1, 1, EstadoProyectoCreador.CERRADO),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.proyecto.update).not.toHaveBeenCalled();
      });

      it('Sprint EN_FINALIZACION bloquea la transición a CERRADO, sin persistir el nuevo estado', async () => {
        const prisma = makePrisma();
        prisma.proyecto.findFirst.mockResolvedValue(proyectoEnProgreso());
        prisma.sprint.findFirst.mockResolvedValue({ idSprint: 99 });
        const service = makeService(prisma);

        await expect(
          service.changeEstado(1, 1, EstadoProyectoCreador.CERRADO),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.proyecto.update).not.toHaveBeenCalled();
      });

      it('sin Sprint operable, changeEstado(CERRADO) NO se bloquea por A11 (llega a intentar persistir)', async () => {
        const prisma = makePrisma();
        prisma.proyecto.findFirst.mockResolvedValue(proyectoEnProgreso());
        prisma.sprint.findFirst.mockResolvedValue(null);
        prisma.proyecto.update.mockResolvedValue({
          idProyecto: 1,
          estadoProyecto: EstadoProyecto.CERRADO,
          tituloProyecto: 'P',
        });
        prisma.participacionProyecto.findMany.mockResolvedValue([]);
        const notifications = { notifyFromTemplate: vi.fn() };
        const service = makeService(prisma, notifications);

        const result = await service.changeEstado(1, 1, EstadoProyectoCreador.CERRADO);

        expect(result.estadoProyecto).toBe(EstadoProyecto.CERRADO);
      });
    });
  });

  it('findPostulacionesByProject exige ownership', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({
      idProyecto: 2,
      estadoProyecto: EstadoProyecto.PUBLICADO,
      creadoPor: 7,
    });
    const service = makeService(prisma);
    await expect(service.findPostulacionesByProject(2, 1)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
