import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

vi.mock('../lib/services/admin-projects', () => ({ getAdminProjects: vi.fn() }));
vi.mock('../lib/services/admin-sprints', () => ({ getAdminSprintCalendar: vi.fn() }));

import { ActiveProjectsBoard } from '../app/dashboard/admin/proyectos/active-projects-board';
import { getAdminProjects } from '../lib/services/admin-projects';
import { getAdminSprintCalendar } from '../lib/services/admin-sprints';
import {
  filterBySituacion,
  filterBySprint,
  indexSprintsByProject,
  joinProjectsWithSprints,
  searchActiveProjects,
  sortActiveProjects,
} from '../lib/admin/active-projects';
import type { AdminProjectListItem } from '../lib/types/admin-projects';
import type { AdminSprintCalendar, AdminSprintCalendarItem } from '../lib/types/admin-sprints';

const getProjectsMock = vi.mocked(getAdminProjects);
const getCalendarMock = vi.mocked(getAdminSprintCalendar);

function proyecto(overrides: Partial<AdminProjectListItem> & { idProyecto: number }): AdminProjectListItem {
  return {
    tituloProyecto: `Proyecto ${overrides.idProyecto}`,
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: 'EN_PROGRESO',
    lider: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' },
    usuariosActivos: 5,
    sprintAmbiente: { idSprint: overrides.idProyecto * 10, numero: 1, estado: 'ACTIVO' },
    accion: 'MONITOREAR',
    ...overrides,
  };
}

function sprint(overrides: Partial<AdminSprintCalendarItem> & { idProyecto: number }): AdminSprintCalendarItem {
  return {
    idSprint: overrides.idProyecto * 10,
    numero: 1,
    estado: 'ACTIVO',
    tituloProyecto: `Proyecto ${overrides.idProyecto}`,
    lider: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' },
    fechaInicio: '2026-09-20T15:00:00.000Z',
    fechaFinPlaneada: '2026-10-12',
    fechaFinalizacionIniciada: null,
    fechaCierre: null,
    situacion: 'EN_CURSO',
    diasRestantes: 6,
    desviacionDias: null,
    ...overrides,
  };
}

/**
 * Población de demostración: un proyecto por situación, uno sin Sprint y uno
 * con Sprint sin fecha, tal como lo clasifica el backend el 6 de octubre.
 */
const PROYECTOS: AdminProjectListItem[] = [
  proyecto({ idProyecto: 1, tituloProyecto: 'Sistema de Tutorías Académicas UVG', estadoProyecto: 'PUBLICADO', usuariosActivos: 9 }),
  proyecto({ idProyecto: 2, tituloProyecto: 'App de Monitoreo Ambiental', lider: { idUsuario: 2, nombre: 'Vernel', apellido: 'Hernández' }, usuariosActivos: 3 }),
  proyecto({ idProyecto: 3, tituloProyecto: 'Portal de Voluntariado', usuariosActivos: 12 }),
  proyecto({ idProyecto: 4, tituloProyecto: 'Feria Tecnológica', sprintAmbiente: { idSprint: 40, numero: 2, estado: 'EN_FINALIZACION' }, usuariosActivos: 7 }),
  proyecto({ idProyecto: 5, tituloProyecto: 'Biblioteca Digital', usuariosActivos: 4 }),
  proyecto({ idProyecto: 6, tituloProyecto: 'Huerto Comunitario', sprintAmbiente: null, usuariosActivos: 2 }),
];

const CALENDARIO: AdminSprintCalendar = {
  hoy: '2026-10-06',
  items: [
    sprint({ idProyecto: 1, fechaFinPlaneada: '2026-10-12', situacion: 'EN_CURSO', diasRestantes: 6 }),
    sprint({ idProyecto: 2, fechaFinPlaneada: '2026-10-06', situacion: 'VENCE_HOY', diasRestantes: 0 }),
    sprint({ idProyecto: 3, fechaFinPlaneada: '2026-10-04', situacion: 'PLAN_VENCIDO', diasRestantes: -2 }),
    sprint({ idProyecto: 4, numero: 2, estado: 'EN_FINALIZACION', fechaFinPlaneada: '2026-09-06', situacion: 'EN_FINALIZACION', diasRestantes: -30 }),
    sprint({ idProyecto: 5, fechaFinPlaneada: null, situacion: 'SIN_FECHA', diasRestantes: null }),
  ],
  conteos: { EN_CURSO: 1, VENCE_HOY: 1, PLAN_VENCIDO: 1, EN_FINALIZACION: 1, SIN_FECHA: 1 },
  resumen: { proximos7Dias: 2, planVencido: 1 },
};

