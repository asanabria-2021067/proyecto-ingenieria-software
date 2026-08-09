import { describe, expect, it } from 'vitest';
import {
  COLUMNAS_TABLERO,
  FILTRO_SIN_HITO,
  FILTRO_SIN_ROL,
  FILTRO_TODOS,
  coincideFiltroHito,
  coincideFiltroRol,
  derivarOpcionesHito,
  derivarOpcionesRol,
  estaVencida,
  filtrarTareas,
  formatearFechaLimite,
  ordenarTareas,
} from '../components/projects/task-board.utils';
import type { TareaPublicaDTO } from '../lib/types/tasks';

function tarea(overrides: Partial<TareaPublicaDTO> = {}): TareaPublicaDTO {
  return {
    idTarea: 1,
    idProyecto: 10,
    idHito: null,
    idRolProyecto: null,
    tituloTarea: 'Tarea',
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

describe('COLUMNAS_TABLERO', () => {
  it('define exactamente cuatro columnas en el orden fijo', () => {
    expect(COLUMNAS_TABLERO).toHaveLength(4);
    expect(COLUMNAS_TABLERO.map((c) => c.estado)).toEqual([
      'POR_HACER',
      'EN_PROGRESO',
      'EN_REVISION',
      'HECHO',
    ]);
    expect(COLUMNAS_TABLERO.map((c) => c.titulo)).toEqual([
      'Por hacer',
      'En progreso',
      'En revisión',
      'Hecho',
    ]);
  });
});

describe('ordenarTareas', () => {
  it('ordena por prioridad ALTA > MEDIA > BAJA', () => {
    const tareas = [
      tarea({ idTarea: 1, prioridad: 'BAJA' }),
      tarea({ idTarea: 2, prioridad: 'ALTA' }),
      tarea({ idTarea: 3, prioridad: 'MEDIA' }),
    ];
    expect(ordenarTareas(tareas).map((t) => t.idTarea)).toEqual([2, 3, 1]);
  });

  it('dentro de la misma prioridad, ordena por fecha límite ascendente', () => {
    const tareas = [
      tarea({ idTarea: 1, prioridad: 'ALTA', fechaLimite: '2026-06-01' }),
      tarea({ idTarea: 2, prioridad: 'ALTA', fechaLimite: '2026-01-01' }),
      tarea({ idTarea: 3, prioridad: 'ALTA', fechaLimite: '2026-03-01' }),
    ];
    expect(ordenarTareas(tareas).map((t) => t.idTarea)).toEqual([2, 3, 1]);
  });

  it('las tareas sin fecha quedan al final dentro de su prioridad', () => {
    const tareas = [
      tarea({ idTarea: 1, prioridad: 'ALTA', fechaLimite: null }),
      tarea({ idTarea: 2, prioridad: 'ALTA', fechaLimite: '2026-01-01' }),
    ];
    expect(ordenarTareas(tareas).map((t) => t.idTarea)).toEqual([2, 1]);
  });

  it('desempata por idTarea ascendente cuando prioridad y fecha coinciden', () => {
    const tareas = [
      tarea({ idTarea: 3, prioridad: 'MEDIA', fechaLimite: '2026-01-01' }),
      tarea({ idTarea: 1, prioridad: 'MEDIA', fechaLimite: '2026-01-01' }),
      tarea({ idTarea: 2, prioridad: 'MEDIA', fechaLimite: '2026-01-01' }),
    ];
    expect(ordenarTareas(tareas).map((t) => t.idTarea)).toEqual([1, 2, 3]);
  });

  it('desempata por idTarea cuando ambas carecen de fecha', () => {
    const tareas = [
      tarea({ idTarea: 5, prioridad: 'BAJA', fechaLimite: null }),
      tarea({ idTarea: 2, prioridad: 'BAJA', fechaLimite: null }),
    ];
    expect(ordenarTareas(tareas).map((t) => t.idTarea)).toEqual([2, 5]);
  });

  it('no muta el array original', () => {
    const original = [
      tarea({ idTarea: 2, prioridad: 'BAJA' }),
      tarea({ idTarea: 1, prioridad: 'ALTA' }),
    ];
    const copiaIds = original.map((t) => t.idTarea);
    ordenarTareas(original);
    expect(original.map((t) => t.idTarea)).toEqual(copiaIds);
  });
});

describe('estaVencida', () => {
  const hoy = new Date('2026-06-15T12:00:00');

  it('una tarea con fecha pasada y estado distinto de HECHO está vencida', () => {
    expect(estaVencida(tarea({ fechaLimite: '2026-06-01', estadoTarea: 'EN_PROGRESO' }), hoy)).toBe(true);
  });

  it('una tarea con fecha futura no está vencida', () => {
    expect(estaVencida(tarea({ fechaLimite: '2026-07-01', estadoTarea: 'EN_PROGRESO' }), hoy)).toBe(false);
  });

  it('una tarea HECHO nunca se marca vencida aunque la fecha ya pasó', () => {
    expect(estaVencida(tarea({ fechaLimite: '2026-01-01', estadoTarea: 'HECHO' }), hoy)).toBe(false);
  });

  it('una tarea sin fecha nunca está vencida', () => {
    expect(estaVencida(tarea({ fechaLimite: null, estadoTarea: 'POR_HACER' }), hoy)).toBe(false);
  });
});

describe('formatearFechaLimite', () => {
  it('no desplaza el día calendario sin importar la zona horaria del proceso', () => {
    expect(formatearFechaLimite('2026-12-25')).toContain('25');
    expect(formatearFechaLimite('2026-01-01')).toContain('1');
  });
});

describe('derivarOpcionesRol', () => {
  it('deduplica por ID y ordena por nombre', () => {
    const tareas = [
      tarea({ idTarea: 1, rolProyecto: { idRolProyecto: 2, nombreRol: 'Backend' } }),
      tarea({ idTarea: 2, rolProyecto: { idRolProyecto: 1, nombreRol: 'Diseño' } }),
      tarea({ idTarea: 3, rolProyecto: { idRolProyecto: 2, nombreRol: 'Backend' } }),
    ];
    expect(derivarOpcionesRol(tareas)).toEqual([
      { valor: '2', etiqueta: 'Backend' },
      { valor: '1', etiqueta: 'Diseño' },
    ]);
  });

  it('incluye "Sin rol" solo cuando existe al menos una tarea sin rol', () => {
    const conSinRol = [tarea({ rolProyecto: null })];
    expect(derivarOpcionesRol(conSinRol)).toEqual([{ valor: FILTRO_SIN_ROL, etiqueta: 'Sin rol' }]);

    const sinTareasSueltas = [tarea({ rolProyecto: { idRolProyecto: 1, nombreRol: 'Backend' } })];
    expect(derivarOpcionesRol(sinTareasSueltas).some((o) => o.valor === FILTRO_SIN_ROL)).toBe(false);
  });
});

describe('derivarOpcionesHito', () => {
  it('deduplica por ID y ordena por nombre', () => {
    const tareas = [
      tarea({ idTarea: 1, hito: { idHito: 2, tituloHito: 'Entrega 2' } }),
      tarea({ idTarea: 2, hito: { idHito: 1, tituloHito: 'Entrega 1' } }),
    ];
    expect(derivarOpcionesHito(tareas)).toEqual([
      { valor: '1', etiqueta: 'Entrega 1' },
      { valor: '2', etiqueta: 'Entrega 2' },
    ]);
  });

  it('incluye "Sin hito" solo cuando existe al menos una tarea sin hito', () => {
    expect(derivarOpcionesHito([tarea({ hito: null })])).toEqual([
      { valor: FILTRO_SIN_HITO, etiqueta: 'Sin hito' },
    ]);
  });
});

describe('filtrarTareas / coincideFiltroRol / coincideFiltroHito', () => {
  const tareas = [
    tarea({ idTarea: 1, rolProyecto: { idRolProyecto: 1, nombreRol: 'Backend' }, hito: { idHito: 1, tituloHito: 'E1' } }),
    tarea({ idTarea: 2, rolProyecto: null, hito: { idHito: 1, tituloHito: 'E1' } }),
    tarea({ idTarea: 3, rolProyecto: { idRolProyecto: 1, nombreRol: 'Backend' }, hito: null }),
  ];

  it('FILTRO_TODOS no descarta ninguna tarea', () => {
    expect(filtrarTareas(tareas, FILTRO_TODOS, FILTRO_TODOS)).toHaveLength(3);
  });

  it('filtra por rol específico', () => {
    expect(filtrarTareas(tareas, '1', FILTRO_TODOS).map((t) => t.idTarea)).toEqual([1, 3]);
  });

  it('filtra por "sin rol"', () => {
    expect(filtrarTareas(tareas, FILTRO_SIN_ROL, FILTRO_TODOS).map((t) => t.idTarea)).toEqual([2]);
  });

  it('filtra por hito específico', () => {
    expect(filtrarTareas(tareas, FILTRO_TODOS, '1').map((t) => t.idTarea)).toEqual([1, 2]);
  });

  it('filtra por "sin hito"', () => {
    expect(filtrarTareas(tareas, FILTRO_TODOS, FILTRO_SIN_HITO).map((t) => t.idTarea)).toEqual([3]);
  });

  it('combina rol e hito con lógica AND', () => {
    expect(filtrarTareas(tareas, '1', '1').map((t) => t.idTarea)).toEqual([1]);
  });

  it('no muta la colección original', () => {
    const idsOriginales = tareas.map((t) => t.idTarea);
    filtrarTareas(tareas, '1', FILTRO_TODOS);
    expect(tareas.map((t) => t.idTarea)).toEqual(idsOriginales);
  });

  it('coincideFiltroRol/coincideFiltroHito exponen la misma lógica por tarea', () => {
    expect(coincideFiltroRol(tareas[0], '1')).toBe(true);
    expect(coincideFiltroRol(tareas[1], '1')).toBe(false);
    expect(coincideFiltroHito(tareas[2], FILTRO_SIN_HITO)).toBe(true);
  });
});
