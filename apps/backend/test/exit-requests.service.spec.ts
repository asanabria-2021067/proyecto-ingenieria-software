import { ForbiddenException, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ExitRequestsAuthorizationService } from '../src/exit-requests/exit-requests.authorization.service';
import { ExitRequestsContextService } from '../src/exit-requests/exit-requests.context.service';
import { ExitRequestsService } from '../src/exit-requests/exit-requests.service';

/**
 * Tarea 5: el índice parcial `solicitud_salida_proyecto_pendiente_unique` (a
 * lo sumo una fila abierta por (id_proyecto, id_usuario)) puede rechazar
 * una segunda inserción concurrente. Mismo patrón que
 * tasks-assignment-conflict.spec.ts / labels-conflict.spec.ts: se construye
 * la CLASE REAL `Prisma.PrismaClientKnownRequestError` (no un objeto
 * `{ code: 'P2002' }` falso), con la forma de metadata que Prisma 6.19.2 ya
 * demostró entregar para este tipo de violación (modelName + target de
 * columnas, sin el nombre del índice).
 */
function makePendingExitRequestCollisionError() {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`id_proyecto`,`id_usuario`)',
    {
      code: 'P2002',
      clientVersion: '6.19.2',
      meta: { modelName: 'SolicitudSalidaProyecto', target: ['id_proyecto', 'id_usuario'] },
    },
  );
}

function makeOtherModelP2002Error() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`correo`)', {
    code: 'P2002',
    clientVersion: '6.19.2',
    meta: { modelName: 'Usuario', target: ['correo'] },
  });
}

function makeOtherTargetP2002Error() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.2',
    meta: { modelName: 'SolicitudSalidaProyecto', target: ['id_proyecto'] },
  });
}

function makeConnectionError() {
  return new Error('database unavailable');
}

function makePrisma() {
  const writeSpies = () => ({
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    upsert: vi.fn(),
  });
  const prisma: any = {
    proyecto: { findFirst: vi.fn() },
    participacionProyecto: { findFirst: vi.fn(), ...writeSpies() },
    asignacionTarea: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), ...writeSpies() },
    horasParticipacion: { ...writeSpies() },
    tarea: { ...writeSpies() },
    solicitudSalidaProyecto: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  };
  // approveSolicitudSalida corre en $transaction; reusar el mismo objeto
  // prisma como tx deja las aserciones sobre solicitudSalidaProyecto.update /
  // participacionProyecto.updateMany apuntando a los mismos spies de arriba.
  prisma.$transaction = vi.fn(async (cb: (tx: any) => unknown) => cb(prisma));
  return prisma;
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
  notificationsOverride: Partial<{
    notifyFromTemplate: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const context = new ExitRequestsContextService(prisma);
  return new ExitRequestsService(
    prisma,
    {
      isAdmin: vi.fn(),
      notifyAdminsFromTemplate: vi.fn(),
      notifyFromTemplate: vi.fn(),
      ...notificationsOverride,
    } as any,
    new ExitRequestsAuthorizationService(context),
    context,
  );
}

const LIDER_ID = 1;
const MIEMBRO_ID = 2;
const PROYECTO_ID = 10;

function decimal(value: number) {
  return { toNumber: () => value };
}

const SOLICITUD_CREADA = {
  idSolicitud: 500,
  idProyecto: PROYECTO_ID,
  idUsuario: MIEMBRO_ID,
  motivo: 'Cambio de disponibilidad de horario',
  estadoSolicitud: 'PREPARACION',
  solicitadaEn: new Date('2026-01-10T00:00:00.000Z'),
  resueltaEn: null,
  resueltaPor: null,
};

// Deja el prisma mock listo para el camino feliz completo (Caso 1); cada
// test sobreescribe únicamente lo que necesita variar.
function setupHappyPath(prisma: ReturnType<typeof makePrisma>) {
  prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
  prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 77 });
  prisma.solicitudSalidaProyecto.findFirst.mockResolvedValue(null);
  prisma.solicitudSalidaProyecto.create.mockResolvedValue(SOLICITUD_CREADA);
}

