import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

vi.mock('../lib/swal', () => ({ default: { fire: vi.fn().mockResolvedValue({ isConfirmed: false }) }, swalCustomClass: {} }));
const getMyProjectsMock = vi.fn();
const getContributorProjectsMock = vi.fn();
vi.mock('../lib/services/projects', () => ({
  getMyProjects: () => getMyProjectsMock(),
  getContributorProjects: () => getContributorProjectsMock(),
  deleteProject: vi.fn(),
}));
const apiFetchMock = vi.fn();
vi.mock('../lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

import MyProjectsPage from '../app/dashboard/projects/mine/page';
import { ProjectsListClient } from '../app/dashboard/projects/projects-list-client';
import ProyectosPage from '../app/dashboard/proyectos/page';
import type { MiProyectoListItemDTO, ProyectoListItemDTO } from '../lib/dto/project.dto';
import type { ProyectoDisponibleResumen } from '../components/projects/available-project-card';

function mio(overrides: Partial<MiProyectoListItemDTO> = {}): MiProyectoListItemDTO {
  return {
    idProyecto: 7,
    tituloProyecto: 'Proyecto cerrado histórico',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: 'CERRADO',
    modalidadProyecto: 'VIRTUAL',
    descripcionProyecto: 'Ya cerrado.',
    fechaCreacion: '2026-01-01T12:00:00.000Z',
    fechaActualizacion: '2026-08-01T12:00:00.000Z',
    revisiones: [],
    avanceProyecto: { sprintsCerrados: 3, sprintsTotales: 3, tareasCompletadas: 10, tareasTotales: 10, porcentaje: 100 } as any,
    ...overrides,
  };
}

function publico(overrides: Partial<ProyectoListItemDTO> = {}): ProyectoListItemDTO {
  return {
    idProyecto: 9,
    tituloProyecto: 'Proyecto público cerrado',
    tipoProyecto: 'ACADEMICO_EXPERIENCIA',
    estadoProyecto: 'CERRADO',
    modalidadProyecto: 'PRESENCIAL',
    descripcionProyecto: 'Descripción',
    ...overrides,
  };
}

function disponible(overrides: Partial<ProyectoDisponibleResumen> = {}): ProyectoDisponibleResumen {
  return {
    idProyecto: 11,
    tituloProyecto: 'Proyecto explorable',
    descripcionProyecto: 'Descripción',
    tipoProyecto: 'ACADEMICO_EXPERIENCIA',
    estadoProyecto: 'PUBLICADO',
    modalidadProyecto: 'VIRTUAL',
    organizaciones: [],
    intereses: [],
    _count: { roles: 1 },
    roles: [{ cupos: 1 }],
    creador: { idUsuario: 1, nombre: 'Ana', apellido: 'López', fotoUrl: null },
    ...overrides,
  };
}

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return Wrapper;
}

beforeEach(() => {
  getContributorProjectsMock.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VIEW-09 — proyectos cerrados en los listados (F019)', () => {
  it('Mis proyectos: CERRADO muestra badge, enlaza al histórico y no ofrece Eliminar/Editar/Enviar; el abierto conserva sus acciones', async () => {
    getMyProjectsMock.mockResolvedValue([
      mio(),
      mio({ idProyecto: 8, tituloProyecto: 'Borrador vivo', estadoProyecto: 'BORRADOR' }),
    ]);
    render(createElement(MyProjectsPage), { wrapper: wrapper() });

    const cerrada = await screen.findByTestId('project-card-7');
    expect(within(cerrada).getByText('Cerrado')).toBeInTheDocument();
    expect(within(cerrada).getByRole('link', { name: /Ver proyecto/ })).toHaveAttribute('href', '/dashboard/proyectos/7');
    expect(within(cerrada).queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
    expect(within(cerrada).queryByRole('link', { name: /Editar|Enviar a revisión|Postular/ })).not.toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('1 proyecto cerrado');

    const abierta = screen.getByTestId('project-card-8');
    expect(within(abierta).getByRole('button', { name: 'Eliminar proyecto Borrador vivo' })).toBeInTheDocument();
    expect(within(abierta).getByRole('link', { name: /Seguir editando proyecto/ })).toHaveAttribute('href', '/dashboard/projects/mine/form?id=8');
    // El cerrado va al final del listado.
    const cards = screen.getAllByTestId(/project-card-/);
    expect(cards[cards.length - 1]).toBe(cerrada);
  });

  it('Listado público SSR: CERRADO se etiqueta legible, en tono neutro, y enlaza al histórico', () => {
    render(createElement(ProjectsListClient, { initialData: [publico(), publico({ idProyecto: 10, estadoProyecto: 'PUBLICADO', tituloProyecto: 'Abierto' })], initialTotalPages: 1 }));

    const enlace = screen.getByRole('link', { name: /Proyecto público cerrado/ });
    expect(enlace).toHaveAttribute('href', '/dashboard/proyectos/9');
    expect(within(enlace).getByText('Cerrado')).toBeInTheDocument();
    expect(within(enlace).queryByText('CERRADO')).not.toBeInTheDocument();
    expect(within(enlace).getByText('Solo consulta · histórico')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Abierto/ })).queryByText('Solo consulta · histórico')).not.toBeInTheDocument();
  });

  it('Explorar proyectos: un CERRADO va al final, no ofrece Postular y se anuncia como solo consulta', async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path === '/organizaciones') return Promise.resolve([]);
      return Promise.resolve([
        disponible({ idProyecto: 12, tituloProyecto: 'Cerrado explorable', estadoProyecto: 'CERRADO', roles: [] }),
        disponible(),
      ]);
    });
    render(createElement(ProyectosPage), { wrapper: wrapper() });

    const cerrada = await screen.findByTestId('project-card-12');
    expect(within(cerrada).getByText('Cerrado')).toBeInTheDocument();
    expect(within(cerrada).getByRole('link', { name: /Ver proyecto/ })).toHaveAttribute('href', '/dashboard/proyectos/12');
    expect(screen.queryByRole('button', { name: /Postular/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Postular/ })).not.toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('ya no aceptan postulaciones');

    const cards = screen.getAllByTestId(/project-card-/);
    expect(cards[0]).toBe(screen.getByTestId('project-card-11'));
    expect(cards[cards.length - 1]).toBe(cerrada);
  });
});
