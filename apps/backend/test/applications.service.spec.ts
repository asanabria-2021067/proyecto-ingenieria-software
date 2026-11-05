import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { UpdateEstadoPostulacionDto } from '../src/applications/dto/update-estado-postulacion.dto';
import { ApplicationsService } from '../src/applications/applications.service';
import { ProjectTransactionService } from '../src/common/project-policy/project-transaction.service';
import {
  makeProjectPolicyDouble,
  makeProjectReadPolicyDouble,
  withProjectLock,
} from './helpers/project-policy.double';

type NotificationsDouble = Partial<{
  notifyUsers: ReturnType<typeof vi.fn>;
  persistTemplateTx: ReturnType<typeof vi.fn>;
  persistUsersTx: ReturnType<typeof vi.fn>;
  publishEffects: ReturnType<typeof vi.fn>;
}>;

function makeNotifications(): NotificationsDouble {
  return {
    notifyUsers: vi.fn(),
    persistTemplateTx: vi.fn(),
    // C043: la resolución persiste la notificación dentro de la transacción.
    persistUsersTx: vi.fn(),
    publishEffects: vi.fn(),
  };
}

/**
 * C043: el servicio corre sobre el protocolo con el runner REAL sobre el
 * `$transaction` mockeado, de modo que las aserciones existentes sobre la
 * transacción y sobre `prisma._tx` siguen siendo exactamente las mismas. El
 * estado del proyecto lo entrega ahora la fila bloqueada, de la que dependen
 * las validaciones de estado y de cupo.
 */
function makeService(
  prisma: ReturnType<typeof makePrisma>,
  notifications: NotificationsDouble = makeNotifications(),
  eventEmitter: Partial<{ emit: ReturnType<typeof vi.fn> }> = { emit: vi.fn() },
  estadoProyecto: EstadoProyecto = EstadoProyecto.PUBLICADO,
) {
  withProjectLock(prisma._tx, { estadoProyecto });
  return new ApplicationsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    eventEmitter as unknown as EventEmitter2,
    new ProjectTransactionService(prisma as unknown as PrismaService),
    makeProjectPolicyDouble(),
    makeProjectReadPolicyDouble(),
  );
}

