import { describe, expect, it } from 'vitest';
import { EstadoSprint } from '@prisma/client';
import {
  SITUACIONES_SPRINT,
  classifySprintTemporalStatus,
  type SprintTemporalInput,
} from '../src/sprints/sprint-temporal-status';

const HOY = '2026-10-14';

/** Columna @db.Date tal como la entrega Prisma: medianoche UTC del día. */
function plan(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function sprint(overrides: Partial<SprintTemporalInput> = {}): SprintTemporalInput {
  return {
    estado: EstadoSprint.ACTIVO,
    fechaFinPlaneada: plan('2026-10-14'),
    fechaFinalizacionIniciada: null,
    ...overrides,
  };
}

describe('classifySprintTemporalStatus', () => {
  it('declara exactamente las ocho situaciones derivadas', () => {
    expect([...SITUACIONES_SPRINT]).toEqual([
      'EN_CURSO',
      'VENCE_HOY',
      'PLAN_VENCIDO',
      'EN_FINALIZACION',
      'SIN_FECHA',
      'FINALIZADO_ANTES',
      'FINALIZADO_EN_FECHA',
      'FINALIZADO_DESPUES',
    ]);
  });

  describe('Sprint ACTIVO: plan frente a hoy', () => {
    it('EN_CURSO cuando el plan es posterior a hoy', () => {
      expect(classifySprintTemporalStatus(sprint({ fechaFinPlaneada: plan('2026-10-16') }), HOY)).toEqual({
        situacion: 'EN_CURSO',
        desviacionDias: null,
        diasRestantes: 2,
      });
    });

    it('VENCE_HOY cuando el plan es hoy', () => {
      expect(classifySprintTemporalStatus(sprint({ fechaFinPlaneada: plan('2026-10-14') }), HOY)).toEqual({
        situacion: 'VENCE_HOY',
        desviacionDias: null,
        diasRestantes: 0,
      });
    });

    it('PLAN_VENCIDO cuando el plan ya pasó, con diasRestantes negativo', () => {
      expect(classifySprintTemporalStatus(sprint({ fechaFinPlaneada: plan('2026-10-09') }), HOY)).toEqual({
        situacion: 'PLAN_VENCIDO',
        desviacionDias: null,
        diasRestantes: -5,
      });
    });

    it('SIN_FECHA cuando no tiene plan (Sprint anterior a la planificación obligatoria)', () => {
      expect(classifySprintTemporalStatus(sprint({ fechaFinPlaneada: null }), HOY)).toEqual({
        situacion: 'SIN_FECHA',
        desviacionDias: null,
        diasRestantes: null,
      });
    });
  });

  describe('Sprint EN_FINALIZACION: el estado real tiene precedencia', () => {
    it('sobre un plan vencido: no es PLAN_VENCIDO, y la desviación ya es conocida', () => {
      expect(
        classifySprintTemporalStatus(
          sprint({
            estado: EstadoSprint.EN_FINALIZACION,
            fechaFinPlaneada: plan('2026-10-12'),
            fechaFinalizacionIniciada: new Date('2026-10-13T16:00:00.000Z'),
          }),
          HOY,
        ),
      ).toEqual({ situacion: 'EN_FINALIZACION', desviacionDias: 1, diasRestantes: -2 });
    });

    it('sobre un plan futuro: finalizó antes de lo previsto', () => {
      expect(
        classifySprintTemporalStatus(
          sprint({
            estado: EstadoSprint.EN_FINALIZACION,
            fechaFinPlaneada: plan('2026-10-20'),
            fechaFinalizacionIniciada: new Date('2026-10-14T15:00:00.000Z'),
          }),
          HOY,
        ),
      ).toEqual({ situacion: 'EN_FINALIZACION', desviacionDias: -6, diasRestantes: 6 });
    });

    it('sobre la ausencia de plan: no es SIN_FECHA', () => {
      expect(
        classifySprintTemporalStatus(
          sprint({
            estado: EstadoSprint.EN_FINALIZACION,
            fechaFinPlaneada: null,
            fechaFinalizacionIniciada: new Date('2026-10-13T16:00:00.000Z'),
          }),
          HOY,
        ),
      ).toEqual({ situacion: 'EN_FINALIZACION', desviacionDias: null, diasRestantes: null });
    });
  });

  describe('Sprint CERRADO: plan frente al fin operativo', () => {
    const cerrado = (fechaFinalizacionIniciada: Date | null, fechaFinPlaneada: Date | null = plan('2026-10-14')) =>
      sprint({ estado: EstadoSprint.CERRADO, fechaFinPlaneada, fechaFinalizacionIniciada });

    it('FINALIZADO_ANTES con desviación negativa', () => {
      expect(classifySprintTemporalStatus(cerrado(new Date('2026-10-12T18:00:00.000Z')), HOY)).toEqual({
        situacion: 'FINALIZADO_ANTES',
        desviacionDias: -2,
        diasRestantes: null,
      });
    });

    it('FINALIZADO_EN_FECHA con desviación cero', () => {
      expect(classifySprintTemporalStatus(cerrado(new Date('2026-10-14T18:00:00.000Z')), HOY)).toEqual({
        situacion: 'FINALIZADO_EN_FECHA',
        desviacionDias: 0,
        diasRestantes: null,
      });
    });

    it('FINALIZADO_DESPUES con desviación positiva', () => {
      expect(classifySprintTemporalStatus(cerrado(new Date('2026-10-16T18:00:00.000Z')), HOY)).toEqual({
        situacion: 'FINALIZADO_DESPUES',
        desviacionDias: 2,
        diasRestantes: null,
      });
    });

    it('no depende de hoy: un Sprint cerrado conserva su clasificación con el paso del tiempo', () => {
      const s = cerrado(new Date('2026-10-16T18:00:00.000Z'));
      expect(classifySprintTemporalStatus(s, '2026-10-17')).toEqual(classifySprintTemporalStatus(s, '2027-03-01'));
    });

    it('SIN_FECHA cuando el Sprint cerrado nunca tuvo plan', () => {
      expect(classifySprintTemporalStatus(cerrado(new Date('2026-10-12T18:00:00.000Z'), null), HOY)).toEqual({
        situacion: 'SIN_FECHA',
        desviacionDias: null,
        diasRestantes: null,
      });
    });

    it('con plan pero sin fin operativo no se clasifica: nunca usa fechaCierre como sustituto', () => {
      expect(() => classifySprintTemporalStatus(cerrado(null), HOY)).toThrow(/fechaFinalizacionIniciada/);
    });
  });

  describe('frontera de día: Guatemala, no UTC', () => {
    it('finalizar a las 20:00 de Guatemala del día planeado (02:00Z del siguiente) es EN_FECHA', () => {
      expect(
        classifySprintTemporalStatus(
          sprint({
            estado: EstadoSprint.CERRADO,
            fechaFinPlaneada: plan('2026-10-14'),
            fechaFinalizacionIniciada: new Date('2026-10-15T02:00:00.000Z'),
          }),
          HOY,
        ),
      ).toMatchObject({ situacion: 'FINALIZADO_EN_FECHA', desviacionDias: 0 });
    });

    it('finalizar a las 00:00 de Guatemala del día siguiente (06:00Z) ya es DESPUES', () => {
      expect(
        classifySprintTemporalStatus(
          sprint({
            estado: EstadoSprint.CERRADO,
            fechaFinPlaneada: plan('2026-10-14'),
            fechaFinalizacionIniciada: new Date('2026-10-15T06:00:00.000Z'),
          }),
          HOY,
        ),
      ).toMatchObject({ situacion: 'FINALIZADO_DESPUES', desviacionDias: 1 });
    });

    it('el plan (DATE a medianoche UTC) no se desplaza al día anterior al compararlo con hoy', () => {
      // 2026-10-14T00:00Z es todavía 13 de octubre en Guatemala; el plan sigue siendo el 14.
      expect(classifySprintTemporalStatus(sprint({ fechaFinPlaneada: plan('2026-10-14') }), '2026-10-13')).toMatchObject({
        situacion: 'EN_CURSO',
        diasRestantes: 1,
      });
    });

    it('cruza fin de mes y de año con signos correctos', () => {
      expect(classifySprintTemporalStatus(sprint({ fechaFinPlaneada: plan('2027-01-02') }), '2026-12-30')).toMatchObject({
        situacion: 'EN_CURSO',
        diasRestantes: 3,
      });
      expect(classifySprintTemporalStatus(sprint({ fechaFinPlaneada: plan('2026-09-30') }), '2026-10-02')).toMatchObject({
        situacion: 'PLAN_VENCIDO',
        diasRestantes: -2,
      });
    });
  });
});
