import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';

// La vista de detalle administrativa ya NO contiene el tablero (Sección 19):
// ofrece "Tablero" al líder/participante y redirige las URLs antiguas
// `?tab=` al workspace (Sección 20).

vi.mock('../components/dashboard/DashboardLayout', () => ({
  default: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-project-avance', () => ({
  useProjectAvance: () => ({ data: undefined, isSuccess: false }),
}));
vi.mock('../hooks/use-project-members', () => ({ useProjectMembers: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../lib/swal', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
  swalCustomClass: {},
}));
vi.mock('../lib/services/projects', () => ({
  approveProjectClosure: vi.fn().mockResolvedValue(undefined),
  rejectProjectClosure: vi.fn().mockResolvedValue(undefined),
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
import uvgSwal from '../lib/swal';
import { approveProjectClosure, rejectProjectClosure } from '../lib/services/projects';

const proyectoFixture: ProyectoDetalleDTO = {
  idProyecto: 42,
  tituloProyecto: 'Proyecto de prueba',
  descripcionProyecto: 'Una descripción de al menos veinte caracteres.',
  objetivosProyecto: null,
  tipoProyecto: 'INVESTIGACION',
  estadoProyecto: 'EN_PROGRESO',
  modalidadProyecto: 'HIBRIDO',
  ubicacionProyecto: null,
  contextoAcademico: null,
  urlRecursoExterno: null,
  fechaPublicacion: null,
  fechaInicio: null,
  fechaFinEstimada: null,
  fechaCreacion: '2026-01-01T00:00:00.000Z',
  creador: { idUsuario: 1, nombre: 'Ana', apellido: 'Lopez', correo: 'ana@uvg.edu.gt' },
  organizaciones: [],
  intereses: [],
  roles: [],
  hitos: [],
  tareas: [],
};

function mockMembers(members: Array<{ idUsuario: number; idRolProyecto: number }> = []) {
  (useProjectMembers as any).mockReturnValue({ members });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ProjectDetailClient, { id: 42 }),
    ),
  );
}

describe('ProjectDetailClient — vista administrativa (Sección 19/21)', () => {
  beforeEach(() => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    searchParamsMock.mockReturnValue(new URLSearchParams());
    mockMembers([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('no renderiza el tablero ni las pestañas Tablero/Hitos', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    renderPage();

    expect(screen.queryByRole('tab', { name: 'Tablero' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Por hacer' })).not.toBeInTheDocument();
  });

  it('el líder ve "Tablero" que enlaza directamente al workspace (sin selector de rol)', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    renderPage();

    const enlaces = screen.getAllByRole('link', { name: /tablero/i });
    expect(enlaces.length).toBeGreaterThan(0);
    expect(enlaces[0]).toHaveAttribute('href', '/dashboard/projects/42/kanban');
    expect(screen.queryByText(/necesitas un rol/i)).not.toBeInTheDocument();
  });

  it('un participante activo (no líder) también ve "Tablero", sin controles exclusivos de líder', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 7 } });
    mockMembers([{ idUsuario: 7, idRolProyecto: 3 }]);
    renderPage();

    expect(screen.getAllByRole('link', { name: /tablero/i })[0]).toHaveAttribute(
      'href',
      '/dashboard/projects/42/kanban',
    );
    expect(screen.queryByRole('link', { name: /revisiones previas/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /editar información/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar roles/i })).not.toBeInTheDocument();
  });

  it('un externo (ni líder ni participante) ve "Postularme", no "Tablero"', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999 } });
    mockMembers([]);
    renderPage();

    expect(screen.queryByRole('link', { name: /tablero/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /postularme/i })).toBeInTheDocument();
  });

  it('redirige la URL antigua ?tab=tablero al workspace conservando taskId', async () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    searchParamsMock.mockReturnValue(new URLSearchParams('tab=tablero&taskId=55'));
    renderPage();

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith('/dashboard/projects/42/kanban?taskId=55'),
    );
  });

  it('renderiza título, descripción y detalles reales del proyecto', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Proyecto de prueba' })).toBeInTheDocument();
    expect(screen.getByText('Una descripción de al menos veinte caracteres.')).toBeInTheDocument();
    expect(screen.getByText('Detalles del proyecto')).toBeInTheDocument();
  });

  it('muestra el aviso de solicitud de cierre pendiente', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    (useProjectDetail as any).mockReturnValue({
      data: { ...proyectoFixture, estadoProyecto: 'EN_SOLICITUD_CIERRE' },
      isLoading: false,
      error: null,
    });
    renderPage();

    expect(screen.getByText('Solicitud de cierre pendiente')).toBeInTheDocument();
  });

  it('un administrador (no líder) puede aprobar el cierre', async () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999, roles: ['administrador'] } });
    (useProjectDetail as any).mockReturnValue({
      data: { ...proyectoFixture, estadoProyecto: 'EN_SOLICITUD_CIERRE' },
      isLoading: false,
      error: null,
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /aprobar cierre/i }));

    expect(uvgSwal.fire).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Aprobar cierre?' }));
    await waitFor(() => expect(approveProjectClosure).toHaveBeenCalledWith(42));
    expect(rejectProjectClosure).not.toHaveBeenCalled();
  });

  it('un administrador (no líder) puede rechazar el cierre', async () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999, roles: ['administrador'] } });
    (useProjectDetail as any).mockReturnValue({
      data: { ...proyectoFixture, estadoProyecto: 'EN_SOLICITUD_CIERRE' },
      isLoading: false,
      error: null,
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /rechazar/i }));

    expect(uvgSwal.fire).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Rechazar cierre?' }));
    await waitFor(() => expect(rejectProjectClosure).toHaveBeenCalledWith(42));
    expect(approveProjectClosure).not.toHaveBeenCalled();
  });
});
