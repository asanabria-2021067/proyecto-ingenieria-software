import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';
import type { ExitPreparationBlockerDto, ExitPreparationSummaryDto } from '../lib/types/exit-requests';

beforeAll(() => {
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-exit-request', () => ({
  useCurrentExitRequest: vi.fn(),
  useExitPreparationSummary: vi.fn(),
  useContinueExitPreparation: vi.fn(),
}));
vi.mock('../hooks/use-project-tasks', () => ({
  useProjectTasks: vi.fn(() => ({
    cerrarAsignacion: { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null },
  })),
}));
vi.mock('../lib/services/sprints', () => ({ getProjectSprints: vi.fn() }));
vi.mock('../lib/services/leadership', () => ({ getLeadershipContext: vi.fn() }));
vi.mock('../lib/services/users', () => ({ getMe: vi.fn() }));

import ExitPreparationWorkspaceClient from '../app/dashboard/projects/[id]/salida/preparacion/exit-preparation-workspace-client';
import { deriveExitS7Blockers } from '../hooks/use-exit-s7-context';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useContinueExitPreparation, useCurrentExitRequest, useExitPreparationSummary } from '../hooks/use-exit-request';
import { getProjectSprints } from '../lib/services/sprints';
import { getLeadershipContext } from '../lib/services/leadership';
import { getMe } from '../lib/services/users';

function proyecto(overrides: Partial<ProyectoDetalleDTO> = {}): ProyectoDetalleDTO {
  return {
    idProyecto: 7,
    tituloProyecto: 'Sistema de Tutorías Académicas UVG',
    descripcionProyecto: null,
    objetivosProyecto: null,
    tipoProyecto: 'EXPERIENCIA',
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
    ...overrides,
  } as ProyectoDetalleDTO;
}

function blocker(overrides: Partial<ExitPreparationBlockerDto> = {}): ExitPreparationBlockerDto {
  return {
    idAsignacion: 1,
    idTarea: 1,
    tituloTarea: 'Documentar procesos',
    estadoTarea: 'EN_PROGRESO',
    fechaAsignacion: '2026-01-01T00:00:00.000Z',
    horasReales: null,
    tieneHoras: true,
    tieneAvance: true,
    estadoPreparacion: 'COMPLETA',
    ...overrides,
  };
}

function summary(overrides: Partial<ExitPreparationSummaryDto> = {}): ExitPreparationSummaryDto {
  const blockers = overrides.blockers ?? [];
  return {
    solicitud: { idSolicitud: 1, idProyecto: 7, idUsuario: 3, estadoSolicitud: 'PREPARACION', solicitadaEn: '2026-01-01T00:00:00.000Z' },
    blockers,
    cantidadBlockers: blockers.length,
    puedeContinuar: blockers.every((b) => b.estadoPreparacion === 'COMPLETA'),
    ...overrides,
  };
}

