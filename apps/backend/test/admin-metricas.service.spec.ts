import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { AdminService } from '../src/admin/admin.service';

/**
 * HU-178 (T-303). Agregados de GET /admin/metricas con datos conocidos.
 * "Hoy" es el lunes 2026-10-05 a mediodía en Guatemala: la ventana semanal
 * va de la semana del 2026-08-17 (semana 1) a la del 2026-10-05 (semana 8).
 */

const AHORA = new Date('2026-10-05T18:00:00.000Z'); // 12:00 en Guatemala (UTC-6)

/** Instante UTC de una hora local de Guatemala. */
const gt = (fechaHoraLocal: string) => new Date(`${fechaHoraLocal}-06:00`);

interface Datos {
  usuariosNuevos?: Date[];
  usuariosActivos?: Date[];
  proyectos?: Date[];
  tareas?: Date[];
  horas?: Array<{ fecha: Date; horas: string | null }>;
}

function setup(datos: Datos = {}, esAdmin = true) {
  const prisma = {
    usuarioRolAcceso: { findFirst: vi.fn().mockResolvedValue(esAdmin ? { idUsuario: 1 } : null) },
    usuario: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        'fechaUltimaSesion' in where
          ? (datos.usuariosActivos ?? []).map((f) => ({ fechaUltimaSesion: f }))
          : (datos.usuariosNuevos ?? []).map((f) => ({ fechaCreacion: f })),
      ),
    },
    proyecto: {
      findMany: vi.fn().mockResolvedValue((datos.proyectos ?? []).map((f) => ({ fechaCreacion: f }))),
    },
    tarea: {
      findMany: vi.fn().mockResolvedValue((datos.tareas ?? []).map((f) => ({ actualizadaEn: f }))),
    },
    horasParticipacion: {
      findMany: vi.fn().mockResolvedValue(
        (datos.horas ?? []).map((h) => ({
          fechaAprobacion: h.fecha,
          horasAprobadas: h.horas === null ? null : new Prisma.Decimal(h.horas),
        })),
      ),
    },
  };
  const admin = new AdminService(prisma as unknown as PrismaService, new JwtService({}));
  return { admin, prisma };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AdminService.getMetricas — series por semana', () => {
  const datos: Datos = {
    usuariosNuevos: [
      gt('2026-08-17T09:00:00'),
      gt('2026-08-19T15:00:00'),
      gt('2026-08-23T22:00:00'),
      gt('2026-08-24T08:00:00'),
      gt('2026-08-28T10:00:00'),
    ],
    usuariosActivos: [gt('2026-08-18T10:00:00'), gt('2026-10-05T08:00:00')],
    proyectos: [gt('2026-08-20T10:00:00'), gt('2026-09-30T10:00:00')],
    tareas: [
      gt('2026-08-18T10:00:00'),
      gt('2026-08-25T10:00:00'),
      gt('2026-08-26T10:00:00'),
      gt('2026-10-05T09:00:00'),
    ],
    horas: [
      { fecha: gt('2026-08-21T10:00:00'), horas: '4.50' },
      { fecha: gt('2026-08-27T10:00:00'), horas: '5.50' },
    ],
  };

  it('devuelve 8 semanas, de lunes a lunes, en orden cronológico', async () => {
    const { admin } = setup(datos);
    const res = await admin.getMetricas(1, 'semana');

    expect(res.periodo).toBe('semana');
    expect(res.serie.map((p) => p.inicio)).toEqual([
      '2026-08-17',
      '2026-08-24',
      '2026-08-31',
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
    ]);
  });

  it('usuarios nuevos: 3 en la semana 1 y 2 en la semana 2', async () => {
    const { admin } = setup(datos);
    const { serie } = await admin.getMetricas(1, 'semana');

    expect(serie.map((p) => p.usuariosNuevos)).toEqual([3, 2, 0, 0, 0, 0, 0, 0]);
  });

  it('usuarios activos: cada uno en la semana de su última sesión', async () => {
    const { admin } = setup(datos);
    const { serie } = await admin.getMetricas(1, 'semana');

    expect(serie.map((p) => p.usuariosActivos)).toEqual([1, 0, 0, 0, 0, 0, 0, 1]);
  });

  it('proyectos creados por semana', async () => {
    const { admin } = setup(datos);
    const { serie } = await admin.getMetricas(1, 'semana');

    expect(serie.map((p) => p.proyectosCreados)).toEqual([1, 0, 0, 0, 0, 0, 1, 0]);
  });

  it('tareas completadas: 4 en total, repartidas por semana', async () => {
    const { admin } = setup(datos);
    const { serie } = await admin.getMetricas(1, 'semana');

    expect(serie.map((p) => p.tareasCompletadas)).toEqual([1, 2, 0, 0, 0, 0, 0, 1]);
    expect(serie.reduce((acc, p) => acc + p.tareasCompletadas, 0)).toBe(4);
  });

  it('horas confirmadas: 10 en total, sumando horasAprobadas por semana', async () => {
    const { admin } = setup(datos);
    const { serie } = await admin.getMetricas(1, 'semana');

    expect(serie.map((p) => p.horasConfirmadas)).toEqual([4.5, 5.5, 0, 0, 0, 0, 0, 0]);
    expect(serie.reduce((acc, p) => acc + p.horasConfirmadas, 0)).toBe(10);
  });

  it('el domingo 23:30 en Guatemala cae en esa semana, no en la siguiente', async () => {
    // 2026-08-23 23:30 GT = 2026-08-24 05:30 UTC.
    const { admin } = setup({ usuariosNuevos: [gt('2026-08-23T23:30:00')] });
    const { serie } = await admin.getMetricas(1, 'semana');

    expect(serie[0].usuariosNuevos).toBe(1);
    expect(serie[1].usuariosNuevos).toBe(0);
  });

  it('sin periodo usa semana', async () => {
    const { admin } = setup(datos);
    const res = await admin.getMetricas(1);

    expect(res.periodo).toBe('semana');
    expect(res.serie).toHaveLength(8);
  });
});

