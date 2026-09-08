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
vi.mock('../hooks/use-project-sprints', () => ({ useProjectSprints: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../lib/swal', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
  swalCustomClass: {},
}));
vi.mock('../lib/services/projects', () => ({}));
vi.mock('../lib/services/closure', () => ({
  getCloseReadiness: vi.fn(),
  getClosureRevisions: vi.fn(),
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
import { useProjectSprints } from '../hooks/use-project-sprints';
import { useCurrentUser } from '../hooks/use-current-user';
import { getCloseReadiness, getClosureRevisions } from '../lib/services/closure';
import type { CloseReadinessSummary } from '../lib/types/closure';
import type { SprintDto } from '../lib/types/sprints';

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

function mockSprints(sprints: SprintDto[] = []) {
  (useProjectSprints as any).mockReturnValue({
    sprints,
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
    mockSprints([]);
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

  it('el líder no ve controles de "necesitas un rol" (Tablero se navega desde la sidebar)', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    renderPage();

    expect(screen.queryByRole('link', { name: /tablero/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/necesitas un rol/i)).not.toBeInTheDocument();
  });

  it('un participante activo (no líder) no ve controles exclusivos de líder (Tablero se navega desde la sidebar)', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 7 } });
    mockMembers([{ idUsuario: 7, idRolProyecto: 3 }]);
    renderPage();

    expect(screen.queryByRole('link', { name: /tablero/i })).not.toBeInTheDocument();
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

  it('muestra el banner de solicitud de cierre en revisión (sin veredictos en esta vista)', async () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    (useProjectDetail as any).mockReturnValue({
      data: { ...proyectoFixture, estadoProyecto: 'EN_SOLICITUD_CIERRE' },
      isLoading: false,
      error: null,
    });
    (getClosureRevisions as any).mockResolvedValue({
      page: 1, limit: 20, total: 1,
      items: [{ idRevisionCierre: 5, numeroRevision: 1, estadoRevision: 'ENVIADA', comentarioRevisor: null, documentosEnviados: [], informeOficial: null, puedeEditar: false, puedeEnviar: false, puedeResolver: false }],
    });
    renderPage();

    expect(await screen.findByText(/Solicitud de cierre en revisión/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aprobar cierre/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rechazar/i })).not.toBeInTheDocument();
  });

  it('un administrador (no líder) tampoco ve veredictos aquí: viven en la revisión administrativa del cierre', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999, roles: ['administrador'] } });
    (useProjectDetail as any).mockReturnValue({
      data: { ...proyectoFixture, estadoProyecto: 'EN_SOLICITUD_CIERRE' },
      isLoading: false,
      error: null,
    });
    renderPage();

    expect(screen.queryByRole('button', { name: /aprobar cierre/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rechazar/i })).not.toBeInTheDocument();
  });
});

// ─── S7 — «Preparar cierre del proyecto» gobernado por el readiness ────────

function readiness(overrides: Partial<CloseReadinessSummary> = {}): CloseReadinessSummary {
  return {
    projectId: 42,
    revisionId: null,
    phase: 'REQUEST',
    canSubmit: true,
    blockers: [],
    warnings: [],
    executionFingerprint: null,
    ...overrides,
  };
}

describe('ProjectDetailClient — S7: preparar cierre según CloseReadinessSummary', () => {
  beforeEach(() => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } }); // idUsuario 1 = líder (creador.idUsuario)
    searchParamsMock.mockReturnValue(new URLSearchParams());
    mockMembers([]);
    mockSprints([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('con canSubmit:true la acción es un enlace habilitado a /cierre', async () => {
    (getCloseReadiness as any).mockResolvedValue(readiness());
    renderPage();

    const link = await screen.findByRole('link', { name: /preparar cierre del proyecto/i });
    expect(link).toHaveAttribute('href', '/dashboard/projects/42/cierre');
  });

  it('con canSubmit:false la acción está deshabilitada y explica cuántas comprobaciones faltan', async () => {
    (getCloseReadiness as any).mockResolvedValue(
      readiness({ canSubmit: false, blockers: [{ code: 'SPRINTS_NO_CERRADOS', message: 'Sprint abierto', ids: [1], cantidad: 1 }] }),
    );
    renderPage();

    expect(await screen.findByLabelText(/Faltan 1 de 16 comprobación/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /preparar cierre del proyecto/i })).toBeDisabled();
    expect(screen.queryByRole('link', { name: /preparar cierre del proyecto/i })).not.toBeInTheDocument();
  });

  it('no-líder no ve el control', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999 } });
    mockMembers([{ idUsuario: 999, idRolProyecto: 3 }]);
    renderPage();

    expect(screen.queryByText(/preparar cierre del proyecto/i)).not.toBeInTheDocument();
    expect(getCloseReadiness).not.toHaveBeenCalled();
  });

  it('fuera de EN_PROGRESO (p.ej. PUBLICADO) el control no se muestra', () => {
    (useProjectDetail as any).mockReturnValue({
      data: { ...proyectoFixture, estadoProyecto: 'PUBLICADO' },
      isLoading: false,
      error: null,
    });
    renderPage();

    expect(screen.queryByText(/preparar cierre del proyecto/i)).not.toBeInTheDocument();
  });
});
