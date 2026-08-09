import { describe, expect, it } from 'vitest';
import {
  computeTaskProgress,
  getProgressVisualState,
} from '../components/projects/task-board.utils';
import type { TareaPublicaDTO } from '../lib/types/tasks';

function tarea(overrides: Partial<TareaPublicaDTO> = {}): TareaPublicaDTO {
  return {
    idTarea: 1,
    idProyecto: 10,
    idHito: null,
    idRolProyecto: null,
    tituloTarea: 'T',
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    creadaPor: 1,
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    fechaLimite: null,
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
    horasReales: null,
    asignacionActiva: null,
    rolProyecto: null,
    hito: null,
    etiquetas: [],
    cantidadComentarios: 0,
    ...overrides,
  };
}

describe('getProgressVisualState (Sección 16)', () => {
  it('0–33 % es rojo', () => {
    for (const p of [0, 10, 33]) expect(getProgressVisualState(p).bar).toContain('red');
  });

  it('34–66 % es naranja', () => {
    for (const p of [34, 50, 66]) expect(getProgressVisualState(p).bar).toContain('orange');
  });

  it('67–99 % es verde', () => {
    for (const p of [67, 80, 99]) expect(getProgressVisualState(p).bar).toContain('green');
  });

  it('100 % usa el verde UVG (primary) y marca complete', () => {
    const v = getProgressVisualState(100);
    expect(v.bar).toContain('primary');
    expect(v.complete).toBe(true);
  });

  it('acota valores fuera de rango o no finitos sin lanzar', () => {
    expect(getProgressVisualState(-20).bar).toContain('red');
    expect(getProgressVisualState(999).complete).toBe(true);
    expect(getProgressVisualState(Number.NaN).bar).toContain('red');
  });
});

describe('computeTaskProgress (Sección 14)', () => {
  it('sin tareas devuelve 0 % y conteos en cero (sin dividir por cero)', () => {
    const r = computeTaskProgress([]);
    expect(r.total).toBe(0);
    expect(r.porcentaje).toBe(0);
    expect(r.conteos).toEqual({ POR_HACER: 0, EN_PROGRESO: 0, EN_REVISION: 0, HECHO: 0 });
  });

  it('cuenta los cuatro estados, incluido En revisión, y calcula HECHO/total', () => {
    const r = computeTaskProgress([
      tarea({ estadoTarea: 'POR_HACER' }),
      tarea({ estadoTarea: 'EN_PROGRESO' }),
      tarea({ estadoTarea: 'EN_REVISION' }),
      tarea({ estadoTarea: 'HECHO' }),
    ]);
    expect(r.total).toBe(4);
    expect(r.conteos.EN_REVISION).toBe(1);
    expect(r.porcentaje).toBe(25);
  });

  it('redondea el porcentaje', () => {
    const r = computeTaskProgress([
      tarea({ estadoTarea: 'HECHO' }),
      tarea({ estadoTarea: 'POR_HACER' }),
      tarea({ estadoTarea: 'POR_HACER' }),
    ]);
    expect(r.porcentaje).toBe(33); // 1/3 = 33.33 → 33
  });
});
