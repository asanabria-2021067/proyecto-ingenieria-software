import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  EVENT_SHARED_SELECT,
  EventsService,
  proyectarEventoCompartido,
  type EventoCompartidoFila,
} from '../src/events/events.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateEventDto } from '../src/events/dto/update-event.dto';
import { GetEventsRangeQueryDto, MAX_DIAS_RANGO_EVENTOS } from '../src/events/dto/get-events-range-query.dto';

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
    fechaInicio: '2030-10-01T14:00:00.000Z',
    fechaFin: '2030-10-01T15:00:00.000Z',
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
      service.create(PROJECT_ID, LEADER_ID, dto({ fechaInicio: '2030-10-01T15:00:00.000Z', fechaFin: '2030-10-01T14:00:00.000Z' })),
    ).rejects.toThrow(new BadRequestException('La fecha y hora de fin debe ser posterior a la fecha y hora de inicio'));
    expect(prisma.eventoProyecto.create).not.toHaveBeenCalled();
  });

  it('fechaFin == fechaInicio también produce 400', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    const service = new EventsService(prisma);

    await expect(
      service.create(PROJECT_ID, LEADER_ID, dto({ fechaInicio: '2030-10-01T14:00:00.000Z', fechaFin: '2030-10-01T14:00:00.000Z' })),
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
        where: expect.objectContaining({ idProyecto: PROJECT_ID, eliminadoEn: null }),
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
      fechaInicio: new Date('2030-10-01T14:00:00.000Z'),
      fechaFin: new Date('2030-10-01T15:00:00.000Z'),
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

    await service.update(PROJECT_ID, EVENT_ID, LEADER_ID, { fechaInicio: '2030-10-01T13:00:00.000Z' });

    const data = prisma.eventoProyecto.update.mock.calls[0][0].data;
    expect(data.recordatorioEnviadoEn).toBeNull();
    expect(data.fechaInicio).toEqual(new Date('2030-10-01T13:00:00.000Z'));
  });

  it('nueva fechaInicio posterior a la fechaFin existente produce 400', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.eventoProyecto.findFirst.mockResolvedValue(eventoActual());
    const service = new EventsService(prisma);

    await expect(
      service.update(PROJECT_ID, EVENT_ID, LEADER_ID, { fechaInicio: '2030-10-01T16:00:00.000Z' }),
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

describe('EventsService — tipo e invitados (HU-184)', () => {
  it('al crear guarda el tipo (OTRO por defecto) e invitados sin duplicados', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: PARTICIPANT_ID }]);
    prisma.eventoProyecto.create.mockResolvedValue({ idEvento: EVENT_ID });
    const service = new EventsService(prisma);

    await service.create(PROJECT_ID, LEADER_ID, dto({ tipoEvento: 'TUTORIA', invitados: [PARTICIPANT_ID, PARTICIPANT_ID, LEADER_ID] }));
    expect(prisma.eventoProyecto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tipoEvento: 'TUTORIA', invitados: [PARTICIPANT_ID, LEADER_ID] }),
      }),
    );

    await service.create(PROJECT_ID, LEADER_ID, dto());
    expect(prisma.eventoProyecto.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipoEvento: 'OTRO', invitados: [] }) }),
    );
  });

  it('invitar a alguien que no es integrante activo produce 400, sin crear', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: PARTICIPANT_ID }]);
    const service = new EventsService(prisma);

    await expect(
      service.create(PROJECT_ID, LEADER_ID, dto({ invitados: [PARTICIPANT_ID, EXTERNO_ID] })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.eventoProyecto.create).not.toHaveBeenCalled();
  });

  it('al editar valida y reemplaza los invitados, y cambia el tipo', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.eventoProyecto.findFirst.mockResolvedValue({
      idEvento: EVENT_ID,
      fechaInicio: new Date('2030-10-01T14:00:00.000Z'),
      fechaFin: new Date('2030-10-01T15:00:00.000Z'),
      // G04-C16 (clase B): la fila real siempre trae `invitados` (Int[] con default []); el
      // fixture lo omitía y ahora el servicio lo compara para saber si la audiencia crece.
      invitados: [],
    });
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: PARTICIPANT_ID }]);
    prisma.eventoProyecto.update.mockResolvedValue({ idEvento: EVENT_ID });
    const service = new EventsService(prisma);

    await service.update(PROJECT_ID, EVENT_ID, LEADER_ID, { tipoEvento: 'REVISION', invitados: [PARTICIPANT_ID] });
    expect(prisma.eventoProyecto.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipoEvento: 'REVISION', invitados: [PARTICIPANT_ID] }) }),
    );

    await expect(
      service.update(PROJECT_ID, EVENT_ID, LEADER_ID, { invitados: [EXTERNO_ID] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('EventsService — visibilidad por invitados (HU-184)', () => {
  const FILTRO_PARTICIPANTE = {
    OR: [{ invitados: { isEmpty: true } }, { invitados: { has: PARTICIPANT_ID } }, { proyecto: { creadoPor: PARTICIPANT_ID } }],
  };

  it('GET /usuarios/me/eventos solo trae eventos sin invitados, donde está invitado o que lidera', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findMany.mockResolvedValue([{ idProyecto: PROJECT_ID }]);
    prisma.eventoProyecto.findMany.mockResolvedValue([]);
    const service = new EventsService(prisma);

    await service.findForUserInRange(PARTICIPANT_ID, '2026-10-01T00:00:00.000Z', '2026-10-31T23:59:59.000Z');

    expect(prisma.eventoProyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(FILTRO_PARTICIPANTE) }),
    );
  });

  it('GET /proyectos/:id/eventos aplica el mismo filtro', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
    prisma.eventoProyecto.findMany.mockResolvedValue([]);
    const service = new EventsService(prisma);

    await service.findAllForProject(PROJECT_ID, PARTICIPANT_ID);

    expect(prisma.eventoProyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(FILTRO_PARTICIPANTE) }),
    );
  });
});

