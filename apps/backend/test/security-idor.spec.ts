import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TasksContextService } from '../src/tasks/tasks-context.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { ExitRequestsAuthorizationService } from '../src/exit-requests/exit-requests.authorization.service';
import type { ExitRequestsContextService } from '../src/exit-requests/exit-requests.context.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * T-127 (IESUC-285). IDOR: los ids del sistema son enteros consecutivos y
 * adivinables, así que el aislamiento debe salir de la consulta a la base de
 * datos (filtros reales), no de que el atacante "no sepa" un id.
 *
 * No se repite aquí lo ya cubierto por tasks-queries-isolation.spec.ts
 * (tarea de otro proyecto → 404, sin filtrar campos, listar solo del
 * proyecto propio) ni por tasks-authorization.service.spec.ts /
 * sprints-authorization.service.spec.ts (matriz líder/participante/externo
 * con TasksContextService y SprintsContextService mockeados por completo).
 * Este spec ejercita TasksContextService.assertActiveProjectParticipant y
 * getTaskInProjectOrThrow como implementación REAL contra un Prisma
 * simulado en memoria, para probar el filtro `estadoParticipacion: ACTIVO`
 * y `eliminadoEn: null` de la consulta misma — no solo el resultado.
 */

type Row = Record<string, unknown>;

function makeParticipacionPrisma(participaciones: Row[]) {
  return {
    participacionProyecto: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        const rolProyecto = where.rolProyecto as { idProyecto?: number } | undefined;
        return (
          participaciones.find(
            (p) =>
              p.idUsuario === where.idUsuario &&
              p.estadoParticipacion === where.estadoParticipacion &&
              p.idProyecto === rolProyecto?.idProyecto,
          ) ?? null
        );
      }),
    },
    proyecto: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => ({
        idProyecto: where.idProyecto,
        creadoPor: -1, // ningún caso de este spec es el líder
        eliminadoEn: null,
      })),
    },
  };
}

describe('TasksContextService.assertActiveProjectParticipant — filtro real de pertenencia', () => {
  const PROYECTO_A = 1;
  const PROYECTO_B = 2;
  const USUARIO = 300;

  it('la consulta de pertenencia filtra por estadoParticipacion: ACTIVO', async () => {
    const prisma = makeParticipacionPrisma([
      { idUsuario: USUARIO, estadoParticipacion: 'ACTIVO', idProyecto: PROYECTO_A },
    ]);
    const context = new TasksContextService(prisma as unknown as PrismaService);

    await context.assertActiveProjectParticipant(PROYECTO_A, USUARIO);

    expect(prisma.participacionProyecto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ estadoParticipacion: 'ACTIVO' }),
      }),
    );
  });

  it('un participante con estado RETIRADO pierde el acceso', async () => {
    const prisma = makeParticipacionPrisma([
      { idUsuario: USUARIO, estadoParticipacion: 'RETIRADO', idProyecto: PROYECTO_A },
    ]);
    const context = new TasksContextService(prisma as unknown as PrismaService);

    await expect(context.assertActiveProjectParticipant(PROYECTO_A, USUARIO)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('pertenecer al proyecto B (ACTIVO) no da acceso al proyecto A', async () => {
    const prisma = makeParticipacionPrisma([
      { idUsuario: USUARIO, estadoParticipacion: 'ACTIVO', idProyecto: PROYECTO_B },
    ]);
    const context = new TasksContextService(prisma as unknown as PrismaService);

    await expect(context.assertActiveProjectParticipant(PROYECTO_A, USUARIO)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // Camino positivo de control: la misma participación sí habilita su propio proyecto.
    await expect(
      context.assertActiveProjectParticipant(PROYECTO_B, USUARIO),
    ).resolves.toBeUndefined();
  });

  it('el rechazo no filtra a qué proyecto pertenece realmente el usuario', async () => {
    const prisma = makeParticipacionPrisma([
      { idUsuario: USUARIO, estadoParticipacion: 'ACTIVO', idProyecto: PROYECTO_B },
    ]);
    const context = new TasksContextService(prisma as unknown as PrismaService);

    let caught: unknown;
    try {
      await context.assertActiveProjectParticipant(PROYECTO_A, USUARIO);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ForbiddenException);
    if (!(caught instanceof ForbiddenException)) throw caught;
    expect(JSON.stringify(caught.getResponse())).not.toContain(String(PROYECTO_B));
  });
});

describe('TasksContextService.getTaskInProjectOrThrow — soft delete', () => {
  it('una tarea con eliminadoEn no nulo no es accesible aunque el id/proyecto coincidan', async () => {
    const tareaEliminada = {
      idTarea: 5,
      idProyecto: 1,
      eliminadoEn: new Date('2026-01-01T00:00:00.000Z'),
    };
    const prisma = {
      tarea: {
        findFirst: vi.fn(async ({ where }: { where: Row }) =>
          where.eliminadoEn === null ? null : tareaEliminada,
        ),
      },
    };
    const context = new TasksContextService(prisma as unknown as PrismaService);

    await expect(context.getTaskInProjectOrThrow(1, 5)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tarea.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ eliminadoEn: null }) }),
    );
  });
});

