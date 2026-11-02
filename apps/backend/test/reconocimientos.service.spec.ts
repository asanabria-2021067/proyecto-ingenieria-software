import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReconocimientosService } from '../src/seguimiento/reconocimientos.service';
import { INSIGNIAS_EVENTO } from '../src/insignias/insignias.catalog';
import { CrearReconocimientoDto } from '../src/seguimiento/dto/seguimiento.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { SprintsContextService } from '../src/sprints/sprints-context.service';

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
