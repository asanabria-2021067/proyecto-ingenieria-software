import { describe, expect, it } from 'vitest';
import { calcularProgresoHito } from '../src/common/hito-progreso';

/**
 * A12: semántica canónica única de progreso de Hito — extraída del bucle
 * interno de ProjectsService.calcularAvanceHitos (documentado en su
 * docstring original sobre el bug de Hito.estadoHito congelado en
 * PENDIENTE). Estos tests fijan la fórmula de forma aislada, reutilizada
 * tanto por ProjectsService (agregación de GET) como por TasksService
 * (persistencia real tras un write-path de estadoTarea) y SprintsService
 * (porcentaje expuesto en SprintDetail).
 */
describe('calcularProgresoHito', () => {
  it('PENDIENTE: ninguna tarea completada — porcentaje 0', () => {
    const resultado = calcularProgresoHito([
      { estadoTarea: 'POR_HACER' },
      { estadoTarea: 'EN_PROGRESO' },
    ]);

    expect(resultado).toEqual({ estadoHito: 'PENDIENTE', porcentaje: 0 });
  });

  it('EN_PROGRESO: progreso parcial (no 0%, no 100%)', () => {
    const resultado = calcularProgresoHito([
      { estadoTarea: 'HECHO' },
      { estadoTarea: 'POR_HACER' },
      { estadoTarea: 'EN_PROGRESO' },
      { estadoTarea: 'EN_REVISION' },
    ]);

    expect(resultado).toEqual({ estadoHito: 'EN_PROGRESO', porcentaje: 25 });
  });

  it('COMPLETADO: todas las tareas relevantes cumplen HECHO (100%, con al menos una tarea)', () => {
    const resultado = calcularProgresoHito([{ estadoTarea: 'HECHO' }, { estadoTarea: 'HECHO' }]);

    expect(resultado).toEqual({ estadoHito: 'COMPLETADO', porcentaje: 100 });
  });

  it('Hito sin tareas: porcentaje 0, PENDIENTE, sin división por cero ni NaN', () => {
    const resultado = calcularProgresoHito([]);

    expect(resultado.porcentaje).toBe(0);
    expect(Number.isNaN(resultado.porcentaje)).toBe(false);
    expect(resultado.estadoHito).toBe('PENDIENTE');
  });

  it('redondea el porcentaje (2 de 3 = 67%, no 66.66...)', () => {
    const resultado = calcularProgresoHito([
      { estadoTarea: 'HECHO' },
      { estadoTarea: 'HECHO' },
      { estadoTarea: 'POR_HACER' },
    ]);

    expect(resultado).toEqual({ estadoHito: 'EN_PROGRESO', porcentaje: 67 });
  });
});
