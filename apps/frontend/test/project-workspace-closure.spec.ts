import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-project-members', () => ({ useProjectMembers: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../hooks/use-project-roles', () => ({ useProjectRoles: vi.fn() }));
vi.mock('../hooks/use-exit-request', () => ({ useCurrentExitRequest: () => ({ request: null }) }));
vi.mock('../lib/services/closure', () => ({
  getCloseReadiness: vi.fn(),
  getClosureRevisions: vi.fn(),
}));
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

import ProjectDetailClient from '../app/dashboard/projects/[id]/project-detail-client';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useProjectMembers } from '../hooks/use-project-members';
import { useCurrentUser } from '../hooks/use-current-user';
import { useProjectRoles } from '../hooks/use-project-roles';
import { getCloseReadiness, getClosureRevisions } from '../lib/services/closure';
import * as projectsService from '../lib/services/projects';
import type { CloseReadinessSummary } from '../lib/types/closure';

const proyecto: ProyectoDetalleDTO = {
  idProyecto: 42,
  tituloProyecto: 'Sistema de Tutorías',
  descripcionProyecto: 'Descripción suficientemente larga del proyecto.',
  objetivosProyecto: 'Objetivo uno',
  tipoProyecto: 'INVESTIGACION',
  estadoProyecto: 'EN_PROGRESO',
  modalidadProyecto: 'PRESENCIAL',
  ubicacionProyecto: null,
  contextoAcademico: null,
  urlRecursoExterno: null,
  fechaPublicacion: null,
  fechaInicio: null,
  fechaFinEstimada: null,
  fechaCreacion: '2026-01-01T00:00:00.000Z',
  fechaActualizacion: '2026-08-30T12:00:00.000Z',
  creador: { idUsuario: 1, nombre: 'Ana', apellido: 'Lopez', correo: 'ana@uvg.edu.gt' },
  organizaciones: [],
  intereses: [],
  roles: [],
  hitos: [],
  tareas: [],
} as unknown as ProyectoDetalleDTO;

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

function mockProyecto(estadoProyecto: string, idUsuario = 1) {
  (useProjectDetail as any).mockReturnValue({ data: { ...proyecto, estadoProyecto }, isLoading: false, error: null });
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario } });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(createElement(ProjectDetailClient, { id: 42 }), { wrapper });
}

beforeEach(() => {
  (useProjectMembers as any).mockReturnValue({ members: [] });
  (useProjectRoles as any).mockReturnValue({
    roles: [],
    crearRol: { mutate: vi.fn(), isPending: false },
    editarRol: { mutate: vi.fn(), isPending: false },
    eliminarRol: { mutate: vi.fn(), isPending: false },
    asignarmeRol: { mutate: vi.fn(), isPending: false },
    salirDeRol: { mutate: vi.fn(), isPending: false },
  });
  (getClosureRevisions as any).mockResolvedValue({ page: 1, limit: 20, total: 0, items: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VIEW-01 — workspace del líder y cierre (F006)', () => {
  it('EN_PROGRESO + canSubmit:true → «Preparar cierre del proyecto» habilitado hacia /cierre', async () => {
    mockProyecto('EN_PROGRESO');
    (getCloseReadiness as any).mockResolvedValue(readiness());
    renderPage();

    const link = await screen.findByRole('link', { name: /preparar cierre del proyecto/i });
    expect(link).toHaveAttribute('href', '/dashboard/projects/42/cierre');
    expect(getCloseReadiness).toHaveBeenCalledWith(42, 'REQUEST');
  });

  it('canSubmit:false → deshabilitado con tooltip que dice cuántas comprobaciones faltan', async () => {
    mockProyecto('EN_PROGRESO');
    (getCloseReadiness as any).mockResolvedValue(
      readiness({
        canSubmit: false,
        blockers: [
          { code: 'SPRINTS_NO_CERRADOS', message: 'Hay un sprint abierto', ids: [3], cantidad: 1 },
          { code: 'TAREAS_SIN_TERMINAR', message: 'Quedan tareas', ids: [8, 9], cantidad: 2 },
          { code: 'INFORME_INVALIDO', message: 'Sin informe', ids: [], cantidad: 1 },
        ],
      }),
    );
    renderPage();

    const wrapper = await screen.findByLabelText(/Faltan 3 de 16 comprobaciones/);
    expect(wrapper).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('button', { name: /preparar cierre del proyecto/i })).toBeDisabled();
  });

  it('si el readiness falla, el workspace se renderiza y la acción queda deshabilitada', async () => {
    mockProyecto('EN_PROGRESO');
    (getCloseReadiness as any).mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));
    renderPage();

    await waitFor(() => expect(screen.getByLabelText(/No se pudo comprobar el estado del cierre/)).toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 1, name: 'Sistema de Tutorías' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /preparar cierre del proyecto/i })).toBeDisabled();
  });

  it('EN_SOLICITUD_CIERRE → banner de revisión, sin acción de cierre', async () => {
    mockProyecto('EN_SOLICITUD_CIERRE');
    (getClosureRevisions as any).mockResolvedValue({
      page: 1,
      limit: 20,
      total: 1,
      items: [{ idRevisionCierre: 5, numeroRevision: 2, estadoRevision: 'ENVIADA', comentarioRevisor: null, documentosEnviados: [], informeOficial: null, puedeEditar: false, puedeEnviar: false, puedeResolver: false }],
    });
    renderPage();

    expect(await screen.findByText(/entrega #2/)).toBeInTheDocument();
    expect(screen.getByText(/Solicitud de cierre en revisión/)).toBeInTheDocument();
    expect(screen.queryByText(/preparar cierre del proyecto/i)).not.toBeInTheDocument();
    expect(getCloseReadiness).not.toHaveBeenCalled();
  });

  it('EN_SOLICITUD_CIERRE con corrección documental → banner ámbar con «Corregir documentos» hacia /cierre', async () => {
    mockProyecto('EN_SOLICITUD_CIERRE');
    (getClosureRevisions as any).mockResolvedValue({
      page: 1,
      limit: 20,
      total: 2,
      items: [{ idRevisionCierre: 6, numeroRevision: 2, estadoRevision: 'BORRADOR', comentarioRevisor: 'Falta una evidencia', documentosEnviados: [], informeOficial: null, puedeEditar: true, puedeEnviar: true, puedeResolver: false }],
    });
    renderPage();

    expect(await screen.findByText(/solicitó una corrección documental/)).toBeInTheDocument();
    expect(screen.getByText('Falta una evidencia')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /corregir documentos/i })).toHaveAttribute('href', '/dashboard/projects/42/cierre');
  });

  it('CERRADO → ReadOnlyProjectBanner y ninguna acción de escritura', async () => {
    mockProyecto('CERRADO');
    renderPage();

    expect(await screen.findByRole('status', { name: /vista histórica de solo lectura/i })).toBeInTheDocument();
    expect(screen.getByText(/Proyecto cerrado el/)).toBeInTheDocument();
    expect(screen.queryByText(/preparar cierre del proyecto/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /agregar rol/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar rol/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /postularme/i })).not.toBeInTheDocument();
    expect(getCloseReadiness).not.toHaveBeenCalled();
  });

  it('lib/services/projects.ts ya no exporta las tres funciones retiradas de cierre', () => {
    expect((projectsService as Record<string, unknown>).requestProjectClosure).toBeUndefined();
    expect((projectsService as Record<string, unknown>).approveProjectClosure).toBeUndefined();
    expect((projectsService as Record<string, unknown>).rejectProjectClosure).toBeUndefined();
  });
});
