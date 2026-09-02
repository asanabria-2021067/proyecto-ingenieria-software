import { describe, expect, it } from 'vitest';
import {
  FILTRO_TODOS,
  filterTasksByPriority,
  filterTasksBySprint,
  filterTasksByStatus,
  groupTasksByProject,
  groupTasksBySprint,
  paginateTasks,
  searchTasks,
  sortTasks,
} from '../lib/tasks/filters';
import type { TareaPublicaDTO } from '../lib/types/tasks';

/** DTO canónico + `idSprint` (todavía no expuesto por el backend). */
type TareaTest = TareaPublicaDTO & { idSprint: number | null };

function tarea(overrides: Partial<TareaTest> = {}): TareaTest {
  return {
    idTarea: 1,
    idProyecto: 10,
    idHito: null,
    idRolProyecto: null,
    idSprint: null,
    tituloTarea: 'Tarea',
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    creadaPor: 1,
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    fechaLimite: null,
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
    asignacionActiva: null,
    rolProyecto: null,
    hito: null,
    etiquetas: [],
    cantidadComentarios: 0,
    ...overrides,
  };
}

// Muestra reutilizable: ids 1..6 con estado / prioridad / sprint variados.
function muestra(): TareaTest[] {
  return [
    tarea({ idTarea: 1, estadoTarea: 'POR_HACER', prioridad: 'ALTA', idSprint: 1 }),
    tarea({ idTarea: 2, estadoTarea: 'EN_PROGRESO', prioridad: 'ALTA', idSprint: 1 }),
    tarea({ idTarea: 3, estadoTarea: 'EN_PROGRESO', prioridad: 'BAJA', idSprint: 2 }),
    tarea({ idTarea: 4, estadoTarea: 'HECHO', prioridad: 'MEDIA', idSprint: 2 }),
    tarea({ idTarea: 5, estadoTarea: 'EN_PROGRESO', prioridad: 'ALTA', idSprint: null }),
    tarea({ idTarea: 6, estadoTarea: 'POR_HACER', prioridad: 'ALTA', idSprint: 1 }),
  ];
}

const ids = (tareas: { idTarea: number }[]) => tareas.map((t) => t.idTarea);