function mockHooks(opts: { proyecto?: ProyectoDetalleDTO; summary?: ExitPreparationSummaryDto } = {}) {
  (useProjectDetail as any).mockReturnValue({ data: opts.proyecto ?? proyecto(), isLoading: false, error: null });
  (useCurrentExitRequest as any).mockReturnValue({
    request: { idSolicitud: 1, idProyecto: 7, idUsuario: 3, motivo: 'Cambio', solicitadaEn: '2026-01-01T00:00:00.000Z', estadoSolicitud: 'PREPARACION' },
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  (useExitPreparationSummary as any).mockReturnValue({
    summary: opts.summary ?? summary(),
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  (useContinueExitPreparation as any).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false, error: null });
}

function renderWorkspace() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return render(createElement(ExitPreparationWorkspaceClient, { id: 7 }), { wrapper: Wrapper });
}

beforeEach(() => {
  (getProjectSprints as any).mockResolvedValue([{ idSprint: 2, numero: 2, estado: 'ACTIVO' }, { idSprint: 1, numero: 1, estado: 'CERRADO' }]);
  (getLeadershipContext as any).mockResolvedValue({
    projectId: 7,
    estadoProyecto: 'EN_PROGRESO',
    liderActual: { idUsuario: 1, nombre: 'Ana', apellido: 'Lopez' },
    tieneParticipacionActiva: true,
    participacionesActivas: [],
    conservaMembresiaSiSeTransfiere: true,
    advertenciaApelacion: null,
    advertenciaAdmin: null,
  });
  (getMe as any).mockResolvedValue({ idUsuario: 3, nombre: 'Beatriz', apellido: 'Solano', roles: [], habilidades: [], perfil: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Preparación de salida — bloqueos del ciclo S7 (VIEW-10 / F020)', () => {
  it('Sprint EN_FINALIZACION bloquea con mensaje accionable aunque el backend permita continuar por responsabilidades', async () => {
    (getProjectSprints as any).mockResolvedValue([{ idSprint: 2, numero: 2, estado: 'EN_FINALIZACION' }]);
    mockHooks();
    renderWorkspace();

    expect(await screen.findByText('El Sprint se está cerrando; podrás solicitar la salida cuando termine')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar solicitud de salida' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Por qué no puedo continuar todavía' })).toBeInTheDocument();
  });

  it('proyecto EN_SOLICITUD_CIERRE bloquea y explica que un administrador debe resolver el cierre', async () => {
    mockHooks({ proyecto: proyecto({ estadoProyecto: 'EN_SOLICITUD_CIERRE' }) });
    renderWorkspace();

    expect(await screen.findByText('El proyecto está en revisión de cierre')).toBeInTheDocument();
    expect(screen.getByText(/hasta que un administrador resuelva el cierre/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar solicitud de salida' })).toBeDisabled());
  });

  it('proyecto CERRADO muestra ReadOnlyProjectBanner y no ofrece ninguna salida', async () => {
    mockHooks({ proyecto: proyecto({ estadoProyecto: 'CERRADO' }) });
    renderWorkspace();

    expect(await screen.findByRole('status', { name: 'Proyecto cerrado: vista histórica de solo lectura' })).toBeInTheDocument();
    expect(screen.getByText(/La salida de rol ya no aplica/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continuar solicitud de salida' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar tramo' })).not.toBeInTheDocument();
    expect(getProjectSprints).not.toHaveBeenCalled();
    expect(getLeadershipContext).not.toHaveBeenCalled();
  });

  it('el líder actual es dirigido a la apelación de liderazgo, no a una salida que fallaría', async () => {
    (getMe as any).mockResolvedValue({ idUsuario: 1, nombre: 'Ana', apellido: 'Lopez', roles: [], habilidades: [], perfil: null });
    mockHooks();
    renderWorkspace();

    expect(await screen.findByText('Debes resolver el liderazgo antes de salir')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Apelar el liderazgo/ })).toHaveAttribute('href', '/dashboard/proyectos/7/miembros');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar solicitud de salida' })).toBeDisabled());
  });

  it('un miembro sin bloqueos conserva el flujo actual intacto (Continuar habilitado, sin avisos S7)', async () => {
    mockHooks();
    renderWorkspace();

    await waitFor(() => expect(getLeadershipContext).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar solicitud de salida' })).toBeEnabled());
    expect(screen.queryByRole('list', { name: 'Bloqueos para la salida' })).not.toBeInTheDocument();
  });

  it('responsabilidades sin horas producen la orientación «horas sin consolidar» sin sustituir el gate de B6', async () => {
    mockHooks({ summary: summary({ blockers: [blocker({ tieneHoras: false, tieneAvance: false, estadoPreparacion: 'PENDIENTE' })], puedeContinuar: false }) });
    renderWorkspace();

    expect(await screen.findByText('Tienes horas sin consolidar en el Sprint actual')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar solicitud de salida' })).toBeDisabled();
  });

  it('deriveExitS7Blockers es puro y prioriza los bloqueos duros', () => {
    const blockers = deriveExitS7Blockers({
      idProyecto: 7,
      estadoProyecto: 'EN_PROGRESO',
      sprintOperableEstado: 'ACTIVO',
      esLider: false,
      horasSinConsolidar: false,
    });
    expect(blockers).toEqual([]);
    const todos = deriveExitS7Blockers({ idProyecto: 7, estadoProyecto: 'EN_SOLICITUD_CIERRE', sprintOperableEstado: 'EN_FINALIZACION', esLider: true, horasSinConsolidar: true });
    expect(todos.map((b) => b.code)).toEqual(['PROYECTO_EN_SOLICITUD_CIERRE', 'SPRINT_EN_FINALIZACION', 'ES_LIDER', 'HORAS_SIN_CONSOLIDAR']);
    expect(todos.filter((b) => b.bloqueante)).toHaveLength(3);
  });
});
