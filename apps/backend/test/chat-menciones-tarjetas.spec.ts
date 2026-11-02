import { describe, expect, it } from 'vitest';
import { prepararMencionesChat } from '../src/chat/chat-menciones';
import { parsearEnlaceInterno } from '../src/chat/chat-tarjetas';

describe('prepararMencionesChat (MEJ-44)', () => {
  it('conserva el token de los participantes y degrada al resto a texto', () => {
    const r = prepararMencionesChat('hola @[Ana Perez](2) y @[Luis Gomez](9)', [1, 2, 3], 1);
    expect(r.contenido).toBe('hola @[Ana Perez](2) y @Luis Gomez');
    expect(r.mencionados).toEqual([2]);
  });

  it('el autor no se notifica a si mismo y no repite mencionados', () => {
    const r = prepararMencionesChat('@[Yo](1) @[Ana](2) @[Ana](2)', [1, 2], 1);
    expect(r.mencionados).toEqual([2]);
  });

  it('sin menciones deja el texto igual', () => {
    expect(prepararMencionesChat('hola', [1, 2], 1)).toEqual({ contenido: 'hola', mencionados: [] });
  });
});

describe('parsearEnlaceInterno (MEJ-45)', () => {
  it('reconoce proyecto y tarea en las dos familias de rutas', () => {
    expect(parsearEnlaceInterno('/dashboard/proyectos/12')).toEqual({ tipo: 'PROYECTO', idProyecto: 12 });
    expect(parsearEnlaceInterno('/dashboard/projects/12/kanban')).toEqual({ tipo: 'PROYECTO', idProyecto: 12 });
    expect(parsearEnlaceInterno('/dashboard/projects/12/kanban/tasks/34')).toEqual({ tipo: 'TAREA', idProyecto: 12, idTarea: 34 });
    expect(parsearEnlaceInterno('/dashboard/projects/12/tareas/7')).toEqual({ tipo: 'TAREA', idProyecto: 12, idTarea: 7 });
  });

  it('descarta rutas ajenas, ids invalidos y URLs externas', () => {
    for (const ruta of ['/dashboard/mensajes/3', '/dashboard/proyectos/0', '/dashboard/proyectos/abc', 'https://evil.test/dashboard/proyectos/1', '/dashboard/proyectosx/1']) {
      expect(parsearEnlaceInterno(ruta)).toBeNull();
    }
  });
});