function makePrisma() {
  const tx = {
    postulacion: {
      // C030: la creación ocurre dentro de la transacción; el mismo doble se expone en la raíz.
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn(),
      // C043: duplicado y retiro también se evalúan bajo el lock.
      findFirst: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    participacionProyecto: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ idParticipacion: 1 }),
      update: vi.fn().mockResolvedValue({ idParticipacion: 1 }),
      // C043: el cupo se cuenta dentro de la transacción — tanto al postular
      // como al aceptar (`activarParticipacionPorPostulacion`).
      count: vi.fn().mockResolvedValue(0),
    },
    // El alta por aceptación relee el rol bajo el lock para conocer su cupo.
    rolProyecto: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ cupos: 10, nombreRol: 'Backend' }),
    },
    // MEJ-97: preguntas vigentes del rol al postular (por defecto, el rol no tiene).
    preguntaRol: { findMany: vi.fn().mockResolvedValue([]) },
    // MEJ-100: pasos de la línea de tiempo.
    eventoPostulacion: { createMany: vi.fn().mockResolvedValue({ count: 1 }), findMany: vi.fn().mockResolvedValue([]) },
  };
  return {
    usuario: { findUnique: vi.fn() },
    rolProyecto: { findUnique: vi.fn(), ...tx.rolProyecto },
    participacionProyecto: { ...tx.participacionProyecto },
    eventoPostulacion: tx.eventoPostulacion,
    postulacion: {
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
      proyecto: { idProyecto: 5, estadoProyecto: EstadoProyecto.EN_PROGRESO },
    });
    prisma.participacionProyecto.count.mockResolvedValue(1);
    const service = makeService(prisma, makeNotifications(), { emit: vi.fn() }, EstadoProyecto.EN_PROGRESO);
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

  it('findAll del líder trae las respuestas en orden (las ve al revisar en Miembros)', async () => {
    const prisma = makePrisma();
    prisma.postulacion.findMany.mockResolvedValue([]);
    await makeService(prisma).findAll(9);
    expect(prisma.postulacion.findMany.mock.calls[0][0].include.respuestas).toEqual({ orderBy: { orden: 'asc' } });
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

  it('updateEstado (ACEPTADA) rechaza el alta cuando el rol ya no tiene cupo activo libre', async () => {
    const prisma = makePrisma();
    mockPostulacionPendiente(prisma);
    // Rol de un solo cupo, ya ocupado: aceptar aquí dejaría 2 participaciones
    // ACTIVO sobre `cupos: 1`. `create` no lo cubre — solo cuenta cupo cuando
    // el proyecto está EN_PROGRESO, y un rol PUBLICADO puede acumular
    // postulaciones pendientes que después se aceptan una por una.
    prisma._tx.rolProyecto.findUniqueOrThrow.mockResolvedValue({ cupos: 1, nombreRol: 'Diseño' });
    prisma._tx.participacionProyecto.count.mockResolvedValue(1);
    const notifications = { notifyUsers: vi.fn(), persistUsersTx: vi.fn(), publishEffects: vi.fn() };
    const service = makeService(prisma, notifications);

    await expect(
      service.updateEstado(
        1,
        { estadoPostulacion: 'ACEPTADA', comentarioResolucion: '' } as UpdateEstadoPostulacionDto,
        9,
      ),
    ).rejects.toThrow(ConflictException);

    expect(prisma._tx.participacionProyecto.create).not.toHaveBeenCalled();
    expect(prisma._tx.participacionProyecto.update).not.toHaveBeenCalled();
  });

  it('updateEstado (ACEPTADA) no vuelve a consumir cupo cuando la participación ya estaba ACTIVO', async () => {
    const prisma = makePrisma();
    mockPostulacionPendiente(prisma);
    prisma._tx.postulacion.findUniqueOrThrow.mockResolvedValue({ idPostulacion: 1, estadoPostulacion: 'ACEPTADA' });
    prisma._tx.participacionProyecto.findFirst.mockResolvedValue({
      idParticipacion: 7,
      estadoParticipacion: 'ACTIVO',
    });
    // Rol lleno: la idempotencia manda, porque esa plaza ya es de esta persona.
    prisma._tx.rolProyecto.findUniqueOrThrow.mockResolvedValue({ cupos: 1, nombreRol: 'Diseño' });
    prisma._tx.participacionProyecto.count.mockResolvedValue(1);
    const notifications = { notifyUsers: vi.fn(), persistUsersTx: vi.fn(), publishEffects: vi.fn() };
    const service = makeService(prisma, notifications);

    const result = await service.updateEstado(
      1,
      { estadoPostulacion: 'ACEPTADA', comentarioResolucion: '' } as UpdateEstadoPostulacionDto,
      9,
    );

    expect(result.estadoPostulacion).toBe('ACEPTADA');
    expect(prisma._tx.rolProyecto.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma._tx.participacionProyecto.create).not.toHaveBeenCalled();
    expect(prisma._tx.participacionProyecto.update).not.toHaveBeenCalled();
  });

  it('updateEstado (ACEPTADA) valida resolutor, notifica y crea la participación cuando no existe ninguna previa', async () => {
    const prisma = makePrisma();
    mockPostulacionPendiente(prisma);
    prisma._tx.postulacion.findUniqueOrThrow.mockResolvedValue({ idPostulacion: 1, estadoPostulacion: 'ACEPTADA' });
    const notifications = { notifyUsers: vi.fn(), persistUsersTx: vi.fn(), publishEffects: vi.fn() };
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
    // C043: la notificación al postulante se persiste dentro de la misma
    // transacción que resuelve, y el socket se publica tras el commit.
    expect(notifications.persistUsersTx).toHaveBeenCalledWith(
      prisma._tx,
      [4],
      expect.objectContaining({ tipoNotificacion: 'POSTULACION_RESUELTA' }),
      expect.objectContaining({ add: expect.any(Function) }),
    );
    expect(notifications.publishEffects).toHaveBeenCalledTimes(1);
  });

  it('MEJ-102: al aceptar se envia la bienvenida del lider; al rechazar no', async () => {
    const bienvenida = { enviarSinFallar: vi.fn().mockResolvedValue(undefined) };
    for (const estado of ['ACEPTADA', 'RECHAZADA'] as const) {
      const prisma = makePrisma();
      mockPostulacionPendiente(prisma);
      prisma._tx.postulacion.findUniqueOrThrow.mockResolvedValue({ idPostulacion: 1, estadoPostulacion: estado });
      const service = makeService(prisma);
      (service as unknown as { bienvenida: typeof bienvenida }).bienvenida = bienvenida;
      await service.updateEstado(1, { estadoPostulacion: estado, motivoRechazo: 'CUPO_LLENO' } as UpdateEstadoPostulacionDto, 9);
    }
    expect(bienvenida.enviarSinFallar).toHaveBeenCalledTimes(1);
    expect(bienvenida.enviarSinFallar).toHaveBeenCalledWith(expect.any(Number), 4);
  });

  it('updateEstado (ACEPTADA) emite el recálculo de insignias de postulaciones del postulante; RECHAZADA no (HU-190)', async () => {
    const prisma = makePrisma();
    mockPostulacionPendiente(prisma);
    prisma._tx.postulacion.findUniqueOrThrow.mockResolvedValue({ idPostulacion: 1, estadoPostulacion: 'ACEPTADA' });
    const eventEmitter = { emit: vi.fn() };
    const service = makeService(prisma, makeNotifications(), eventEmitter);

    await service.updateEstado(1, { estadoPostulacion: 'ACEPTADA' } as UpdateEstadoPostulacionDto, 9);
    expect(eventEmitter.emit).toHaveBeenCalledWith('insignias.recalcular', { claves: ['postulaciones'], idUsuarios: [4] });

    const prisma2 = makePrisma();
    mockPostulacionPendiente(prisma2);
    prisma2._tx.postulacion.findUniqueOrThrow.mockResolvedValue({ idPostulacion: 1, estadoPostulacion: 'RECHAZADA' });
    const emitter2 = { emit: vi.fn() };
    await makeService(prisma2, makeNotifications(), emitter2).updateEstado(
      1,
      { estadoPostulacion: 'RECHAZADA', motivoRechazo: 'HORARIO' } as UpdateEstadoPostulacionDto,
      9,
    );
    expect(emitter2.emit).not.toHaveBeenCalledWith('insignias.recalcular', expect.anything());
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

    await service.updateEstado(
      1,
      { estadoPostulacion: 'RECHAZADA', motivoRechazo: 'CUPO_LLENO' } as UpdateEstadoPostulacionDto,
      9,
    );

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

  // MEJ-99: motivo del rechazo.
  it('updateEstado (RECHAZADA) exige un motivo y guarda motivo y comentario', async () => {
    const prisma = makePrisma();
    mockPostulacionPendiente(prisma);
    prisma._tx.postulacion.findUniqueOrThrow.mockResolvedValue({ idPostulacion: 1, estadoPostulacion: 'RECHAZADA' });
    const notifications = { notifyUsers: vi.fn(), persistUsersTx: vi.fn(), publishEffects: vi.fn() };
    const service = makeService(prisma, notifications);

    await expect(
      service.updateEstado(1, { estadoPostulacion: 'RECHAZADA' } as UpdateEstadoPostulacionDto, 9),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma._tx.postulacion.updateMany).not.toHaveBeenCalled();

    await service.updateEstado(
      1,
      { estadoPostulacion: 'RECHAZADA', motivoRechazo: 'HORARIO', comentarioResolucion: ' Choca con clases ' } as UpdateEstadoPostulacionDto,
      9,
    );
    expect(prisma._tx.postulacion.updateMany).toHaveBeenCalledWith({
      where: { idPostulacion: 1, estadoPostulacion: 'PENDIENTE' },
      data: expect.objectContaining({ estadoPostulacion: 'RECHAZADA', motivoRechazo: 'HORARIO', comentarioResolucion: 'Choca con clases' }),
    });
    expect(notifications.persistUsersTx).toHaveBeenCalledWith(
      prisma._tx,
      [4],
      expect.objectContaining({
        mensajeNotificacion: expect.stringContaining('Motivo: El horario no es compatible. Comentario: Choca con clases'),
        datosJson: expect.objectContaining({ motivoRechazo: 'HORARIO' }),
      }),
      expect.anything(),
    );
    expect(prisma._tx.eventoPostulacion.createMany).toHaveBeenCalledWith({
      data: [{ idPostulacion: 1, tipo: 'RECHAZADA' }],
      skipDuplicates: true,
    });
  });

  it('updateEstado (RECHAZADA) con motivo OTRO exige comentario; al aceptar el motivo se ignora', async () => {
    const prisma = makePrisma();
    mockPostulacionPendiente(prisma);
    prisma._tx.postulacion.findUniqueOrThrow.mockResolvedValue({ idPostulacion: 1, estadoPostulacion: 'ACEPTADA' });
    const service = makeService(prisma);

    for (const comentarioResolucion of [undefined, '   ']) {
      await expect(
        service.updateEstado(1, { estadoPostulacion: 'RECHAZADA', motivoRechazo: 'OTRO', comentarioResolucion } as UpdateEstadoPostulacionDto, 9),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(prisma._tx.postulacion.updateMany).not.toHaveBeenCalled();

    await service.updateEstado(1, { estadoPostulacion: 'ACEPTADA', motivoRechazo: 'CUPO_LLENO' } as UpdateEstadoPostulacionDto, 9);
    expect(prisma._tx.postulacion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estadoPostulacion: 'ACEPTADA', motivoRechazo: null }) }),
    );
    expect(prisma._tx.eventoPostulacion.createMany).toHaveBeenCalledWith({
      data: [{ idPostulacion: 1, tipo: 'ACEPTADA' }],
      skipDuplicates: true,
    });
  });

  // MEJ-97: preguntas del rol.
  describe('create con preguntas del rol', () => {
    const pregunta = (idPregunta: number, over: Record<string, unknown> = {}) => ({
      idPregunta,
      idRolProyecto: 2,
      enunciado: `Pregunta ${idPregunta}`,
      tipo: 'CORTA',
      obligatoria: true,
      orden: idPregunta - 1,
      ...over,
    });
    function preparar(preguntas: unknown[]) {
      const prisma = makePrisma();
      prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 1 });
      prisma.rolProyecto.findUnique.mockResolvedValue({
        idRolProyecto: 2,
        cupos: 3,
        proyecto: { idProyecto: 5, estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: 9, tituloProyecto: 'P' },
      });
      prisma.postulacion.findFirst.mockResolvedValue(null);
      prisma._tx.preguntaRol.findMany.mockResolvedValue(preguntas);
      prisma.postulacion.create.mockResolvedValue({
        idPostulacion: 10,
        postulante: { nombre: 'Ana', apellido: 'Pérez' },
        rolProyecto: { nombreRol: 'Backend' },
      });
      return { prisma, service: makeService(prisma) };
    }
    const base = { idRolProyecto: 2, justificacion: 'x'.repeat(40) };

    it('guarda cada respuesta con copia del enunciado y el paso ENVIADA', async () => {
      const { prisma, service } = preparar([pregunta(1), pregunta(2, { tipo: 'LARGA', obligatoria: false })]);
      await service.create({ ...base, respuestas: [{ idPregunta: 1, respuesta: '  Sí  ' }] }, 1);
      expect(prisma._tx.postulacion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            respuestas: {
              create: [
                { pregunta: { connect: { idPregunta: 1 } }, enunciado: 'Pregunta 1', tipo: 'CORTA', respuesta: 'Sí', orden: 0 },
              ],
            },
            eventos: { create: { tipo: 'ENVIADA' } },
          }),
        }),
      );
    });

    it('rechaza una obligatoria sin responder, una respuesta ajena, repetida o demasiado larga', async () => {
      const { prisma, service } = preparar([pregunta(1), pregunta(2, { tipo: 'LARGA', obligatoria: false })]);
      const casos = [
        { respuestas: [] },
        { respuestas: [{ idPregunta: 1, respuesta: '   ' }] },
        { respuestas: [{ idPregunta: 1, respuesta: 'a' }, { idPregunta: 99, respuesta: 'b' }] },
        { respuestas: [{ idPregunta: 1, respuesta: 'a' }, { idPregunta: 1, respuesta: 'b' }] },
        { respuestas: [{ idPregunta: 1, respuesta: 'a'.repeat(201) }] },
        { respuestas: [{ idPregunta: 1, respuesta: 'a' }, { idPregunta: 2, respuesta: 'b'.repeat(2001) }] },
      ];
      for (const caso of casos) {
        await expect(service.create({ ...base, ...caso }, 1)).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(prisma._tx.postulacion.create).not.toHaveBeenCalled();
    });

    it('acepta una respuesta larga de hasta 2000 caracteres y omite las opcionales vacías', async () => {
      const { prisma, service } = preparar([pregunta(1, { tipo: 'LARGA' }), pregunta(2, { obligatoria: false })]);
      await service.create({ ...base, respuestas: [{ idPregunta: 1, respuesta: 'a'.repeat(2000) }] }, 1);
      const data = prisma._tx.postulacion.create.mock.calls[0][0].data;
      expect(data.respuestas.create).toHaveLength(1);
    });

    it('una postulación retirada no impide volver a postular (el duplicado ignora RETIRADA)', async () => {
      const { prisma, service } = preparar([]);
      await service.create(base, 1);
      expect(prisma._tx.postulacion.findFirst).toHaveBeenCalledWith({
        where: { idUsuarioPostulante: 1, idRolProyecto: 2, estadoPostulacion: { not: 'RETIRADA' } },
      });
    });
  });

  // MEJ-96: retirar.
  describe('retirar', () => {
    function pendiente(prisma: ReturnType<typeof makePrisma>, over: Record<string, unknown> = {}) {
      prisma.postulacion.findUnique.mockResolvedValue({
        idPostulacion: 1,
        idRolProyecto: 2,
        idUsuarioPostulante: 4,
        estadoPostulacion: 'PENDIENTE',
        postulante: { nombre: 'Ana', apellido: 'Pérez' },
        rolProyecto: { nombreRol: 'Backend', proyecto: { idProyecto: 99, creadoPor: 9, tituloProyecto: 'Proyecto X' } },
        ...over,
      });
    }

    it('cambia a RETIRADA sin borrar, registra el paso y avisa al líder', async () => {
      const prisma = makePrisma();
      pendiente(prisma);
      const notifications = makeNotifications();
      const service = makeService(prisma, notifications);

      const result = await service.retirar(1, 4);

      expect(result.estadoPostulacion).toBe('RETIRADA');
      expect(prisma._tx.postulacion.deleteMany).not.toHaveBeenCalled();
      expect(prisma._tx.postulacion.updateMany).toHaveBeenCalledWith({
        where: { idPostulacion: 1, idUsuarioPostulante: 4, estadoPostulacion: 'PENDIENTE' },
        data: { estadoPostulacion: 'RETIRADA', fechaResolucion: expect.any(Date) },
      });
      expect(prisma._tx.eventoPostulacion.createMany).toHaveBeenCalledWith({
        data: [{ idPostulacion: 1, tipo: 'RETIRADA' }],
        skipDuplicates: true,
      });
      expect(notifications.persistUsersTx).toHaveBeenCalledWith(
        prisma._tx,
        [9],
        expect.objectContaining({
          tipoNotificacion: 'NUEVA_POSTULACION',
          tituloNotificacion: 'Postulación retirada',
          mensajeNotificacion: expect.stringContaining('Ana Pérez retiró su postulación'),
        }),
        expect.objectContaining({ add: expect.any(Function) }),
      );
      expect(notifications.publishEffects).toHaveBeenCalledTimes(1);
    });

    it('otro estudiante no puede retirar la postulación ajena', async () => {
      const prisma = makePrisma();
      pendiente(prisma);
      const service = makeService(prisma);
      await expect(service.retirar(1, 5)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma._tx.postulacion.updateMany).not.toHaveBeenCalled();
    });

    it('solo se retira mientras sigue PENDIENTE y una carrera concurrente da 409', async () => {
      const prisma = makePrisma();
      pendiente(prisma, { estadoPostulacion: 'ACEPTADA' });
      await expect(makeService(prisma).retirar(1, 4)).rejects.toBeInstanceOf(BadRequestException);

      const carrera = makePrisma();
      pendiente(carrera);
      carrera._tx.postulacion.updateMany.mockResolvedValue({ count: 0 });
      await expect(makeService(carrera).retirar(1, 4)).rejects.toBeInstanceOf(ConflictException);
      expect(carrera._tx.eventoPostulacion.createMany).not.toHaveBeenCalled();
    });

    it('no existe: 404; si el líder es el propio postulante no se notifica', async () => {
      const prisma = makePrisma();
      prisma.postulacion.findUnique.mockResolvedValue(null);
      await expect(makeService(prisma).retirar(1, 4)).rejects.toBeInstanceOf(NotFoundException);

      const propio = makePrisma();
      pendiente(propio, { idUsuarioPostulante: 9 });
      const notifications = makeNotifications();
      await makeService(propio, notifications).retirar(1, 9);
      expect(notifications.persistUsersTx).not.toHaveBeenCalled();
    });
  });

  // MEJ-100: línea de tiempo.
  describe('línea de tiempo', () => {
    const lider = { proyecto: { idProyecto: 5, creadoPor: 9 } };

    it('«vista» se registra solo cuando el líder abre la postulación, y es idempotente por índice único', async () => {
      const prisma = makePrisma();
      prisma.postulacion.findUnique.mockResolvedValue({ idPostulacion: 1, idUsuarioPostulante: 4, estadoPostulacion: 'PENDIENTE', rolProyecto: lider });
      const service = makeService(prisma);

      await service.findOne(1, 4);
      expect(prisma.eventoPostulacion.createMany).not.toHaveBeenCalled();

      await service.findOne(1, 9);
      await service.findOne(1, 9);
      expect(prisma.eventoPostulacion.createMany).toHaveBeenCalledTimes(2);
      expect(prisma.eventoPostulacion.createMany).toHaveBeenCalledWith({
        data: [{ idPostulacion: 1, tipo: 'VISTA' }],
        skipDuplicates: true,
      });
    });

    it('una postulación ya resuelta o retirada no registra «vista»', async () => {
      const prisma = makePrisma();
      const service = makeService(prisma);
      for (const estadoPostulacion of ['ACEPTADA', 'RECHAZADA', 'RETIRADA']) {
        prisma.postulacion.findUnique.mockResolvedValue({ idPostulacion: 1, idUsuarioPostulante: 4, estadoPostulacion, rolProyecto: lider });
        await service.findOne(1, 9);
      }
      expect(prisma.eventoPostulacion.createMany).not.toHaveBeenCalled();
    });

    it('un tercero no ve la postulación ni deja rastro de «vista»', async () => {
      const prisma = makePrisma();
      prisma.postulacion.findUnique.mockResolvedValue({ idPostulacion: 1, idUsuarioPostulante: 4, rolProyecto: lider });
      const service = makeService(prisma);
      await expect(service.findOne(1, 77)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.eventoPostulacion.createMany).not.toHaveBeenCalled();
    });

    it('findMine entrega los eventos ordenados y completa enviada/resuelta de postulaciones anteriores', async () => {
      const prisma = makePrisma();
      const d = (iso: string) => new Date(iso);
      prisma.postulacion.findMany.mockResolvedValue([
        {
          idPostulacion: 1,
          estadoPostulacion: 'RECHAZADA',
          fechaPostulacion: d('2026-11-01T10:00:00Z'),
          fechaResolucion: d('2026-11-03T10:00:00Z'),
          eventos: [{ tipo: 'VISTA', fecha: d('2026-11-02T10:00:00Z') }],
        },
        {
          idPostulacion: 2,
          estadoPostulacion: 'PENDIENTE',
          fechaPostulacion: d('2026-11-01T10:00:00Z'),
          fechaResolucion: null,
          eventos: [{ tipo: 'ENVIADA', fecha: d('2026-11-01T10:00:00Z') }],
        },
      ]);
      const [a, b] = await makeService(prisma).findMine(4);
      expect(a.eventos.map((e) => e.tipo)).toEqual(['ENVIADA', 'VISTA', 'RECHAZADA']);
      expect(b.eventos.map((e) => e.tipo)).toEqual(['ENVIADA']);
    });

    it('marcarEnRevision: solo el líder, solo PENDIENTE, registra EN_REVISION', async () => {
      const prisma = makePrisma();
      prisma.postulacion.findUnique.mockResolvedValue({ estadoPostulacion: 'PENDIENTE', rolProyecto: lider });
      const service = makeService(prisma);

      await expect(service.marcarEnRevision(1, 4)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.eventoPostulacion.createMany).not.toHaveBeenCalled();

      await service.marcarEnRevision(1, 9);
      expect(prisma.eventoPostulacion.createMany).toHaveBeenCalledWith({
        data: [{ idPostulacion: 1, tipo: 'EN_REVISION' }],
        skipDuplicates: true,
      });

      prisma.postulacion.findUnique.mockResolvedValue({ estadoPostulacion: 'ACEPTADA', rolProyecto: lider });
      await expect(service.marcarEnRevision(1, 9)).rejects.toBeInstanceOf(BadRequestException);
      prisma.postulacion.findUnique.mockResolvedValue(null);
      await expect(service.marcarEnRevision(1, 9)).rejects.toBeInstanceOf(NotFoundException);
    });
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
