import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReconocimientosService } from '../src/seguimiento/reconocimientos.service';
import { RetrospectivaService } from '../src/seguimiento/retrospectiva.service';
import { INSIGNIAS_EVENTO } from '../src/insignias/insignias.catalog';
import { TipoEventoBitacora } from '../src/bitacora/tipos-evento-bitacora';
import { CrearReconocimientoDto, GuardarRetrospectivaDto } from '../src/seguimiento/dto/seguimiento.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { SprintsContextService } from '../src/sprints/sprints-context.service';
import type { BitacoraEventosService } from '../src/bitacora/bitacora-eventos.service';

const LIDER = 1;
const AUTOR = 2;
const RECEPTOR = 3;

function buildReconocimientos(estadoSprint = 'ACTIVO') {
  const prisma = {
    participacionProyecto: { findFirst: vi.fn().mockResolvedValue({ idParticipacion: 1 }) },
    reconocimientoCompanero: {
      create: vi.fn().mockResolvedValue({ idReconocimiento: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    usuario: { findUnique: vi.fn().mockResolvedValue({ nombre: 'Ana', apellido: 'Paz' }) },
  };
  const sprintsContext = {
    assertActiveProjectParticipant: vi.fn().mockResolvedValue(undefined),
    getProjectOrThrow: vi.fn().mockResolvedValue({ creadoPor: LIDER, tituloProyecto: 'Feria' }),
    getSprintInProjectOrThrow: vi.fn().mockResolvedValue({ idSprint: 8, numero: 2, estado: estadoSprint }),
  };
  const notifications = { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) };
  const events = { emit: vi.fn() };
  const service = new ReconocimientosService(
    prisma as unknown as PrismaService,
    sprintsContext as unknown as SprintsContextService,
    notifications as unknown as NotificationsService,
    events as never,
  );
  return { prisma, sprintsContext, notifications, events, service };
}

describe('ReconocimientosService (MEJ-57)', () => {
  it('guarda el reconocimiento, avisa al receptor y recalcula su insignia', async () => {
    const { prisma, notifications, events, service } = buildReconocimientos();
    await service.crear(5, 8, AUTOR, { idReceptor: RECEPTOR, mensaje: 'Gran apoyo' });
    expect(prisma.reconocimientoCompanero.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { idSprint: 8, idProyecto: 5, idAutor: AUTOR, idReceptor: RECEPTOR, mensaje: 'Gran apoyo' } }),
    );
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([RECEPTOR], 'RECONOCIMIENTO_RECIBIDO', {
      autorNombre: 'Ana Paz',
      projectTitle: 'Feria',
      projectId: 5,
      sprintNumero: 2,
    });
    expect(events.emit).toHaveBeenCalledWith(INSIGNIAS_EVENTO, { claves: ['companerismo'], idUsuarios: [RECEPTOR] });
  });

  it('el líder también puede ser reconocido aunque no tenga participación', async () => {
    const { prisma, service } = buildReconocimientos();
    prisma.participacionProyecto.findFirst.mockResolvedValue(null);
    await expect(service.crear(5, 8, AUTOR, { idReceptor: LIDER, mensaje: 'Buen liderazgo' })).resolves.toBeDefined();
  });

  it('rechaza reconocerse a uno mismo', async () => {
    const { prisma, service } = buildReconocimientos();
    await expect(service.crear(5, 8, AUTOR, { idReceptor: AUTOR, mensaje: 'Yo' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.reconocimientoCompanero.create).not.toHaveBeenCalled();
  });

  it('rechaza reconocer a alguien que no es del proyecto', async () => {
    const { prisma, service } = buildReconocimientos();
    prisma.participacionProyecto.findFirst.mockResolvedValue(null);
    await expect(service.crear(5, 8, AUTOR, { idReceptor: 77, mensaje: 'Ajeno' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.reconocimientoCompanero.create).not.toHaveBeenCalled();
  });

  it('rechaza reconocer en un sprint cerrado', async () => {
    const { service } = buildReconocimientos('CERRADO');
    await expect(service.crear(5, 8, AUTOR, { idReceptor: RECEPTOR, mensaje: 'Tarde' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('quien no es integrante activo recibe 403 y no se crea nada', async () => {
    const { prisma, sprintsContext, service } = buildReconocimientos();
    sprintsContext.assertActiveProjectParticipant.mockRejectedValue(new ForbiddenException('No participas'));
    await expect(service.crear(5, 8, 55, { idReceptor: RECEPTOR, mensaje: 'Intruso' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.reconocimientoCompanero.create).not.toHaveBeenCalled();
  });

  it('un segundo reconocimiento en el mismo sprint responde 409 sin avisar ni recalcular', async () => {
    const { prisma, notifications, events, service } = buildReconocimientos();
    prisma.reconocimientoCompanero.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(service.crear(5, 8, AUTOR, { idReceptor: RECEPTOR, mensaje: 'Otro más' })).rejects.toBeInstanceOf(ConflictException);
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('listar indica si el actor ya dio su reconocimiento', async () => {
    const { prisma, service } = buildReconocimientos();
    prisma.reconocimientoCompanero.findMany.mockResolvedValue([
      { idReconocimiento: 1, mensaje: 'x', creadoEn: new Date(), autor: { idUsuario: AUTOR }, receptor: { idUsuario: RECEPTOR } },
    ]);
    expect((await service.listar(5, 8, AUTOR)).yaReconoci).toBe(true);
    expect((await service.listar(5, 8, RECEPTOR)).yaReconoci).toBe(false);
  });

  it('el DTO exige receptor entero y mensaje de 3 a 280 caracteres', async () => {
    const valido = plainToInstance(CrearReconocimientoDto, { idReceptor: 3, mensaje: '  Gracias  ' });
    expect(await validate(valido)).toEqual([]);
    expect(valido.mensaje).toBe('Gracias');
    expect(await validate(plainToInstance(CrearReconocimientoDto, { idReceptor: '3', mensaje: 'ok!' }))).not.toEqual([]);
    expect(await validate(plainToInstance(CrearReconocimientoDto, { idReceptor: 3, mensaje: 'ab' }))).not.toEqual([]);
    expect(await validate(plainToInstance(CrearReconocimientoDto, { idReceptor: 3, mensaje: 'a'.repeat(281) }))).not.toEqual([]);
  });
});

function buildRetro(estadoSprint = 'EN_FINALIZACION', estadoProyecto = 'EN_PROGRESO') {
  const tx = {
    retrospectivaSprint: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(({ create }: { create: object }) => Promise.resolve(create)),
    },
  };
  const prisma = {
    retrospectivaSprint: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const sprintsContext = {
    assertActiveProjectParticipant: vi.fn().mockResolvedValue(undefined),
    assertProjectLeader: vi.fn().mockResolvedValue(undefined),
    getProjectOrThrow: vi.fn().mockResolvedValue({ estadoProyecto }),
    getSprintInProjectOrThrow: vi.fn().mockResolvedValue({ idSprint: 8, numero: 2, estado: estadoSprint }),
  };
  const bitacora = { registrarEvento: vi.fn().mockResolvedValue(undefined) };
  const service = new RetrospectivaService(
    prisma as unknown as PrismaService,
    sprintsContext as unknown as SprintsContextService,
    bitacora as unknown as BitacoraEventosService,
  );
  return { prisma, tx, sprintsContext, bitacora, service };
}

const RETRO = { quePaso: 'Se entregó la demo', quePodriaMejorar: 'Estimar mejor', acuerdos: 'Revisión diaria' };

describe('RetrospectivaService (MEJ-24)', () => {
  it('guarda la retrospectiva y deja el evento en la bitácora con el mismo tx', async () => {
    const { tx, bitacora, service } = buildRetro();
    await service.guardar(5, 8, LIDER, RETRO);
    expect(tx.retrospectivaSprint.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { idSprint: 8, idProyecto: 5, creadaPor: LIDER, ...RETRO } }),
    );
    expect(bitacora.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        tipoEvento: TipoEventoBitacora.SPRINT_RETROSPECTIVE_SAVED,
        idActor: LIDER,
        idProyecto: 5,
        idSprint: 8,
        tipoEntidad: 'SPRINT',
        idEntidad: 8,
        valorAnterior: null,
      }),
    );
  });

  it('al editar una existente lo marca como edición', async () => {
    const { tx, bitacora, service } = buildRetro('CERRADO');
    tx.retrospectivaSprint.findUnique.mockResolvedValue({ ...RETRO });
    await service.guardar(5, 8, LIDER, RETRO);
    expect(bitacora.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({ valorAnterior: { editada: true } }));
  });

  it('solo el líder escribe', async () => {
    const { tx, sprintsContext, service } = buildRetro();
    sprintsContext.assertProjectLeader.mockRejectedValue(new ForbiddenException('No eres el líder'));
    await expect(service.guardar(5, 8, AUTOR, RETRO)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.retrospectivaSprint.upsert).not.toHaveBeenCalled();
  });

  it('no se escribe mientras el sprint sigue activo ni con el proyecto cerrado', async () => {
    await expect(buildRetro('ACTIVO').service.guardar(5, 8, LIDER, RETRO)).rejects.toBeInstanceOf(BadRequestException);
    await expect(buildRetro('CERRADO', 'CERRADO').service.guardar(5, 8, LIDER, RETRO)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cualquier integrante activo la lee y es null mientras no exista', async () => {
    const { prisma, sprintsContext, service } = buildRetro();
    await expect(service.obtener(5, 8, AUTOR)).resolves.toBeNull();
    prisma.retrospectivaSprint.findUnique.mockResolvedValue(RETRO);
    await expect(service.obtener(5, 8, AUTOR)).resolves.toEqual(RETRO);
    sprintsContext.assertActiveProjectParticipant.mockRejectedValue(new ForbiddenException('No participas'));
    await expect(service.obtener(5, 8, 55)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el DTO exige los tres campos de 3 a 1000 caracteres', async () => {
    expect(await validate(plainToInstance(GuardarRetrospectivaDto, RETRO))).toEqual([]);
    expect(await validate(plainToInstance(GuardarRetrospectivaDto, { ...RETRO, acuerdos: '' }))).not.toEqual([]);
    expect(await validate(plainToInstance(GuardarRetrospectivaDto, { ...RETRO, quePaso: 'a'.repeat(1001) }))).not.toEqual([]);
    expect(await validate(plainToInstance(GuardarRetrospectivaDto, { quePaso: 'abc' }))).not.toEqual([]);
  });
});
