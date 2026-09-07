import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock('next/navigation', () => ({ useParams: () => ({ id: '42' }) }));
vi.mock('../hooks/use-project-team', () => ({ useProjectTeam: vi.fn() }));
vi.mock('../hooks/use-project-pending-postulations', () => ({
  useProjectPendingPostulations: () => ({ postulaciones: [], isLoading: false, isError: false }),
  useResolvePostulacion: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../hooks/use-exit-request', () => ({
  useProjectPendingExitRequests: () => ({ requests: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useApproveExitRequest: () => ({ mutate: vi.fn(), isPending: false }),
  useRejectExitRequest: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../lib/services/leadership', () => ({
  getLeadershipContext: vi.fn(),
  getLeadershipHistory: vi.fn(),
  getLeadershipAppeals: vi.fn(),
  getLeadershipCandidates: vi.fn(),
  createLeadershipAppeal: vi.fn(),
  cancelLeadershipAppeal: vi.fn(),
}));

import LiderazgoProyectoPage from '../app/dashboard/proyectos/[id]/liderazgo/page';
import { LeadershipCard, origenLabel } from '../components/leadership/leadership-card';
import { useProjectTeam } from '../hooks/use-project-team';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useCurrentUser } from '../hooks/use-current-user';
import { getLeadershipAppeals, getLeadershipContext, getLeadershipHistory } from '../lib/services/leadership';
import type { ApelacionItemDto, LeadershipContextDto, LeadershipHistoryItemDto } from '../lib/types/leadership';

function contexto(overrides: Partial<LeadershipContextDto> = {}): LeadershipContextDto {
  return {
    projectId: 42,
    estadoProyecto: 'EN_PROGRESO',
    liderActual: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' },
    tieneParticipacionActiva: true,
    participacionesActivas: [{ idParticipacion: 9, idRolProyecto: 2, nombreRol: 'Líder técnico' }],
    conservaMembresiaSiSeTransfiere: true,
    advertenciaApelacion: 'Aviso del servidor sobre la apelación.',
    advertenciaAdmin: 'Aviso del servidor para el administrador.',
    ...overrides,
  };
}

function historialItem(overrides: Partial<LeadershipHistoryItemDto> = {}): LeadershipHistoryItemDto {
  return {
    idHistorialLiderazgo: 3,
    idProyecto: 42,
    liderAnterior: { idUsuario: 5, nombre: 'Ana', apellido: 'García' },
    liderNuevo: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' },
    admin: { idUsuario: 99, nombre: 'Admin', apellido: 'UVG' },
    motivo: 'Reasignación administrativa',
    origen: 'CAMBIO_ADMINISTRATIVO',
    registradoEn: '2026-06-12T18:00:00.000Z',
    idApelacion: null,
    candidatoSugerido: null,
    ...overrides,
  };
}

function apelacion(overrides: Partial<ApelacionItemDto> = {}): ApelacionItemDto {
  return {
    idApelacion: 7,
    idProyecto: 42,
    asunto: 'Cambio de liderazgo por carga académica',
    mensaje: 'Mensaje largo',
    estadoApelacion: 'PENDIENTE',
    creadaEn: '2026-08-01T12:00:00.000Z',
    resueltaEn: null,
    mensajeResolucion: null,
    liderSolicitante: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' },
    candidatoPropuesto: { idUsuario: 8, nombre: 'Ana', apellido: 'García' },
    adminResolutor: null,
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

beforeEach(() => {
  (useProjectDetail as any).mockReturnValue({ data: { idProyecto: 42, creador: { idUsuario: 1 } }, isLoading: false });
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 }, isLoading: false });
  (useProjectTeam as any).mockReturnValue({ lider: null, miembros: [], isLoading: false, isError: false, refetch: vi.fn() });
  (getLeadershipContext as any).mockResolvedValue(contexto());
  (getLeadershipHistory as any).mockResolvedValue({ items: [historialItem()], total: 1, page: 1, limit: 20 });
  (getLeadershipAppeals as any).mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LeadershipCard (componente)', () => {
  it('miembro (sin slot de acción) → líder actual e historial, sin ningún botón', () => {
    render(createElement(LeadershipCard, { context: contexto(), history: [historialItem()] }));

    expect(screen.getByText('Valeria Ortiz')).toBeInTheDocument();
    expect(screen.getByText(/Líder desde/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cambiar liderazgo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /apelar/i })).not.toBeInTheDocument();
  });

  it('el historial plegable muestra origen y motivo del backend', () => {
    render(createElement(LeadershipCard, { context: contexto(), history: [historialItem()] }));

    fireEvent.click(screen.getByRole('button', { name: /historial de liderazgo/i }));
    expect(screen.getByText('Reasignación administrativa')).toBeInTheDocument();
    expect(screen.getByText('Cambio administrativo')).toBeInTheDocument();
    expect(screen.getByText('Ana García')).toBeInTheDocument();
    expect(origenLabel('SOLICITUD_LIDER')).toBe('Apelación del líder');
  });

  it('con error (403) no rompe: no renderiza nada', () => {
    const { container } = render(createElement(LeadershipCard, { context: undefined, history: [], isError: true }));
    expect(container).toBeEmptyDOMElement();
  });
});

