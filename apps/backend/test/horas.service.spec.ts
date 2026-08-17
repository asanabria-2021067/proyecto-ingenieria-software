import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { HorasService } from '../src/horas/horas.service';
import { CerrarParticipacionDto } from '../src/horas/dto/cerrar-participacion.dto';

const LEADER_ID = 1;
const MEMBER_ID = 2;
const OUTSIDER_ID = 99;
const PROJECT_A_ID = 10;
const PROJECT_B_ID = 20;
const PARTICIPACION_ID = 100;

function proyecto(overrides: Record<string, unknown> = {}) {
  return { idProyecto: PROJECT_A_ID, creadoPor: LEADER_ID, tituloProyecto: 'Proyecto X', ...overrides };
}

function participacion(overrides: Record<string, unknown> = {}) {
  return {
    idParticipacion: PARTICIPACION_ID,
    idUsuario: MEMBER_ID,
    idRolProyecto: 1,
    estadoParticipacion: 'ACTIVO',
    usuario: { nombre: 'Ana', apellido: 'Lopez' },
    ...overrides,
  };
}

function makePrisma() {
  const prisma: any = {
    proyecto: { findFirst: vi.fn() },
    participacionProyecto: { findFirst: vi.fn(), update: vi.fn() },
    tarea: { findMany: vi.fn().mockResolvedValue([]) },
    horasParticipacion: { create: vi.fn() },
  };
  // Mismo patrón que roles.service.spec.ts: $transaction ejecuta el
  // callback directamente contra los mismos mocks.
  prisma.$transaction = vi.fn(async (fn: any) => fn(prisma));
  return prisma;
}

function makeNotifications() {
  return { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) };
}

function makeService() {
  const prisma = makePrisma();
  const notifications = makeNotifications();
  const service = new HorasService(prisma, notifications as any);
  return { service, prisma, notifications };
}

describe('HorasService.cerrarParticipacion — autorización', () => {
  it('el líder autorizado puede cerrar la participación', async () => {
    const { service, prisma } = makeService();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.participacionProyecto.findFirst.mockResolvedValue(participacion());
    prisma.tarea.findMany.mockResolvedValue([
      { idTarea: 1, tituloTarea: 'T1', tiempoEstimadoHoras: 5 },
    ]);
    prisma.horasParticipacion.create.mockResolvedValue({
      horasCalculadas: 5,
      justificacionAjuste: null,
    });

    const result = await service.cerrarParticipacion(PROJECT_A_ID, PARTICIPACION_ID, {}, LEADER_ID);

    expect(result.estadoParticipacion).toBe('COMPLETADO');
    expect(prisma.participacionProyecto.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estadoParticipacion: 'COMPLETADO' }) }),
    );
  });

  it('un no-líder es rechazado con 403', async () => {
    const { service, prisma } = makeService();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());

    await expect(
      service.cerrarParticipacion(PROJECT_A_ID, PARTICIPACION_ID, {}, MEMBER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un usuario externo sin relación con el proyecto es rechazado con 403', async () => {
    const { service, prisma } = makeService();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());

    await expect(
      service.cerrarParticipacion(PROJECT_A_ID, PARTICIPACION_ID, {}, OUTSIDER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('HorasService — aislamiento cross-project', () => {
  it('un recurso del Proyecto B no puede leerse usando el projectId del Proyecto A', async () => {
    const { service, prisma } = makeService();
    // El líder del proyecto A intenta cerrar una participación que en
    // realidad pertenece al proyecto B: el filtro rolProyecto.idProyecto
    // dentro de loadParticipacionInProjectOrThrow no encuentra nada.
    prisma.proyecto.findFirst.mockResolvedValue(proyecto({ idProyecto: PROJECT_A_ID, creadoPor: LEADER_ID }));
    prisma.participacionProyecto.findFirst.mockResolvedValue(null);

    await expect(
      service.cerrarParticipacion(PROJECT_A_ID, PARTICIPACION_ID, {}, LEADER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.participacionProyecto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          idParticipacion: PARTICIPACION_ID,
          rolProyecto: { idProyecto: PROJECT_A_ID },
        }),
      }),
    );
  });
});

describe('HorasService.cerrarParticipacion — ajuste de horas', () => {
  it('sin modificación: horasAprobadas = horasCalculadas, justificacionAjuste = null', async () => {
    const { service, prisma } = makeService();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.participacionProyecto.findFirst.mockResolvedValue(participacion());
    prisma.tarea.findMany.mockResolvedValue([
      { idTarea: 1, tituloTarea: 'T1', tiempoEstimadoHoras: 8 },
    ]);
    prisma.horasParticipacion.create.mockImplementation(({ data }: any) => data);

    await service.cerrarParticipacion(
      PROJECT_A_ID,
      PARTICIPACION_ID,
      { horasReconocidas: 8 },
      LEADER_ID,
    );

    expect(prisma.horasParticipacion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ horasAprobadas: 8, justificacionAjuste: null }),
      }),
    );
  });

  it('ajuste válido con justificación se persiste', async () => {
    const { service, prisma } = makeService();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.participacionProyecto.findFirst.mockResolvedValue(participacion());
    prisma.tarea.findMany.mockResolvedValue([
      { idTarea: 1, tituloTarea: 'T1', tiempoEstimadoHoras: 8 },
    ]);
    prisma.horasParticipacion.create.mockImplementation(({ data }: any) => data);

    await service.cerrarParticipacion(
      PROJECT_A_ID,
      PARTICIPACION_ID,
      { horasReconocidas: 6, justificacion: 'Se descontaron horas por ausencia justificada' },
      LEADER_ID,
    );

    expect(prisma.horasParticipacion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          horasAprobadas: 6,
          justificacionAjuste: 'Se descontaron horas por ausencia justificada',
        }),
      }),
    );
  });

  it('ajuste diferente sin justificación es rechazado', async () => {
    const { service, prisma } = makeService();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.participacionProyecto.findFirst.mockResolvedValue(participacion());
    prisma.tarea.findMany.mockResolvedValue([
      { idTarea: 1, tituloTarea: 'T1', tiempoEstimadoHoras: 8 },
    ]);

    await expect(
      service.cerrarParticipacion(PROJECT_A_ID, PARTICIPACION_ID, { horasReconocidas: 6 }, LEADER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.horasParticipacion.create).not.toHaveBeenCalled();
  });

  it('justificación formada únicamente por espacios es rechazada (defensa en el service tras trim)', async () => {
    const { service, prisma } = makeService();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.participacionProyecto.findFirst.mockResolvedValue(participacion());
    prisma.tarea.findMany.mockResolvedValue([
      { idTarea: 1, tituloTarea: 'T1', tiempoEstimadoHoras: 8 },
    ]);

    await expect(
      service.cerrarParticipacion(
        PROJECT_A_ID,
        PARTICIPACION_ID,
        { horasReconocidas: 6, justificacion: '          ' },
        LEADER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.horasParticipacion.create).not.toHaveBeenCalled();
  });

  it('la comparación de decimales no dispara un ajuste falso por error de punto flotante', async () => {
    const { service, prisma } = makeService();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.participacionProyecto.findFirst.mockResolvedValue(participacion());
    // 1.1 + 2.2 en tareas separadas puede dar 3.3000000000000003 en JS puro.
    prisma.tarea.findMany.mockResolvedValue([
      { idTarea: 1, tituloTarea: 'T1', tiempoEstimadoHoras: 1.1 },
      { idTarea: 2, tituloTarea: 'T2', tiempoEstimadoHoras: 2.2 },
    ]);
    prisma.horasParticipacion.create.mockImplementation(({ data }: any) => data);

    await service.cerrarParticipacion(
      PROJECT_A_ID,
      PARTICIPACION_ID,
      { horasReconocidas: 3.3 },
      LEADER_ID,
    );

    expect(prisma.horasParticipacion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ justificacionAjuste: null }) }),
    );
  });
});

