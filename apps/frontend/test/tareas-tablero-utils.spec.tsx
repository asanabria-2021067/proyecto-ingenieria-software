import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  FILTRO_SIN_RESPONSABLE,
  FILTRO_TODOS,
  coincideFiltroResponsable,
  derivarOpcionesResponsable,
  filtrarTareas,
  ordenarTabla,
  responsablesDe,
} from '../components/projects/task-board.utils';
import { armarHilo } from '../components/comments/comment-thread';
import { leerVistaTablero, useVistaTablero } from '../hooks/use-vista-tablero';
import {
  candidatosResponsables,
  extrasIniciales,
  extrasParaCrear,
  inputSubtarea,
  responsablesParaEditar,
} from '../lib/tasks/extras';
import type { ComentarioListado } from '../lib/services/comments';
import type { TareaPublicaDTO } from '../lib/types/tasks';

const angel = { idUsuario: 1, nombre: 'Angel', apellido: 'Sanabria', fotoUrl: null };
const maria = { idUsuario: 2, nombre: 'Maria', apellido: 'Lopez', fotoUrl: null };
const carlos = { idUsuario: 3, nombre: 'Carlos', apellido: 'Mendoza', fotoUrl: null };

function tarea(overrides: Partial<TareaPublicaDTO> & { idTarea: number }): TareaPublicaDTO {
  return {
    idProyecto: 7,
    idHito: 5,
    idRolProyecto: null,
    tituloTarea: `Tarea ${overrides.idTarea}`,
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    creadaPor: 1,
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    fechaLimite: null,
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
    puntosHistoria: null,
    asignacionActiva: null,
    rolProyecto: null,
    hito: null,
    etiquetas: [],
    cantidadComentarios: 0,
    idTareaBloqueante: null,
    bloqueadaPor: null,
    repeticion: null,
    repeticionProxima: null,
    checklist: [],
    ...overrides,
  };
}

const asignacion = (usuario: typeof angel) => ({
  idAsignacion: usuario.idUsuario * 10,
  idUsuario: usuario.idUsuario,
  fechaAsignacion: '2026-01-02T00:00:00.000Z',
  usuario,
});

describe('filtro por responsable (MEJ-112)', () => {
  const tareas = [
    tarea({ idTarea: 1, asignacionActiva: asignacion(angel), responsables: [angel] }),
    tarea({ idTarea: 2, asignacionActiva: asignacion(maria), responsables: [maria, angel] }),
    tarea({ idTarea: 3 }),
    // Respuesta anterior sin `responsables`: cuenta solo el principal.
    tarea({ idTarea: 4, asignacionActiva: asignacion(carlos) }),
  ];

  it('responsablesDe usa la lista nueva o, sin ella, el responsable principal', () => {
    expect(responsablesDe(tareas[1]).map((r) => r.idUsuario)).toEqual([2, 1]);
    expect(responsablesDe(tareas[3]).map((r) => r.idUsuario)).toEqual([3]);
    expect(responsablesDe(tareas[2])).toEqual([]);
  });

  it('una persona ve sus tareas aunque sea responsable adicional', () => {
    const ids = (f: string) => filtrarTareas(tareas, FILTRO_TODOS, FILTRO_TODOS, f).map((t) => t.idTarea);
    expect(ids('1')).toEqual([1, 2]);
    expect(ids('3')).toEqual([4]);
    expect(ids(FILTRO_SIN_RESPONSABLE)).toEqual([3]);
    expect(ids(FILTRO_TODOS)).toEqual([1, 2, 3, 4]);
    expect(coincideFiltroResponsable(tareas[2], '1')).toBe(false);
  });

  it('se combina con el filtro de rol', () => {
    const conRol = [
      tarea({ idTarea: 1, asignacionActiva: asignacion(angel), responsables: [angel], rolProyecto: { idRolProyecto: 9, nombreRol: 'Backend' } }),
      tarea({ idTarea: 2, asignacionActiva: asignacion(angel), responsables: [angel], rolProyecto: { idRolProyecto: 8, nombreRol: 'Diseno' } }),
    ];
    expect(filtrarTareas(conRol, '9', FILTRO_TODOS, '1').map((t) => t.idTarea)).toEqual([1]);
    expect(filtrarTareas(conRol, '8', FILTRO_TODOS, '2')).toEqual([]);
  });

  it('las opciones juntan integrantes y responsables, ordenadas, con «Sin responsable» solo si hace falta', () => {
    const opciones = derivarOpcionesResponsable(tareas, [maria, { ...angel }]);
    expect(opciones.map((o) => o.etiqueta)).toEqual(['Angel Sanabria', 'Carlos Mendoza', 'Maria Lopez', 'Sin responsable']);
    expect(derivarOpcionesResponsable([tareas[0]], []).map((o) => o.valor)).toEqual(['1']);
  });
});

