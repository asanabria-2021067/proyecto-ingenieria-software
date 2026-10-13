import { EstadoSprint } from '@prisma/client';
import { dateOnlyToDay, diffInDays, guatemalaDayOf } from '../common/utils/guatemala-date';

/**
 * Situación temporal de un Sprint frente a su plan. Es un valor DERIVADO:
 * nunca se persiste ni amplía `EstadoSprint`. Las tres últimas solo aplican
 * a Sprints cerrados (histórico).
 */
export const SITUACIONES_SPRINT = [
  'EN_CURSO',
  'VENCE_HOY',
  'PLAN_VENCIDO',
  'EN_FINALIZACION',
  'SIN_FECHA',
  'FINALIZADO_ANTES',
  'FINALIZADO_EN_FECHA',
  'FINALIZADO_DESPUES',
] as const;

export type SituacionSprint = (typeof SITUACIONES_SPRINT)[number];

export interface SprintTemporalInput {
  estado: EstadoSprint;
  /** Columna `@db.Date`: fecha esperada de fin del trabajo. */
  fechaFinPlaneada: Date | null;
  /** Instante en que terminó el trabajo normal (ACTIVO -> EN_FINALIZACION). */
  fechaFinalizacionIniciada: Date | null;
}

export interface SprintTemporalStatus {
  situacion: SituacionSprint;
  /**
   * Fin operativo real menos plan, en días calendario de Guatemala: negativo
   * si se finalizó antes, 0 en fecha, positivo después. `null` mientras falte
   * el plan o la finalización no haya iniciado.
   */
  desviacionDias: number | null;
  /**
   * Plan menos hoy, en días calendario: negativo si el plan ya pasó. Solo
   * para Sprints operables con plan; `null` en el resto.
   */
  diasRestantes: number | null;
}

/**
 * Clasifica un Sprint contra su plan usando días calendario de Guatemala.
 * `hoy` llega como `YYYY-MM-DD` (ver `todayInGuatemala`) para que una misma
 * respuesta clasifique todos sus Sprints con el mismo día.
 *
 * Precedencia:
 *   1. EN_FINALIZACION — el estado real manda: el trabajo normal ya terminó,
 *      aunque el plan falte, haya vencido o siga en el futuro.
 *   2. SIN_FECHA — Sprint anterior a la planificación obligatoria.
 *   3. CERRADO — plan frente al fin operativo.
 *   4. ACTIVO — plan frente a hoy: PLAN_VENCIDO, VENCE_HOY o EN_CURSO.
 *
 * El fin operativo es `fechaFinalizacionIniciada`, nunca `fechaCierre`: el
 * cierre formal puede llegar días después por consolidación y no es un
 * retraso del equipo.
 */
export function classifySprintTemporalStatus(sprint: SprintTemporalInput, hoy: string): SprintTemporalStatus {
  const plannedDay = sprint.fechaFinPlaneada ? dateOnlyToDay(sprint.fechaFinPlaneada) : null;
  const actualDay = sprint.fechaFinalizacionIniciada ? guatemalaDayOf(sprint.fechaFinalizacionIniciada) : null;
  const desviacionDias = plannedDay !== null && actualDay !== null ? diffInDays(actualDay, plannedDay) : null;

  if (sprint.estado === EstadoSprint.EN_FINALIZACION) {
    return {
      situacion: 'EN_FINALIZACION',
      desviacionDias,
      diasRestantes: plannedDay !== null ? diffInDays(plannedDay, hoy) : null,
    };
  }

  if (plannedDay === null) {
    return { situacion: 'SIN_FECHA', desviacionDias: null, diasRestantes: null };
  }

  if (sprint.estado === EstadoSprint.CERRADO) {
    if (desviacionDias === null) {
      // Cerrado con plan pero sin fin operativo registrado (solo datos
      // anteriores al flujo Finalizar -> Cerrar). Cómo presentarlo es una
      // decisión de producto todavía abierta para la vista histórica; lo que
      // está descartado es suplir el dato con `fechaCierre`.
      throw new Error(
        'Sprint CERRADO con fechaFinPlaneada pero sin fechaFinalizacionIniciada: su situación histórica no está definida',
      );
    }
    return {
      situacion:
        desviacionDias < 0 ? 'FINALIZADO_ANTES' : desviacionDias === 0 ? 'FINALIZADO_EN_FECHA' : 'FINALIZADO_DESPUES',
      desviacionDias,
      diasRestantes: null,
    };
  }

  const diasRestantes = diffInDays(plannedDay, hoy);
  return {
    situacion: diasRestantes < 0 ? 'PLAN_VENCIDO' : diasRestantes === 0 ? 'VENCE_HOY' : 'EN_CURSO',
    desviacionDias,
    diasRestantes,
  };
}
