import { describe, expect, it } from 'vitest';
import {
  buildParticipationBaselines,
  defaultSprintClosingFormValues,
  planParticipationAdjustments,
  sprintClosingFormSchema,
  type SprintClosingFormValues,
} from '../components/projects/sprint-closing-form.schema';
import type { SprintClosingSummaryDto } from '../lib/types/sprints';

function fila(overrides: Partial<SprintClosingFormValues['participaciones'][number]> = {}) {
  return {
    idParticipacion: 51,
    horasCalculadas: 18,
    horasAprobadas: '18',
    justificacionAjuste: '',
    ...overrides,
  };
}

function valores(filas: SprintClosingFormValues['participaciones']): SprintClosingFormValues {
  return { participaciones: filas };
}

describe('sprintClosingFormSchema — regla central de justificación', () => {
  it('igualdad: aprobadas === calculadas sin justificación es válido', () => {
    const result = sprintClosingFormSchema.safeParse(
      valores([fila({ horasCalculadas: 10, horasAprobadas: '10', justificacionAjuste: '' })]),
    );
    expect(result.success).toBe(true);
  });

  it('aumento sin justificación es inválido, marca el error en justificacionAjuste', () => {
    const result = sprintClosingFormSchema.safeParse(
      valores([fila({ horasCalculadas: 18, horasAprobadas: '20', justificacionAjuste: '' })]),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'participaciones.0.justificacionAjuste');
      expect(issue).toBeDefined();
    }
  });

  it('aumento con justificación es válido', () => {
    const result = sprintClosingFormSchema.safeParse(
      valores([fila({ horasCalculadas: 18, horasAprobadas: '20', justificacionAjuste: 'Horas extra validadas' })]),
    );
    expect(result.success).toBe(true);
  });

  it('disminución sin justificación es inválido', () => {
    const result = sprintClosingFormSchema.safeParse(
      valores([fila({ horasCalculadas: 18, horasAprobadas: '15', justificacionAjuste: '' })]),
    );
    expect(result.success).toBe(false);
  });

  it('disminución con justificación es válido', () => {
    const result = sprintClosingFormSchema.safeParse(
      valores([fila({ horasCalculadas: 18, horasAprobadas: '15', justificacionAjuste: 'Se descuentan horas no verificables' })]),
    );
    expect(result.success).toBe(true);
  });

  it('justificación de solo espacios cuenta como vacía — sigue inválido', () => {
    const result = sprintClosingFormSchema.safeParse(
      valores([fila({ horasCalculadas: 18, horasAprobadas: '15', justificacionAjuste: '     ' })]),
    );
    expect(result.success).toBe(false);
  });

  it('comparación numérica correcta: "10" y "10.0" se consideran iguales, no strings distintos', () => {
    const result = sprintClosingFormSchema.safeParse(
      valores([fila({ horasCalculadas: 10, horasAprobadas: '10.0', justificacionAjuste: '' })]),
    );
    expect(result.success).toBe(true);
  });

  it('horasCalculadas null (sin base de comparación) nunca exige justificación', () => {
    const result = sprintClosingFormSchema.safeParse(
      valores([fila({ horasCalculadas: null, horasAprobadas: '5', justificacionAjuste: '' })]),
    );
    expect(result.success).toBe(true);
  });

  it('horasAprobadas negativa es inválida', () => {
    const result = sprintClosingFormSchema.safeParse(
      valores([fila({ horasCalculadas: 10, horasAprobadas: '-1', justificacionAjuste: 'motivo' })]),
    );
    expect(result.success).toBe(false);
  });

  it('horasAprobadas vacía es inválida', () => {
    const result = sprintClosingFormSchema.safeParse(valores([fila({ horasAprobadas: '' })]));
    expect(result.success).toBe(false);
  });

  it('dos participaciones — el error solo aparece en la modificada', () => {
    const result = sprintClosingFormSchema.safeParse(
      valores([
        fila({ idParticipacion: 51, horasCalculadas: 10, horasAprobadas: '12', justificacionAjuste: '' }),
        fila({ idParticipacion: 87, horasCalculadas: 8, horasAprobadas: '8', justificacionAjuste: '' }),
      ]),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('participaciones.0.justificacionAjuste');
      expect(paths).not.toContain('participaciones.1.justificacionAjuste');
    }
  });

  it('volver a igualdad: 18 -> 20 (inválido) -> 18 (válido de nuevo, sin error stale)', () => {
    const invalido = sprintClosingFormSchema.safeParse(
      valores([fila({ horasCalculadas: 18, horasAprobadas: '20', justificacionAjuste: '' })]),
    );
    expect(invalido.success).toBe(false);

    const valido = sprintClosingFormSchema.safeParse(
      valores([fila({ horasCalculadas: 18, horasAprobadas: '18', justificacionAjuste: '' })]),
    );
    expect(valido.success).toBe(true);
  });
});

