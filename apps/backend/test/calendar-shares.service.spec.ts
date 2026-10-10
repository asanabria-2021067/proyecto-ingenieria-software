import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CalendarSharesService, proyectarTareaCompartida } from '../src/calendar-shares/calendar-shares.service';
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
  const events = { findForUserInRange: vi.fn(), findSharedInRange: vi.fn().mockResolvedValue([]), projectIdsForUser: vi.fn().mockResolvedValue([]) };
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
    expect(events.findSharedInRange).not.toHaveBeenCalled();
    expect(events.findForUserInRange).not.toHaveBeenCalled();
    expect(prisma.tarea.findMany).not.toHaveBeenCalled();
  });

  it('con calendario compartido devuelve los eventos y las fechas límite del rango', async () => {
    const { prisma, events, service } = makeDeps();
    prisma.calendarioCompartido.findFirst.mockResolvedValue({ idCalendarioCompartido: 1 });
    events.findSharedInRange.mockResolvedValue([{ idEvento: 5, visibilidad: 'OCUPADO' }]);
    events.projectIdsForUser.mockResolvedValueOnce([10]).mockResolvedValueOnce([10]);
    prisma.tarea.findMany.mockResolvedValue([
      { idTarea: 8, tituloTarea: 'Informe', estadoTarea: 'EN_PROGRESO', prioridad: 'ALTA', fechaLimite: new Date('2026-10-03'), proyecto: { idProyecto: 10, tituloProyecto: 'Común' } },
    ]);

    const resultado = await service.agendaCompartida(
      VIEWER_ID,
      OWNER_ID,
      '2026-10-01T06:00:00.000Z',
      '2026-10-08T06:00:00.000Z',
    );

    expect(resultado.eventos).toEqual([{ idEvento: 5, visibilidad: 'OCUPADO' }]);
    // La consulta de eventos se hace con los permisos de quien mira, nunca con los del propietario.
    expect(events.findSharedInRange).toHaveBeenCalledWith(OWNER_ID, VIEWER_ID, '2026-10-01T06:00:00.000Z', '2026-10-08T06:00:00.000Z');
    expect(events.findForUserInRange).not.toHaveBeenCalled();
    expect(resultado.tareas).toEqual([
      {
        idTarea: 8,
        fechaLimite: new Date('2026-10-03'),
        visibilidad: 'DETALLE',
        tituloTarea: 'Informe',
        estadoTarea: 'EN_PROGRESO',
        prioridad: 'ALTA',
        proyecto: { idProyecto: 10, tituloProyecto: 'Común' },
      },
    ]);
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

describe('CalendarSharesService — tareas compartidas por participación vigente (G01-C03, UI-01/B-02)', () => {
  const RANGO = ['2026-10-01T06:00:00.000Z', '2026-10-08T06:00:00.000Z'] as const;
  const tarea = (overrides: Record<string, unknown> = {}) => ({
    idTarea: 8,
    tituloTarea: 'SECRETO-tarea',
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    fechaLimite: new Date('2026-10-03'),
    proyecto: { idProyecto: 10, tituloProyecto: 'SECRETO-proyecto' },
    ...overrides,
  });

  it('solo consulta tareas de proyectos donde el propietario es líder o participante ACTIVO hoy', async () => {
    const { prisma, events, service } = makeDeps();
    prisma.calendarioCompartido.findFirst.mockResolvedValue({ idCalendarioCompartido: 1 });
    events.findSharedInRange.mockResolvedValue([]);
    events.projectIdsForUser.mockResolvedValueOnce([10, 11]).mockResolvedValueOnce([10]);
    prisma.tarea.findMany.mockResolvedValue([]);

    await service.agendaCompartida(VIEWER_ID, OWNER_ID, ...RANGO);

    expect(events.projectIdsForUser).toHaveBeenNthCalledWith(1, OWNER_ID);
    expect(events.projectIdsForUser).toHaveBeenNthCalledWith(2, VIEWER_ID);
    const where = prisma.tarea.findMany.mock.calls[0][0].where;
    expect(where.proyecto).toEqual({ eliminadoEn: null, idProyecto: { in: [10, 11] } });
    expect(where.asignaciones).toEqual({ some: { idUsuario: OWNER_ID } });
    expect(where.eliminadoEn).toBeNull();
  });

  it('propietario retirado de todos sus proyectos: sin tareas y sin consultar la tabla', async () => {
    const { prisma, events, service } = makeDeps();
    prisma.calendarioCompartido.findFirst.mockResolvedValue({ idCalendarioCompartido: 1 });
    events.findSharedInRange.mockResolvedValue([]);
    events.projectIdsForUser.mockResolvedValueOnce([]).mockResolvedValueOnce([10]);

    const resultado = await service.agendaCompartida(VIEWER_ID, OWNER_ID, ...RANGO);

    expect(resultado.tareas).toEqual([]);
    expect(prisma.tarea.findMany).not.toHaveBeenCalled();
  });

  it('a un destinatario ajeno al proyecto no se le envía título, estado ni proyecto de la tarea', async () => {
    const { prisma, events, service } = makeDeps();
    prisma.calendarioCompartido.findFirst.mockResolvedValue({ idCalendarioCompartido: 1 });
    events.findSharedInRange.mockResolvedValue([]);
    events.projectIdsForUser.mockResolvedValueOnce([10]).mockResolvedValueOnce([99]);
    prisma.tarea.findMany.mockResolvedValue([tarea()]);

    const resultado = await service.agendaCompartida(VIEWER_ID, OWNER_ID, ...RANGO);

    expect(resultado.tareas).toEqual([{ idTarea: 8, fechaLimite: new Date('2026-10-03'), visibilidad: 'OCUPADO' }]);
    expect(JSON.stringify(resultado.tareas)).not.toContain('SECRETO');
  });

  it('proyectarTareaCompartida copia campo por campo y nunca columnas ajenas al contrato', () => {
    const fila = { ...tarea(), descripcionTarea: 'SECRETO-descripcion', idSprint: 4, idHito: 2 } as unknown as Parameters<typeof proyectarTareaCompartida>[0];
    const conDetalle = proyectarTareaCompartida(fila, true);
    expect(Object.keys(conDetalle).sort()).toEqual(['estadoTarea', 'fechaLimite', 'idTarea', 'prioridad', 'proyecto', 'tituloTarea', 'visibilidad']);
    expect(JSON.stringify(conDetalle)).not.toContain('SECRETO-descripcion');
    expect(Object.keys(proyectarTareaCompartida(fila, false)).sort()).toEqual(['fechaLimite', 'idTarea', 'visibilidad']);
  });
});

describe('CalendarSharesService — respuesta segura del endpoint compartido (G01-C04, UI-01/B-01)', () => {
  const RANGO = ['2026-10-01T06:00:00.000Z', '2026-10-08T06:00:00.000Z'] as const;
  const CLAVES_EVENTO_DETALLE = ['fechaFin', 'fechaInicio', 'idEvento', 'modalidad', 'proyecto', 'tipoEvento', 'tituloEvento', 'visibilidad'];
  const CLAVES_OCUPADO = ['fechaFin', 'fechaInicio', 'idEvento', 'visibilidad'];
  const CLAVES_TAREA_DETALLE = ['estadoTarea', 'fechaLimite', 'idTarea', 'prioridad', 'proyecto', 'tituloTarea', 'visibilidad'];

  it('el JSON de la agenda solo contiene las claves del contrato, para eventos y tareas, con y sin detalle', async () => {
    const { prisma, events, service } = makeDeps();
    prisma.calendarioCompartido.findFirst.mockResolvedValue({ idCalendarioCompartido: 1 });
    events.findSharedInRange.mockResolvedValue([
      { idEvento: 1, fechaInicio: new Date('2026-10-02T14:00:00.000Z'), fechaFin: new Date('2026-10-02T15:00:00.000Z'), visibilidad: 'DETALLE', tituloEvento: 'Reunión', tipoEvento: 'REUNION', modalidad: 'VIRTUAL', proyecto: { idProyecto: 10, tituloProyecto: 'Común' } },
      { idEvento: 2, fechaInicio: new Date('2026-10-03T14:00:00.000Z'), fechaFin: new Date('2026-10-03T15:00:00.000Z'), visibilidad: 'OCUPADO' },
    ]);
    events.projectIdsForUser.mockResolvedValueOnce([10, 11]).mockResolvedValueOnce([10]);
    prisma.tarea.findMany.mockResolvedValue([
      { idTarea: 8, tituloTarea: 'Informe', estadoTarea: 'EN_PROGRESO', prioridad: 'ALTA', fechaLimite: new Date('2026-10-03'), proyecto: { idProyecto: 10, tituloProyecto: 'Común' } },
      { idTarea: 9, tituloTarea: 'SECRETO', estadoTarea: 'POR_HACER', prioridad: 'BAJA', fechaLimite: new Date('2026-10-04'), proyecto: { idProyecto: 11, tituloProyecto: 'SECRETO-proyecto' } },
    ]);

    const json = JSON.parse(JSON.stringify(await service.agendaCompartida(VIEWER_ID, OWNER_ID, ...RANGO)));

    expect(Object.keys(json).sort()).toEqual(['eventos', 'tareas']);
    expect(Object.keys(json.eventos[0]).sort()).toEqual(CLAVES_EVENTO_DETALLE);
    expect(Object.keys(json.eventos[1]).sort()).toEqual(CLAVES_OCUPADO);
    expect(Object.keys(json.tareas[0]).sort()).toEqual(CLAVES_TAREA_DETALLE);
    expect(Object.keys(json.tareas[1]).sort()).toEqual(['fechaLimite', 'idTarea', 'visibilidad']);
    for (const privado of ['linkSesion', 'descripcion', 'ubicacion', 'invitados', 'rolesDestino', 'antelacionMinutos', 'SECRETO', 'correo']) {
      expect(JSON.stringify(json)).not.toContain(privado);
    }
  });

  it('tras revocar la compartición, la siguiente petición recibe 403', async () => {
    const { prisma, events, service } = makeDeps();
    prisma.calendarioCompartido.findFirst.mockResolvedValueOnce({ idCalendarioCompartido: 1 }).mockResolvedValueOnce(null);
    events.projectIdsForUser.mockResolvedValue([]);

    await expect(service.agendaCompartida(VIEWER_ID, OWNER_ID, ...RANGO)).resolves.toEqual({ eventos: [], tareas: [] });
    await expect(service.agendaCompartida(VIEWER_ID, OWNER_ID, ...RANGO)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.calendarioCompartido.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { idPropietario: OWNER_ID, idInvitado: VIEWER_ID, propietario: { estado: 'ACTIVO' } } }),
    );
  });

  it('un tercero que pide la agenda de un propietario que no le compartió recibe 403 sin consultar datos', async () => {
    const { prisma, events, service } = makeDeps();
    prisma.calendarioCompartido.findFirst.mockResolvedValue(null);

    await expect(service.agendaCompartida(42, OWNER_ID, ...RANGO)).rejects.toBeInstanceOf(ForbiddenException);
    expect(events.findSharedInRange).not.toHaveBeenCalled();
    expect(events.projectIdsForUser).not.toHaveBeenCalled();
  });
});