describe('ordenarTabla (MEJ-112)', () => {
  const tareas = [
    tarea({ idTarea: 1, tituloTarea: 'Beta', prioridad: 'BAJA', estadoTarea: 'HECHO', fechaLimite: '2026-12-02', responsables: [maria], asignacionActiva: asignacion(maria) }),
    tarea({ idTarea: 2, tituloTarea: 'alfa', prioridad: 'ALTA', estadoTarea: 'POR_HACER', fechaLimite: null }),
    tarea({ idTarea: 3, tituloTarea: 'Gamma', prioridad: 'MEDIA', estadoTarea: 'EN_PROGRESO', fechaLimite: '2026-12-01', responsables: [angel], asignacionActiva: asignacion(angel) }),
  ];
  const ids = (columna: Parameters<typeof ordenarTabla>[1], dir: 'asc' | 'desc') =>
    ordenarTabla(tareas, columna, dir).map((t) => t.idTarea);

  it('ordena por cada columna en ambas direcciones', () => {
    expect(ids('titulo', 'asc')).toEqual([2, 1, 3]);
    expect(ids('prioridad', 'asc')).toEqual([2, 3, 1]);
    expect(ids('prioridad', 'desc')).toEqual([1, 3, 2]);
    expect(ids('estado', 'asc')).toEqual([2, 3, 1]);
    expect(ids('responsable', 'asc')).toEqual([3, 1, 2]);
    expect(ids('responsable', 'desc')).toEqual([1, 3, 2]);
  });

  it('las tareas sin fecha o sin responsable quedan siempre al final', () => {
    expect(ids('fechaLimite', 'asc')).toEqual([3, 1, 2]);
    expect(ids('fechaLimite', 'desc')).toEqual([1, 3, 2]);
  });

  it('no muta la lista recibida', () => {
    const copia = [...tareas];
    ordenarTabla(tareas, 'titulo', 'desc');
    expect(tareas).toEqual(copia);
  });
});

describe('vista del tablero recordada por proyecto (MEJ-112)', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('por defecto es Kanban y guarda la elección con la clave del proyecto', () => {
    const { result } = renderHook(() => useVistaTablero(7));
    expect(result.current[0]).toBe('kanban');
    act(() => result.current[1]('tabla'));
    expect(result.current[0]).toBe('tabla');
    expect(window.localStorage.getItem('tablero-vista-7')).toBe('tabla');
  });

  it('cada proyecto recuerda su propia vista', () => {
    window.localStorage.setItem('tablero-vista-7', 'lista');
    window.localStorage.setItem('tablero-vista-8', 'tabla');
    expect(leerVistaTablero(7)).toBe('lista');
    expect(leerVistaTablero(8)).toBe('tabla');
    expect(leerVistaTablero(9)).toBe('kanban');
    expect(renderHook(() => useVistaTablero(8)).result.current[0]).toBe('tabla');
  });

  it('ignora un valor guardado inválido', () => {
    window.localStorage.setItem('tablero-vista-7', 'cuadricula');
    expect(leerVistaTablero(7)).toBe('kanban');
  });

  it('sin almacenamiento disponible no falla y la vista vale en la sesión', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const { result } = renderHook(() => useVistaTablero(7));
    expect(result.current[0]).toBe('kanban');
    act(() => result.current[1]('lista'));
    expect(result.current[0]).toBe('lista');
  });
});

