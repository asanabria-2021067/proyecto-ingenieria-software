import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

/**
 * El resumen de cierre solo publicaba el exceso AGREGADO por integrante, así
 * que el líder veía «este miembro se pasó 5 h» sin poder saber en qué tramo.
 * Para revisar tramo a tramo hace falta el exceso de cada uno y lo que el
 * propio estudiante argumentó al registrarlo.
 *
 * Se prueba la regla de cálculo aislada, con los mismos `Decimal` del servicio:
 * es aritmética de horas y no debe pasar por punto flotante.
 */

const cero = new Prisma.Decimal(0);

/** Misma expresión que `sprints.service.ts` para el exceso de un tramo. */
function excesoDeTramo(reportadas: string, estimacionTarea: number | null): string {
  const granulares = new Prisma.Decimal(reportadas);
  return (estimacionTarea === null
    ? cero
    : Prisma.Decimal.max(granulares.minus(estimacionTarea), 0)
  ).toFixed(2);
}

/** Misma expresión que el servicio para las justificaciones del estudiante. */
function justificacionDeTramo(registros: Array<{ justificacionExceso: string | null }>): string | null {
  const textos = registros
    .map((fila) => fila.justificacionExceso?.trim())
    .filter((texto): texto is string => !!texto);
  return textos.length > 0 ? textos.join(' · ') : null;
}

describe('Exceso por tramo en el resumen de cierre', () => {
  it('mide lo reportado por encima de la estimación de su tarea', () => {
    expect(excesoDeTramo('7.50', 5)).toBe('2.50');
  });

  it('no inventa exceso cuando se reportó por debajo o justo en la estimación', () => {
    expect(excesoDeTramo('3.00', 5)).toBe('0.00');
    expect(excesoDeTramo('5.00', 5)).toBe('0.00');
  });

  it('sin estimación no hay exceso que medir', () => {
    expect(excesoDeTramo('9.00', null)).toBe('0.00');
  });

  it('conserva los céntimos de hora sin pasar por punto flotante', () => {
    // 0.1 + 0.2 en binario daría 0.30000000000000004; aquí no.
    expect(excesoDeTramo('5.30', 5)).toBe('0.30');
    expect(excesoDeTramo('0.30', 0.1)).toBe('0.20');
  });

  it('reúne lo que el estudiante argumentó en cada registro del tramo', () => {
    expect(
      justificacionDeTramo([
        { justificacionExceso: 'Se cayó el proveedor' },
        { justificacionExceso: '  Hubo retrabajo  ' },
      ]),
    ).toBe('Se cayó el proveedor · Hubo retrabajo');
  });

  it('sin justificación del estudiante devuelve null, nunca una cadena vacía', () => {
    expect(justificacionDeTramo([{ justificacionExceso: null }, { justificacionExceso: '   ' }])).toBeNull();
    expect(justificacionDeTramo([])).toBeNull();
  });
});
