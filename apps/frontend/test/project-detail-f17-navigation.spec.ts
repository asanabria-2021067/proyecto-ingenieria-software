import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';

// F17 — navegación contextual del detalle del proyecto (hub): "Sprints" y
// "Miembros" deben aparecer como nuevos entry points hacia F3/F12 (rutas
// reales bajo /dashboard/proyectos/[id], namespace distinto al de esta
// página), preservando "Tablero" y la fila administrativa existente. Ambos
// endpoints (SprintsService.listSprints, TeamService.getTeamSummary) son
// exclusivos del líder en backend, así que los links solo deben aparecer
// para el líder — mismo criterio ya aplicado a "Revisiones previas"/"Editar
// información"/"Editar roles".

vi.mock('../components/dashboard/DashboardLayout', () => ({
  default: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-project-avance', () => ({
  useProjectAvance: () => ({ data: undefined, isSuccess: false }),
}));
vi.mock('../hooks/use-project-members', () => ({ useProjectMembers: vi.fn() }));
vi.mock('../hooks/use-project-sprints', () => ({ useProjectSprints: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../lib/swal', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
  swalCustomClass: {},
}));
vi.mock('../lib/services/projects', () => ({
  approveProjectClosure: vi.fn().mockResolvedValue(undefined),
  rejectProjectClosure: vi.fn().mockResolvedValue(undefined),
  requestProjectClosure: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import ProjectDetailClient from '../app/dashboard/projects/[id]/project-detail-client';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useProjectMembers } from '../hooks/use-project-members';
import { useProjectSprints } from '../hooks/use-project-sprints';
import { useCurrentUser } from '../hooks/use-current-user';

const proyectoFixture: ProyectoDetalleDTO = {
  idProyecto: 42,
  tituloProyecto: 'Sistema de Tutorías Académicas UVG',
  descripcionProyecto: 'Una descripción de al menos veinte caracteres.',
  objetivosProyecto: null,
  tipoProyecto: 'ACADEMICO_HORAS_BECA',
  estadoProyecto: 'EN_PROGRESO',
  modalidadProyecto: 'PRESENCIAL',
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

function mockSprints() {
  (useProjectSprints as any).mockReturnValue({
    sprints: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(QueryClientProvider, { client: queryClient }, createElement(ProjectDetailClient, { id: 42 })),
  );
}

describe('ProjectDetailClient — F17: hub de navegación contextual', () => {
  beforeEach(() => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockSprints();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('líder (creador.idUsuario === currentUser)', () => {
    beforeEach(() => {
      (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
      mockMembers([]);
    });

    it('Test 1 — "Sprints" está visible', () => {
      renderPage();
      expect(screen.getByRole('link', { name: 'Sprints' })).toBeInTheDocument();
    });

    it('Test 2 — "Sprints" enlaza a la ruta real de F3 con el projectId correcto', () => {
      renderPage();
      expect(screen.getByRole('link', { name: 'Sprints' })).toHaveAttribute(
        'href',
        '/dashboard/proyectos/42/sprints',
      );
    });

    it('Test 3 — "Miembros" está visible', () => {
      renderPage();
      expect(screen.getByRole('link', { name: 'Miembros' })).toBeInTheDocument();
    });

    it('Test 4 — "Miembros" enlaza a la ruta real de F12 con el projectId correcto', () => {
      renderPage();
      expect(screen.getByRole('link', { name: 'Miembros' })).toHaveAttribute(
        'href',
        '/dashboard/proyectos/42/miembros',
      );
    });

    it('Test 5 — "Tablero" se preserva, con su href e icono originales', () => {
      renderPage();
      const tablero = screen.getByRole('link', { name: /tablero/i });
      expect(tablero).toHaveAttribute('href', '/dashboard/projects/42/kanban');
    });

    it('Test 6 — navegación administrativa preservada (Editar Información, Revisiones Pasadas, Editar Roles)', () => {
      renderPage();
      expect(screen.getByRole('link', { name: /editar información/i })).toHaveAttribute(
        'href',
        '/dashboard/projects/mine/form?id=42',
      );
      expect(screen.getByRole('link', { name: /revisiones pasadas/i })).toHaveAttribute(
        'href',
        '/dashboard/projects/mine/42?returnTo=/dashboard/projects/42',
      );
      expect(screen.getByRole('button', { name: /editar roles/i })).toBeInTheDocument();
    });

    it('Test 7 — no se introdujo un tab permanente "Salida"', () => {
      renderPage();
      expect(screen.queryByText(/^salida$/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /preparación de salida/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /solicitud de salida/i })).not.toBeInTheDocument();
    });

    it('el orden de la fila es Resumen, Editar Información, Revisiones Pasadas, Editar Roles, Miembros, Sprints, Tablero', () => {
      renderPage();
      const fila = screen.getByText('Resumen').closest('div') as HTMLElement;
      const etiquetas = Array.from(fila.querySelectorAll('a, span[aria-current], button')).map(
        (el) => el.textContent?.trim().replace(/\s+/g, ' '),
      );
      expect(etiquetas).toEqual([
        'Resumen',
        'Editar Información',
        'Revisiones Pasadas',
        'Editar Roles',
        'Miembros',
        'Sprints',
        'Tablero',
      ]);
    });
  });

  describe('colaborador activo (no líder)', () => {
    it('no ve "Sprints" ni "Miembros" — SprintsService.listSprints/TeamService.getTeamSummary son exclusivos del líder', () => {
      (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 7 } });
      mockMembers([{ idUsuario: 7, idRolProyecto: 3 }]);
      renderPage();

      expect(screen.getByRole('link', { name: /tablero/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Sprints' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Miembros' })).not.toBeInTheDocument();
    });
  });
});
