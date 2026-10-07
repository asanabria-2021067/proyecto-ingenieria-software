import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CalendarSharesService } from '../src/calendar-shares/calendar-shares.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { EventsService } from '../src/events/events.service';
import { NotificationsService } from '../src/notifications/notifications.service';

const OWNER_ID = 1;
const VIEWER_ID = 2;

const ANA = { idUsuario: VIEWER_ID, nombre: 'Ana', apellido: 'García', correo: 'ana@uvg.edu.gt', fotoUrl: null };

function makeDeps() {
  const prisma = {
    usuario: { findFirst: vi.fn(), findUnique: vi.fn() },
    calendarioCompartido: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    tarea: { findMany: vi.fn() },
  };
  const events = { findForUserInRange: vi.fn() };
  const notifications = { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) };
  const service = new CalendarSharesService(
    prisma as unknown as PrismaService,
    events as unknown as EventsService,
    notifications as unknown as NotificationsService,
  );
  return { prisma, events, notifications, service };
}

describe('CalendarSharesService.compartir (HU-184)', () => {
  it('comparte con un usuario activo y le avisa con la notificación CALENDARIO_COMPARTIDO', async () => {
    const { prisma, notifications, service } = makeDeps();
    prisma.usuario.findFirst.mockResolvedValue(ANA);
    prisma.usuario.findUnique.mockResolvedValue({ nombre: 'Carlos', apellido: 'Mendoza' });
    prisma.calendarioCompartido.create.mockResolvedValue({});

    await expect(service.compartir(OWNER_ID, VIEWER_ID)).resolves.toEqual(ANA);
    expect(prisma.calendarioCompartido.create).toHaveBeenCalledWith({
      data: { idPropietario: OWNER_ID, idInvitado: VIEWER_ID },
    });
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([VIEWER_ID], 'CALENDARIO_COMPARTIDO', {
      ownerId: OWNER_ID,
      ownerName: 'Carlos Mendoza',
    });
  });

  it('compartir dos veces no falla ni vuelve a notificar', async () => {
    const { prisma, notifications, service } = makeDeps();
    prisma.usuario.findFirst.mockResolvedValue(ANA);
    prisma.calendarioCompartido.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicado', { code: 'P2002', clientVersion: 'test' }),
    );

    await expect(service.compartir(OWNER_ID, VIEWER_ID)).resolves.toEqual(ANA);
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('no se puede compartir con uno mismo (400)', async () => {
    const { prisma, service } = makeDeps();
    await expect(service.compartir(OWNER_ID, OWNER_ID)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.calendarioCompartido.create).not.toHaveBeenCalled();
  });

  it('usuario inexistente o inactivo produce 404', async () => {
    const { prisma, service } = makeDeps();
    prisma.usuario.findFirst.mockResolvedValue(null);
    await expect(service.compartir(OWNER_ID, 99)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.usuario.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idUsuario: 99, estado: 'ACTIVO' } }),
    );
  });

  it('si la notificación falla, el calendario igual queda compartido', async () => {
    const { prisma, notifications, service } = makeDeps();
    prisma.usuario.findFirst.mockResolvedValue(ANA);
    prisma.usuario.findUnique.mockResolvedValue({ nombre: 'Carlos', apellido: 'Mendoza' });
    prisma.calendarioCompartido.create.mockResolvedValue({});
    notifications.notifyFromTemplate.mockRejectedValue(new Error('socket caído'));

    await expect(service.compartir(OWNER_ID, VIEWER_ID)).resolves.toEqual(ANA);
  });
});

describe('CalendarSharesService.listar y dejarDeCompartir (HU-184)', () => {
  it('lista con quién compartí y quién me compartió (solo usuarios activos)', async () => {
    const { prisma, service } = makeDeps();
    prisma.calendarioCompartido.findMany
      .mockResolvedValueOnce([{ invitado: ANA }])
      .mockResolvedValueOnce([{ propietario: { ...ANA, idUsuario: 3, nombre: 'Luis' } }]);

    const resultado = await service.listar(OWNER_ID);

    expect(resultado.compartidoPorMi).toEqual([ANA]);
    expect(resultado.compartidosConmigo[0].nombre).toBe('Luis');
    expect(prisma.calendarioCompartido.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { idInvitado: OWNER_ID, propietario: { estado: 'ACTIVO' } } }),
    );
  });

  it('dejar de compartir solo borra la fila propia', async () => {
    const { prisma, service } = makeDeps();
    prisma.calendarioCompartido.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.dejarDeCompartir(OWNER_ID, VIEWER_ID)).resolves.toEqual({ eliminado: true });
    expect(prisma.calendarioCompartido.deleteMany).toHaveBeenCalledWith({
      where: { idPropietario: OWNER_ID, idInvitado: VIEWER_ID },
    });
  });
});

describe('CalendarSharesService.agendaCompartida (HU-184)', () => {
  it('sin calendario compartido conmigo produce 403 y no consulta nada', async () => {
    const { prisma, events, service } = makeDeps();
    prisma.calendarioCompartido.findFirst.mockResolvedValue(null);

    await expect(
      service.agendaCompartida(VIEWER_ID, OWNER_ID, '2026-10-01T06:00:00.000Z', '2026-10-08T06:00:00.000Z'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(events.findForUserInRange).not.toHaveBeenCalled();
    expect(prisma.tarea.findMany).not.toHaveBeenCalled();
  });

  it('con calendario compartido devuelve los eventos que ve el propietario y sus tareas pendientes del rango', async () => {
    const { prisma, events, service } = makeDeps();
    prisma.calendarioCompartido.findFirst.mockResolvedValue({ idCalendarioCompartido: 1 });
    events.findForUserInRange.mockResolvedValue([{ idEvento: 5 }]);
    prisma.tarea.findMany.mockResolvedValue([{ idTarea: 8 }]);

    const resultado = await service.agendaCompartida(
      VIEWER_ID,
      OWNER_ID,
      '2026-10-01T06:00:00.000Z',
      '2026-10-08T06:00:00.000Z',
    );

    expect(resultado).toEqual({ eventos: [{ idEvento: 5 }], tareas: [{ idTarea: 8 }] });
    expect(events.findForUserInRange).toHaveBeenCalledWith(
      OWNER_ID,
      '2026-10-01T06:00:00.000Z',
      '2026-10-08T06:00:00.000Z',
    );
    expect(prisma.tarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          estadoTarea: { not: 'HECHO' },
          asignaciones: { some: { idUsuario: OWNER_ID } },
          fechaLimite: { gte: new Date('2026-10-01'), lte: new Date('2026-10-08') },
        }),
      }),
    );
  });
});