describe('EventsService — proyección de evento compartido (G01-C01, UI-01)', () => {
  // Una fila real puede traer columnas privadas; la proyección jamás las copia.
  const fila = {
    idEvento: EVENT_ID,
    idProyecto: PROJECT_ID,
    tituloEvento: 'Demo final',
    fechaInicio: new Date('2030-10-01T14:00:00.000Z'),
    fechaFin: new Date('2030-10-01T15:00:00.000Z'),
    tipoEvento: 'REUNION',
    modalidad: 'VIRTUAL',
    proyecto: { idProyecto: PROJECT_ID, tituloProyecto: 'Proyecto X' },
    descripcionEvento: 'SECRETO-descripcion',
    linkSesion: 'https://meet.example/SECRETO-link',
    ubicacionLat: 14.6,
    ubicacionLng: -90.5,
    ubicacionNombre: 'SECRETO-lugar',
    invitados: [PARTICIPANT_ID],
    rolesDestino: [3],
    antelacionMinutos: 60,
    idCreador: LEADER_ID,
    recordatorioEnviadoEn: null,
  } as unknown as EventoCompartidoFila;
  const PRIVADOS = ['SECRETO', 'invitados', 'rolesDestino', 'antelacionMinutos', 'idCreador', 'recordatorioEnviadoEn', 'ubicacion', 'linkSesion', 'descripcionEvento'];

  it('con detalle permitido devuelve exactamente las claves del contrato', () => {
    const evento = proyectarEventoCompartido(fila, true);
    expect(Object.keys(evento).sort()).toEqual(
      ['fechaFin', 'fechaInicio', 'idEvento', 'modalidad', 'proyecto', 'tipoEvento', 'tituloEvento', 'visibilidad'].sort(),
    );
    expect(evento.visibilidad).toBe('DETALLE');
    const json = JSON.stringify(evento);
    for (const privado of PRIVADOS) expect(json).not.toContain(privado);
    expect(json).toContain('Demo final');
    expect(json).toContain('Proyecto X');
  });

  it('sin detalle (OCUPADO) solo devuelve id, horario y visibilidad: sin título, tipo ni proyecto', () => {
    const evento = proyectarEventoCompartido(fila, false);
    expect(Object.keys(evento).sort()).toEqual(['fechaFin', 'fechaInicio', 'idEvento', 'visibilidad']);
    expect(evento.visibilidad).toBe('OCUPADO');
    const json = JSON.stringify(evento);
    expect(json).not.toContain('Demo final');
    expect(json).not.toContain('Proyecto X');
    for (const privado of PRIVADOS) expect(json).not.toContain(privado);
  });

  it('EVENT_SHARED_SELECT no pide ninguna columna privada', () => {
    for (const columna of ['descripcionEvento', 'linkSesion', 'ubicacionLat', 'ubicacionLng', 'ubicacionNombre', 'invitados', 'rolesDestino', 'antelacionMinutos', 'idCreador', 'recordatorioEnviadoEn']) {
      expect(EVENT_SHARED_SELECT).not.toHaveProperty(columna);
    }
  });

  it('el calendario personal (findForUserInRange) sigue pidiendo el contrato completo', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findMany.mockResolvedValue([{ idProyecto: PROJECT_ID }]);
    prisma.eventoProyecto.findMany.mockResolvedValue([]);
    const service = new EventsService(prisma);

    await service.findForUserInRange(LEADER_ID, '2026-10-01T00:00:00.000Z', '2026-10-31T23:59:59.000Z');

    expect(prisma.eventoProyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ descripcionEvento: true, linkSesion: true, invitados: true, ubicacionLat: true }),
      }),
    );
  });
});