describe('ExitRequestsService.createSolicitudSalida', () => {
  // Caso 1 — participante ACTIVO puede solicitar
  it('crea la solicitud cuando el proyecto existe, el solicitante es participante ACTIVO y no hay bloqueos', async () => {
    const prisma = makePrisma();
    setupHappyPath(prisma);
    const service = makeService(prisma);

    const resultado = await service.createSolicitudSalida(PROYECTO_ID, MIEMBRO_ID, 'Cambio de disponibilidad de horario');

    expect(prisma.solicitudSalidaProyecto.create).toHaveBeenCalledTimes(1);
    expect(resultado).toBe(SOLICITUD_CREADA);
  });

  it('rechaza con NotFoundException cuando el proyecto no existe (o fue eliminado)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);

    await expect(
      service.createSolicitudSalida(999, MIEMBRO_ID, 'motivo'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.participacionProyecto.findFirst).not.toHaveBeenCalled();
  });

  // Caso 2 — no participante rechazado
  it('rechaza con ForbiddenException a un usuario sin participación ACTIVO en el proyecto', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    prisma.participacionProyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);

    await expect(
      service.createSolicitudSalida(PROYECTO_ID, MIEMBRO_ID, 'motivo'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.asignacionTarea.findFirst).not.toHaveBeenCalled();
    expect(prisma.solicitudSalidaProyecto.findFirst).not.toHaveBeenCalled();
    expect(prisma.solicitudSalidaProyecto.create).not.toHaveBeenCalled();
  });

  // Caso 3 — líder rechazado
  it('rechaza con ForbiddenException al líder del proyecto, sin consultar participación', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    const service = makeService(prisma);

    await expect(
      service.createSolicitudSalida(PROYECTO_ID, LIDER_ID, 'motivo'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // El líder no tiene ParticipacionProyecto propia: el service no debe
    // intentar buscarla (comportamiento real congelado en Tarea 6, no
    // adaptado aquí).
    expect(prisma.participacionProyecto.findFirst).not.toHaveBeenCalled();
    expect(prisma.asignacionTarea.findFirst).not.toHaveBeenCalled();
    expect(prisma.solicitudSalidaProyecto.create).not.toHaveBeenCalled();
  });

  // Caso 4 — motivo obligatorio
  it.each(['', '   '])('rechaza con BadRequestException un motivo vacío o solo whitespace (%j)', async (motivoInvalido) => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 77 });
    const service = makeService(prisma);

    await expect(
      service.createSolicitudSalida(PROYECTO_ID, MIEMBRO_ID, motivoInvalido),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.solicitudSalidaProyecto.create).not.toHaveBeenCalled();
  });

  // Caso 5 — sin asignaciones crea PREPARACION
  it('permite iniciar PREPARACION sin asignaciones activas', async () => {
    const prisma = makePrisma();
    setupHappyPath(prisma);
    const service = makeService(prisma);

    const resultado = await service.createSolicitudSalida(PROYECTO_ID, MIEMBRO_ID, 'motivo válido');

    expect(resultado.estadoSolicitud).toBe('PREPARACION');
    expect(prisma.asignacionTarea.findFirst).not.toHaveBeenCalled();
    expect(prisma.solicitudSalidaProyecto.create).toHaveBeenCalledTimes(1);
  });

  // Caso 6 — asignación vigente ya no bloquea B5
  it('permite iniciar PREPARACION aunque el usuario tenga una asignación de tarea vigente en el proyecto', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 77 });
    const asignacionActiva = { idAsignacion: 900, desasignadaEn: null };
    prisma.asignacionTarea.findFirst.mockResolvedValue(asignacionActiva);
    prisma.solicitudSalidaProyecto.findFirst.mockResolvedValue(null);
    prisma.solicitudSalidaProyecto.create.mockResolvedValue(SOLICITUD_CREADA);
    const service = makeService(prisma);

    const resultado = await service.createSolicitudSalida(PROYECTO_ID, MIEMBRO_ID, 'motivo válido');

    expect(resultado.estadoSolicitud).toBe('PREPARACION');
    expect(prisma.asignacionTarea.findFirst).not.toHaveBeenCalled();
    expect(prisma.asignacionTarea.update).not.toHaveBeenCalled();
    expect(prisma.asignacionTarea.updateMany).not.toHaveBeenCalled();
    expect(prisma.solicitudSalidaProyecto.create).toHaveBeenCalledTimes(1);
  });

  // Caso 7 — la solicitud nace PREPARACION explícitamente
  it('crea con estadoSolicitud PREPARACION explícito y motivo recortado, sin fijar resueltaEn/resueltaPor', async () => {
    const prisma = makePrisma();
    setupHappyPath(prisma);
    const service = makeService(prisma);

    const resultado = await service.createSolicitudSalida(PROYECTO_ID, MIEMBRO_ID, '  motivo con espacios  ');

    expect(prisma.solicitudSalidaProyecto.create).toHaveBeenCalledWith({
      data: {
        idProyecto: PROYECTO_ID,
        idUsuario: MIEMBRO_ID,
        motivo: 'motivo con espacios',
        estadoSolicitud: 'PREPARACION',
      },
    });
    const dataEnviada = prisma.solicitudSalidaProyecto.create.mock.calls[0][0].data;
    expect(dataEnviada).not.toHaveProperty('resueltaEn');
    expect(dataEnviada).not.toHaveProperty('resueltaPor');
    expect(resultado.estadoSolicitud).toBe('PREPARACION');
  });

  // Caso 8 — segunda solicitud abierta rechazada (precheck)
  it.each(['PREPARACION', 'PENDIENTE_LIDER'] as const)(
    'rechaza con ConflictException cuando ya existe una solicitud %s para (idProyecto, idUsuario)',
    async (estadoSolicitud) => {
      const prisma = makePrisma();
      prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 77 });
      prisma.solicitudSalidaProyecto.findFirst.mockResolvedValue({ idSolicitud: 321, estadoSolicitud });
      const service = makeService(prisma);

      await expect(
        service.createSolicitudSalida(PROYECTO_ID, MIEMBRO_ID, 'motivo válido'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.solicitudSalidaProyecto.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            idProyecto: PROYECTO_ID,
            idUsuario: MIEMBRO_ID,
            estadoSolicitud: { in: ['PREPARACION', 'PENDIENTE_LIDER'] },
          },
        }),
      );
      expect(prisma.solicitudSalidaProyecto.create).not.toHaveBeenCalled();
    },
  );

  // Caso 10 — la creación no modifica participaciones/horas/tareas/asignaciones
  it('no realiza ninguna escritura en ParticipacionProyecto, HorasParticipacion, Tarea ni AsignacionTarea', async () => {
    const prisma = makePrisma();
    setupHappyPath(prisma);
    const service = makeService(prisma);

    await service.createSolicitudSalida(PROYECTO_ID, MIEMBRO_ID, 'motivo válido');

    for (const metodo of ['create', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'] as const) {
      expect(prisma.participacionProyecto[metodo]).not.toHaveBeenCalled();
      expect(prisma.horasParticipacion[metodo]).not.toHaveBeenCalled();
      expect(prisma.tarea[metodo]).not.toHaveBeenCalled();
      expect(prisma.asignacionTarea[metodo]).not.toHaveBeenCalled();
    }
    expect(prisma.solicitudSalidaProyecto.create).toHaveBeenCalledTimes(1);
  });

  // Caso 11 — aislamiento cross-project
  it('aísla todas las lecturas y la escritura al idProyecto solicitado', async () => {
    const prisma = makePrisma();
    setupHappyPath(prisma);
    const service = makeService(prisma);

    await service.createSolicitudSalida(PROYECTO_ID, MIEMBRO_ID, 'motivo válido');

    expect(prisma.proyecto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idProyecto: PROYECTO_ID, eliminadoEn: null } }),
    );
    expect(prisma.participacionProyecto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idUsuario: MIEMBRO_ID, estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto: PROYECTO_ID } },
      }),
    );
    expect(prisma.asignacionTarea.findFirst).not.toHaveBeenCalled();
    expect(prisma.solicitudSalidaProyecto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          idProyecto: PROYECTO_ID,
          idUsuario: MIEMBRO_ID,
          estadoSolicitud: { in: ['PREPARACION', 'PENDIENTE_LIDER'] },
        },
      }),
    );
    expect(prisma.solicitudSalidaProyecto.create).toHaveBeenCalledWith({
      data: {
        idProyecto: PROYECTO_ID,
        idUsuario: MIEMBRO_ID,
        motivo: 'motivo válido',
        estadoSolicitud: 'PREPARACION',
      },
    });
  });

  it('una participación ACTIVO del mismo usuario únicamente en el Proyecto B no autoriza la solicitud en el Proyecto A', async () => {
    const PROYECTO_A = 10;
    const PROYECTO_B = 20;
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockImplementation(async ({ where }: any) =>
      where.idProyecto === PROYECTO_A
        ? { idProyecto: PROYECTO_A, creadoPor: LIDER_ID }
        : { idProyecto: PROYECTO_B, creadoPor: 999 },
    );
    // El mock respeta el filtro real (rolProyecto.idProyecto): el usuario
    // solo tiene participación ACTIVO ligada al Proyecto B.
    prisma.participacionProyecto.findFirst.mockImplementation(async ({ where }: any) =>
      where.rolProyecto.idProyecto === PROYECTO_B ? { idParticipacion: 1 } : null,
    );
    const service = makeService(prisma);

    await expect(
      service.createSolicitudSalida(PROYECTO_A, MIEMBRO_ID, 'motivo válido'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.solicitudSalidaProyecto.create).not.toHaveBeenCalled();

    // El mismo usuario SÍ puede solicitar en el Proyecto B (su proyecto
    // real), lo que demuestra que el rechazo anterior es aislamiento real
    // por proyecto y no una falla genérica de la participación.
    prisma.solicitudSalidaProyecto.findFirst.mockResolvedValue(null);
    prisma.solicitudSalidaProyecto.create.mockResolvedValue({ ...SOLICITUD_CREADA, idProyecto: PROYECTO_B });
    await service.createSolicitudSalida(PROYECTO_B, MIEMBRO_ID, 'motivo válido');
    expect(prisma.solicitudSalidaProyecto.create).toHaveBeenCalledWith({
      data: {
        idProyecto: PROYECTO_B,
        idUsuario: MIEMBRO_ID,
        motivo: 'motivo válido',
        estadoSolicitud: 'PREPARACION',
      },
    });
  });

  describe('defensa P2002 — colisión concurrente contra el índice parcial (Caso 9, cobertura unitaria complementaria)', () => {
    it('reconoce el error real del índice parcial solicitud_salida_proyecto_pendiente_unique: 409 exacto', async () => {
      const prisma = makePrisma();
      setupHappyPath(prisma);
      prisma.solicitudSalidaProyecto.create.mockRejectedValue(makePendingExitRequestCollisionError());
      const service = makeService(prisma);

      try {
        await service.createSolicitudSalida(PROYECTO_ID, MIEMBRO_ID, 'motivo válido');
        throw new Error('no debía resolver');
      } catch (e: any) {
        expect(e).toBeInstanceOf(ConflictException);
        expect(e.getStatus()).toBe(409);
      }
    });

    // Caso 10 (sección 10 del Plan Maestro) — error no-P2002 se propaga intacto
    it('propaga sin transformar un error que no es la colisión reconocida (p. ej. desconexión de base de datos)', async () => {
      const prisma = makePrisma();
      setupHappyPath(prisma);
      const original = makeConnectionError();
      prisma.solicitudSalidaProyecto.create.mockRejectedValue(original);
      const service = makeService(prisma);

      await expect(
        service.createSolicitudSalida(PROYECTO_ID, MIEMBRO_ID, 'motivo válido'),
      ).rejects.toBe(original);
    });

    it('rechaza un P2002 de otro modelo: propaga el error original en vez de traducirlo a 409', async () => {
      const prisma = makePrisma();
      setupHappyPath(prisma);
      const original = makeOtherModelP2002Error();
      prisma.solicitudSalidaProyecto.create.mockRejectedValue(original);
      const service = makeService(prisma);

      await expect(
        service.createSolicitudSalida(PROYECTO_ID, MIEMBRO_ID, 'motivo válido'),
      ).rejects.toBe(original);
    });

    it('rechaza un P2002 con otro target (columnas distintas): propaga el error original', async () => {
      const prisma = makePrisma();
      setupHappyPath(prisma);
      const original = makeOtherTargetP2002Error();
      prisma.solicitudSalidaProyecto.create.mockRejectedValue(original);
      const service = makeService(prisma);

      await expect(
        service.createSolicitudSalida(PROYECTO_ID, MIEMBRO_ID, 'motivo válido'),
      ).rejects.toBe(original);
    });
  });
});