describe('VIEW-06 — vista de Liderazgo del proyecto (F008)', () => {
  it('el líder ve «Apelar cambio de liderazgo» y NUNCA «Cambiar liderazgo»', async () => {
    const { wrapper } = createWrapper();
    render(createElement(LiderazgoProyectoPage), { wrapper });

    const boton = await screen.findByRole('button', { name: 'Apelar cambio de liderazgo' });
    expect(boton).toBeInTheDocument();
    expect(screen.queryByText(/cambiar liderazgo/i)).not.toBeInTheDocument();
    expect(getLeadershipContext).toHaveBeenCalledWith(42);
    expect(getLeadershipAppeals).toHaveBeenCalledWith(42, expect.objectContaining({ estado: 'PENDIENTE' }));
  });

  it('con una apelación PENDIENTE el botón queda deshabilitado con tooltip y la card muestra la apelación', async () => {
    (getLeadershipAppeals as any).mockResolvedValue({ items: [apelacion()], total: 1, page: 1, limit: 20 });
    const { wrapper } = createWrapper();
    render(createElement(LiderazgoProyectoPage), { wrapper });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Apelar cambio de liderazgo' })).toBeDisabled());
    expect(screen.getByLabelText('Ya existe una apelación pendiente para este proyecto.')).toHaveAttribute('tabindex', '0');
    expect(screen.getByText('Cambio de liderazgo por carga académica')).toBeInTheDocument();
    expect(screen.getByText('Ana García')).toBeInTheDocument();
  });

  it('con el proyecto fuera de PUBLICADO/EN_PROGRESO el botón queda deshabilitado', async () => {
    (getLeadershipContext as any).mockResolvedValue(contexto({ estadoProyecto: 'EN_SOLICITUD_CIERRE' }));
    const { wrapper } = createWrapper();
    render(createElement(LiderazgoProyectoPage), { wrapper });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Apelar cambio de liderazgo' })).toBeDisabled());
  });

  it('si el contexto responde 403, la card se oculta sin romper la página', async () => {
    (getLeadershipContext as any).mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }));
    const { wrapper } = createWrapper();
    render(createElement(LiderazgoProyectoPage), { wrapper });

    // La página se sostiene aunque el contexto no se pueda leer…
    expect(await screen.findByRole('heading', { level: 1, name: 'Liderazgo' })).toBeInTheDocument();
    await waitFor(() => expect(getLeadershipContext).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    // …y la card, que es lo que depende del contexto, simplemente no aparece.
    expect(screen.queryByText('Líder actual del proyecto')).not.toBeInTheDocument();
    expect(screen.queryByText('Historial de liderazgo')).not.toBeInTheDocument();
  });
});