describe('AdminService.getMetricas — series por mes', () => {
  it('devuelve 6 meses con los agregados de cada uno', async () => {
    const { admin } = setup({
      usuariosNuevos: [gt('2026-05-01T00:00:00'), gt('2026-08-31T23:59:00'), gt('2026-09-01T00:00:00')],
      tareas: [gt('2026-10-01T10:00:00')],
      horas: [
        { fecha: gt('2026-07-10T10:00:00'), horas: '3.25' },
        { fecha: gt('2026-07-20T10:00:00'), horas: '1.75' },
      ],
    });
    const { periodo, serie } = await admin.getMetricas(1, 'mes');

    expect(periodo).toBe('mes');
    expect(serie.map((p) => p.inicio)).toEqual([
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
    ]);
    expect(serie.map((p) => p.usuariosNuevos)).toEqual([1, 0, 0, 1, 1, 0]);
    expect(serie.map((p) => p.tareasCompletadas)).toEqual([0, 0, 0, 0, 0, 1]);
    expect(serie.map((p) => p.horasConfirmadas)).toEqual([0, 0, 5, 0, 0, 0]);
  });
});

describe('AdminService.getMetricas — filtros de las consultas', () => {
  it('consulta solo la ventana de 8 semanas y aplica los filtros de cada serie', async () => {
    const { admin, prisma } = setup();
    await admin.getMetricas(1, 'semana');

    const rango = { gte: gt('2026-08-17T00:00:00'), lt: gt('2026-10-12T00:00:00') };
    expect(prisma.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { fechaCreacion: rango } }),
    );
    expect(prisma.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { fechaUltimaSesion: rango } }),
    );
    expect(prisma.proyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { fechaCreacion: rango, eliminadoEn: null } }),
    );
    expect(prisma.tarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { estadoTarea: 'HECHO', eliminadoEn: null, actualizadaEn: rango } }),
    );
    expect(prisma.horasParticipacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { estadoHoras: 'APROBADA', fechaAprobacion: rango } }),
    );
  });
});

describe('AdminService.getMetricas — casos borde', () => {
  it('un periodo sin datos devuelve 0 en las cinco series, no se omite', async () => {
    const { admin } = setup();
    const { serie } = await admin.getMetricas(1, 'semana');

    expect(serie).toHaveLength(8);
    for (const punto of serie) {
      expect(punto).toMatchObject({
        usuariosNuevos: 0,
        usuariosActivos: 0,
        proyectosCreados: 0,
        tareasCompletadas: 0,
        horasConfirmadas: 0,
      });
    }
  });

  it('horasAprobadas nulas suman 0', async () => {
    const { admin } = setup({ horas: [{ fecha: gt('2026-10-05T08:00:00'), horas: null }] });
    const { serie } = await admin.getMetricas(1, 'semana');

    expect(serie[7].horasConfirmadas).toBe(0);
  });

  it('un usuario sin rol de administración recibe ForbiddenException y no se consulta nada', async () => {
    const { admin, prisma } = setup({}, false);

    await expect(admin.getMetricas(2, 'semana')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.usuario.findMany).not.toHaveBeenCalled();
    expect(prisma.tarea.findMany).not.toHaveBeenCalled();
    expect(prisma.horasParticipacion.findMany).not.toHaveBeenCalled();
  });
});