describe('CerrarParticipacionDto — validación de decimales (class-validator)', () => {
  it('rechaza horasReconocidas negativas', async () => {
    const dto = plainToInstance(CerrarParticipacionDto, { horasReconocidas: -1 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'horasReconocidas')).toBe(true);
  });

  it('rechaza más de 2 decimales', async () => {
    const dto = plainToInstance(CerrarParticipacionDto, { horasReconocidas: 1.234 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'horasReconocidas')).toBe(true);
  });

  it('acepta valores decimales válidos (hasta 2 posiciones)', async () => {
    const dto = plainToInstance(CerrarParticipacionDto, { horasReconocidas: 10.75 });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'horasReconocidas')).toHaveLength(0);
  });

  it('acepta 0 como valor válido', async () => {
    const dto = plainToInstance(CerrarParticipacionDto, { horasReconocidas: 0 });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'horasReconocidas')).toHaveLength(0);
  });
});

describe('HorasService.cerrarParticipacion — transacción SERIALIZABLE y reintento', () => {
  it('ejecuta la transacción bajo aislamiento SERIALIZABLE', async () => {
    const { service, prisma } = makeService();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.participacionProyecto.findFirst.mockResolvedValue(participacion());
    prisma.horasParticipacion.create.mockImplementation(({ data }: any) => data);

    await service.cerrarParticipacion(PROJECT_A_ID, PARTICIPACION_ID, {}, LEADER_ID);

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    );
  });

  it('reintenta ante P2034 hasta 3 veces y luego tiene éxito', async () => {
    const { service, prisma } = makeService();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.participacionProyecto.findFirst.mockResolvedValue(participacion());
    prisma.horasParticipacion.create.mockImplementation(({ data }: any) => data);

    const conflictError = new Prisma.PrismaClientKnownRequestError('write conflict', {
      code: 'P2034',
      clientVersion: '6.19.2',
    });

    let intento = 0;
    prisma.$transaction.mockImplementation(async (fn: any) => {
      intento += 1;
      if (intento < 3) throw conflictError;
      return fn(prisma);
    });

    const result = await service.cerrarParticipacion(PROJECT_A_ID, PARTICIPACION_ID, {}, LEADER_ID);

    expect(intento).toBe(3);
    expect(result.estadoParticipacion).toBe('COMPLETADO');
  });

  it('no reintenta errores de regla de negocio (BadRequestException)', async () => {
    const { service, prisma } = makeService();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto());
    prisma.participacionProyecto.findFirst.mockResolvedValue(
      participacion({ estadoParticipacion: 'COMPLETADO' }),
    );

    let intentos = 0;
    prisma.$transaction.mockImplementation(async (fn: any) => {
      intentos += 1;
      return fn(prisma);
    });

    await expect(
      service.cerrarParticipacion(PROJECT_A_ID, PARTICIPACION_ID, {}, LEADER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(intentos).toBe(1);
  });
});