const SOLICITUD_PREPARACION = {
  idSolicitud: 501,
  idProyecto: PROYECTO_ID,
  idUsuario: MIEMBRO_ID,
  estadoSolicitud: 'PREPARACION',
  solicitadaEn: new Date('2026-01-11T00:00:00.000Z'),
};

function setupPreparationSummaryPath(prisma: ReturnType<typeof makePrisma>, blockers: unknown[] = []) {
  prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
  prisma.solicitudSalidaProyecto.findFirst.mockResolvedValue(SOLICITUD_PREPARACION);
  prisma.asignacionTarea.findMany.mockResolvedValue(blockers);
}

function makePreparationBlocker(
  idAsignacion: number,
  overrides: Partial<{
    idTarea: number;
    fechaAsignacion: Date;
    horasReales: ReturnType<typeof decimal> | null;
    tituloTarea: string;
    estadoTarea: string;
    registrosAvance: number;
  }> = {},
) {
  return {
    idAsignacion,
    idTarea: overrides.idTarea ?? idAsignacion + 1000,
    fechaAsignacion: overrides.fechaAsignacion ?? new Date(`2026-01-${String(idAsignacion).padStart(2, '0')}T00:00:00.000Z`),
    horasReales: overrides.horasReales ?? null,
    tarea: {
      tituloTarea: overrides.tituloTarea ?? `Tarea ${idAsignacion}`,
      estadoTarea: overrides.estadoTarea ?? 'EN_PROGRESO',
    },
    _count: { registrosAvance: overrides.registrosAvance ?? 0 },
  };
}