describe('EventsService — agenda compartida con permisos del receptor (G01-C02, UI-01)', () => {
  const OWNER_ID = LEADER_ID;
  const VIEWER_ID = PARTICIPANT_ID;
  const PROYECTO_COMUN = PROJECT_ID;
  const PROYECTO_AJENO = 77;
  const RANGO = ['2026-10-01T00:00:00.000Z', '2026-10-31T23:59:59.000Z'] as const;

  function fila(overrides: Record<string, unknown> = {}) {
    return {
      idEvento: 1,
      idProyecto: PROYECTO_COMUN,
      tituloEvento: 'Reunión',
      fechaInicio: new Date('2026-10-05T14:00:00.000Z'),
      fechaFin: new Date('2026-10-05T15:00:00.000Z'),
      tipoEvento: 'REUNION',
      modalidad: 'VIRTUAL',
      proyecto: { idProyecto: PROYECTO_COMUN, tituloProyecto: 'Común' },
      ...overrides,
    };
  }

  it('filtra por los proyectos del propietario, pero la restricción de invitados se evalúa contra quien mira y sin bypass de líder', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findMany
      .mockResolvedValueOnce([{ idProyecto: PROYECTO_COMUN }, { idProyecto: PROYECTO_AJENO }]) // propietario
      .mockResolvedValueOnce([{ idProyecto: PROYECTO_COMUN }]); // receptor
    prisma.eventoProyecto.findMany.mockResolvedValue([]);
    const service = new EventsService(prisma);

    await service.findSharedInRange(OWNER_ID, VIEWER_ID, ...RANGO);

    const llamada = prisma.eventoProyecto.findMany.mock.calls[0][0];
    expect(llamada.where.idProyecto).toEqual({ in: [PROYECTO_COMUN, PROYECTO_AJENO] });
    expect(llamada.where.eliminadoEn).toBeNull();
    // Exactamente estas dos ramas: un evento restringido a otros invitados no aparece aunque el propietario lidere el proyecto.
    expect(llamada.where.OR).toEqual([{ invitados: { isEmpty: true } }, { invitados: { has: VIEWER_ID } }]);
    expect(JSON.stringify(llamada.where)).not.toContain('creadoPor');
    expect(llamada.select).toEqual(EVENT_SHARED_SELECT);
  });

  it('evento de un proyecto común devuelve detalle; evento público de un proyecto ajeno solo disponibilidad sin identidad', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findMany
      .mockResolvedValueOnce([{ idProyecto: PROYECTO_COMUN }, { idProyecto: PROYECTO_AJENO }])
      .mockResolvedValueOnce([{ idProyecto: PROYECTO_COMUN }]);
    prisma.eventoProyecto.findMany.mockResolvedValue([
      fila(),
      fila({ idEvento: 2, idProyecto: PROYECTO_AJENO, tituloEvento: 'SECRETO ajeno', proyecto: { idProyecto: PROYECTO_AJENO, tituloProyecto: 'SECRETO proyecto' } }),
    ]);
    const service = new EventsService(prisma);

    const resultado = await service.findSharedInRange(OWNER_ID, VIEWER_ID, ...RANGO);

    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toMatchObject({ idEvento: 1, visibilidad: 'DETALLE', tituloEvento: 'Reunión', proyecto: { idProyecto: PROYECTO_COMUN } });
    expect(resultado[1]).toEqual({
      idEvento: 2,
      fechaInicio: new Date('2026-10-05T14:00:00.000Z'),
      fechaFin: new Date('2026-10-05T15:00:00.000Z'),
      visibilidad: 'OCUPADO',
    });
    expect(JSON.stringify(resultado)).not.toContain('SECRETO');
  });

  it('propietario sin proyectos: lista vacía sin consultar eventos', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ idProyecto: PROYECTO_COMUN }]);
    const service = new EventsService(prisma);

    await expect(service.findSharedInRange(OWNER_ID, VIEWER_ID, ...RANGO)).resolves.toEqual([]);
    expect(prisma.eventoProyecto.findMany).not.toHaveBeenCalled();
  });

  it('el calendario personal conserva su propio filtro (con bypass de líder) y no cambia', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findMany.mockResolvedValue([{ idProyecto: PROYECTO_COMUN }]);
    prisma.eventoProyecto.findMany.mockResolvedValue([]);
    const service = new EventsService(prisma);

    await service.findForUserInRange(OWNER_ID, ...RANGO);

    expect(prisma.eventoProyecto.findMany.mock.calls[0][0].where.OR).toEqual([
      { invitados: { isEmpty: true } },
      { invitados: { has: OWNER_ID } },
      { proyecto: { creadoPor: OWNER_ID } },
    ]);
  });
});

