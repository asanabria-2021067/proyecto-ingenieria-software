import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventsService } from '../src/events/events.service';
import { PrismaService } from '../src/prisma/prisma.service';

const LEADER_ID = 1;
const PARTICIPANT_ID = 2;
const EXTERNO_ID = 99;
const PROJECT_ID = 5;
const EVENT_ID = 10;

function makePrisma() {
  const prisma = {
    proyecto: { findFirst: vi.fn(), findMany: vi.fn() },
    participacionProyecto: { findFirst: vi.fn(), findMany: vi.fn() },
    eventoProyecto: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  return prisma as typeof prisma & PrismaService;
}

function proyectoActivo(overrides: Record<string, unknown> = {}) {
  return { idProyecto: PROJECT_ID, creadoPor: LEADER_ID, estadoProyecto: 'EN_PROGRESO', ...overrides };
}

function dto(overrides: Record<string, unknown> = {}) {
  return {
    tituloEvento: 'Reunión de avance',
    fechaInicio: '2026-10-01T14:00:00.000Z',
    fechaFin: '2026-10-01T15:00:00.000Z',
    ...overrides,
  };
}

describe('EventsService — creación (T-263)', () => {
  it('el líder puede crear un evento', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.eventoProyecto.create.mockResolvedValue({ idEvento: EVENT_ID, ...dto() });
    const service = new EventsService(prisma);

    const resultado = await service.create(PROJECT_ID, LEADER_ID, dto());

    expect(resultado.idEvento).toBe(EVENT_ID);
    expect(prisma.eventoProyecto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ idProyecto: PROJECT_ID, idCreador: LEADER_ID, antelacionMinutos: 60 }),
      }),
    );
  });

  it('un participante activo no líder recibe 403, sin llegar a crear', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    const service = new EventsService(prisma);

    await expect(service.create(PROJECT_ID, PARTICIPANT_ID, dto())).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.eventoProyecto.create).not.toHaveBeenCalled();
  });

  it('un externo recibe 403', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    const service = new EventsService(prisma);

    await expect(service.create(PROJECT_ID, EXTERNO_ID, dto())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('proyecto inexistente/eliminado produce 404', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = new EventsService(prisma);

    await expect(service.create(PROJECT_ID, LEADER_ID, dto())).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.eventoProyecto.create).not.toHaveBeenCalled();
  });

  it('proyecto CERRADO produce 409, sin crear', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo({ estadoProyecto: 'CERRADO' }));
    const service = new EventsService(prisma);

    await expect(service.create(PROJECT_ID, LEADER_ID, dto())).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.eventoProyecto.create).not.toHaveBeenCalled();
  });

  it('fechaFin <= fechaInicio produce 400 con mensaje legible, sin crear', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    const service = new EventsService(prisma);

    await expect(
      service.create(PROJECT_ID, LEADER_ID, dto({ fechaInicio: '2026-10-01T15:00:00.000Z', fechaFin: '2026-10-01T14:00:00.000Z' })),
    ).rejects.toThrow(new BadRequestException('La fecha y hora de fin debe ser posterior a la fecha y hora de inicio'));
    expect(prisma.eventoProyecto.create).not.toHaveBeenCalled();
  });

  it('fechaFin == fechaInicio también produce 400', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    const service = new EventsService(prisma);

    await expect(
      service.create(PROJECT_ID, LEADER_ID, dto({ fechaInicio: '2026-10-01T14:00:00.000Z', fechaFin: '2026-10-01T14:00:00.000Z' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('EventsService — listado (GET)', () => {
  it('el líder puede listar', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.eventoProyecto.findMany.mockResolvedValue([]);
    const service = new EventsService(prisma);

    await expect(service.findAllForProject(PROJECT_ID, LEADER_ID)).resolves.toEqual([]);
  });

  it('un participante activo puede listar', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
    prisma.eventoProyecto.findMany.mockResolvedValue([]);
    const service = new EventsService(prisma);

    await expect(service.findAllForProject(PROJECT_ID, PARTICIPANT_ID)).resolves.toEqual([]);
  });

  it('un integrante de otro proyecto recibe 403 (no ve eventos ajenos)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.participacionProyecto.findFirst.mockResolvedValue(null);
    const service = new EventsService(prisma);

    await expect(service.findAllForProject(PROJECT_ID, PARTICIPANT_ID)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.eventoProyecto.findMany).not.toHaveBeenCalled();
  });

  it('solo trae eventos no cancelados del proyecto, ordenados por fechaInicio', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.eventoProyecto.findMany.mockResolvedValue([]);
    const service = new EventsService(prisma);

    await service.findAllForProject(PROJECT_ID, LEADER_ID);

    expect(prisma.eventoProyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idProyecto: PROJECT_ID, eliminadoEn: null },
        orderBy: { fechaInicio: 'asc' },
      }),
    );
  });
});