describe('ExitRequestsService.getExitPreparationSummary', () => {
  it('devuelve 0 blockers y puedeContinuar true cuando la solicitud PREPARACION no tiene asignaciones activas', async () => {
    const prisma = makePrisma();
    setupPreparationSummaryPath(prisma, []);
    const service = makeService(prisma);

    const summary = await service.getExitPreparationSummary(PROYECTO_ID, MIEMBRO_ID);

    expect(summary).toEqual({
      solicitud: SOLICITUD_PREPARACION,
      blockers: [],
      cantidadBlockers: 0,
      puedeContinuar: true,
    });
    expect(prisma.solicitudSalidaProyecto.update).not.toHaveBeenCalled();
    expect(prisma.asignacionTarea.update).not.toHaveBeenCalled();
    expect(prisma.tarea.update).not.toHaveBeenCalled();
  });

  it('devuelve 1 blocker y puedeContinuar false con los datos mínimos de la asignación activa', async () => {
    const blocker = makePreparationBlocker(1, {
      idTarea: 20,
      tituloTarea: 'Cerrar documentación',
      estadoTarea: 'POR_HACER',
    });
    const prisma = makePrisma();
    setupPreparationSummaryPath(prisma, [blocker]);
    const service = makeService(prisma);

    const summary = await service.getExitPreparationSummary(PROYECTO_ID, MIEMBRO_ID);

    expect(summary.cantidadBlockers).toBe(1);
    expect(summary.puedeContinuar).toBe(false);
    expect(summary.blockers).toEqual([
      {
        idAsignacion: 1,
        idTarea: 20,
        tituloTarea: 'Cerrar documentación',
        estadoTarea: 'POR_HACER',
        fechaAsignacion: blocker.fechaAsignacion,
        horasReales: null,
        tieneHoras: false,
        tieneAvance: false,
        estadoPreparacion: 'PENDIENTE',
      },
    ]);
  });

  it('devuelve N blockers activos en orden determinista', async () => {
    const blockers = [
      makePreparationBlocker(1),
      makePreparationBlocker(2),
      makePreparationBlocker(3),
    ];
    const prisma = makePrisma();
    setupPreparationSummaryPath(prisma, blockers);
    const service = makeService(prisma);

    const summary = await service.getExitPreparationSummary(PROYECTO_ID, MIEMBRO_ID);

    expect(summary.blockers.map((b) => b.idAsignacion)).toEqual([1, 2, 3]);
    expect(summary.cantidadBlockers).toBe(3);
    expect(summary.puedeContinuar).toBe(false);
    expect(prisma.asignacionTarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ fechaAsignacion: 'asc' }, { idAsignacion: 'asc' }],
      }),
    );
  });

  it('calcula indicadores de horas y avance desde horasReales y _count.registrosAvance sin escribir datos', async () => {
    const blockers = [
      makePreparationBlocker(1, { horasReales: decimal(0), registrosAvance: 1 }),
      makePreparationBlocker(2, { horasReales: null, registrosAvance: 2 }),
    ];
    const prisma = makePrisma();
    setupPreparationSummaryPath(prisma, blockers);
    const service = makeService(prisma);

    const summary = await service.getExitPreparationSummary(PROYECTO_ID, MIEMBRO_ID);

    expect(summary.blockers[0]).toMatchObject({
      horasReales: 0,
      tieneHoras: true,
      tieneAvance: true,
      estadoPreparacion: 'COMPLETA',
    });
    expect(summary.blockers[1]).toMatchObject({
      horasReales: null,
      tieneHoras: false,
      tieneAvance: true,
      estadoPreparacion: 'PENDIENTE',
    });
    expect(prisma.asignacionTarea.updateMany).not.toHaveBeenCalled();
    expect(prisma.solicitudSalidaProyecto.update).not.toHaveBeenCalled();
  });

  it('consulta blockers con projectId, actorUserId y desasignadaEn null para evitar contaminación cross-project y cross-user', async () => {
    const prisma = makePrisma();
    setupPreparationSummaryPath(prisma, []);
    const service = makeService(prisma);

    await service.getExitPreparationSummary(PROYECTO_ID, MIEMBRO_ID);

    expect(prisma.solicitudSalidaProyecto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          idProyecto: PROYECTO_ID,
          idUsuario: MIEMBRO_ID,
          estadoSolicitud: 'PREPARACION',
        },
      }),
    );
    expect(prisma.asignacionTarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          idUsuario: MIEMBRO_ID,
          desasignadaEn: null,
          tarea: { idProyecto: PROYECTO_ID },
        },
      }),
    );
  });

  it('rechaza si no existe solicitud PREPARACION del actor en el proyecto', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    prisma.solicitudSalidaProyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);

    await expect(
      service.getExitPreparationSummary(PROYECTO_ID, MIEMBRO_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.asignacionTarea.findMany).not.toHaveBeenCalled();
  });
});