/**
 * G01-C05 (UI-01, UI-15): matriz de roles sobre la agenda compartida. El
 * mock de Prisma aplica de verdad los dos filtros que importan (proyectos
 * del propietario e invitados contra quien mira), así la matriz prueba la
 * política y no solo la forma de la consulta. Antes de G01 el spec afirmaba
 * que el receptor veía "lo mismo que el propietario" (incluido el bypass de
 * líder): esa expectativa era insegura y se sustituyó en C02–C04.
 */
describe('EventsService — matriz de roles de la agenda compartida (G01-C05)', () => {
  const OWNER = 1; // líder de COMUN y de SOLO_OWNER
  const VIEWER = 2;
  const OTRO_INVITADO = 3;
  const EXTERNO = 4; // nunca invitado, sin proyectos en común
  const COMUN = 10;
  const SOLO_OWNER = 20;
  const CERRADO = 30;
  const RANGO = ['2026-10-01T00:00:00.000Z', '2026-10-31T23:59:59.000Z'] as const;

  const EVENTOS = [
    { idEvento: 1, idProyecto: COMUN, tituloEvento: 'Público común', invitados: [] },
    { idEvento: 2, idProyecto: COMUN, tituloEvento: 'Restringido con viewer', invitados: [OWNER, VIEWER] },
    { idEvento: 3, idProyecto: COMUN, tituloEvento: 'Restringido sin viewer', invitados: [OWNER, OTRO_INVITADO] },
    { idEvento: 4, idProyecto: SOLO_OWNER, tituloEvento: 'Público ajeno', invitados: [] },
    { idEvento: 5, idProyecto: SOLO_OWNER, tituloEvento: 'Restringido ajeno', invitados: [OTRO_INVITADO] },
    { idEvento: 6, idProyecto: CERRADO, tituloEvento: 'Público cerrado', invitados: [] },
  ].map((e) => ({
    ...e,
    fechaInicio: new Date('2026-10-05T14:00:00.000Z'),
    fechaFin: new Date('2026-10-05T15:00:00.000Z'),
    tipoEvento: 'REUNION',
    modalidad: 'VIRTUAL',
    proyecto: { idProyecto: e.idProyecto, tituloProyecto: `Proyecto ${e.idProyecto}` },
    linkSesion: 'https://SECRETO',
  }));

  /** Prisma falso: respeta `idProyecto.in` y la rama OR de invitados tal como las escribe el servicio. */
  function makePrismaConFiltro(proyectosPorUsuario: Record<number, number[]>) {
    const prisma = makePrisma();
    prisma.proyecto.findMany.mockImplementation(async (args: { where: { OR: [{ creadoPor: number }, unknown] } }) => {
      const userId = args.where.OR[0].creadoPor;
      return (proyectosPorUsuario[userId] ?? []).map((idProyecto) => ({ idProyecto }));
    });
    prisma.eventoProyecto.findMany.mockImplementation(
      async (args: { where: { idProyecto: { in: number[] }; OR: { invitados: { isEmpty?: boolean; has?: number } }[] } }) => {
        const { idProyecto, OR } = args.where;
        return EVENTOS.filter(
          (e) =>
            idProyecto.in.includes(e.idProyecto) &&
            OR.some((rama) => (rama.invitados.isEmpty ? e.invitados.length === 0 : e.invitados.includes(rama.invitados.has!))),
        );
      },
    );
    return prisma;
  }

  const porId = (lista: Awaited<ReturnType<EventsService['findSharedInRange']>>) =>
    Object.fromEntries(lista.map((e) => [e.idEvento, e.visibilidad]));

  it('integrante del proyecto común: detalle de lo público y de lo que lo invita; nunca lo restringido a otros, aunque el propietario sea líder', async () => {
    const prisma = makePrismaConFiltro({ [OWNER]: [COMUN, SOLO_OWNER, CERRADO], [VIEWER]: [COMUN] });
    const service = new EventsService(prisma);

    const resultado = await service.findSharedInRange(OWNER, VIEWER, ...RANGO);

    expect(porId(resultado)).toEqual({ 1: 'DETALLE', 2: 'DETALLE', 4: 'OCUPADO', 6: 'OCUPADO' });
    expect(JSON.stringify(resultado)).not.toContain('SECRETO');
    expect(JSON.stringify(resultado)).not.toContain('ajeno');
  });

  it('externo sin proyectos en común: solo disponibilidad de lo público, sin títulos ni proyectos', async () => {
    const prisma = makePrismaConFiltro({ [OWNER]: [COMUN, SOLO_OWNER], [EXTERNO]: [] });
    const service = new EventsService(prisma);

    const resultado = await service.findSharedInRange(OWNER, EXTERNO, ...RANGO);

    expect(porId(resultado)).toEqual({ 1: 'OCUPADO', 4: 'OCUPADO' });
    expect(JSON.stringify(resultado)).not.toContain('tituloEvento');
  });

  it('receptor retirado del proyecto (ya no ACTIVO) baja a OCUPADO aunque siga en la lista de invitados', async () => {
    const prisma = makePrismaConFiltro({ [OWNER]: [COMUN], [VIEWER]: [] });
    const service = new EventsService(prisma);

    const resultado = await service.findSharedInRange(OWNER, VIEWER, ...RANGO);

    expect(porId(resultado)).toEqual({ 1: 'OCUPADO', 2: 'OCUPADO' });
  });

  it('propietario retirado de un proyecto: sus eventos de ese proyecto desaparecen de la agenda compartida', async () => {
    const prisma = makePrismaConFiltro({ [OWNER]: [SOLO_OWNER], [VIEWER]: [COMUN] });
    const service = new EventsService(prisma);

    const resultado = await service.findSharedInRange(OWNER, VIEWER, ...RANGO);

    expect(porId(resultado)).toEqual({ 4: 'OCUPADO' });
  });

  it('el propietario, en su propio calendario, sí ve lo restringido que lidera (el bypass es suyo, no del receptor)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findMany.mockResolvedValue([{ idProyecto: COMUN }]);
    prisma.eventoProyecto.findMany.mockResolvedValue([]);
    const service = new EventsService(prisma);

    await service.findForUserInRange(OWNER, ...RANGO);
    expect(prisma.eventoProyecto.findMany.mock.calls[0][0].where.OR).toContainEqual({ proyecto: { creadoPor: OWNER } });
  });
});

