import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { UpdateEstadoPostulacionDto } from '../src/applications/dto/update-estado-postulacion.dto';
import { ApplicationsService } from '../src/applications/applications.service';

type NotificationsDouble = Partial<{
  notifyUsers: ReturnType<typeof vi.fn>;
  persistTemplateTx: ReturnType<typeof vi.fn>;
  publishEffects: ReturnType<typeof vi.fn>;
}>;

function makeNotifications(): NotificationsDouble {
  return { notifyUsers: vi.fn(), persistTemplateTx: vi.fn(), publishEffects: vi.fn() };
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
  notifications: NotificationsDouble = makeNotifications(),
  eventEmitter: Partial<{ emit: ReturnType<typeof vi.fn> }> = { emit: vi.fn() },
) {
  return new ApplicationsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    eventEmitter as unknown as EventEmitter2,
  );
}

function makePrisma() {
  const tx = {
    postulacion: {
      // C030: la creación ocurre dentro de la transacción; el mismo doble se expone en la raíz.
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn(),
    },
    participacionProyecto: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ idParticipacion: 1 }),
      update: vi.fn().mockResolvedValue({ idParticipacion: 1 }),
    },
  };
  return {
    usuario: { findUnique: vi.fn() },
    rolProyecto: { findUnique: vi.fn() },
    participacionProyecto: { count: vi.fn(), ...tx.participacionProyecto },
    postulacion: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      ...tx.postulacion,
    },
    $transaction: vi.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    _tx: tx,
  };
}