function summaryFixture(): SprintClosingSummaryDto {
  return {
    idProyecto: 7,
    idSprint: 1,
    participantes: [
      {
        idUsuario: 1,
        nombre: 'Andrea',
        apellido: 'Pérez',
        correo: 'andrea@uvg.edu.gt',
        fotoUrl: null,
        roles: [
          { idRolProyecto: 1, nombreRol: 'Backend Developer' },
          { idRolProyecto: 2, nombreRol: 'Líder' },
        ],
        tareasRealizadas: 5,
        horasReportadas: 19,
        horasCalculadas: 18,
        horasAprobadas: 18,
        participaciones: [
          {
            idParticipacion: 51,
            idRolProyecto: 1,
            nombreRol: 'Backend Developer',
            horasReportadas: 11,
            horasCalculadas: 10,
            horasAprobadas: 10,
            justificacionAjuste: null,
          },
          {
            idParticipacion: 87,
            idRolProyecto: 2,
            nombreRol: 'Líder',
            horasReportadas: 8,
            horasCalculadas: 8,
            horasAprobadas: 8,
            justificacionAjuste: null,
          },
        ],
      },
    ],
  };
}

describe('defaultSprintClosingFormValues', () => {
  it('produce una fila plana por participación, con horasAprobadas ya normalizada a string', () => {
    const values = defaultSprintClosingFormValues(summaryFixture());
    expect(values.participaciones).toHaveLength(2);
    expect(values.participaciones[0]).toEqual({
      idParticipacion: 51,
      horasCalculadas: 10,
      horasAprobadas: '10',
      justificacionAjuste: '',
    });
  });

  it('cuando horasAprobadas es null, precarga con horasCalculadas (decisión de UI, no fabricación de contrato)', () => {
    const summary = summaryFixture();
    summary.participantes[0].participaciones[0].horasAprobadas = null;
    const values = defaultSprintClosingFormValues(summary);
    expect(values.participaciones[0].horasAprobadas).toBe('10');
  });
});

describe('planParticipationAdjustments', () => {
  it('sin cambios respecto al baseline: cero ajustes planificados', () => {
    const summary = summaryFixture();
    const baseline = buildParticipationBaselines(summary);
    const values = defaultSprintClosingFormValues(summary);

    const adjustments = planParticipationAdjustments(values, baseline);
    expect(adjustments).toEqual([]);
  });

  it('una fila modificada: exactamente un ajuste, con idParticipacion e input correctos', () => {
    const summary = summaryFixture();
    const baseline = buildParticipationBaselines(summary);
    const values = defaultSprintClosingFormValues(summary);
    values.participaciones[0] = {
      ...values.participaciones[0],
      horasAprobadas: '12',
      justificacionAjuste: 'Se reconocen dos horas adicionales',
    };

    const adjustments = planParticipationAdjustments(values, baseline);
    expect(adjustments).toEqual([
      { idParticipacion: 51, horasAprobadas: 12, justificacionAjuste: 'Se reconocen dos horas adicionales' },
    ]);
  });

  it('dos filas modificadas: dos ajustes con idParticipacion distintos, nunca idUsuario', () => {
    const summary = summaryFixture();
    const baseline = buildParticipationBaselines(summary);
    const values = defaultSprintClosingFormValues(summary);
    values.participaciones[0] = { ...values.participaciones[0], horasAprobadas: '12', justificacionAjuste: 'motivo A' };
    values.participaciones[1] = { ...values.participaciones[1], horasAprobadas: '6', justificacionAjuste: 'motivo B' };

    const adjustments = planParticipationAdjustments(values, baseline);
    expect(adjustments).toHaveLength(2);
    const ids = adjustments.map((a) => a.idParticipacion).sort();
    expect(ids).toEqual([51, 87]);
    expect(adjustments.every((a) => !('idUsuario' in a))).toBe(true);
  });

  it('al volver a igualdad, el payload omite justificacionAjuste (backend la limpia al no recibirla)', () => {
    const summary = summaryFixture();
    summary.participantes[0].participaciones[0].horasAprobadas = 12;
    summary.participantes[0].participaciones[0].justificacionAjuste = 'Ajuste previo';
    const baseline = buildParticipationBaselines(summary);
    const values = defaultSprintClosingFormValues(summary);
    // El líder revierte a las horas calculadas (10) y borra el texto.
    values.participaciones[0] = { ...values.participaciones[0], horasAprobadas: '10', justificacionAjuste: '' };

    const adjustments = planParticipationAdjustments(values, baseline);
    expect(adjustments).toEqual([{ idParticipacion: 51, horasAprobadas: 10 }]);
    expect(adjustments[0]).not.toHaveProperty('justificacionAjuste');
  });
});
