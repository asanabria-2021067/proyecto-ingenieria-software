import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LeadershipReadService } from '../src/leadership/leadership-read.service';

/**
 * Lecturas administrativas de apelaciones para la bandeja con pestañas y la
 * vista de revisión: orden del historial, apelación por id y contadores.
 * Prisma va simulado: aquí se fija QUÉ se le pide y cómo se mapea la fila.
 */

const USUARIO = (idUsuario: number, nombre: string) => ({ idUsuario, nombre, apellido: 'Prueba' });

function fila(overrides: Record<string, unknown> = {}) {
  return {
    idApelacion: 7,
    idProyecto: 37,
    asunto: 'Cambio de liderazgo',
    mensaje: 'Mensaje',
    estadoApelacion: 'PENDIENTE',
    creadaEn: new Date('2026-08-01T12:00:00.000Z'),
    resueltaEn: null,
    mensajeResolucion: null,
    liderSolicitante: USUARIO(1, 'Valeria'),
    candidatoPropuesto: USUARIO(8, 'José'),
    adminResolutor: null,
    proyecto: { idProyecto: 37, tituloProyecto: 'Tutorías', estadoProyecto: 'EN_PROGRESO' },
    historial: null,
    ...overrides,
  };
}

function build(options: { admin?: boolean; filas?: unknown[]; unica?: unknown; grupos?: unknown[] } = {}) {
  const prisma = {
    apelacionLiderazgo: {
      count: vi.fn().mockResolvedValue((options.filas ?? []).length),
      findMany: vi.fn().mockResolvedValue(options.filas ?? []),
      findUnique: vi.fn().mockResolvedValue(options.unica ?? null),
      groupBy: vi.fn().mockResolvedValue(options.grupos ?? []),
    },
  };
  const policy = {
    assertAdminTx: vi.fn(async () => {
      if (options.admin === false) throw new ForbiddenException('Acceso restringido a administradores');
    }),
  };
  const service = new LeadershipReadService(prisma as never, {} as never, {} as never, policy as never);
  return { service, prisma, policy };
}

const ORDEN_CREACION = [{ creadaEn: 'desc' }, { idApelacion: 'desc' }];
const ORDEN_RESOLUCION = [{ resueltaEn: { sort: 'desc', nulls: 'last' } }, ...ORDEN_CREACION];

describe('LeadershipReadService.adminInbox — orden de la bandeja', () => {
  it.each([
    ['sin filtro («Todas»)', undefined, ORDEN_CREACION],
    ['PENDIENTE', 'PENDIENTE', ORDEN_CREACION],
    ['ACEPTADA', 'ACEPTADA', ORDEN_RESOLUCION],
    ['DENEGADA', 'DENEGADA', ORDEN_RESOLUCION],
    ['CANCELADA', 'CANCELADA', ORDEN_RESOLUCION],
  ])('%s: pide el orden correspondiente y pagina en la base de datos', async (_nombre, estado, orden) => {
    const { service, prisma } = build();

    const pagina = await service.adminInbox(undefined, { actorId: 99, query: { estado: estado as never, page: 2, limit: 10 } });

    expect(prisma.apelacionLiderazgo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: estado ? { estadoApelacion: estado } : {},
        orderBy: orden,
        skip: 10,
        take: 10,
      }),
    );
    expect(pagina).toMatchObject({ page: 2, limit: 10 });
  });

  it('cada fila trae su proyecto y, si fue aceptada, el líder realmente designado', async () => {
    const { service } = build({
      filas: [
        fila(),
        fila({
          idApelacion: 8,
          estadoApelacion: 'ACEPTADA',
          proyecto: { idProyecto: 37, tituloProyecto: 'Tutorías', estadoProyecto: 'CERRADO' },
          historial: { liderNuevo: USUARIO(9, 'Lucía') },
        }),
      ],
    });

    const { items } = await service.adminInbox(undefined, { actorId: 99 });

    expect(items[0].liderDesignado).toBeNull();
    expect(items[0].proyecto).toEqual({ idProyecto: 37, tituloProyecto: 'Tutorías', estadoProyecto: 'EN_PROGRESO' });
    // El designado puede no ser el candidato propuesto; el estado del proyecto es independiente.
    expect(items[1].liderDesignado).toEqual(USUARIO(9, 'Lucía'));
    expect(items[1].candidatoPropuesto).toEqual(USUARIO(8, 'José'));
    expect(items[1].proyecto.estadoProyecto).toBe('CERRADO');
    expect(items[1]).not.toHaveProperty('historial');
  });

  it('un no-administrador recibe 403 y no se consulta la bandeja', async () => {
    const { service, prisma } = build({ admin: false });

    await expect(service.adminInbox(undefined, { actorId: 5 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.apelacionLiderazgo.findMany).not.toHaveBeenCalled();
  });
});

describe('LeadershipReadService.adminAppeal — una apelación por id', () => {
  it('devuelve la apelación con su proyecto y su líder designado', async () => {
    const { service, prisma } = build({ unica: fila({ historial: { liderNuevo: USUARIO(8, 'José') } }) });

    const apelacion = await service.adminAppeal(undefined, { actorId: 99, appealId: 7 });

    expect(prisma.apelacionLiderazgo.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { idApelacion: 7 } }));
    expect(apelacion.idApelacion).toBe(7);
    expect(apelacion.liderDesignado).toEqual(USUARIO(8, 'José'));
    expect(apelacion.proyecto.tituloProyecto).toBe('Tutorías');
  });

  it('una apelación inexistente es 404', async () => {
    const { service } = build({ unica: null });
    await expect(service.adminAppeal(undefined, { actorId: 99, appealId: 404 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un no-administrador recibe 403 antes de leer nada', async () => {
    const { service, prisma } = build({ admin: false, unica: fila() });

    await expect(service.adminAppeal(undefined, { actorId: 5, appealId: 7 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.apelacionLiderazgo.findUnique).not.toHaveBeenCalled();
  });
});

describe('LeadershipReadService.adminInboxSummary — contadores de las pestañas', () => {
  it('cuenta por estado, rellena con cero los ausentes y suma el total', async () => {
    const { service } = build({
      grupos: [
        { estadoApelacion: 'PENDIENTE', _count: { _all: 3 } },
        { estadoApelacion: 'DENEGADA', _count: { _all: 5 } },
      ],
    });

    await expect(service.adminInboxSummary(undefined, { actorId: 99 })).resolves.toEqual({
      PENDIENTE: 3,
      ACEPTADA: 0,
      DENEGADA: 5,
      CANCELADA: 0,
      TODAS: 8,
    });
  });

  it('un no-administrador recibe 403', async () => {
    const { service, prisma } = build({ admin: false });

    await expect(service.adminInboxSummary(undefined, { actorId: 5 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.apelacionLiderazgo.groupBy).not.toHaveBeenCalled();
  });
});