function renderBoard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return render(createElement(ActiveProjectsBoard), { wrapper });
}

function titulosVisibles(): string[] {
  const tabla = screen.getByRole('table');
  return within(tabla)
    .getAllByRole('row')
    .slice(1)
    .map((fila) => within(fila).getAllByRole('link')[0].textContent ?? '');
}

function elegir(nombreSelect: string, opcion: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: nombreSelect }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: opcion }));
}

beforeEach(() => {
  getProjectsMock.mockResolvedValue({ items: PROYECTOS, total: PROYECTOS.length, page: 1, limit: 50 });
  getCalendarMock.mockResolvedValue(CALENDARIO);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ActiveProjectsBoard — tabla de supervisión', () => {
  it('muestra Sprint actual y finalización esperada con la situación del backend, sin recalcular', async () => {
    renderBoard();
    const tabla = await screen.findByRole('table');
    const filas = within(tabla).getAllByRole('row').slice(1);

    // EN_CURSO: fecha + días restantes del backend como texto.
    expect(within(filas[0]).getByText(/12 oct 2026/)).toBeInTheDocument();
    expect(within(filas[0]).getByText('En 6 días')).toBeInTheDocument();
    // VENCE_HOY y PLAN_VENCIDO: píldora con texto, no solo color.
    expect(within(filas[1]).getByText('Vence hoy')).toBeInTheDocument();
    expect(within(filas[2]).getByText(/Plan vencido/)).toBeInTheDocument();
    expect(within(filas[2]).getByText('Hace 2 días')).toBeInTheDocument();
    // EN_FINALIZACION conserva la fecha planificada como referencia.
    expect(within(filas[3]).getByText(/6 sept? 2026/)).toBeInTheDocument();
    expect(within(filas[3]).getAllByText('En finalización').length).toBeGreaterThan(0);
    // Sprint sin fecha ≠ proyecto sin Sprint.
    expect(within(filas[4]).getByText('Sin fecha')).toBeInTheDocument();
    expect(within(filas[5]).getAllByText('Sin Sprint').length).toBeGreaterThan(0);
    expect(within(filas[5]).queryByText('Sin fecha')).not.toBeInTheDocument();

    expect(getCalendarMock).toHaveBeenCalledTimes(1);
    expect(getProjectsMock).toHaveBeenCalledTimes(1);
  });

  it('cada fila abre el detalle administrativo real y no ofrece acciones de Sprint', async () => {
    renderBoard();
    await screen.findByRole('table');

    expect(screen.getByRole('link', { name: 'Abrir Sistema de Tutorías Académicas UVG' })).toHaveAttribute(
      'href',
      '/dashboard/admin/proyectos/1',
    );
    expect(screen.queryByRole('button', { name: /finalizar|cerrar sprint|iniciar|editar/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').some((l) => l.getAttribute('href')?.includes('/sprints/'))).toBe(false);
  });

  it('si el calendario falla, la bandeja sigue y la columna temporal dice «No disponible»', async () => {
    getCalendarMock.mockRejectedValue(new Error('500'));
    renderBoard();
    await screen.findByRole('table');

    expect(screen.getAllByText('Sistema de Tutorías Académicas UVG').length).toBeGreaterThan(0);
    expect((await screen.findAllByText('No disponible')).length).toBe(5);
    expect(screen.getByText(/No se pudo cargar la planificación de Sprints/)).toBeInTheDocument();
    // El proyecto sin Sprint no depende del calendario.
    expect(screen.getAllByText('Sin Sprint').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(getCalendarMock).toHaveBeenCalledTimes(2);
  });

  it('si la lista de proyectos falla, muestra el error con reintento', async () => {
    getProjectsMock.mockRejectedValue(new Error('500'));
    renderBoard();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('ActiveProjectsBoard — búsqueda, filtros y orden', () => {
  it('busca por proyecto o por nombre/apellido del líder, sin distinguir mayúsculas ni tildes', async () => {
    renderBoard();
    await screen.findByRole('table');
    const buscador = screen.getByRole('textbox', { name: 'Buscar proyectos por nombre o líder' });

    fireEvent.change(buscador, { target: { value: '  tutorías ' } });
    expect(titulosVisibles()).toEqual(['Sistema de Tutorías Académicas UVG']);

    fireEvent.change(buscador, { target: { value: 'hernandez' } });
    expect(titulosVisibles()).toEqual(['App de Monitoreo Ambiental']);
    expect(screen.getByRole('status').textContent?.replace(/\s+/g, ' ')).toBe('Proyectos encontrados: 1 de 6 activos');
  });

  it('filtra por estado del proyecto, estado del Sprint y situación temporal; combina y limpia', async () => {
    renderBoard();
    await screen.findByRole('table');

    elegir('Filtrar por estado del proyecto', 'Publicado');
    expect(titulosVisibles()).toEqual(['Sistema de Tutorías Académicas UVG']);
    elegir('Filtrar por estado del proyecto', 'Todos los estados');

    elegir('Filtrar por estado del Sprint', 'Sin Sprint');
    expect(titulosVisibles()).toEqual(['Huerto Comunitario']);
    elegir('Filtrar por estado del Sprint', 'En finalización');
    expect(titulosVisibles()).toEqual(['Feria Tecnológica']);
    elegir('Filtrar por estado del Sprint', 'Activo');
    expect(titulosVisibles()).toHaveLength(4);

    // Combinado: Sprint activo + plan vencido.
    elegir('Filtrar por situación temporal', 'Plan vencido');
    expect(titulosVisibles()).toEqual(['Portal de Voluntariado']);

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(titulosVisibles()).toHaveLength(6);
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });

  it('ordena por nombre, finalización (sin fecha al final) y usuarios activos', async () => {
    renderBoard();
    await screen.findByRole('table');

    elegir('Ordenar proyectos', 'Nombre A–Z');
    expect(titulosVisibles()[0]).toBe('App de Monitoreo Ambiental');

    elegir('Ordenar proyectos', 'Finalización más próxima');
    expect(titulosVisibles()).toEqual([
      'Feria Tecnológica',
      'Portal de Voluntariado',
      'App de Monitoreo Ambiental',
      'Sistema de Tutorías Académicas UVG',
      'Biblioteca Digital',
      'Huerto Comunitario',
    ]);

    elegir('Ordenar proyectos', 'Finalización más lejana');
    expect(titulosVisibles()[0]).toBe('Sistema de Tutorías Académicas UVG');
    expect(titulosVisibles().slice(-2)).toEqual(['Biblioteca Digital', 'Huerto Comunitario']);

    elegir('Ordenar proyectos', 'Más usuarios activos');
    expect(titulosVisibles()[0]).toBe('Portal de Voluntariado');
    elegir('Ordenar proyectos', 'Menos usuarios activos');
    expect(titulosVisibles()[0]).toBe('Huerto Comunitario');
  });

  it('sin coincidencias muestra un vacío con el texto buscado y permite limpiar', async () => {
    renderBoard();
    await screen.findByRole('table');

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar proyectos por nombre o líder' }), {
      target: { value: 'zzz' },
    });
    // Cero resultados: el contador distingue lo encontrado del total real.
    expect(screen.getByText(/Proyectos encontrados:/).textContent?.replace(/\s+/g, ' ')).toBe('Proyectos encontrados: 0 de 6 activos');
    const vacio = screen.getByText('No encontramos proyectos o líderes que coincidan con “zzz”.').closest('section');
    expect(vacio).not.toBeNull();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fireEvent.click(within(vacio as HTMLElement).getByRole('button', { name: 'Limpiar filtros' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('sin filtros los selects quedan en «todos» y el contador dice la población total', async () => {
    renderBoard();
    await screen.findByRole('table');
    expect(screen.getByRole('status').textContent?.replace(/\s+/g, ' ')).toBe('Total de proyectos activos: 6');
    expect(screen.getByRole('combobox', { name: 'Filtrar por estado del Sprint' })).toHaveTextContent('Todos los Sprints');
  });
});

describe('lib/admin/active-projects — lógica pura', () => {
  const filas = joinProjectsWithSprints(PROYECTOS, indexSprintsByProject(CALENDARIO.items));

  it('une por idProyecto y distingue «sin Sprint» de «calendario desconocido»', () => {
    expect(filas[0].sprint?.idProyecto).toBe(1);
    expect(filas[5].sprint).toBeNull();
    expect(joinProjectsWithSprints(PROYECTOS, undefined)[0].sprint).toBeUndefined();
  });

  it('filtra por situación con el valor recibido; un proyecto sin Sprint nunca coincide', () => {
    expect(filterBySituacion(filas, 'SIN_FECHA').map((f) => f.project.idProyecto)).toEqual([5]);
    expect(filterBySituacion(filas, 'EN_CURSO').map((f) => f.project.idProyecto)).toEqual([1]);
    expect(filterBySprint(filas, 'SIN_SPRINT').map((f) => f.project.idProyecto)).toEqual([6]);
  });

  it('la búsqueda vacía o solo espacios devuelve todo y el orden predeterminado no reordena', () => {
    expect(searchActiveProjects(filas, '   ')).toHaveLength(6);
    expect(sortActiveProjects(filas, 'PREDETERMINADO').map((f) => f.project.idProyecto)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