describe('ApplicationsService', () => {
  it('create crea postulación válida y persiste la notificación al líder en la misma transacción', async () => {
    const prisma = makePrisma();
    prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 1 });
    prisma.rolProyecto.findUnique.mockResolvedValue({
      idRolProyecto: 2,
      cupos: 3,
      proyecto: { idProyecto: 5, estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: 9, tituloProyecto: 'Proyecto X' },
    });
    prisma.postulacion.findFirst.mockResolvedValue(null);
    const creada = {
      idPostulacion: 10,
      postulante: { nombre: 'Ana', apellido: 'Pérez' },
      rolProyecto: { nombreRol: 'Backend' },
    };
    prisma.postulacion.create.mockResolvedValue(creada);
    const eventEmitter = { emit: vi.fn() };
    const notifications = makeNotifications();
    const service = makeService(prisma, notifications, eventEmitter);

    const result = await service.create(
      { idRolProyecto: 2, justificacion: 'Quiero aportar' },
      1,
    );

    expect(result).toEqual(creada);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(notifications.persistTemplateTx).toHaveBeenCalledTimes(1);
    expect(notifications.persistTemplateTx).toHaveBeenCalledWith(
      prisma._tx,
      [9],
      'NUEVA_POSTULACION',
      expect.objectContaining({
        userName: 'Ana Pérez',
        roleName: 'Backend',
        projectTitle: 'Proyecto X',
        projectId: 5,
        applicationId: 10,
        roleId: 2,
      }),
      expect.objectContaining({ add: expect.any(Function) }),
    );
    expect(notifications.publishEffects).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'application.created',
      expect.objectContaining({ userId: 1, applicationId: 10, roleId: 2 }),
    );
  });

  it('create no notifica cuando el líder es el propio postulante', async () => {
    const prisma = makePrisma();
    prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 9 });
    prisma.rolProyecto.findUnique.mockResolvedValue({
      idRolProyecto: 2,
      cupos: 3,
      proyecto: { idProyecto: 5, estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: 9, tituloProyecto: 'Proyecto X' },
    });
    prisma.postulacion.findFirst.mockResolvedValue(null);
    prisma.postulacion.create.mockResolvedValue({
      idPostulacion: 11,
      postulante: { nombre: 'Líder', apellido: 'Propio' },
      rolProyecto: { nombreRol: 'Backend' },
    });
    const notifications = makeNotifications();
    const service = makeService(prisma, notifications);

    await service.create({ idRolProyecto: 2, justificacion: 'Quiero aportar' }, 9);

    expect(notifications.persistTemplateTx).not.toHaveBeenCalled();
  });

  it('create falla si usuario no existe', async () => {
    const prisma = makePrisma();
    prisma.usuario.findUnique.mockResolvedValue(null);
    const service = makeService(prisma);
    await expect(
      service.create({ idRolProyecto: 2, justificacion: '' }, 1),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create falla por cupos en en_progreso', async () => {
    const prisma = makePrisma();
    prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 1 });
    prisma.rolProyecto.findUnique.mockResolvedValue({
      idRolProyecto: 2,
      cupos: 1,
      proyecto: { estadoProyecto: EstadoProyecto.EN_PROGRESO },
    });
    prisma.participacionProyecto.count.mockResolvedValue(1);
    const service = makeService(prisma);
    await expect(
      service.create({ idRolProyecto: 2, justificacion: '' }, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('findAll y findMine delegan en prisma', async () => {
    const prisma = makePrisma();
    prisma.postulacion.findMany.mockResolvedValue([]);
    const service = makeService(prisma);
    await service.findAll();
    await service.findMine(1);
    expect(prisma.postulacion.findMany).toHaveBeenCalledTimes(2);
  });

  it('findOne falla si no existe', async () => {
    const prisma = makePrisma();
    prisma.postulacion.findUnique.mockResolvedValue(null);
    const service = makeService(prisma);
    await expect(service.findOne(1)).rejects.toBeInstanceOf(NotFoundException);
  });

  function mockPostulacionPendiente(prisma: ReturnType<typeof makePrisma>, overrides: Record<string, unknown> = {}) {
    prisma.postulacion.findUnique.mockResolvedValue({
      idPostulacion: 1,
      idRolProyecto: 2,
      idUsuarioPostulante: 4,
      estadoPostulacion: 'PENDIENTE',
      rolProyecto: { nombreRol: 'Backend', proyecto: { creadoPor: 9, idProyecto: 99, tituloProyecto: 'X' } },
      ...overrides,
    });
  }

  it('updateEstado (ACEPTADA) valida resolutor, notifica y crea la participación cuando no existe ninguna previa', async () => {
    const prisma = makePrisma();
    mockPostulacionPendiente(prisma);
    prisma._tx.postulacion.findUniqueOrThrow.mockResolvedValue({ idPostulacion: 1, estadoPostulacion: 'ACEPTADA' });
    const notifications = { notifyUsers: vi.fn() };
    const service = makeService(prisma, notifications);

    const result = await service.updateEstado(
      1,
      { estadoPostulacion: 'ACEPTADA', comentarioResolucion: '' } as UpdateEstadoPostulacionDto,
      9,
    );

    expect(result.estadoPostulacion).toBe('ACEPTADA');
    expect(prisma._tx.postulacion.updateMany).toHaveBeenCalledWith({
      where: { idPostulacion: 1, estadoPostulacion: 'PENDIENTE' },
      data: expect.objectContaining({ estadoPostulacion: 'ACEPTADA', resueltaPor: 9 }),
    });
    // Sin participación previa: crea una nueva ACTIVA, enlazada a la postulación.
    expect(prisma._tx.participacionProyecto.findFirst).toHaveBeenCalledWith({
      where: { idUsuario: 4, idRolProyecto: 2 },
      orderBy: { idParticipacion: 'desc' },
    });
    expect(prisma._tx.participacionProyecto.create).toHaveBeenCalledWith({
      data: { idUsuario: 4, idRolProyecto: 2, idPostulacion: 1, estadoParticipacion: 'ACTIVO' },
    });
    expect(prisma._tx.participacionProyecto.update).not.toHaveBeenCalled();
    expect(notifications.notifyUsers).toHaveBeenCalled();
  });

  it('updateEstado (ACEPTADA) reactiva una participación RETIRADO existente en vez de duplicarla', async () => {
    const prisma = makePrisma();
    mockPostulacionPendiente(prisma);
    prisma._tx.participacionProyecto.findFirst.mockResolvedValue({
      idParticipacion: 77,
      estadoParticipacion: 'RETIRADO',
    });
    prisma._tx.postulacion.findUniqueOrThrow.mockResolvedValue({ idPostulacion: 1, estadoPostulacion: 'ACEPTADA' });
    const service = makeService(prisma);

    await service.updateEstado(1, { estadoPostulacion: 'ACEPTADA' } as UpdateEstadoPostulacionDto, 9);

    expect(prisma._tx.participacionProyecto.create).not.toHaveBeenCalled();
    expect(prisma._tx.participacionProyecto.update).toHaveBeenCalledWith({
      where: { idParticipacion: 77 },
      data: expect.objectContaining({ estadoParticipacion: 'ACTIVO', fechaSalida: null, idPostulacion: 1 }),
    });
  });

  it('updateEstado (ACEPTADA) no toca la participación si ya estaba ACTIVO (carrera/reintento)', async () => {
    const prisma = makePrisma();
    mockPostulacionPendiente(prisma);
    prisma._tx.participacionProyecto.findFirst.mockResolvedValue({
      idParticipacion: 77,
      estadoParticipacion: 'ACTIVO',
    });
    prisma._tx.postulacion.findUniqueOrThrow.mockResolvedValue({ idPostulacion: 1, estadoPostulacion: 'ACEPTADA' });
    const service = makeService(prisma);

    await service.updateEstado(1, { estadoPostulacion: 'ACEPTADA' } as UpdateEstadoPostulacionDto, 9);

    expect(prisma._tx.participacionProyecto.create).not.toHaveBeenCalled();
    expect(prisma._tx.participacionProyecto.update).not.toHaveBeenCalled();
  });

  it('updateEstado (RECHAZADA) nunca toca ParticipacionProyecto', async () => {
    const prisma = makePrisma();
    mockPostulacionPendiente(prisma);
    prisma._tx.postulacion.findUniqueOrThrow.mockResolvedValue({ idPostulacion: 1, estadoPostulacion: 'RECHAZADA' });
    const service = makeService(prisma);

    await service.updateEstado(1, { estadoPostulacion: 'RECHAZADA' } as UpdateEstadoPostulacionDto, 9);

    expect(prisma._tx.participacionProyecto.findFirst).not.toHaveBeenCalled();
    expect(prisma._tx.participacionProyecto.create).not.toHaveBeenCalled();
  });

  it('updateEstado lanza ConflictException si otra resolución concurrente ya la resolvió (updateMany count 0)', async () => {
    const prisma = makePrisma();
    mockPostulacionPendiente(prisma);
    prisma._tx.postulacion.updateMany.mockResolvedValue({ count: 0 });
    const service = makeService(prisma);

    await expect(service.updateEstado(1, { estadoPostulacion: 'ACEPTADA' } as UpdateEstadoPostulacionDto, 9)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma._tx.participacionProyecto.create).not.toHaveBeenCalled();
  });

  it('updateEstado falla si no es creador', async () => {
    const prisma = makePrisma();
    prisma.postulacion.findUnique.mockResolvedValue({
      idPostulacion: 1,
      estadoPostulacion: 'PENDIENTE',
      rolProyecto: { proyecto: { creadoPor: 99 } },
    });
    const service = makeService(prisma);
    await expect(service.updateEstado(1, { estadoPostulacion: 'RECHAZADA' } as UpdateEstadoPostulacionDto, 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
