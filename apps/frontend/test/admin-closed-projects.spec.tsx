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

import { ClosedProjectsBoard } from '../app/dashboard/admin/proyectos/closed-projects-board';
import { getAdminProjects } from '../lib/services/admin-projects';
import type { AdminProjectListItem } from '../lib/types/admin-projects';

const getProjectsMock = vi.mocked(getAdminProjects);

function cerrado(overrides: Partial<AdminProjectListItem> & { idProyecto: number }): AdminProjectListItem {
  return {
    tituloProyecto: `Proyecto ${overrides.idProyecto}`,
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: 'CERRADO',
    lider: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' },
    usuariosActivos: 0,
    sprintAmbiente: null,
    accion: 'CONSULTAR_HISTORICO',
    ...overrides,
  } as AdminProjectListItem;
}

/** Incluye dos proyectos con el MISMO título y distinto id: son registros reales distintos, no un duplicado visual. */
const PROYECTOS: AdminProjectListItem[] = [
  cerrado({ idProyecto: 64, tituloProyecto: 'Plataforma de tutorías entre estudiantes', lider: { idUsuario: 2, nombre: 'Vernel', apellido: 'Hernández' } }),
  cerrado({ idProyecto: 34, tituloProyecto: 'Torneo Interno de Ajedrez UVG', tipoProyecto: 'EXTRACURRICULAR_EXTENSION' }),
  cerrado({ idProyecto: 26, tituloProyecto: 'Hackathon de Innovación Social', tipoProyecto: 'ACADEMICO_EXPERIENCIA' }),
  cerrado({ idProyecto: 25, tituloProyecto: 'Feria de Ciencias UVG 2026', tipoProyecto: 'EXTRACURRICULAR_EXTENSION' }),
  cerrado({ idProyecto: 18, tituloProyecto: 'Hackathon de Innovación Social', tipoProyecto: 'ACADEMICO_EXPERIENCIA' }),
  cerrado({ idProyecto: 17, tituloProyecto: 'Feria de Ciencias UVG 2026', tipoProyecto: 'EXTRACURRICULAR_EXTENSION' }),
];

function renderBoard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return render(createElement(ClosedProjectsBoard), { wrapper });
}

const titulos = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((fila) => within(fila).getAllByRole('cell')[0].querySelector('p')?.textContent ?? '');
const contador = () => screen.getByText(/Total de proyectos cerrados:/).textContent?.replace(/\s+/g, ' ');

function elegir(select: string, opcion: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: select }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: opcion }));
}

beforeEach(() => {
  getProjectsMock.mockResolvedValue({ items: PROYECTOS, total: PROYECTOS.length, page: 1, limit: 50 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ClosedProjectsBoard — consulta histórica de proyectos cerrados', () => {
  it('muestra proyecto con sus etiquetas, líder y la acción «Ver histórico», sin columnas de supervisión', async () => {
    renderBoard();
    const tabla = within(await screen.findByRole('table'));

    expect(tabla.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Proyecto', 'Líder', 'Acción']);
    const fila = within(tabla.getAllByRole('row')[1]);
    expect(fila.getByText('Plataforma de tutorías entre estudiantes')).toBeInTheDocument();
    expect(fila.getByText('Cerrado')).toHaveClass('pill');
    expect(fila.getByText('Horas Beca')).toHaveClass('rounded-[7px]');
    expect(fila.getAllByText('Vernel Hernández').length).toBeGreaterThan(0);
    expect(fila.getByRole('link', { name: 'Ver histórico de Plataforma de tutorías entre estudiantes' })).toHaveAttribute(
      'href',
      '/dashboard/admin/proyectos/64',
    );
    expect(screen.queryByText(/Usuarios activos|Sprint ambiente|Acción sugerida/)).not.toBeInTheDocument();
    expect(getProjectsMock).toHaveBeenCalledTimes(1);
  });

  it('los rótulos siguen el estilo de Mis Tareas: caja normal, sin mayúsculas forzadas', async () => {
    renderBoard();
    await screen.findByRole('table');
    for (const th of screen.getAllByRole('columnheader')) {
      expect(th).toHaveClass('text-xs', 'font-semibold', 'text-text-secondary');
      expect(th.className).not.toMatch(/uppercase|tracking-wid/);
    }
  });

  it('dos proyectos con el mismo título y distinto id se listan los dos: son registros distintos', async () => {
    renderBoard();
    await screen.findByRole('table');
    expect(titulos().filter((t) => t === 'Feria de Ciencias UVG 2026')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /Ver histórico de Feria de Ciencias UVG 2026/ }).map((a) => a.getAttribute('href'))).toEqual([
      '/dashboard/admin/proyectos/25',
      '/dashboard/admin/proyectos/17',
    ]);
  });

  it('el contador distingue el total real de lo filtrado', async () => {
    renderBoard();
    await screen.findByRole('table');
    expect(contador()).toBe('Total de proyectos cerrados: 6');
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();

    elegir('Filtrar por tipo de proyecto', 'Extensión');
    expect(contador()).toBe('Total de proyectos cerrados: 3 de 6');
    expect(titulos()).toEqual(['Torneo Interno de Ajedrez UVG', 'Feria de Ciencias UVG 2026', 'Feria de Ciencias UVG 2026']);

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(contador()).toBe('Total de proyectos cerrados: 6');
  });

  it('busca por proyecto o líder sin distinguir mayúsculas ni tildes, y combina con el tipo', async () => {
    renderBoard();
    await screen.findByRole('table');
    const buscador = screen.getByRole('textbox', { name: 'Buscar proyectos cerrados por nombre o líder' });

    fireEvent.change(buscador, { target: { value: '  hernandez ' } });
    expect(titulos()).toEqual(['Plataforma de tutorías entre estudiantes']);

    fireEvent.change(buscador, { target: { value: 'innovacion' } });
    expect(titulos()).toHaveLength(2);
    elegir('Filtrar por tipo de proyecto', 'Horas Beca');
    expect(screen.getByText('No encontramos proyectos cerrados o líderes que coincidan con “innovacion”.')).toBeInTheDocument();
    expect(contador()).toBe('Total de proyectos cerrados: 0 de 6');
  });

  it('ordena por nombre y conserva el orden del backend como predeterminado', async () => {
    renderBoard();
    await screen.findByRole('table');
    expect(titulos()[0]).toBe('Plataforma de tutorías entre estudiantes');

    elegir('Ordenar proyectos cerrados', 'Nombre A–Z');
    expect(titulos()).toEqual([
      'Feria de Ciencias UVG 2026',
      'Feria de Ciencias UVG 2026',
      'Hackathon de Innovación Social',
      'Hackathon de Innovación Social',
      'Plataforma de tutorías entre estudiantes',
      'Torneo Interno de Ajedrez UVG',
    ]);
  });

  it('con una sola página no pinta paginador; vacío y error tienen su estado', async () => {
    renderBoard();
    await screen.findByRole('table');
    expect(screen.queryByRole('navigation', { name: 'Paginación de proyectos cerrados' })).not.toBeInTheDocument();
    cleanup();

    getProjectsMock.mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 });
    renderBoard();
    expect(await screen.findByText('No hay proyectos cerrados.')).toBeInTheDocument();
    cleanup();

    getProjectsMock.mockRejectedValue(new Error('500'));
    renderBoard();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