/**
 * G01-C05 (UI-01, UI-15): matriz de acceso a la agenda compartida a nivel de
 * servicio. Sustituye la expectativa previa (clase B) de que el receptor
 * recibiera `findForUserInRange(propietario)`, es decir, todo lo que el
 * propietario ve: esa afirmación codificaba la fuga F262-01.
 */
describe('CalendarSharesService — matriz de acceso (G01-C05)', () => {
  const RANGO = ['2026-10-01T06:00:00.000Z', '2026-10-08T06:00:00.000Z'] as const;
  const EXTERNO_ID = 42;

  it.each([
    ['receptor con compartición vigente', VIEWER_ID, { idCalendarioCompartido: 1 }, true],
    ['tercero sin compartición', EXTERNO_ID, null, false],
    ['receptor tras revocación', VIEWER_ID, null, false],
  ])('%s → %s', async (_caso, quienMira, fila, permitido) => {
    const { prisma, events, service } = makeDeps();
    prisma.calendarioCompartido.findFirst.mockResolvedValue(fila);
    events.projectIdsForUser.mockResolvedValue([]);

    const peticion = service.agendaCompartida(quienMira, OWNER_ID, ...RANGO);
    if (permitido) {
      await expect(peticion).resolves.toEqual({ eventos: [], tareas: [] });
      expect(events.findSharedInRange).toHaveBeenCalledWith(OWNER_ID, quienMira, ...RANGO);
    } else {
      await expect(peticion).rejects.toBeInstanceOf(ForbiddenException);
      expect(events.findSharedInRange).not.toHaveBeenCalled();
    }
  });

  it('propietario inactivo (estado ≠ ACTIVO) se trata como no compartido', async () => {
    const { prisma, service } = makeDeps();
    prisma.calendarioCompartido.findFirst.mockResolvedValue(null);

    await expect(service.agendaCompartida(VIEWER_ID, OWNER_ID, ...RANGO)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.calendarioCompartido.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ propietario: { estado: 'ACTIVO' } }) }),
    );
  });

  it('las tareas de un proyecto común llevan detalle y las de un proyecto ajeno solo fecha, en la misma respuesta', async () => {
    const { prisma, events, service } = makeDeps();
    prisma.calendarioCompartido.findFirst.mockResolvedValue({ idCalendarioCompartido: 1 });
    events.projectIdsForUser.mockResolvedValueOnce([10, 11]).mockResolvedValueOnce([10]);
    prisma.tarea.findMany.mockResolvedValue([
      { idTarea: 1, tituloTarea: 'Común', estadoTarea: 'POR_HACER', prioridad: 'ALTA', fechaLimite: new Date('2026-10-02'), proyecto: { idProyecto: 10, tituloProyecto: 'P10' } },
      { idTarea: 2, tituloTarea: 'SECRETO', estadoTarea: 'POR_HACER', prioridad: 'ALTA', fechaLimite: new Date('2026-10-03'), proyecto: { idProyecto: 11, tituloProyecto: 'SECRETO' } },
    ]);

    const { tareas } = await service.agendaCompartida(VIEWER_ID, OWNER_ID, ...RANGO);

    expect(tareas.map((t) => t.visibilidad)).toEqual(['DETALLE', 'OCUPADO']);
    expect(JSON.stringify(tareas)).not.toContain('SECRETO');
  });
});