const SOLICITUD_PREPARACION_TRANSICION = {
  idSolicitud: 502,
  idProyecto: PROYECTO_ID,
  idUsuario: MIEMBRO_ID,
  motivo: 'Cambio de disponibilidad',
  estadoSolicitud: 'PREPARACION',
  solicitadaEn: new Date('2026-01-12T00:00:00.000Z'),
};

function setupContinuePreparationPath(prisma: ReturnType<typeof makePrisma>) {
  prisma.solicitudSalidaProyecto.findFirst.mockResolvedValue(SOLICITUD_PREPARACION_TRANSICION);
  prisma.asignacionTarea.findFirst.mockResolvedValue(null);
  prisma.solicitudSalidaProyecto.updateMany.mockResolvedValue({ count: 1 });
}

describe('ExitRequestsService.continueExitPreparation', () => {
  it('rechaza con ConflictException y no transiciona cuando existen blockers activos', async () => {
    const prisma = makePrisma();
    setupContinuePreparationPath(prisma);
    prisma.asignacionTarea.findFirst.mockResolvedValue({ idAsignacion: 900 });
    const service = makeService(prisma);

    await expect(
      service.continueExitPreparation(PROYECTO_ID, MIEMBRO_ID),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.solicitudSalidaProyecto.updateMany).not.toHaveBeenCalled();
  });

  it('transiciona PREPARACION a PENDIENTE_LIDER con 0 blockers usando updateMany condicional', async () => {
    const prisma = makePrisma();
    setupContinuePreparationPath(prisma);
    const service = makeService(prisma);

    const resultado = await service.continueExitPreparation(PROYECTO_ID, MIEMBRO_ID);

    expect(resultado).toEqual({
      idSolicitud: 502,
      idProyecto: PROYECTO_ID,
      idUsuario: MIEMBRO_ID,
      motivo: 'Cambio de disponibilidad',
      solicitadaEn: SOLICITUD_PREPARACION_TRANSICION.solicitadaEn,
      estadoSolicitud: 'PENDIENTE_LIDER',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.solicitudSalidaProyecto.updateMany).toHaveBeenCalledWith({
      where: {
        idSolicitud: 502,
        idProyecto: PROYECTO_ID,
        idUsuario: MIEMBRO_ID,
        estadoSolicitud: 'PREPARACION',
      },
      data: { estadoSolicitud: 'PENDIENTE_LIDER' },
    });
  });

  it.each(['PENDIENTE_LIDER', 'APROBADA', 'RECHAZADA', 'CANCELADA'] as const)(
    'rechaza si no existe solicitud PREPARACION porque la solicitud está en %s',
    async (estadoSolicitud) => {
      const prisma = makePrisma();
      prisma.solicitudSalidaProyecto.findFirst.mockResolvedValue(null);
      const service = makeService(prisma);

      await expect(
        service.continueExitPreparation(PROYECTO_ID, MIEMBRO_ID),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(estadoSolicitud).toBeTruthy();
      expect(prisma.asignacionTarea.findFirst).not.toHaveBeenCalled();
      expect(prisma.solicitudSalidaProyecto.updateMany).not.toHaveBeenCalled();
    },
  );

  it('revalida blockers server-side dentro de la transición con filtros de actor, proyecto y desasignadaEn null', async () => {
    const prisma = makePrisma();
    setupContinuePreparationPath(prisma);
    const service = makeService(prisma);

    await service.continueExitPreparation(PROYECTO_ID, MIEMBRO_ID);

    expect(prisma.asignacionTarea.findFirst).toHaveBeenCalledWith({
      where: {
        idUsuario: MIEMBRO_ID,
        desasignadaEn: null,
        tarea: { idProyecto: PROYECTO_ID },
      },
      select: { idAsignacion: true },
    });
  });

  it('rechaza si updateMany devuelve count 0', async () => {
    const prisma = makePrisma();
    setupContinuePreparationPath(prisma);
    prisma.solicitudSalidaProyecto.updateMany.mockResolvedValue({ count: 0 });
    const service = makeService(prisma);

    await expect(
      service.continueExitPreparation(PROYECTO_ID, MIEMBRO_ID),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

const SOLICITUD_ID = 500;

const SOLICITUD_PENDIENTE = {
  idSolicitud: SOLICITUD_ID,
  idProyecto: PROYECTO_ID,
  idUsuario: MIEMBRO_ID,
  motivo: 'Cambio de disponibilidad de horario',
  estadoSolicitud: 'PENDIENTE_LIDER',
  solicitadaEn: new Date('2026-01-10T00:00:00.000Z'),
  resueltaEn: null,
  resueltaPor: null,
};

// Deja el prisma mock listo para el camino feliz de resolución (líder real,
// solicitud PENDIENTE_LIDER encontrada); cada test sobreescribe lo que necesita.
const PROYECTO_TITULO = 'Proyecto Demo';

function setupResolutionPath(prisma: ReturnType<typeof makePrisma>) {
  prisma.proyecto.findFirst.mockResolvedValue({
    idProyecto: PROYECTO_ID,
    creadoPor: LIDER_ID,
    tituloProyecto: PROYECTO_TITULO,
  });
  prisma.solicitudSalidaProyecto.findFirst.mockResolvedValue(SOLICITUD_PENDIENTE);
}

describe('ExitRequestsService.approveSolicitudSalida', () => {
  // Caso A / D — 0 tareas pendientes (o todas HECHO, mismo conteo)
  it('aprueba y retira la participación cuando el integrante tiene 0 tareas distintas de HECHO', async () => {
    const prisma = makePrisma();
    setupResolutionPath(prisma);
    prisma.asignacionTarea.count.mockResolvedValue(0);
    prisma.solicitudSalidaProyecto.update.mockResolvedValue({
      ...SOLICITUD_PENDIENTE,
      estadoSolicitud: 'APROBADA',
    });
    const service = makeService(prisma);

    const resultado = await service.approveSolicitudSalida(PROYECTO_ID, SOLICITUD_ID, LIDER_ID);

    expect(resultado.estadoSolicitud).toBe('APROBADA');
    expect(prisma.solicitudSalidaProyecto.update).toHaveBeenCalledWith({
      where: { idSolicitud: SOLICITUD_ID },
      data: { estadoSolicitud: 'APROBADA', resueltaEn: expect.any(Date), resueltaPor: LIDER_ID },
    });
    expect(prisma.participacionProyecto.updateMany).toHaveBeenCalledWith({
      where: { idUsuario: MIEMBRO_ID, estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto: PROYECTO_ID } },
      data: { estadoParticipacion: 'RETIRADO', fechaSalida: expect.any(Date) },
    });
  });

  // Caso B — 1 tarea pendiente
  it('rechaza la aprobación con BadRequestException cuando hay 1 tarea pendiente, e informa la cantidad', async () => {
    const prisma = makePrisma();
    setupResolutionPath(prisma);
    prisma.asignacionTarea.count.mockResolvedValue(1);
    const service = makeService(prisma);

    try {
      await service.approveSolicitudSalida(PROYECTO_ID, SOLICITUD_ID, LIDER_ID);
      throw new Error('no debía resolver');
    } catch (e: any) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect(e.message).toContain('1 tarea(s) pendiente(s)');
    }
    expect(prisma.solicitudSalidaProyecto.update).not.toHaveBeenCalled();
    expect(prisma.participacionProyecto.updateMany).not.toHaveBeenCalled();
  });

  // Caso C — varias tareas pendientes
  it('rechaza la aprobación e informa la cantidad exacta cuando hay 5 tareas pendientes', async () => {
    const prisma = makePrisma();
    setupResolutionPath(prisma);
    prisma.asignacionTarea.count.mockResolvedValue(5);
    const service = makeService(prisma);

    try {
      await service.approveSolicitudSalida(PROYECTO_ID, SOLICITUD_ID, LIDER_ID);
      throw new Error('no debía resolver');
    } catch (e: any) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect(e.message).toContain('5 tarea(s) pendiente(s)');
    }
    expect(prisma.solicitudSalidaProyecto.update).not.toHaveBeenCalled();
  });

  it('cuenta las tareas pendientes en una sola consulta, filtrando desasignadaEn null y estadoTarea distinto de HECHO (sin N+1)', async () => {
    const prisma = makePrisma();
    setupResolutionPath(prisma);
    prisma.asignacionTarea.count.mockResolvedValue(0);
    prisma.solicitudSalidaProyecto.update.mockResolvedValue(SOLICITUD_PENDIENTE);
    const service = makeService(prisma);

    await service.approveSolicitudSalida(PROYECTO_ID, SOLICITUD_ID, LIDER_ID);

    expect(prisma.asignacionTarea.count).toHaveBeenCalledTimes(1);
    expect(prisma.asignacionTarea.count).toHaveBeenCalledWith({
      where: {
        idUsuario: MIEMBRO_ID,
        desasignadaEn: null,
        tarea: { idProyecto: PROYECTO_ID, eliminadoEn: null, estadoTarea: { not: 'HECHO' } },
      },
    });
  });

  it('rechaza con ForbiddenException a quien no es el líder, sin consultar la solicitud ni las tareas', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: 999 });
    const service = makeService(prisma);

    await expect(
      service.approveSolicitudSalida(PROYECTO_ID, SOLICITUD_ID, LIDER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.solicitudSalidaProyecto.findFirst).not.toHaveBeenCalled();
    expect(prisma.asignacionTarea.count).not.toHaveBeenCalled();
  });

  it('rechaza con NotFoundException cuando la solicitud no existe o no pertenece a ese proyecto', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    prisma.solicitudSalidaProyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);

    await expect(
      service.approveSolicitudSalida(PROYECTO_ID, 999, LIDER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.asignacionTarea.count).not.toHaveBeenCalled();
  });

  it('rechaza con BadRequestException cuando la solicitud ya fue resuelta (no está PENDIENTE_LIDER)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    prisma.solicitudSalidaProyecto.findFirst.mockResolvedValue({
      ...SOLICITUD_PENDIENTE,
      estadoSolicitud: 'APROBADA',
    });
    const service = makeService(prisma);

    await expect(
      service.approveSolicitudSalida(PROYECTO_ID, SOLICITUD_ID, LIDER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.asignacionTarea.count).not.toHaveBeenCalled();
  });

  it('rechaza con BadRequestException cuando la solicitud todavía está en PREPARACION', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    prisma.solicitudSalidaProyecto.findFirst.mockResolvedValue({
      ...SOLICITUD_PENDIENTE,
      estadoSolicitud: 'PREPARACION',
    });
    const service = makeService(prisma);

    await expect(
      service.approveSolicitudSalida(PROYECTO_ID, SOLICITUD_ID, LIDER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.asignacionTarea.count).not.toHaveBeenCalled();
    expect(prisma.solicitudSalidaProyecto.update).not.toHaveBeenCalled();
  });

  // Request changes (revisión HU-125/T-113), punto 12 — notificación al aprobar
  it('notifica al solicitante cuando el líder aprueba la solicitud', async () => {
    const prisma = makePrisma();
    setupResolutionPath(prisma);
    prisma.asignacionTarea.count.mockResolvedValue(0);
    prisma.solicitudSalidaProyecto.update.mockResolvedValue({
      ...SOLICITUD_PENDIENTE,
      estadoSolicitud: 'APROBADA',
    });
    const notifyFromTemplate = vi.fn();
    const service = makeService(prisma, { notifyFromTemplate });

    await service.approveSolicitudSalida(PROYECTO_ID, SOLICITUD_ID, LIDER_ID);

    expect(notifyFromTemplate).toHaveBeenCalledTimes(1);
    // Destinatario exacto = el solicitante (MIEMBRO_ID); nunca el líder que
    // resuelve (LIDER_ID) ni ningún otro integrante.
    expect(notifyFromTemplate).toHaveBeenCalledWith(
      [MIEMBRO_ID],
      'PARTICIPACION_ACTUALIZADA',
      { projectTitle: PROYECTO_TITULO, projectId: PROYECTO_ID, approved: true },
      prisma, // tx === prisma en este mock de $transaction
    );
    const [destinatarios] = notifyFromTemplate.mock.calls[0];
    expect(destinatarios).not.toContain(LIDER_ID);
  });

  // Request changes, punto 15 — evidencia de atomicidad: si una escritura
  // dentro de la transacción falla, la operación completa debe rechazar y no
  // debe notificarse (la notificación va después en el mismo callback).
  it('propaga el error y no notifica si falla una escritura dentro de la transacción de aprobación', async () => {
    const prisma = makePrisma();
    setupResolutionPath(prisma);
    prisma.asignacionTarea.count.mockResolvedValue(0);
    prisma.solicitudSalidaProyecto.update.mockResolvedValue({
      ...SOLICITUD_PENDIENTE,
      estadoSolicitud: 'APROBADA',
    });
    prisma.participacionProyecto.updateMany.mockRejectedValue(new Error('db down'));
    const notifyFromTemplate = vi.fn();
    const service = makeService(prisma, { notifyFromTemplate });

    await expect(
      service.approveSolicitudSalida(PROYECTO_ID, SOLICITUD_ID, LIDER_ID),
    ).rejects.toThrow('db down');

    // Todas las escrituras (solicitud, participación, notificación) están
    // dentro del único callback de $transaction: nunca se ejecutan
    // directamente sobre this.prisma fuera de él.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(notifyFromTemplate).not.toHaveBeenCalled();
  });

  // Request changes, punto 16 — T-113 no administra HorasParticipacion.
  it('no realiza ninguna escritura en HorasParticipacion al aprobar', async () => {
    const prisma = makePrisma();
    setupResolutionPath(prisma);
    prisma.asignacionTarea.count.mockResolvedValue(0);
    prisma.solicitudSalidaProyecto.update.mockResolvedValue({
      ...SOLICITUD_PENDIENTE,
      estadoSolicitud: 'APROBADA',
    });
    const service = makeService(prisma);

    await service.approveSolicitudSalida(PROYECTO_ID, SOLICITUD_ID, LIDER_ID);

    for (const metodo of ['create', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'] as const) {
      expect(prisma.horasParticipacion[metodo]).not.toHaveBeenCalled();
    }
  });
});