describe('EventsService — metadatos de modalidad al editar (G04-C14, UI-35)', () => {
  function presencial(overrides: Record<string, unknown> = {}) {
    return {
      idEvento: EVENT_ID,
      idProyecto: PROJECT_ID,
      tituloEvento: 'Taller',
      fechaInicio: new Date('2030-10-01T14:00:00.000Z'),
      fechaFin: new Date('2030-10-01T15:00:00.000Z'),
      modalidad: 'PRESENCIAL',
      ubicacionLat: 14.6,
      ubicacionLng: -90.5,
      ubicacionNombre: 'Edificio CIT',
      linkSesion: null,
      invitados: [],
      ...overrides,
    };
  }
  function preparar(actual: Record<string, unknown>) {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.eventoProyecto.findFirst.mockResolvedValue(actual);
    prisma.eventoProyecto.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...actual, ...data }));
    return { prisma, service: new EventsService(prisma) };
  }
  const datos = (prisma: ReturnType<typeof makePrisma>) => prisma.eventoProyecto.update.mock.calls[0][0].data as Record<string, unknown>;

  it('PRESENCIAL → VIRTUAL con null explícito limpia latitud, longitud y nombre del lugar', async () => {
    const { prisma, service } = preparar(presencial());
    const resultado = await service.update(PROJECT_ID, EVENT_ID, LEADER_ID, {
      modalidad: 'VIRTUAL',
      linkSesion: 'https://meet.google.com/abc',
      ubicacionLat: null,
      ubicacionLng: null,
      ubicacionNombre: null,
    });

    expect(datos(prisma)).toMatchObject({ modalidad: 'VIRTUAL', ubicacionLat: null, ubicacionLng: null, ubicacionNombre: null, linkSesion: 'https://meet.google.com/abc' });
    // Lo que devuelve el servicio (y verá el detalle) ya no trae un lugar huérfano.
    expect(resultado).toMatchObject({ ubicacionLat: null, ubicacionLng: null, ubicacionNombre: null });
  });

  it('un PATCH parcial de un cliente antiguo (solo modalidad, sin campos de ubicación) no borra nada por omisión', async () => {
    const { prisma, service } = preparar(presencial());
    await service.update(PROJECT_ID, EVENT_ID, LEADER_ID, { modalidad: 'VIRTUAL', linkSesion: 'https://meet.google.com/abc' });

    const data = datos(prisma);
    expect(data).not.toHaveProperty('ubicacionLat');
    expect(data).not.toHaveProperty('ubicacionLng');
    expect(data).not.toHaveProperty('ubicacionNombre');
  });

  it('MIXTA conserva lugar y enlace tal como llegan', async () => {
    const { prisma, service } = preparar(presencial());
    await service.update(PROJECT_ID, EVENT_ID, LEADER_ID, {
      modalidad: 'MIXTA',
      ubicacionLat: 14.6,
      ubicacionLng: -90.5,
      ubicacionNombre: 'Edificio CIT',
      linkSesion: 'https://meet.google.com/abc',
    });
    expect(datos(prisma)).toMatchObject({ modalidad: 'MIXTA', ubicacionLat: 14.6, ubicacionLng: -90.5, ubicacionNombre: 'Edificio CIT', linkSesion: 'https://meet.google.com/abc' });
  });

  it('VIRTUAL → PRESENCIAL con linkSesion null limpia el enlace y guarda el lugar', async () => {
    const { prisma, service } = preparar(presencial({ modalidad: 'VIRTUAL', ubicacionLat: null, ubicacionLng: null, ubicacionNombre: null, linkSesion: 'https://meet.google.com/abc' }));
    await service.update(PROJECT_ID, EVENT_ID, LEADER_ID, { modalidad: 'PRESENCIAL', ubicacionLat: 14.6, ubicacionLng: -90.5, linkSesion: null });
    expect(datos(prisma)).toMatchObject({ modalidad: 'PRESENCIAL', ubicacionLat: 14.6, ubicacionLng: -90.5, linkSesion: null });
  });

  it.each([
    ['sin cambiar la modalidad de un presencial', { ubicacionLat: null, ubicacionLng: null }],
    ['pasando a híbrida', { modalidad: 'MIXTA' as const, ubicacionLat: null, ubicacionLng: null, linkSesion: 'https://meet.google.com/abc' }],
  ])('borrar la ubicación %s produce 400 y no toca la base', async (_caso, cambio) => {
    const { prisma, service } = preparar(presencial());
    await expect(service.update(PROJECT_ID, EVENT_ID, LEADER_ID, cambio)).rejects.toThrow(BadRequestException);
    expect(prisma.eventoProyecto.update).not.toHaveBeenCalled();
  });

  it('borrar el enlace de un evento que sigue siendo virtual produce 400 y no toca la base', async () => {
    const { prisma, service } = preparar(presencial({ modalidad: 'VIRTUAL', linkSesion: 'https://meet.google.com/abc' }));
    await expect(service.update(PROJECT_ID, EVENT_ID, LEADER_ID, { linkSesion: null })).rejects.toThrow('necesita el enlace');
    expect(prisma.eventoProyecto.update).not.toHaveBeenCalled();
  });

  it('borrar solo el nombre del lugar de un presencial está permitido (es opcional)', async () => {
    const { prisma, service } = preparar(presencial());
    await service.update(PROJECT_ID, EVENT_ID, LEADER_ID, { ubicacionNombre: null });
    expect(datos(prisma)).toMatchObject({ ubicacionNombre: null });
    expect(datos(prisma)).not.toHaveProperty('ubicacionLat');
  });
});