describe('filterTasksByStatus', () => {
  it('entrada vacía: [] y undefined devuelven []', () => {
    expect(filterTasksByStatus([], 'POR_HACER')).toEqual([]);
    expect(filterTasksByStatus(undefined, 'POR_HACER')).toEqual([]);
  });

  it('filtra por el estado indicado', () => {
    expect(ids(filterTasksByStatus(muestra(), 'EN_PROGRESO'))).toEqual([2, 3, 5]);
  });

  it('FILTRO_TODOS y undefined devuelven una copia sin filtrar', () => {
    const entrada = muestra();
    expect(ids(filterTasksByStatus(entrada, FILTRO_TODOS))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ids(filterTasksByStatus(entrada, undefined))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('no muta el arreglo original y devuelve una referencia nueva', () => {
    const entrada = muestra();
    const copia = [...entrada];
    const salida = filterTasksByStatus(entrada, FILTRO_TODOS);
    expect(entrada).toEqual(copia);
    expect(salida).not.toBe(entrada);
  });
});

describe('filterTasksByPriority', () => {
  it('entrada vacía: [] y undefined devuelven []', () => {
    expect(filterTasksByPriority([], 'ALTA')).toEqual([]);
    expect(filterTasksByPriority(undefined, 'ALTA')).toEqual([]);
  });

  it('filtra por la prioridad indicada', () => {
    expect(ids(filterTasksByPriority(muestra(), 'ALTA'))).toEqual([1, 2, 5, 6]);
  });

  it('FILTRO_TODOS devuelve una copia sin filtrar', () => {
    expect(filterTasksByPriority(muestra(), FILTRO_TODOS)).toHaveLength(6);
  });
});

describe('filterTasksBySprint', () => {
  it('entrada vacía: [] y undefined devuelven []', () => {
    expect(filterTasksBySprint([], 1)).toEqual([]);
    expect(filterTasksBySprint(undefined, 1)).toEqual([]);
  });

  it('filtra por un sprint concreto', () => {
    expect(ids(filterTasksBySprint(muestra(), 1))).toEqual([1, 2, 6]);
  });

  it('sprintId null selecciona las tareas sin sprint (null o ausente)', () => {
    const conAusente = [
      tarea({ idTarea: 7, idSprint: 3 }),
      tarea({ idTarea: 8, idSprint: null }),
      { ...tarea({ idTarea: 9 }), idSprint: undefined } as unknown as TareaTest,
    ];
    expect(ids(filterTasksBySprint(conAusente, null))).toEqual([8, 9]);
  });

  it('sprintId undefined devuelve una copia sin filtrar', () => {
    expect(filterTasksBySprint(muestra(), undefined)).toHaveLength(6);
  });
});

describe('filtros combinados (estado + prioridad + sprint)', () => {
  it('encadena los tres filtros con lógica AND', () => {
    const resultado = filterTasksBySprint(
      filterTasksByPriority(
        filterTasksByStatus(muestra(), 'EN_PROGRESO'),
        'ALTA',
      ),
      1,
    );
    expect(ids(resultado)).toEqual([2]);
  });

  it('el orden de aplicación de los filtros no cambia el resultado', () => {
    const entrada = muestra();
    const a = filterTasksBySprint(
      filterTasksByPriority(filterTasksByStatus(entrada, 'POR_HACER'), 'ALTA'),
      1,
    );
    const b = filterTasksByStatus(
      filterTasksByPriority(filterTasksBySprint(entrada, 1), 'ALTA'),
      'POR_HACER',
    );
    expect(ids(a)).toEqual([1, 6]);
    expect(ids(a)).toEqual(ids(b));
  });

  it('una combinación sin coincidencias devuelve []', () => {
    const resultado = filterTasksBySprint(
      filterTasksByPriority(filterTasksByStatus(muestra(), 'HECHO'), 'ALTA'),
      1,
    );
    expect(resultado).toEqual([]);
  });
});

describe('searchTasks', () => {
  const tareas = [
    tarea({ idTarea: 1, tituloTarea: 'Diseñar API de Login', descripcionTarea: 'Endpoints REST' }),
    tarea({ idTarea: 2, tituloTarea: 'Refactor kanban', descripcionTarea: 'Mover lógica a utils PUROS' }),
    tarea({ idTarea: 3, tituloTarea: 'Tests unitarios', descripcionTarea: null }),
  ];

  it('entrada vacía: [] y undefined devuelven []', () => {
    expect(searchTasks([], 'login')).toEqual([]);
    expect(searchTasks(undefined, 'login')).toEqual([]);
  });

  it('es insensible a mayúsculas/minúsculas', () => {
    expect(ids(searchTasks(tareas, 'LOGIN'))).toEqual([1]);
    expect(ids(searchTasks(tareas, 'login'))).toEqual([1]);
    expect(ids(searchTasks(tareas, 'LoGiN'))).toEqual([1]);
  });

  it('coincide por subcadena parcial en título', () => {
    expect(ids(searchTasks(tareas, 'kan'))).toEqual([2]);
  });

  it('coincide por subcadena parcial en descripción', () => {
    expect(ids(searchTasks(tareas, 'puros'))).toEqual([2]);
  });

  it('busca en título O descripción', () => {
    expect(ids(searchTasks(tareas, 'test'))).toEqual([3]);
    expect(ids(searchTasks(tareas, 'rest'))).toEqual([1]);
  });

  it('ignora espacios sobrantes en la consulta', () => {
    expect(ids(searchTasks(tareas, '   login   '))).toEqual([1]);
  });

  it('una consulta vacía o solo espacios devuelve una copia sin filtrar', () => {
    expect(searchTasks(tareas, '')).toHaveLength(3);
    expect(searchTasks(tareas, '    ')).toHaveLength(3);
    expect(searchTasks(tareas, null)).toHaveLength(3);
    expect(searchTasks(tareas, '')).not.toBe(tareas);
  });

  it('sin coincidencias devuelve []', () => {
    expect(searchTasks(tareas, 'zzz')).toEqual([]);
  });

  it('no muta el arreglo original', () => {
    const copia = [...tareas];
    searchTasks(tareas, 'login');
    expect(tareas).toEqual(copia);
  });
});

describe('sortTasks', () => {
  it('entrada vacía: [] y undefined devuelven []', () => {
    expect(sortTasks([], 'prioridad')).toEqual([]);
    expect(sortTasks(undefined, 'prioridad')).toEqual([]);
  });

  it('prioridad ascendente: ALTA > MEDIA > BAJA', () => {
    const tareas = [
      tarea({ idTarea: 1, prioridad: 'BAJA' }),
      tarea({ idTarea: 2, prioridad: 'ALTA' }),
      tarea({ idTarea: 3, prioridad: 'MEDIA' }),
    ];
    expect(ids(sortTasks(tareas, 'prioridad', 'asc'))).toEqual([2, 3, 1]);
  });

  it('prioridad descendente invierte el criterio', () => {
    const tareas = [
      tarea({ idTarea: 1, prioridad: 'BAJA' }),
      tarea({ idTarea: 2, prioridad: 'ALTA' }),
      tarea({ idTarea: 3, prioridad: 'MEDIA' }),
    ];
    expect(ids(sortTasks(tareas, 'prioridad', 'desc'))).toEqual([1, 3, 2]);
  });

  it('estado ascendente sigue el orden de columnas del tablero', () => {
    const tareas = [
      tarea({ idTarea: 1, estadoTarea: 'HECHO' }),
      tarea({ idTarea: 2, estadoTarea: 'POR_HACER' }),
      tarea({ idTarea: 3, estadoTarea: 'EN_REVISION' }),
      tarea({ idTarea: 4, estadoTarea: 'EN_PROGRESO' }),
    ];
    expect(ids(sortTasks(tareas, 'estado', 'asc'))).toEqual([2, 4, 3, 1]);
  });

  it('titulo: alfabético español, sin distinguir mayúsculas ni acentos', () => {
    const tareas = [
      tarea({ idTarea: 1, tituloTarea: 'zeta' }),
      tarea({ idTarea: 2, tituloTarea: 'Álvaro' }),
      tarea({ idTarea: 3, tituloTarea: 'beta' }),
    ];
    expect(ids(sortTasks(tareas, 'titulo', 'asc'))).toEqual([2, 3, 1]);
    expect(ids(sortTasks(tareas, 'titulo', 'desc'))).toEqual([1, 3, 2]);
  });

  it('fechaLimite ascendente y descendente', () => {
    const tareas = [
      tarea({ idTarea: 1, fechaLimite: '2026-06-01' }),
      tarea({ idTarea: 2, fechaLimite: '2026-01-01' }),
      tarea({ idTarea: 3, fechaLimite: '2026-03-01' }),
    ];
    expect(ids(sortTasks(tareas, 'fechaLimite', 'asc'))).toEqual([2, 3, 1]);
    expect(ids(sortTasks(tareas, 'fechaLimite', 'desc'))).toEqual([1, 3, 2]);
  });

  it('las tareas sin fecha quedan al final en asc y en desc', () => {
    const tareas = [
      tarea({ idTarea: 1, fechaLimite: null }),
      tarea({ idTarea: 2, fechaLimite: '2026-01-01' }),
      tarea({ idTarea: 3, fechaLimite: null }),
      tarea({ idTarea: 4, fechaLimite: '2026-05-01' }),
    ];
    expect(ids(sortTasks(tareas, 'fechaLimite', 'asc'))).toEqual([2, 4, 1, 3]);
    expect(ids(sortTasks(tareas, 'fechaLimite', 'desc'))).toEqual([4, 2, 1, 3]);
  });

  it('valores repetidos: desempata de forma estable por idTarea ascendente', () => {
    const tareas = [
      tarea({ idTarea: 3, prioridad: 'MEDIA' }),
      tarea({ idTarea: 1, prioridad: 'MEDIA' }),
      tarea({ idTarea: 2, prioridad: 'MEDIA' }),
    ];
    expect(ids(sortTasks(tareas, 'prioridad', 'asc'))).toEqual([1, 2, 3]);
    // el desempate NO se invierte con la dirección
    expect(ids(sortTasks(tareas, 'prioridad', 'desc'))).toEqual([1, 2, 3]);
  });

  it('fechas repetidas: también desempata por idTarea ascendente', () => {
    const tareas = [
      tarea({ idTarea: 3, fechaLimite: '2026-01-01' }),
      tarea({ idTarea: 1, fechaLimite: '2026-01-01' }),
      tarea({ idTarea: 2, fechaLimite: '2026-01-01' }),
    ];
    expect(ids(sortTasks(tareas, 'fechaLimite', 'desc'))).toEqual([1, 2, 3]);
  });

  it('no muta el arreglo original', () => {
    const tareas = [
      tarea({ idTarea: 2, prioridad: 'BAJA' }),
      tarea({ idTarea: 1, prioridad: 'ALTA' }),
    ];
    const copiaIds = ids(tareas);
    sortTasks(tareas, 'prioridad', 'asc');
    expect(ids(tareas)).toEqual(copiaIds);
  });
});

describe('paginateTasks', () => {
  const treinta = Array.from({ length: 30 }, (_, i) => tarea({ idTarea: i + 1 }));

  it('entrada vacía: [] y undefined', () => {
    for (const entrada of [[], undefined]) {
      const r = paginateTasks(entrada, 1, 10);
      expect(r.items).toEqual([]);
      expect(r.totalItems).toBe(0);
      expect(r.totalPaginas).toBe(0);
      expect(r.paginaEnRango).toBe(false);
      expect(r.haySiguiente).toBe(false);
    }
  });

  it('primera página', () => {
    const r = paginateTasks(treinta, 1, 10);
    expect(ids(r.items)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r).toMatchObject({
      pagina: 1,
      tamanioPagina: 10,
      totalItems: 30,
      totalPaginas: 3,
      paginaEnRango: true,
      hayAnterior: false,
      haySiguiente: true,
    });
  });

  it('última página', () => {
    const r = paginateTasks(treinta, 3, 10);
    expect(ids(r.items)).toEqual([21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
    expect(r).toMatchObject({ hayAnterior: true, haySiguiente: false, paginaEnRango: true });
  });

  it('última página parcial cuando el total no es múltiplo del tamaño', () => {
    const r = paginateTasks(treinta.slice(0, 25), 3, 10);
    expect(ids(r.items)).toEqual([21, 22, 23, 24, 25]);
    expect(r.totalPaginas).toBe(3);
    expect(r.haySiguiente).toBe(false);
  });

  it('tamaño de página mayor al total: la primera página trae todo', () => {
    const r = paginateTasks(treinta, 1, 500);
    expect(r.items).toHaveLength(30);
    expect(r.totalPaginas).toBe(1);
    expect(r.haySiguiente).toBe(false);
  });

  it('página fuera de rango (mayor que totalPaginas): items vacío, no recorta a la última', () => {
    const r = paginateTasks(treinta, 99, 10);
    expect(r.items).toEqual([]);
    expect(r.paginaEnRango).toBe(false);
    expect(r.pagina).toBe(99);
    expect(r.totalPaginas).toBe(3);
  });

  it('página fuera de rango (< 1 o no entera): items vacío', () => {
    expect(paginateTasks(treinta, 0, 10).items).toEqual([]);
    expect(paginateTasks(treinta, -2, 10).items).toEqual([]);
    expect(paginateTasks(treinta, 1.5, 10).items).toEqual([]);
  });

  it('tamaño de página inválido se normaliza a 1', () => {
    expect(paginateTasks(treinta, 1, 0).tamanioPagina).toBe(1);
    expect(paginateTasks(treinta, 1, -5).tamanioPagina).toBe(1);
    expect(paginateTasks(treinta, 1, 2.9).tamanioPagina).toBe(2);
  });

  it('no muta el arreglo original', () => {
    const copiaIds = ids(treinta);
    paginateTasks(treinta, 2, 10);
    expect(ids(treinta)).toEqual(copiaIds);
  });

  it('encadena filtrar → ordenar → paginar sin perder campos', () => {
    const entrada = muestra();
    const r = paginateTasks(
      sortTasks(filterTasksByStatus(entrada, 'EN_PROGRESO'), 'prioridad', 'asc'),
      1,
      2,
    );
    expect(ids(r.items)).toEqual([2, 5]);
    expect(r.totalItems).toBe(3);
    expect(r.totalPaginas).toBe(2);
    expect(r.items[0].tituloTarea).toBe('Tarea'); // el objeto completo sobrevive
  });
});

describe('groupTasksByProject', () => {
  it('entrada vacía: [] y undefined devuelven []', () => {
    expect(groupTasksByProject([])).toEqual([]);
    expect(groupTasksByProject(undefined)).toEqual([]);
  });

  it('agrupa por idProyecto, ordena por clave y deja "sin proyecto" al final', () => {
    const tareas = [
      tarea({ idTarea: 1, idProyecto: 20 }),
      tarea({ idTarea: 2, idProyecto: 10 }),
      tarea({ idTarea: 3, idProyecto: 20 }),
      // tarea sin proyecto a nivel raíz (caso real: MiTareaDTO no lo trae)
      { ...tarea({ idTarea: 4 }), idProyecto: undefined } as unknown as TareaTest,
      tarea({ idTarea: 5, idProyecto: 10 }),
    ];
    const grupos = groupTasksByProject(tareas);
    expect(grupos.map((g) => g.clave)).toEqual([10, 20, null]);
    expect(grupos.map((g) => ids(g.tareas))).toEqual([[2, 5], [1, 3], [4]]);
  });

  it('no muta el arreglo original', () => {
    const tareas = [tarea({ idTarea: 1, idProyecto: 2 }), tarea({ idTarea: 2, idProyecto: 1 })];
    const copiaIds = ids(tareas);
    groupTasksByProject(tareas);
    expect(ids(tareas)).toEqual(copiaIds);
  });
});

describe('groupTasksBySprint', () => {
  it('entrada vacía: [] y undefined devuelven []', () => {
    expect(groupTasksBySprint([])).toEqual([]);
    expect(groupTasksBySprint(undefined)).toEqual([]);
  });

  it('agrupa por idSprint con "sin sprint" (null) al final', () => {
    const grupos = groupTasksBySprint(muestra());
    expect(grupos.map((g) => g.clave)).toEqual([1, 2, null]);
    expect(grupos.map((g) => ids(g.tareas))).toEqual([[1, 2, 6], [3, 4], [5]]);
  });
});

describe('determinismo', () => {
  it('mismas entradas producen exactamente la misma salida', () => {
    const entrada = muestra();

    const pipeline = (tareas: TareaTest[]) =>
      paginateTasks(
        sortTasks(
          searchTasks(
            filterTasksBySprint(filterTasksByStatus(tareas, 'EN_PROGRESO'), 1),
            'tarea',
          ),
          'fechaLimite',
          'desc',
        ),
        1,
        5,
      );

    expect(pipeline(entrada)).toEqual(pipeline(entrada));
  });

  it('llamadas repetidas no alteran el arreglo de entrada', () => {
    const entrada = muestra();
    const snapshot = JSON.parse(JSON.stringify(entrada));
    for (let i = 0; i < 3; i++) {
      sortTasks(entrada, 'prioridad', 'desc');
      filterTasksByStatus(entrada, 'HECHO');
      groupTasksBySprint(entrada);
      paginateTasks(entrada, 2, 2);
    }
    expect(entrada).toEqual(snapshot);
  });
});
