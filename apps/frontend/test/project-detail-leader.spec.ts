import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';
import type { ProjectRoleDTO } from '../lib/services/roles';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

vi.mock('../components/dashboard/DashboardLayout', () => ({
  default: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-project-avance', () => ({
  useProjectAvance: () => ({ data: undefined, isSuccess: false }),
}));
vi.mock('../hooks/use-project-members', () => ({ useProjectMembers: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../hooks/use-project-roles', () => ({ useProjectRoles: vi.fn() }));
vi.mock('../lib/services/catalogs', () => ({
  getCarreras: vi.fn().mockResolvedValue([{ idCarrera: 3, nombreCarrera: 'Sistemas' }]),
  getHabilidades: vi.fn().mockResolvedValue([{ idHabilidad: 7, nombreHabilidad: 'React', categoriaHabilidad: null }]),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import ProjectDetailClient from '../app/dashboard/projects/[id]/project-detail-client';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useProjectMembers } from '../hooks/use-project-members';
import { useCurrentUser } from '../hooks/use-current-user';
import { useProjectRoles } from '../hooks/use-project-roles';

function proyecto(overrides: Partial<ProyectoDetalleDTO> = {}): ProyectoDetalleDTO {
  return {
    idProyecto: 42,
    tituloProyecto: 'Proyecto de prueba',
    descripcionProyecto: 'Descripción real del proyecto.',
    objetivosProyecto: 'Objetivo uno\nObjetivo dos',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: 'PUBLICADO',
    modalidadProyecto: 'MIXTA',
    ubicacionProyecto: null,
    contextoAcademico: null,
    urlRecursoExterno: null,
    fechaPublicacion: null,
    fechaInicio: '2026-02-01',
    fechaFinEstimada: '2026-06-01',
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    creador: { idUsuario: 1, nombre: 'Ana', apellido: 'Lopez', correo: 'ana@uvg.edu.gt' },
    organizaciones: [],
    intereses: [],
    roles: [],
    hitos: [],
    ...overrides,
  };
}

function rol(overrides: Partial<ProjectRoleDTO> = {}): ProjectRoleDTO {
  return {
    idRolProyecto: 1,
    nombreRol: 'Frontend',
    descripcionRolProyecto: 'UI',
    idCarreraRequerida: null,
    carreraRequerida: null,
    cupos: 2,
    horasSemanalesEstimadas: null,
    requisitos: [],
    participantesActivos: 1,
    cuposDisponibles: 1,
    isMine: false,
    canLeave: false,
    ...overrides,
  };
}

function mutationStub() {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null, variables: undefined };
}

function mockRoles(roles: ProjectRoleDTO[]) {
  (useProjectRoles as any).mockReturnValue({
    isLeader: true,
    roles,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    crearRol: mutationStub(),
    editarRol: mutationStub(),
    eliminarRol: mutationStub(),
    asignarmeRol: mutationStub(),
    salirDeRol: mutationStub(),
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(QueryClientProvider, { client }, createElement(ProjectDetailClient, { id: 42 })),
  );
}

describe('ProjectDetailClient — vista administrativa del líder (Sección 7-24)', () => {
  beforeEach(() => {
    (useProjectDetail as any).mockReturnValue({ data: proyecto(), isLoading: false, error: null, refetch: vi.fn() });
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } }); // = creador ⇒ líder
    (useProjectMembers as any).mockReturnValue({ members: [] });
    mockRoles([rol()]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('no contiene Kanban, pestañas ni progreso; muestra las acciones del líder sin "Gestionar roles"', () => {
    renderPage();
    expect(screen.queryByRole('tab', { name: 'Tablero' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Por hacer' })).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: /revisiones previas/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/mine/42?returnTo=/dashboard/projects/42',
    );
    expect(screen.getByRole('link', { name: /editar información/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/mine/form?id=42',
    );
    expect(screen.getByRole('button', { name: /editar roles/i })).toBeInTheDocument();
    // La opción de editar fecha final ya no vive aquí (irá dentro del formulario
    // de editar información).
    expect(screen.queryByRole('button', { name: /editar fecha final/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tablero/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/42/kanban',
    );
    // Nunca el diálogo descartado.
    expect(screen.queryByText(/necesitas un rol para continuar/i)).not.toBeInTheDocument();
  });

  it('muestra el badge "Líder del proyecto" y "Eres el responsable del proyecto"', () => {
    renderPage();
    expect(screen.getByText('Líder del proyecto')).toBeInTheDocument();
    expect(screen.getByText('Eres el responsable del proyecto')).toBeInTheDocument();
  });

  it('renderiza los objetivos reales (Sección 16)', () => {
    renderPage();
    expect(screen.getByText('Objetivo uno')).toBeInTheDocument();
    expect(screen.getByText('Objetivo dos')).toBeInTheDocument();
  });

  it('muestra el estado vacío de objetivos cuando no hay', () => {
    (useProjectDetail as any).mockReturnValue({
      data: proyecto({ objetivosProyecto: null }),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('No se han registrado objetivos para este proyecto.')).toBeInTheDocument();
  });

  it('Resumen del equipo: mis roles, participantes deduplicados, cupos y disponibles reales', () => {
    (useProjectMembers as any).mockReturnValue({
      members: [
        { idUsuario: 1, idRolProyecto: 1 },
        { idUsuario: 1, idRolProyecto: 2 }, // mismo usuario, cuenta 1
        { idUsuario: 2, idRolProyecto: 1 },
      ],
    });
    mockRoles([
      rol({ idRolProyecto: 1, nombreRol: 'Frontend', cupos: 2, cuposDisponibles: 1, isMine: true }),
      rol({ idRolProyecto: 2, nombreRol: 'Docs', cupos: 3, cuposDisponibles: 0, isMine: false }),
    ]);
    renderPage();

    // Mis roles: un chip "Frontend" (isMine).
    const resumen = screen.getByText('Resumen del equipo').closest('div') as HTMLElement;
    expect(within(resumen).getByText('Frontend')).toBeInTheDocument();

    const filaValor = (label: string) =>
      within(screen.getByText(label).parentElement as HTMLElement).getAllByText(/\d+/)[0].textContent;
    expect(filaValor('Participantes confirmados')).toBe('2');
    expect(filaValor('Roles disponibles')).toBe('1');
    expect(filaValor('Cupos totales')).toBe('5');
  });

  it('"Editar roles" abre el Sheet en modo listado con los roles reales', () => {
    mockRoles([rol({ idRolProyecto: 1, nombreRol: 'Frontend' })]);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /editar roles/i }));

    expect(screen.getByRole('heading', { name: 'Gestionar roles' })).toBeInTheDocument();
    expect(screen.getByText('Roles existentes')).toBeInTheDocument();
    expect(screen.getAllByTestId('role-list-card')).toHaveLength(1);
  });

  it('"Agregar rol" abre el Sheet en modo creación', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /agregar rol/i }));
    expect(screen.getByRole('button', { name: 'Crear rol' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del rol')).toHaveValue('');
  });

  it('"Editar rol" abre el Sheet en modo edición con el rol precargado', () => {
    mockRoles([rol({ idRolProyecto: 1, nombreRol: 'Frontend', cupos: 2 })]);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /editar rol frontend/i }));
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del rol')).toHaveValue('Frontend');
  });

  it('404: muestra "Proyecto no encontrado" con vuelta a Mis Proyectos', () => {
    (useProjectDetail as any).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { statusCode: 404 },
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('Proyecto no encontrado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /volver a mis proyectos/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/mine',
    );
  });
});
