import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SprintColumnTimeService, horasPorColumna } from '../src/sprints/sprint-column-time.service';

const t = (iso: string) => new Date(iso);

describe('horasPorColumna', () => {
  it('suma el tiempo de cada columna hasta llegar a HECHO', () => {
    const horas = horasPorColumna(
      t('2026-10-01T00:00:00Z'),
      [
        { en: t('2026-10-01T10:00:00Z'), estado: 'EN_PROGRESO' },
        { en: t('2026-10-02T10:00:00Z'), estado: 'HECHO' },
      ] as never,
      t('2026-10-10T00:00:00Z'),
    );
    expect(horas.get('POR_HACER')).toBe(10);
    expect(horas.get('EN_PROGRESO')).toBe(24);
  });

  it('un cambio anterior al inicio fija la columna de partida y no suma tiempo previo', () => {
    const horas = horasPorColumna(
      t('2026-10-05T00:00:00Z'),
      [{ en: t('2026-10-02T00:00:00Z'), estado: 'EN_PROGRESO' }] as never,
      t('2026-10-05T06:00:00Z'),
    );
    expect(horas.get('EN_PROGRESO')).toBe(6);
    expect(horas.has('POR_HACER')).toBe(false);
  });

  it('una tarea sin cambios pasó todo el tiempo en POR_HACER', () => {
    const horas = horasPorColumna(t('2026-10-01T00:00:00Z'), [], t('2026-10-01T05:00:00Z'));
    expect(horas.get('POR_HACER')).toBe(5);
  });
});

describe('SprintColumnTimeService', () => {
  function armar(permitido = true) {
    const prisma = {
      tarea: {
        findMany: vi.fn().mockResolvedValue([
          { idTarea: 1, fechaCreacion: t('2026-10-01T00:00:00Z') },
          { idTarea: 2, fechaCreacion: t('2026-10-01T00:00:00Z') },
        ]),
      },
      bitacoraAuditoria: {
        findMany: vi.fn().mockResolvedValue([
          { idObjeto: '1', fechaEvento: t('2026-10-01T10:00:00Z'), detalleJson: { valorNuevo: { estadoTarea: 'EN_PROGRESO' } } },
          { idObjeto: '1', fechaEvento: t('2026-10-01T14:00:00Z'), detalleJson: { valorNuevo: { estadoTarea: 'HECHO' } } },
          { idObjeto: '1', fechaEvento: t('2026-10-01T15:00:00Z'), detalleJson: null },
        ]),
      },
    };
    const authorization = {
      assertCanViewSprintAnalytics: vi.fn(async () => {
        if (!permitido) throw new ForbiddenException('sin acceso');
        return { fechaInicio: t('2026-10-01T00:00:00Z'), fechaCierre: t('2026-10-01T20:00:00Z') };
      }),
    };
    return { service: new SprintColumnTimeService(prisma as never, authorization as never), prisma };
  }

  it('promedia por columna sobre las tareas que pasaron por ella', async () => {
    const { service } = armar();
    const r = await service.get(1, 5, 9);
    const por = Object.fromEntries(r.columnas.map((c) => [c.estado, c]));
    // tarea 1: 10 h en POR_HACER; tarea 2: 20 h (hasta el cierre).
    expect(por.POR_HACER).toEqual({ estado: 'POR_HACER', tareas: 2, promedioHoras: 15 });
    expect(por.EN_PROGRESO).toEqual({ estado: 'EN_PROGRESO', tareas: 1, promedioHoras: 4 });
    expect(por.EN_REVISION).toEqual({ estado: 'EN_REVISION', tareas: 0, promedioHoras: 0 });
  });

  it('una tarea creada en un sprint anterior solo cuenta desde el inicio de este', async () => {
    const { service, prisma } = armar();
    prisma.tarea.findMany.mockResolvedValue([{ idTarea: 2, fechaCreacion: t('2026-09-01T00:00:00Z') }]);
    prisma.bitacoraAuditoria.findMany.mockResolvedValue([]);
    const r = await service.get(1, 5, 9);
    // inicio del sprint 01-oct 00:00 hasta el cierre 20:00 = 20 h, no semanas.
    expect(r.columnas[0]).toEqual({ estado: 'POR_HACER', tareas: 1, promedioHoras: 20 });
  });

  it('sin permiso no consulta datos', async () => {
    const { service, prisma } = armar(false);
    await expect(service.get(1, 5, 2)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tarea.findMany).not.toHaveBeenCalled();
  });
});
