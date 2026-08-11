import { ForbiddenException, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ProjectsService } from '../src/projects/projects.service';

/**
 * Tarea 5: el índice parcial `solicitud_salida_proyecto_pendiente_unique` (a
 * lo sumo una fila PENDIENTE por (id_proyecto, id_usuario)) puede rechazar
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
  return {
    proyecto: { findFirst: vi.fn() },
    participacionProyecto: { findFirst: vi.fn(), ...writeSpies() },
    asignacionTarea: { findFirst: vi.fn(), ...writeSpies() },
    horasParticipacion: { ...writeSpies() },
    tarea: { ...writeSpies() },
    solicitudSalidaProyecto: { findFirst: vi.fn(), create: vi.fn() },
  } as any;
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new ProjectsService(
    prisma,
    { isAdmin: vi.fn(), notifyAdminsFromTemplate: vi.fn(), notifyFromTemplate: vi.fn() } as any,
    {} as any,
  );
}

const LIDER_ID = 1;
const MIEMBRO_ID = 2;
const PROYECTO_ID = 10;

const SOLICITUD_CREADA = {
  idSolicitud: 500,
  idProyecto: PROYECTO_ID,
  idUsuario: MIEMBRO_ID,
  motivo: 'Cambio de disponibilidad de horario',
  estadoSolicitud: 'PENDIENTE',
  solicitadaEn: new Date('2026-01-10T00:00:00.000Z'),
  resueltaEn: null,
  resueltaPor: null,
};

// Deja el prisma mock listo para el camino feliz completo (Caso 1); cada
// test sobreescribe únicamente lo que necesita variar.
function setupHappyPath(prisma: ReturnType<typeof makePrisma>) {
  prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
  prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 77 });
  prisma.asignacionTarea.findFirst.mockResolvedValue(null);
  prisma.solicitudSalidaProyecto.findFirst.mockResolvedValue(null);
  prisma.solicitudSalidaProyecto.create.mockResolvedValue(SOLICITUD_CREADA);
}

describe('ProjectsService.createSolicitudSalida', () => {
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

  // Caso 5 — cero asignaciones permite crear
  it('permite crear cuando asignacionTarea.findFirst no encuentra asignación vigente, y consulta con los filtros correctos', async () => {
    const prisma = makePrisma();
    setupHappyPath(prisma);
    const service = makeService(prisma);

    await service.createSolicitudSalida(PROYECTO_ID, MIEMBRO_ID, 'motivo válido');

    expect(prisma.asignacionTarea.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idUsuario: MIEMBRO_ID, desasignadaEn: null, tarea: { idProyecto: PROYECTO_ID } },
      }),
    );
    expect(prisma.solicitudSalidaProyecto.create).toHaveBeenCalledTimes(1);
  });

  // Caso 6 — asignación vigente bloquea
  it('rechaza con ConflictException cuando el usuario tiene una asignación de tarea vigente en el proyecto', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 77 });
    prisma.asignacionTarea.findFirst.mockResolvedValue({ idAsignacion: 900 });
    const service = makeService(prisma);

    await expect(
      service.createSolicitudSalida(PROYECTO_ID, MIEMBRO_ID, 'motivo válido'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.solicitudSalidaProyecto.findFirst).not.toHaveBeenCalled();
    expect(prisma.solicitudSalidaProyecto.create).not.toHaveBeenCalled();
  });

  // Caso 7 — la solicitud nace PENDIENTE (delegado a los defaults de Prisma)
  it('crea con idProyecto/idUsuario/motivo recortado únicamente, sin fijar estadoSolicitud/resueltaEn/resueltaPor, y conserva PENDIENTE en el resultado', async () => {
    const prisma = makePrisma();
    setupHappyPath(prisma);
    const service = makeService(prisma);

    const resultado = await service.createSolicitudSalida(PROYECTO_ID, MIEMBRO_ID, '  motivo con espacios  ');

    expect(prisma.solicitudSalidaProyecto.create).toHaveBeenCalledWith({
      data: { idProyecto: PROYECTO_ID, idUsuario: MIEMBRO_ID, motivo: 'motivo con espacios' },
    });
    const dataEnviada = prisma.solicitudSalidaProyecto.create.mock.calls[0][0].data;
    expect(dataEnviada).not.toHaveProperty('estadoSolicitud');
    expect(dataEnviada).not.toHaveProperty('resueltaEn');
    expect(dataEnviada).not.toHaveProperty('resueltaPor');
    expect(resultado.estadoSolicitud).toBe('PENDIENTE');
  });

  // Caso 8 — segunda PENDIENTE rechazada (precheck)
  it('rechaza con ConflictException cuando ya existe una solicitud PENDIENTE para (idProyecto, idUsuario)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 77 });
    prisma.asignacionTarea.findFirst.mockResolvedValue(null);
    prisma.solicitudSalidaProyecto.findFirst.mockResolvedValue({ idSolicitud: 321 });
    const service = makeService(prisma);

    await expect(
      service.createSolicitudSalida(PROYECTO_ID, MIEMBRO_ID, 'motivo válido'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.solicitudSalidaProyecto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idProyecto: PROYECTO_ID, idUsuario: MIEMBRO_ID, estadoSolicitud: 'PENDIENTE' },
      }),
    );
    expect(prisma.solicitudSalidaProyecto.create).not.toHaveBeenCalled();
  });

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
    expect(prisma.asignacionTarea.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idUsuario: MIEMBRO_ID, desasignadaEn: null, tarea: { idProyecto: PROYECTO_ID } },
      }),
    );
    expect(prisma.solicitudSalidaProyecto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idProyecto: PROYECTO_ID, idUsuario: MIEMBRO_ID, estadoSolicitud: 'PENDIENTE' },
      }),
    );
    expect(prisma.solicitudSalidaProyecto.create).toHaveBeenCalledWith({
      data: { idProyecto: PROYECTO_ID, idUsuario: MIEMBRO_ID, motivo: 'motivo válido' },
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
    prisma.asignacionTarea.findFirst.mockResolvedValue(null);
    prisma.solicitudSalidaProyecto.findFirst.mockResolvedValue(null);
    prisma.solicitudSalidaProyecto.create.mockResolvedValue({ ...SOLICITUD_CREADA, idProyecto: PROYECTO_B });
    await service.createSolicitudSalida(PROYECTO_B, MIEMBRO_ID, 'motivo válido');
    expect(prisma.solicitudSalidaProyecto.create).toHaveBeenCalledWith({
      data: { idProyecto: PROYECTO_B, idUsuario: MIEMBRO_ID, motivo: 'motivo válido' },
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