describe('subtareas y responsables en el formulario (MEJ-106, MEJ-109)', () => {
  it('inputSubtarea hereda hito, rol y prioridad, y cuelga del padre', () => {
    const padre = tarea({ idTarea: 10, idHito: 5, idRolProyecto: 3, prioridad: 'ALTA', fechaLimite: '2026-12-30' });
    expect(inputSubtarea(padre, '  Revisar  ', 2, '2026-11-04')).toEqual({
      tituloTarea: 'Revisar',
      fechaLimite: '2026-12-30',
      prioridad: 'ALTA',
      idTareaPadre: 10,
      idHito: 5,
      idRolProyecto: 3,
      idUsuarioAsignado: 2,
    });
  });

  it('inputSubtarea usa mañana si la fecha del padre ya pasó y omite lo que no hay', () => {
    const padre = tarea({ idTarea: 10, idHito: null, fechaLimite: '2026-10-01' });
    expect(inputSubtarea(padre, 'X', null, '2026-12-31')).toEqual({
      tituloTarea: 'X',
      fechaLimite: '2027-01-01',
      prioridad: 'MEDIA',
      idTareaPadre: 10,
    });
  });

  it('candidatosResponsables respeta el rol, quita al principal y no repite personas', () => {
    const miembros = [
      { ...angel, correo: 'a', idRolProyecto: 1 },
      { ...angel, correo: 'a', idRolProyecto: 2 },
      { ...maria, correo: 'm', idRolProyecto: 1 },
      { ...carlos, correo: 'c', idRolProyecto: 2 },
    ];
    expect(candidatosResponsables(miembros, 1, 2).map((m) => m.idUsuario)).toEqual([1]);
    expect(candidatosResponsables(miembros, null, null).map((m) => m.idUsuario)).toEqual([1, 3, 2]);
  });

  it('los adicionales parten de la tarea sin el principal y solo se envían si cambian', () => {
    const t = tarea({ idTarea: 1, asignacionActiva: asignacion(angel), responsables: [angel, maria, carlos] });
    expect(extrasIniciales(t).idsResponsablesAdicionales).toEqual([2, 3]);
    expect(responsablesParaEditar(t, [3, 2])).toBeNull();
    expect(responsablesParaEditar(t, [2])).toEqual([2]);
    expect(responsablesParaEditar(t, [])).toEqual([]);
    expect(extrasParaCrear({ ...extrasIniciales(null), idsResponsablesAdicionales: [2] })).toEqual({
      idsResponsablesAdicionales: [2],
    });
  });
});

describe('hilo de comentarios de un nivel (MEJ-110)', () => {
  const c = (idComentario: number, creadoEn: string, idComentarioPadre: number | null = null): ComentarioListado => ({
    idComentario,
    idAutor: 1,
    contenido: `c${idComentario}`,
    creadoEn,
    editadoEn: null,
    autor: angel,
    idComentarioPadre,
  });

  it('pone cada respuesta tras su comentario, la más antigua primero', () => {
    // Llegan de la más reciente a la más antigua.
    const lista = [c(5, '2026-10-05T00:00:00Z', 1), c(4, '2026-10-04T00:00:00Z'), c(3, '2026-10-03T00:00:00Z', 1), c(1, '2026-10-01T00:00:00Z')];
    expect(armarHilo(lista).map((h) => [h.comentario.idComentario, h.esRespuesta])).toEqual([
      [4, false],
      [1, false],
      [3, true],
      [5, true],
    ]);
  });

  it('una respuesta cuyo comentario ya no existe se muestra como comentario propio', () => {
    expect(armarHilo([c(7, '2026-10-05T00:00:00Z', 99)]).map((h) => h.esRespuesta)).toEqual([false]);
  });
});
