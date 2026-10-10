import { describe, expect, it } from 'vitest';
import type { AgendaItem } from '@/lib/calendar/agenda';
import {
  contarItems,
  etiquetaRango,
  filtrarItems,
  navegar,
  proyectosDelCalendario,
  rangoVisible,
} from '@/lib/calendar/vista';

function evento(id: number, overrides: Partial<Extract<AgendaItem, { kind: 'evento' }>> = {}): AgendaItem {
  return {
    kind: 'evento',
    key: '2026-10-06',
    sortKey: '09:00',
    id,
    projectId: 1,
    titulo: `E${id}`,
    descripcion: null,
    modalidad: 'VIRTUAL',
    tipo: 'REUNION',
    multiDia: false,
    projectTitle: 'Zeta',
    href: '',
    horaInicio: '09:00',
    horaFin: '10:00',
    fechaInicio: new Date(2026, 9, 6, 9),
    fechaFin: new Date(2026, 9, 6, 10),
    ...overrides,
  };
}

function tarea(id: number, overrides: Partial<Extract<AgendaItem, { kind: 'tarea' }>> = {}): AgendaItem {
  return {
    kind: 'tarea',
    key: '2026-10-06',
    sortKey: '24:00',
    id,
    titulo: `T${id}`,
    projectId: 2,
    projectTitle: 'Alfa',
    href: '/x',
    prioridad: 'MEDIA',
    estado: 'POR_HACER',
    ...overrides,
  };
}

const MARTES = new Date(2026, 9, 6, 15, 0);

describe('calendar/vista rangos y navegación (HU-184 T-324)', () => {
  it('Día pide un solo día; Semana de lunes a domingo; Mes la rejilla de 6 semanas', () => {
    const dia = rangoVisible('dia', MARTES);
    expect(dia.days.map((d) => d.key)).toEqual(['2026-10-06']);
    expect(dia.hasta).toEqual(new Date(2026, 9, 7));

    const semana = rangoVisible('semana', MARTES);
    expect(semana.days[0].key).toBe('2026-10-05');
    expect(semana.days[6].key).toBe('2026-10-11');

    const mes = rangoVisible('mes', MARTES);
    expect(mes.days).toHaveLength(42);
    expect(mes.desde).toEqual(new Date(2026, 8, 28));
  });

  it('anterior/siguiente avanza un día, una semana o un mes', () => {
    expect(navegar('dia', MARTES, 1).getDate()).toBe(7);
    expect(navegar('semana', MARTES, -1).getDate()).toBe(29);
    expect(navegar('mes', MARTES, 1)).toEqual(new Date(2026, 10, 1));
  });

  it('etiqueta del rango según la vista', () => {
    expect(etiquetaRango('dia', MARTES)).toMatch(/^Martes, 6 de octubre de 2026$/);
    expect(etiquetaRango('mes', MARTES)).toBe('Octubre 2026');
  });
});

describe('calendar/vista filtros (HU-184 T-324)', () => {
  const sinFiltros = { mostrarTareas: true, tiposOcultos: new Set<never>(), proyectosOcultos: new Set<number>() };

  it('oculta tareas, tipos y proyectos', () => {
    const items = [evento(1), evento(2, { tipo: 'TUTORIA' }), tarea(3)];
    expect(filtrarItems(items, sinFiltros)).toHaveLength(3);
    expect(filtrarItems(items, { ...sinFiltros, mostrarTareas: false }).map((i) => i.id)).toEqual([1, 2]);
    expect(filtrarItems(items, { ...sinFiltros, tiposOcultos: new Set(['TUTORIA']) }).map((i) => i.id)).toEqual([1, 3]);
    expect(filtrarItems(items, { ...sinFiltros, proyectosOcultos: new Set([2]) }).map((i) => i.id)).toEqual([1, 2]);
  });

  it('ocultar un proyecto no oculta lo que viene de un calendario compartido', () => {
    const compartido = evento(9, { compartidoPor: { idUsuario: 4, nombre: 'Ana', tono: 2 } });
    expect(filtrarItems([compartido], { ...sinFiltros, proyectosOcultos: new Set([1]) })).toHaveLength(1);
  });

  it('un evento de varios días cuenta una sola vez', () => {
    expect(contarItems([evento(1, { key: '2026-10-06' }), evento(1, { key: '2026-10-07' }), tarea(2)])).toBe(2);
  });
});

describe('calendar/vista proyectosDelCalendario (HU-184 T-324)', () => {
  it('une liderados y los que tienen actividad, en orden alfabético con tono estable', () => {
    const proyectos = proyectosDelCalendario([evento(1), tarea(2)], [{ idProyecto: 3, tituloProyecto: 'Beta' }]);
    expect(proyectos.map((p) => [p.tituloProyecto, p.tono])).toEqual([
      ['Alfa', 1],
      ['Beta', 2],
      ['Zeta', 3],
    ]);
  });

  it('no incluye proyectos que solo aparecen en calendarios compartidos', () => {
    const ajeno = evento(1, { projectId: 9, projectTitle: 'Ajeno', compartidoPor: { idUsuario: 4, nombre: 'Ana', tono: 2 } });
    expect(proyectosDelCalendario([ajeno], [])).toEqual([]);
  });
});
