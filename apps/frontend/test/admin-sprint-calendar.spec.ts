import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('../lib/api/client', () => ({ apiFetch: apiFetchMock }));

import { getAdminSprintCalendar } from '../lib/services/admin-sprints';
import { adminSprintCalendarQueryKey } from '../lib/query-keys/admin-sprints';
import {
  SITUACION_SPRINT_LABEL,
  SITUACION_SPRINT_TONE,
  countSprintsByPlannedDay,
  describePlannedDay,
  formatDiaCorto,
  formatDiaLargo,
  formatDiasRestantes,
  pickNextSprintFinalization,
} from '../lib/admin/sprint-calendar';
import type { AdminSprintCalendarItem } from '../lib/types/admin-sprints';

let nextId = 1;
function item(overrides: Partial<AdminSprintCalendarItem> = {}): AdminSprintCalendarItem {
  const idSprint = nextId++;
  return {
    idSprint,
    numero: 1,
    estado: 'ACTIVO',
    idProyecto: idSprint + 100,
    tituloProyecto: `Proyecto ${idSprint}`,
    lider: { idUsuario: 7, nombre: 'Ana', apellido: 'López' },
    fechaInicio: '2026-09-20T15:00:00.000Z',
    fechaFinPlaneada: '2026-10-08',
    fechaFinalizacionIniciada: null,
    fechaCierre: null,
    situacion: 'EN_CURSO',
    diasRestantes: 3,
    desviacionDias: null,
    ...overrides,
  };
}

beforeEach(() => {
  nextId = 1;
});

describe('getAdminSprintCalendar', () => {
  it('consulta el endpoint administrativo sin parámetros', async () => {
    const respuesta = { hoy: '2026-10-05', items: [], conteos: {}, resumen: {} };
    apiFetchMock.mockResolvedValue(respuesta);

    await expect(getAdminSprintCalendar()).resolves.toBe(respuesta);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).toHaveBeenCalledWith('/admin/sprints/calendario');
  });

  it('la query key es única: métricas, calendario y próxima finalización comparten la consulta', () => {
    expect(adminSprintCalendarQueryKey).toEqual(['admin', 'sprints', 'calendario']);
  });
});

describe('countSprintsByPlannedDay', () => {
  it('agrupa por día planificado y cuenta los que coinciden', () => {
    const porDia = countSprintsByPlannedDay([
      item({ fechaFinPlaneada: '2026-10-08' }),
      item({ fechaFinPlaneada: '2026-10-08' }),
      item({ fechaFinPlaneada: '2026-10-12' }),
    ]);

    expect([...porDia.entries()]).toEqual([
      ['2026-10-08', 2],
      ['2026-10-12', 1],
    ]);
  });

  it('un Sprint sin fecha planificada no marca ningún día', () => {
    const porDia = countSprintsByPlannedDay([item({ fechaFinPlaneada: null, situacion: 'SIN_FECHA', diasRestantes: null })]);
    expect(porDia.size).toBe(0);
  });

  it('usa solo fechaFinPlaneada: ni inicio, ni finalización iniciada, ni cierre', () => {
    const porDia = countSprintsByPlannedDay([
      item({
        estado: 'EN_FINALIZACION',
        situacion: 'EN_FINALIZACION',
        fechaInicio: '2026-08-17T12:00:00.000Z',
        fechaFinPlaneada: '2026-09-06',
        fechaFinalizacionIniciada: '2026-09-07T06:13:36.319Z',
        fechaCierre: '2026-09-09T06:00:00.000Z',
      }),
    ]);

    expect([...porDia.keys()]).toEqual(['2026-09-06']);
  });
});

describe('pickNextSprintFinalization', () => {
  it('prioriza el Sprint que vence hoy', () => {
    const hoy = item({ situacion: 'VENCE_HOY', diasRestantes: 0, fechaFinPlaneada: '2026-10-05' });
    const proximo = pickNextSprintFinalization([item({ diasRestantes: 1 }), hoy, item({ diasRestantes: 3 })]);
    expect(proximo).toBe(hoy);
  });

  it('si ninguno vence hoy, elige el Sprint en curso más cercano', () => {
    const cercano = item({ diasRestantes: 2 });
    expect(pickNextSprintFinalization([item({ diasRestantes: 7 }), cercano, item({ diasRestantes: 4 })])).toBe(cercano);
  });

  it('ignora los planes ya vencidos, los Sprints en finalización y los que no tienen fecha', () => {
    const candidato = item({ diasRestantes: 6 });
    const proximo = pickNextSprintFinalization([
      item({ situacion: 'PLAN_VENCIDO', diasRestantes: -1 }),
      item({ estado: 'EN_FINALIZACION', situacion: 'EN_FINALIZACION', diasRestantes: 1 }),
      item({ situacion: 'SIN_FECHA', fechaFinPlaneada: null, diasRestantes: null }),
      candidato,
    ]);
    expect(proximo).toBe(candidato);
  });

  it('en caso de empate conserva el orden que envía el backend', () => {
    const primero = item({ diasRestantes: 2 });
    expect(pickNextSprintFinalization([primero, item({ diasRestantes: 2 })])).toBe(primero);
  });

  it('devuelve null cuando no hay ninguna finalización próxima', () => {
    expect(pickNextSprintFinalization([])).toBeNull();
    expect(pickNextSprintFinalization([item({ situacion: 'PLAN_VENCIDO', diasRestantes: -3 })])).toBeNull();
  });

  it('decide con los días restantes del backend, sin mirar el reloj del navegador', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
      const hoy = item({ situacion: 'VENCE_HOY', diasRestantes: 0, fechaFinPlaneada: '2026-10-05' });
      expect(pickNextSprintFinalization([hoy])).toBe(hoy);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('formato', () => {
  it('formatDiasRestantes: hoy, mañana, en N días y días pasados', () => {
    expect(formatDiasRestantes(0)).toBe('hoy');
    expect(formatDiasRestantes(1)).toBe('mañana');
    expect(formatDiasRestantes(4)).toBe('en 4 días');
    expect(formatDiasRestantes(-1)).toBe('hace 1 día');
    expect(formatDiasRestantes(-5)).toBe('hace 5 días');
  });

  it('formatea el día planificado sin desplazarlo (no lo interpreta como UTC)', () => {
    expect(formatDiaCorto('2026-10-05')).toBe('5 oct');
    expect(formatDiaCorto('2026-12-01')).toBe('1 dic');
    expect(formatDiaLargo('2026-10-08')).toBe('8 de octubre');
    expect(formatDiaLargo('2027-01-01')).toBe('1 de enero');
  });

  it('describePlannedDay da el nombre accesible del día, en singular y plural', () => {
    expect(describePlannedDay('2026-10-08', 3)).toBe('8 de octubre, 3 finalizaciones planificadas');
    expect(describePlannedDay('2026-10-12', 1)).toBe('12 de octubre, 1 finalización planificada');
  });

  it('cada situación tiene etiqueta y tono; el plan vencido no usa el rojo de error', () => {
    const situaciones = ['EN_CURSO', 'VENCE_HOY', 'PLAN_VENCIDO', 'EN_FINALIZACION', 'SIN_FECHA'] as const;
    for (const situacion of situaciones) {
      expect(SITUACION_SPRINT_LABEL[situacion]).toBeTruthy();
      expect(SITUACION_SPRINT_TONE[situacion]).toBeTruthy();
    }
    expect(SITUACION_SPRINT_TONE.PLAN_VENCIDO).toContain('attention');
    expect(SITUACION_SPRINT_TONE.PLAN_VENCIDO).not.toMatch(/error/);
  });
});