describe('CalendarSharesService.dejarDeRecibir — revocación por el destinatario (G01-C10, UI-31/B-05)', () => {
  it('borra únicamente la fila (propietario, yo): el actor sale del token, nunca del cuerpo', async () => {
    const { prisma, service } = makeDeps();
    prisma.calendarioCompartido.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.dejarDeRecibir(VIEWER_ID, OWNER_ID)).resolves.toEqual({ eliminado: true });
    expect(prisma.calendarioCompartido.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.calendarioCompartido.deleteMany).toHaveBeenCalledWith({
      where: { idPropietario: OWNER_ID, idInvitado: VIEWER_ID },
    });
  });

  it('otro usuario no puede borrar la relación ajena: su llamada solo apunta a su propia fila (inexistente → eliminado: false)', async () => {
    const { prisma, service } = makeDeps();
    prisma.calendarioCompartido.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.dejarDeRecibir(42, OWNER_ID)).resolves.toEqual({ eliminado: false });
    const where = prisma.calendarioCompartido.deleteMany.mock.calls[0][0].where;
    expect(where).toEqual({ idPropietario: OWNER_ID, idInvitado: 42 });
    expect(where).not.toHaveProperty('OR');
  });

  it('tras quitarse el calendario, la lectura posterior de la agenda es 403', async () => {
    const { prisma, events, service } = makeDeps();
    prisma.calendarioCompartido.deleteMany.mockResolvedValue({ count: 1 });
    prisma.calendarioCompartido.findFirst.mockResolvedValue(null);

    await service.dejarDeRecibir(VIEWER_ID, OWNER_ID);
    await expect(
      service.agendaCompartida(VIEWER_ID, OWNER_ID, '2026-10-01T06:00:00.000Z', '2026-10-08T06:00:00.000Z'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(events.findSharedInRange).not.toHaveBeenCalled();
  });

  it('la revocación del propietario sigue intacta y es independiente', async () => {
    const { prisma, service } = makeDeps();
    prisma.calendarioCompartido.deleteMany.mockResolvedValue({ count: 1 });

    await service.dejarDeCompartir(OWNER_ID, VIEWER_ID);
    expect(prisma.calendarioCompartido.deleteMany).toHaveBeenCalledWith({ where: { idPropietario: OWNER_ID, idInvitado: VIEWER_ID } });
  });
});