// Request changes, punto 14 — regresión explícita de aislamiento cross-project
// en la resolución (no solo en la creación). approveSolicitudSalida y
// rejectSolicitudSalida comparten exactamente el mismo helper de pertenencia
// (_requirePendingSolicitudSalida, filtro { idSolicitud, idProyecto }), por lo
// que un segundo test idéntico para el rechazo sería completamente redundante.
describe('ExitRequestsService.approveSolicitudSalida — aislamiento cross-project', () => {
  it('no permite aprobar una solicitud perteneciente a otro proyecto', async () => {
    const PROYECTO_A = 10;
    const PROYECTO_B = 20;
    const SOLICITUD_DE_B = 55;
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockImplementation(async ({ where }: any) =>
      where.idProyecto === PROYECTO_A
        ? { idProyecto: PROYECTO_A, creadoPor: LIDER_ID, tituloProyecto: 'Proyecto A' }
        : null,
    );
    // La solicitud 55 pertenece al Proyecto B: el filtro compuesto
    // { idSolicitud, idProyecto } no debe encontrarla al resolver bajo A.
    prisma.solicitudSalidaProyecto.findFirst.mockImplementation(async ({ where }: any) =>
      where.idProyecto === PROYECTO_B && where.idSolicitud === SOLICITUD_DE_B
        ? { ...SOLICITUD_PENDIENTE, idSolicitud: SOLICITUD_DE_B, idProyecto: PROYECTO_B }
        : null,
    );
    const notifyFromTemplate = vi.fn();
    const service = makeService(prisma, { notifyFromTemplate });

    await expect(
      service.approveSolicitudSalida(PROYECTO_A, SOLICITUD_DE_B, LIDER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.solicitudSalidaProyecto.update).not.toHaveBeenCalled();
    expect(prisma.participacionProyecto.updateMany).not.toHaveBeenCalled();
    expect(notifyFromTemplate).not.toHaveBeenCalled();
  });
});

describe('ExitRequestsService.rejectSolicitudSalida', () => {
  // Caso E — el rechazo nunca se bloquea por tareas pendientes
  it('rechaza la solicitud sin consultar tareas ni tocar la participación, aunque el integrante tenga tareas activas', async () => {
    const prisma = makePrisma();
    setupResolutionPath(prisma);
    prisma.solicitudSalidaProyecto.update.mockResolvedValue({
      ...SOLICITUD_PENDIENTE,
      estadoSolicitud: 'RECHAZADA',
    });
    const service = makeService(prisma);

    const resultado = await service.rejectSolicitudSalida(PROYECTO_ID, SOLICITUD_ID, LIDER_ID);

    expect(resultado.estadoSolicitud).toBe('RECHAZADA');
    expect(prisma.asignacionTarea.count).not.toHaveBeenCalled();
    expect(prisma.participacionProyecto.updateMany).not.toHaveBeenCalled();
    expect(prisma.solicitudSalidaProyecto.update).toHaveBeenCalledWith({
      where: { idSolicitud: SOLICITUD_ID },
      data: { estadoSolicitud: 'RECHAZADA', resueltaEn: expect.any(Date), resueltaPor: LIDER_ID },
    });
  });

  it('rechaza con ForbiddenException a quien no es el líder', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: 999 });
    const service = makeService(prisma);

    await expect(
      service.rejectSolicitudSalida(PROYECTO_ID, SOLICITUD_ID, LIDER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.solicitudSalidaProyecto.findFirst).not.toHaveBeenCalled();
  });

  it('rechaza con NotFoundException si la solicitud no existe', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    prisma.solicitudSalidaProyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);

    await expect(
      service.rejectSolicitudSalida(PROYECTO_ID, 999, LIDER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['PREPARACION', 'RECHAZADA'] as const)(
    'rechaza con BadRequestException si la solicitud está en %s',
    async (estadoSolicitud) => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    prisma.solicitudSalidaProyecto.findFirst.mockResolvedValue({
      ...SOLICITUD_PENDIENTE,
      estadoSolicitud,
    });
    const service = makeService(prisma);

    await expect(
      service.rejectSolicitudSalida(PROYECTO_ID, SOLICITUD_ID, LIDER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.solicitudSalidaProyecto.update).not.toHaveBeenCalled();
    },
  );

  // Request changes, punto 13 — notificación al rechazar
  it('notifica al solicitante cuando el líder rechaza la solicitud, sin retirar participaciones ni tocar horas', async () => {
    const prisma = makePrisma();
    setupResolutionPath(prisma);
    prisma.solicitudSalidaProyecto.update.mockResolvedValue({
      ...SOLICITUD_PENDIENTE,
      estadoSolicitud: 'RECHAZADA',
    });
    const notifyFromTemplate = vi.fn();
    const service = makeService(prisma, { notifyFromTemplate });

    const resultado = await service.rejectSolicitudSalida(PROYECTO_ID, SOLICITUD_ID, LIDER_ID);

    expect(resultado.estadoSolicitud).toBe('RECHAZADA');
    expect(notifyFromTemplate).toHaveBeenCalledTimes(1);
    // Destinatario exacto = el solicitante; misma semántica reutilizada
    // (PARTICIPACION_ACTUALIZADA) que la aprobación, pero con approved: false.
    expect(notifyFromTemplate).toHaveBeenCalledWith(
      [MIEMBRO_ID],
      'PARTICIPACION_ACTUALIZADA',
      { projectTitle: PROYECTO_TITULO, projectId: PROYECTO_ID, approved: false },
      prisma,
    );
    const [destinatarios] = notifyFromTemplate.mock.calls[0];
    expect(destinatarios).not.toContain(LIDER_ID);

    expect(prisma.participacionProyecto.updateMany).not.toHaveBeenCalled();
    for (const metodo of ['create', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'] as const) {
      expect(prisma.horasParticipacion[metodo]).not.toHaveBeenCalled();
    }
  });
});