describe('UpdateEventDto — null explícito solo donde significa "limpiar" (G04-C14, UI-35)', () => {
  const errores = async (plano: Record<string, unknown>) => (await validate(plainToInstance(UpdateEventDto, plano), { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property);

  it('acepta null en ubicación al pasar a VIRTUAL y en el enlace al pasar a PRESENCIAL', async () => {
    expect(await errores({ modalidad: 'VIRTUAL', linkSesion: 'https://meet.google.com/abc', ubicacionLat: null, ubicacionLng: null, ubicacionNombre: null })).toEqual([]);
    expect(await errores({ modalidad: 'PRESENCIAL', ubicacionLat: 14.6, ubicacionLng: -90.5, linkSesion: null })).toEqual([]);
  });

  it('rechaza null en la ubicación de un PRESENCIAL/MIXTA y en el enlace de un VIRTUAL/MIXTA', async () => {
    expect(await errores({ modalidad: 'PRESENCIAL', ubicacionLat: null, ubicacionLng: null })).toEqual(['ubicacionLat', 'ubicacionLng']);
    expect(await errores({ modalidad: 'MIXTA', ubicacionLat: 14.6, ubicacionLng: -90.5, linkSesion: null })).toEqual(['linkSesion']);
    expect(await errores({ modalidad: 'VIRTUAL', linkSesion: null })).toEqual(['linkSesion']);
  });

  it('el resto de campos sigue rechazando null (solo se acepta la omisión real)', async () => {
    expect(await errores({ tituloEvento: null })).toEqual(['tituloEvento']);
    expect(await errores({ fechaInicio: null })).toEqual(['fechaInicio']);
    expect(await errores({ antelacionMinutos: null })).toEqual(['antelacionMinutos']);
    expect(await errores({ invitados: null })).toEqual(['invitados']);
  });

  it('la omisión sigue siendo válida: un PATCH de solo título no exige nada más', async () => {
    expect(await errores({ tituloEvento: 'Nuevo título' })).toEqual([]);
  });
});

describe('GetEventsRangeQueryDto — rango acotado (G04-C15, UI-20/B-06)', () => {
  const DESDE = '2026-10-01T06:00:00.000Z';
  const mas = (dias: number, ms = 0) => new Date(Date.parse(DESDE) + dias * 86_400_000 + ms).toISOString();
  const validar = async (query: Record<string, unknown>) => {
    const errores = await validate(plainToInstance(GetEventsRangeQueryDto, query), { whitelist: true, forbidNonWhitelisted: true });
    return errores.flatMap((e) => Object.values(e.constraints ?? {}).map((mensaje) => `${e.property}: ${mensaje}`));
  };

  it('el tope es de 62 días', () => {
    expect(MAX_DIAS_RANGO_EVENTOS).toBe(62);
  });

  it.each([
    ['un día (vista Día)', 1],
    ['una semana (vista Semana)', 7],
    ['6 semanas, lo que pide la vista Mes y el mini calendario', 42],
    ['exactamente 62 días', 62],
  ])('acepta %s', async (_caso, dias) => {
    expect(await validar({ desde: DESDE, hasta: mas(dias) })).toEqual([]);
  });

  it('acepta un rango de longitud cero (hasta igual a desde)', async () => {
    expect(await validar({ desde: DESDE, hasta: DESDE })).toEqual([]);
  });

  it.each([
    ['62 días y un milisegundo', mas(62, 1)],
    ['un año completo', mas(365)],
    ['diez años', mas(3650)],
  ])('rechaza %s con un mensaje que dice el tope', async (_caso, hasta) => {
    expect(await validar({ desde: DESDE, hasta })).toEqual(['hasta: el rango entre desde y hasta no puede superar 62 días']);
  });

  it('rechaza un rango invertido con su propio mensaje', async () => {
    expect(await validar({ desde: DESDE, hasta: mas(-1) })).toEqual(['hasta: hasta no puede ser anterior a desde']);
  });

  it('una fecha con formato inválido la sigue reportando solo @IsDateString (sin error duplicado ni excepción)', async () => {
    expect(await validar({ desde: 'ayer', hasta: mas(1) })).toEqual(['desde: desde debe ser una fecha/hora válida (ISO 8601)']);
    expect(await validar({ desde: DESDE, hasta: 'mañana' })).toEqual(['hasta: hasta debe ser una fecha/hora válida (ISO 8601)']);
    expect(await validar({ desde: DESDE })).toEqual(['hasta: hasta debe ser una fecha/hora válida (ISO 8601)']);
  });

  it('el tope se mide en tiempo real, sin importar la zona con que venga escrita la fecha', async () => {
    // 62 días exactos expresados con offset de Guatemala (-06:00) en vez de Z.
    expect(await validar({ desde: '2026-10-01T00:00:00.000-06:00', hasta: '2026-12-02T00:00:00.000-06:00' })).toEqual([]);
    expect(await validar({ desde: '2026-10-01T00:00:00.000-06:00', hasta: '2026-12-02T00:00:00.001-06:00' })).toHaveLength(1);
  });
});

describe('EventsService — reabrir el recordatorio cuando crece la audiencia (G04-C16, UI-22)', () => {
  const ANA = 4;
  const LUIS = 6;
  function preparar(invitadosActuales: number[]) {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.eventoProyecto.findFirst.mockResolvedValue({
      idEvento: EVENT_ID,
      idProyecto: PROJECT_ID,
      tituloEvento: 'Kickoff',
      fechaInicio: new Date('2030-10-01T14:00:00.000Z'),
      fechaFin: new Date('2030-10-01T15:00:00.000Z'),
      modalidad: 'VIRTUAL',
      linkSesion: 'https://meet.google.com/abc',
      invitados: invitadosActuales,
    });
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: ANA }, { idUsuario: LUIS }]);
    prisma.eventoProyecto.update.mockResolvedValue({ idEvento: EVENT_ID });
    return { prisma, service: new EventsService(prisma) };
  }
  const datos = (prisma: ReturnType<typeof makePrisma>) => prisma.eventoProyecto.update.mock.calls[0][0].data as Record<string, unknown>;
  /** Lo que el diálogo real envía en cada edición: título, la misma fecha de inicio y la lista de invitados. */
  const comoElDialogo = (invitados: number[], extra: Record<string, unknown> = {}) => ({ tituloEvento: 'Kickoff', fechaInicio: '2030-10-01T14:00:00.000Z', invitados, ...extra });

  it('añadir un invitado nuevo reabre el recordatorio (recordatorioEnviadoEn = null)', async () => {
    const { prisma, service } = preparar([ANA]);
    await service.update(PROJECT_ID, EVENT_ID, LEADER_ID, comoElDialogo([ANA, LUIS]));
    expect(datos(prisma)).toMatchObject({ invitados: [ANA, LUIS], recordatorioEnviadoEn: null });
  });

  it('vaciar la lista (el evento vuelve a ser de todo el proyecto) también amplía la audiencia y lo reabre', async () => {
    const { prisma, service } = preparar([ANA]);
    await service.update(PROJECT_ID, EVENT_ID, LEADER_ID, comoElDialogo([]));
    expect(datos(prisma)).toMatchObject({ invitados: [], recordatorioEnviadoEn: null });
  });

  it.each([
    ['guardar con los mismos invitados (editar solo el título, como hace el diálogo)', [ANA, LUIS], [ANA, LUIS], { tituloEvento: 'Kickoff (aula nueva)' }],
    ['los mismos invitados en otro orden o repetidos', [ANA, LUIS], [LUIS, ANA, ANA], {}],
    ['quitar a un invitado', [ANA, LUIS], [ANA], {}],
    ['restringir un evento de todo el proyecto a unos invitados (nadie nuevo entra)', [], [ANA], {}],
  ])('%s NO reabre el recordatorio', async (_caso, antes, ahora, extra) => {
    const { prisma, service } = preparar(antes);
    await service.update(PROJECT_ID, EVENT_ID, LEADER_ID, comoElDialogo(ahora, extra));
    expect(datos(prisma)).not.toHaveProperty('recordatorioEnviadoEn');
  });

  it('un PATCH que no menciona los invitados (solo título) no reabre nada', async () => {
    const { prisma, service } = preparar([ANA]);
    await service.update(PROJECT_ID, EVENT_ID, LEADER_ID, { tituloEvento: 'Otro título' });
    expect(datos(prisma)).not.toHaveProperty('recordatorioEnviadoEn');
    expect(datos(prisma)).not.toHaveProperty('invitados');
  });

  it('si el invitado nuevo no es integrante activo, es un 400 y no se reabre ni se guarda nada', async () => {
    const { prisma, service } = preparar([ANA]);
    await expect(service.update(PROJECT_ID, EVENT_ID, LEADER_ID, comoElDialogo([ANA, 777]))).rejects.toThrow(BadRequestException);
    expect(prisma.eventoProyecto.update).not.toHaveBeenCalled();
  });

  it('la respuesta sigue sin exponer recordatorioEnviadoEn (contrato público de T-263)', async () => {
    const { prisma, service } = preparar([ANA]);
    await service.update(PROJECT_ID, EVENT_ID, LEADER_ID, comoElDialogo([ANA, LUIS]));
    expect(Object.keys(prisma.eventoProyecto.update.mock.calls[0][0].select)).not.toContain('recordatorioEnviadoEn');
  });
});