describe('EventsService — edición (PATCH, T-263/T-265)', () => {
  function eventoActual(overrides: Record<string, unknown> = {}) {
    return {
      idEvento: EVENT_ID,
      idProyecto: PROJECT_ID,
      tituloEvento: 'Reunión',
      descripcionEvento: null,
      fechaInicio: new Date('2026-10-01T14:00:00.000Z'),
      fechaFin: new Date('2026-10-01T15:00:00.000Z'),
      antelacionMinutos: 60,
      ...overrides,
    };
  }

  it('el líder puede editar el título sin tocar fechas', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.eventoProyecto.findFirst.mockResolvedValue(eventoActual());
    prisma.eventoProyecto.update.mockResolvedValue({ ...eventoActual(), tituloEvento: 'Reunión final' });
    const service = new EventsService(prisma);

    await service.update(PROJECT_ID, EVENT_ID, LEADER_ID, { tituloEvento: 'Reunión final' });

    expect(prisma.eventoProyecto.update).toHaveBeenCalledWith({
      where: { idEvento: EVENT_ID },
      data: expect.objectContaining({ tituloEvento: 'Reunión final' }),
      select: expect.any(Object),
    });
    const data = prisma.eventoProyecto.update.mock.calls[0][0].data;
    expect(data.recordatorioEnviadoEn).toBeUndefined();
  });

  it('editar el título mandando la misma fechaInicio (como hace el diálogo real) no resetea recordatorioEnviadoEn', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.eventoProyecto.findFirst.mockResolvedValue(eventoActual());
    prisma.eventoProyecto.update.mockResolvedValue(eventoActual());
    const service = new EventsService(prisma);

    await service.update(PROJECT_ID, EVENT_ID, LEADER_ID, {
      tituloEvento: 'Reunión final',
      fechaInicio: eventoActual().fechaInicio.toISOString(),
      fechaFin: eventoActual().fechaFin.toISOString(),
      antelacionMinutos: 60,
    });

    const data = prisma.eventoProyecto.update.mock.calls[0][0].data;
    expect(data.recordatorioEnviadoEn).toBeUndefined();
  });

  it('mover fechaInicio a un valor distinto resetea recordatorioEnviadoEn a null (recalcular, no reenviar el viejo)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.eventoProyecto.findFirst.mockResolvedValue(eventoActual());
    prisma.eventoProyecto.update.mockResolvedValue(eventoActual());
    const service = new EventsService(prisma);

    await service.update(PROJECT_ID, EVENT_ID, LEADER_ID, { fechaInicio: '2026-10-01T13:00:00.000Z' });

    const data = prisma.eventoProyecto.update.mock.calls[0][0].data;
    expect(data.recordatorioEnviadoEn).toBeNull();
    expect(data.fechaInicio).toEqual(new Date('2026-10-01T13:00:00.000Z'));
  });

  it('nueva fechaInicio posterior a la fechaFin existente produce 400', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.eventoProyecto.findFirst.mockResolvedValue(eventoActual());
    const service = new EventsService(prisma);

    await expect(
      service.update(PROJECT_ID, EVENT_ID, LEADER_ID, { fechaInicio: '2026-10-01T16:00:00.000Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.eventoProyecto.update).not.toHaveBeenCalled();
  });

  it('un participante no líder recibe 403, sin llegar a leer el evento', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    const service = new EventsService(prisma);

    await expect(
      service.update(PROJECT_ID, EVENT_ID, PARTICIPANT_ID, { tituloEvento: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.eventoProyecto.findFirst).not.toHaveBeenCalled();
  });

  it('evento inexistente/de otro proyecto produce 404', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.eventoProyecto.findFirst.mockResolvedValue(null);
    const service = new EventsService(prisma);

    await expect(
      service.update(PROJECT_ID, EVENT_ID, LEADER_ID, { tituloEvento: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('EventsService — cancelación (DELETE, T-265)', () => {
  it('el líder cancela (soft delete): setea eliminadoEn, no borra la fila', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.eventoProyecto.findFirst.mockResolvedValue({ idEvento: EVENT_ID, idProyecto: PROJECT_ID });
    prisma.eventoProyecto.update.mockResolvedValue({});
    const service = new EventsService(prisma);

    await service.remove(PROJECT_ID, EVENT_ID, LEADER_ID);

    expect(prisma.eventoProyecto.update).toHaveBeenCalledWith({
      where: { idEvento: EVENT_ID },
      data: { eliminadoEn: expect.any(Date) },
    });
  });

  it('un participante no líder recibe 403', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    const service = new EventsService(prisma);

    await expect(service.remove(PROJECT_ID, EVENT_ID, PARTICIPANT_ID)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.eventoProyecto.update).not.toHaveBeenCalled();
  });

  it('evento ya cancelado (findFirst con eliminadoEn: null no lo encuentra) produce 404', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.eventoProyecto.findFirst.mockResolvedValue(null);
    const service = new EventsService(prisma);

    await expect(service.remove(PROJECT_ID, EVENT_ID, LEADER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('EventsService — rango global (GET /usuarios/me/eventos, T-264)', () => {
  it('sin proyectos (ni líder ni participante) devuelve [] sin consultar eventos', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findMany.mockResolvedValue([]);
    const service = new EventsService(prisma);

    await expect(service.findForUserInRange(EXTERNO_ID, '2026-10-01', '2026-10-31')).resolves.toEqual([]);
    expect(prisma.eventoProyecto.findMany).not.toHaveBeenCalled();
  });

  it('filtra por los proyectos donde el usuario es líder o participante activo, y por solapamiento de rango', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findMany.mockResolvedValue([{ idProyecto: PROJECT_ID }]);
    prisma.eventoProyecto.findMany.mockResolvedValue([]);
    const service = new EventsService(prisma);

    await service.findForUserInRange(LEADER_ID, '2026-10-01T00:00:00.000Z', '2026-10-31T23:59:59.000Z');

    expect(prisma.eventoProyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          idProyecto: { in: [PROJECT_ID] },
          eliminadoEn: null,
        }),
      }),
    );
  });
});