describe('NotificationsService — pertenencia de notificaciones', () => {
  function makePrisma() {
    return {
      notificacion: {
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };
  }

  it('no se puede marcar como leída una notificación de otro usuario (403, no 200)', async () => {
    const prisma = makePrisma();
    prisma.notificacion.findUnique.mockResolvedValue({
      idNotificacion: 9,
      idUsuario: 2,
      leidaEn: null,
      tituloNotificacion: 'Secreta de otro usuario',
    });
    const service = new NotificationsService(prisma as unknown as PrismaService);

    let caught: unknown;
    try {
      await service.markAsRead(9, 1);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ForbiddenException);
    expect(prisma.notificacion.update).not.toHaveBeenCalled();
    if (!(caught instanceof ForbiddenException)) throw caught;
    expect(JSON.stringify(caught.getResponse())).not.toContain('Secreta de otro usuario');
  });

  it('markAllAsRead siempre se acota al usuario autenticado, nunca a un id arbitrario', async () => {
    const prisma = makePrisma();
    prisma.notificacion.updateMany.mockResolvedValue({ count: 3 });
    const service = new NotificationsService(prisma as unknown as PrismaService);

    await service.markAllAsRead(1);

    expect(prisma.notificacion.updateMany).toHaveBeenCalledWith({
      where: { idUsuario: 1, leidaEn: null },
      data: { leidaEn: expect.any(Date) },
    });
  });
});

describe('ExitRequestsAuthorizationService.assertProjectLeader — líder del proyecto correcto', () => {
  function makeContext(proyectosPorId: Record<number, number>) {
    return {
      getLeaderProjectOrThrow: vi.fn(async (idProyecto: number) => ({
        idProyecto,
        creadoPor: proyectosPorId[idProyecto],
      })),
    } as unknown as ExitRequestsContextService;
  }

  const PROYECTO_A = 10;
  const PROYECTO_B = 20;
  const LIDER_A = 100;
  const LIDER_B = 200;

  it('el líder real del proyecto puede resolver sus propias solicitudes', async () => {
    const context = makeContext({ [PROYECTO_A]: LIDER_A });
    const service = new ExitRequestsAuthorizationService(context);

    await expect(service.assertProjectLeader(PROYECTO_A, LIDER_A)).resolves.toEqual({
      idProyecto: PROYECTO_A,
      creadoPor: LIDER_A,
    });
  });

  it('el líder de OTRO proyecto (privilegio real, pero del proyecto equivocado) es rechazado', async () => {
    const context = makeContext({ [PROYECTO_A]: LIDER_A, [PROYECTO_B]: LIDER_B });
    const service = new ExitRequestsAuthorizationService(context);

    await expect(service.assertProjectLeader(PROYECTO_A, LIDER_B)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('un usuario sin ninguna relación con el proyecto es rechazado igual que el líder de otro proyecto', async () => {
    const context = makeContext({ [PROYECTO_A]: LIDER_A });
    const service = new ExitRequestsAuthorizationService(context);

    await expect(service.assertProjectLeader(PROYECTO_A, 999)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
