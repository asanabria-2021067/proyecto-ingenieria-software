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
const replaceMock = vi.fn();
const searchParamsMock = vi.fn(() => new URLSearchParams());
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock(),
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

import ProjectDetailClient from '../app/dashboard/projects/[id]/project-detail-client';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useProjectMembers } from '../hooks/use-project-members';
import { useCurrentUser } from '../hooks/use-current-user';
import { useProjectRoles } from '../hooks/use-project-roles';
import { ProjectHeaderCard, ProjectClosureAction } from '../components/projects/detail/project-header-card';
import { ProjectOwnerCard } from '../components/projects/detail/project-owner-card';
import { ProjectDescriptionCard } from '../components/projects/detail/project-description-card';

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
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('no contiene Kanban, pestañas ni progreso; la navegación del proyecto vive en la sidebar', () => {
    renderPage();
    expect(screen.queryByRole('tab', { name: 'Tablero' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Por hacer' })).not.toBeInTheDocument();

    // Editar Información/Revisiones Pasadas/Editar Roles/Tablero ya no se
    // renderizan dentro de esta página: son NavItems de ProjectSidebar.
    expect(screen.queryByRole('link', { name: /revisiones pasadas/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /editar información/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar roles/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /tablero/i })).not.toBeInTheDocument();
    // La opción de editar fecha final ya no vive aquí (irá dentro del formulario
    // de editar información).
    expect(screen.queryByRole('button', { name: /editar fecha final/i })).not.toBeInTheDocument();
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

  it('?openRoles=1 (enlace "Editar Roles" de la sidebar) abre el Sheet en modo listado con los roles reales', () => {
    mockRoles([rol({ idRolProyecto: 1, nombreRol: 'Frontend' })]);
    searchParamsMock.mockReturnValue(new URLSearchParams('openRoles=1'));
    renderPage();

    expect(screen.getByRole('heading', { name: 'Gestionar roles' })).toBeInTheDocument();
    expect(screen.getByText('Roles existentes')).toBeInTheDocument();
    expect(screen.getAllByTestId('role-list-card')).toHaveLength(1);
    expect(replaceMock).toHaveBeenCalledWith('/dashboard/projects/42');
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

// ── HU-154 (T-214/T-216): tarjetas compartidas del detalle ────────────────
describe('Tarjetas compartidas del detalle de proyecto', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function renderHeader(props: Partial<Parameters<typeof ProjectHeaderCard>[0]> = {}) {
    return render(
      createElement(ProjectHeaderCard, {
        breadcrumb: { href: '/dashboard/projects/mine', label: 'Mis proyectos' },
        titulo: 'Proyecto de prueba',
        descripcion: 'Descripción corta.',
        tipoProyecto: 'ACADEMICO_HORAS_BECA',
        estadoProyecto: 'EN_PROGRESO',
        modalidadProyecto: 'MIXTA',
        ...props,
      }),
    );
  }

  it('ProjectHeaderCard: ruta de vuelta, título h1, descripción y etiquetas de estado/tipo/modalidad', () => {
    renderHeader({ etiquetas: ['Salud', 'Deporte'] });

    expect(screen.getByRole('link', { name: 'Mis proyectos' })).toHaveAttribute('href', '/dashboard/projects/mine');
    expect(screen.getByRole('heading', { level: 1, name: 'Proyecto de prueba' })).toBeInTheDocument();
    expect(screen.getByText('Descripción corta.')).toBeInTheDocument();
    const resumen = screen.getByRole('region', { name: 'Resumen del proyecto' });
    expect(within(resumen).getByText('En progreso')).toHaveClass('pill');
    expect(within(resumen).getByText('Horas Beca')).toHaveClass('pill');
    expect(within(resumen).getByText('Mixta')).toHaveClass('pill', 'pill-neutral');
    const etiquetas = screen.getByRole('list', { name: 'Etiquetas del proyecto' });
    expect(within(etiquetas).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Salud', 'Deporte']);
  });

  it('ProjectHeaderCard: sin descripción muestra el texto de respaldo y sin etiquetas no hay lista', () => {
    renderHeader({ descripcion: null });
    expect(screen.getByText('Sin descripción disponible.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Etiquetas del proyecto' })).not.toBeInTheDocument();
  });

  it('ProjectHeaderCard: solo con líder muestra «Líder del proyecto» y «Eres el responsable del proyecto»', () => {
    renderHeader({ lider: { nombre: 'Ana', apellido: 'Lopez' } });
    expect(screen.getByText('Líder del proyecto')).toBeInTheDocument();
    expect(screen.getByText('Eres el responsable del proyecto')).toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument();

    cleanup();
    renderHeader();
    expect(screen.queryByText('Líder del proyecto')).not.toBeInTheDocument();
    expect(screen.queryByText('Eres el responsable del proyecto')).not.toBeInTheDocument();
  });

  it('ProjectHeaderCard: renderiza la acción principal recibida', () => {
    renderHeader({ acciones: createElement('a', { href: '/x' }, 'Acción principal') });
    expect(screen.getByRole('link', { name: 'Acción principal' })).toHaveAttribute('href', '/x');
  });

  it('ProjectClosureAction: habilitada es un enlace; bloqueada es un botón deshabilitado que explica el motivo', () => {
    render(createElement(ProjectClosureAction, { action: { href: '/dashboard/projects/42/cierre', enabled: true, reason: null } }));
    expect(screen.getByRole('link', { name: /preparar cierre del proyecto/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/42/cierre',
    );

    cleanup();
    render(createElement(ProjectClosureAction, { action: { href: '/x', enabled: false, reason: 'Faltan 2 de 16 comprobaciones' } }));
    expect(screen.getByRole('button', { name: /preparar cierre del proyecto/i })).toBeDisabled();
    expect(screen.getByLabelText('Faltan 2 de 16 comprobaciones')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('ProjectOwnerCard: responsable con iniciales y correo; «Chat» solo si se ofrece y llama al callback', () => {
    const onChat = vi.fn();
    render(createElement(ProjectOwnerCard, { nombre: 'Valeria', apellido: 'Ortiz', correo: 's6.lider@uvg.edu.gt', onChat }));

    const card = screen.getByRole('region', { name: 'Responsable del proyecto' });
    expect(within(card).getByText('Valeria Ortiz')).toBeInTheDocument();
    expect(within(card).getByText('s6.lider@uvg.edu.gt')).toBeInTheDocument();
    expect(within(card).getByText('VO')).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Chat' }));
    expect(onChat).toHaveBeenCalledTimes(1);

    cleanup();
    render(createElement(ProjectOwnerCard, { nombre: 'Valeria', apellido: 'Ortiz' }));
    expect(screen.queryByRole('button', { name: 'Chat' })).not.toBeInTheDocument();
  });

  it('ProjectDescriptionCard: descripción completa y objetivos en una sola tarjeta', () => {
    render(createElement(ProjectDescriptionCard, { descripcion: 'Texto\ncompleto', objetivos: ['Uno', 'Dos'] }));

    const card = screen.getByRole('region', { name: 'Descripción y objetivos' });
    expect(within(card).getByRole('heading', { level: 2, name: 'Descripción del proyecto' })).toBeInTheDocument();
    expect(within(card).getByRole('heading', { level: 3, name: 'Objetivos del proyecto' })).toBeInTheDocument();
    expect(within(card).getByText(/Texto\s+completo/)).toBeInTheDocument();
    expect(within(card).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Uno', 'Dos']);
  });

  it('ProjectDescriptionCard: sin descripción (undefined) es solo de objetivos; vacía muestra el estado vacío', () => {
    render(createElement(ProjectDescriptionCard, { objetivos: [] }));

    const card = screen.getByRole('region', { name: 'Objetivos del proyecto' });
    expect(within(card).getByRole('heading', { level: 2, name: 'Objetivos del proyecto' })).toBeInTheDocument();
    expect(within(card).queryByText('Descripción del proyecto')).not.toBeInTheDocument();
    expect(within(card).getByText('No se han registrado objetivos para este proyecto.')).toBeInTheDocument();
  });

  it('ProjectDescriptionCard: descripción null muestra el texto de respaldo', () => {
    render(createElement(ProjectDescriptionCard, { descripcion: null, objetivos: ['Uno'] }));
    expect(screen.getByText('Sin descripción disponible.')).toBeInTheDocument();
  });
});

describe('ProjectDetailClient — responsable en la tarjeta compartida', () => {
  beforeEach(() => {
    (useProjectDetail as any).mockReturnValue({ data: proyecto(), isLoading: false, error: null, refetch: vi.fn() });
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    (useProjectMembers as any).mockReturnValue({ members: [] });
    mockRoles([rol()]);
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('el líder ve al responsable (nombre y correo reales) sin botón de chat', () => {
    renderPage();
    const card = screen.getByRole('region', { name: 'Responsable del proyecto' });
    expect(within(card).getByText('Ana Lopez')).toBeInTheDocument();
    expect(within(card).getByText('ana@uvg.edu.gt')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Chat' })).not.toBeInTheDocument();
  });
});

// ── HU-154 (T-216): esqueleto compartido del líder ───────────────────────
describe('ProjectDetailClient — esqueleto 8/4 del líder', () => {
  beforeEach(() => {
    (useProjectDetail as any).mockReturnValue({ data: proyecto(), isLoading: false, error: null, refetch: vi.fn() });
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    (useProjectMembers as any).mockReturnValue({ members: [{ idUsuario: 1 }, { idUsuario: 5 }] });
    mockRoles([rol({ isMine: true })]);
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function slot(container: HTMLElement, nombre: string) {
    return container.querySelector(`[data-slot="${nombre}"]`) as HTMLElement;
  }

  it('usa la rejilla compartida: encabezado, principal y lateral, en ese orden', () => {
    const { container } = renderPage();

    const grid = slot(container, 'project-content-grid');
    expect(grid).toBeInTheDocument();
    expect(Array.from(grid.children).map((el) => el.getAttribute('data-slot'))).toEqual([
      'project-grid-full',
      'project-grid-main',
      'project-grid-aside',
    ]);
    expect(grid.className).not.toContain('max-w-[1400px]');
  });

  it('encabezado a ancho completo con la ruta de vuelta a Mis proyectos', () => {
    const { container } = renderPage();

    const full = slot(container, 'project-grid-full');
    expect(within(full).getByRole('heading', { level: 1, name: 'Proyecto de prueba' })).toBeInTheDocument();
    expect(within(full).getByRole('link', { name: 'Mis proyectos' })).toHaveAttribute('href', '/dashboard/projects/mine');
  });

  it('la columna principal tiene «Descripción y objetivos» y luego los roles', () => {
    const { container } = renderPage();

    const main = slot(container, 'project-grid-main');
    const descripcion = within(main).getByRole('region', { name: 'Descripción y objetivos' });
    expect(within(descripcion).getByText('Descripción real del proyecto.')).toBeInTheDocument();
    expect(within(descripcion).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Objetivo uno', 'Objetivo dos']);
    const rolesTitulo = within(main).getByText(/Roles del proyecto/);
    // La descripción precede a los roles en el orden del documento.
    expect(descripcion.compareDocumentPosition(rolesTitulo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('la columna lateral reúne responsable, detalles y resumen del equipo', () => {
    renderPage();

    const aside = screen.getByRole('complementary', { name: 'Información del proyecto' });
    expect(within(aside).getByRole('region', { name: 'Responsable del proyecto' })).toBeInTheDocument();
    expect(within(aside).getByText('Detalles del proyecto')).toBeInTheDocument();
    expect(within(aside).getByText('Resumen del equipo')).toBeInTheDocument();
  });

  it('?openRoles=1 sigue abriendo la gestión de roles y limpia la URL', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('openRoles=1'));
    renderPage();

    expect(screen.getByRole('heading', { name: 'Gestionar roles' })).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith('/dashboard/projects/42');
  });
});

// ── HU-154: la lista de roles del líder decide sus columnas por contenedor ──
describe('ProjectDetailClient — lista de roles por contenedor', () => {
  beforeEach(() => {
    (useProjectDetail as any).mockReturnValue({ data: proyecto(), isLoading: false, error: null, refetch: vi.fn() });
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    (useProjectMembers as any).mockReturnValue({ members: [] });
    mockRoles([rol(), rol({ idRolProyecto: 2, nombreRol: 'Backend' })]);
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('las tarjetas van en una rejilla de 2 columnas solo cuando la lista mide al menos 42rem', () => {
    renderPage();

    const tarjeta = screen.getByRole('heading', { level: 3, name: 'Frontend' });
    const rejilla = tarjeta.closest('.grid') as HTMLElement;
    expect(rejilla).toHaveClass('grid-cols-1', '@2xl/roles:grid-cols-2');
    expect(rejilla.className).not.toMatch(/(^|\s)(sm|md|lg|xl):grid-cols-/);
    expect(rejilla.parentElement).toHaveClass('@container/roles');
    expect(within(rejilla).getByRole('heading', { level: 3, name: 'Backend' })).toBeInTheDocument();
  });
});

// «Agregar rol» usa la misma escala secundaria que las acciones de cada rol.
describe('ProjectDetailClient — tamaño de «Agregar rol»', () => {
  beforeEach(() => {
    (useProjectDetail as any).mockReturnValue({ data: proyecto(), isLoading: false, error: null, refetch: vi.fn() });
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    (useProjectMembers as any).mockReturnValue({ members: [] });
    mockRoles([rol()]);
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('usa type-meta y conserva su color de acento', () => {
    renderPage();

    const boton = screen.getByRole('button', { name: /agregar rol/i });
    expect(boton).toHaveClass('type-meta', 'text-primary', 'border-primary');
  });
});
