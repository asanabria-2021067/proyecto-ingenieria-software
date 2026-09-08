import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../hooks/use-is-project-leader', () => ({ useIsProjectLeader: vi.fn() }));
const swalFire = vi.hoisted(() => vi.fn());
vi.mock('../lib/swal', () => ({ default: { fire: swalFire }, swalCustomClass: {} }));
vi.mock('../lib/services/closure', () => ({
  prepareClosure: vi.fn(),
  getCloseReadiness: vi.fn(),
  generateAutoReport: vi.fn(),
  reserveClosureDocument: vi.fn(),
  uploadClosureDocument: vi.fn(),
  detachClosureDocument: vi.fn(),
  requestClose: vi.fn(),
  resubmitClosure: vi.fn(),
  getClosureRevisions: vi.fn(),
  getClosureRevision: vi.fn(),
  getClosureDocumentReadGrant: vi.fn(),
  fetchClosureDocumentBytes: vi.fn(),
}));

function createMockSocket() {
  const handlers = new Map<string, Set<(...args: any[]) => void>>();
  return {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
    }),
    off: vi.fn(),
    close: vi.fn(),
    __emit: (event: string, payload?: unknown) => {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
  };
}
const mockIo = vi.fn();
vi.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));

import ClosurePreparationClient, { resolveClosurePhase } from '../app/dashboard/projects/[id]/cierre/closure-preparation-client';
import { groupClosureBlockers, countPassedChecks, TOTAL_CLOSURE_CHECKS } from '../components/closure/closure-readiness-panel';
import { useRealtimeNotifications } from '../lib/hooks/useRealtimeNotifications';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useCurrentUser } from '../hooks/use-current-user';
import { useIsProjectLeader } from '../hooks/use-is-project-leader';
import {
  getCloseReadiness,
  getClosureRevision,
  getClosureRevisions,
  prepareClosure,
  requestClose,
  resubmitClosure,
} from '../lib/services/closure';
import { closeReadinessQueryKey, closureDraftQueryKey, closureRevisionsPrefix } from '../lib/query-keys/closure';
import { projectDetailQueryKey } from '../lib/query-keys/project';
import { CLOSURE_BLOCKER_CODES, type CloseReadinessSummary } from '../lib/types/closure';

const FINGERPRINT = 'a'.repeat(64);

function readiness(overrides: Partial<CloseReadinessSummary> = {}): CloseReadinessSummary {
  return {
    projectId: 7,
    revisionId: 5,
    phase: 'REQUEST',
    canSubmit: true,
    blockers: [],
    warnings: [{ code: 'POSTULACIONES_PENDIENTES', message: 'Hay 2 postulaciones pendientes que se rechazarán.', ids: [1, 2], cantidad: 2 }],
    executionFingerprint: FINGERPRINT,
    ...overrides,
  };
}

function mockProyecto(estadoProyecto = 'EN_PROGRESO') {
  (useProjectDetail as any).mockReturnValue({
    data: { idProyecto: 7, tituloProyecto: 'Sistema de Tutorías', tipoProyecto: 'EXTENSION', estadoProyecto, creador: { idUsuario: 1 } },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 }, isLoading: false });
  (useIsProjectLeader as any).mockReturnValue(true);
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

function renderPage() {
  const { wrapper, queryClient } = createWrapper();
  const utils = render(createElement(ClosurePreparationClient, { id: 7 }), { wrapper });
  return { ...utils, queryClient };
}

beforeEach(() => {
  mockProyecto();
  (prepareClosure as any).mockResolvedValue({ idRevisionCierre: 5, numeroRevision: 1, estadoRevision: 'BORRADOR' });
  (getCloseReadiness as any).mockResolvedValue(readiness());
  (getClosureRevision as any).mockResolvedValue({
    idRevisionCierre: 5,
    idProyecto: 7,
    numeroRevision: 1,
    estadoRevision: 'BORRADOR',
    documentosEnviados: [],
    informeOficial: null,
    puedeEditar: true,
    puedeEnviar: true,
    puedeResolver: false,
    comentarioRevisor: null,
  });
  (getClosureRevisions as any).mockResolvedValue({ page: 1, limit: 5, total: 1, items: [] });
  swalFire.mockResolvedValue({ isConfirmed: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('groupClosureBlockers — 16 códigos en 6 grupos', () => {
  it('cada uno de los 16 códigos pertenece a exactamente un grupo y el total es 16', () => {
    const todos = CLOSURE_BLOCKER_CODES.map((code) => ({ code, message: `msg ${code}`, ids: [], cantidad: 1 }));
    const grupos = groupClosureBlockers(todos);
    expect(grupos).toHaveLength(6);
    expect(grupos.map((g) => g.definition.key)).toEqual(['SPRINTS', 'HORAS', 'TAREAS', 'EQUIPO', 'DOCUMENTOS', 'ESTADO']);
    expect(grupos.reduce((acc, g) => acc + g.total, 0)).toBe(TOTAL_CLOSURE_CHECKS);
    expect(TOTAL_CLOSURE_CHECKS).toBe(16);
    expect(grupos.every((g) => !g.ok && g.superadas === 0)).toBe(true);
    expect(countPassedChecks(todos)).toBe(0);
    expect(countPassedChecks([])).toBe(16);
  });

  it('resolveClosurePhase: EN_SOLICITUD_CIERRE → RESUBMIT, el resto → REQUEST', () => {
    expect(resolveClosurePhase('EN_SOLICITUD_CIERRE')).toBe('RESUBMIT');
    expect(resolveClosurePhase('EN_PROGRESO')).toBe('REQUEST');
  });
});

describe('ClosurePreparationClient (VIEW-13 / F005)', () => {
  it('canSubmit:false deshabilita el envío y explica cuántas comprobaciones faltan; muestra el message del backend', async () => {
    (getCloseReadiness as any).mockResolvedValue(
      readiness({
        canSubmit: false,
        blockers: [
          { code: 'SPRINTS_NO_CERRADOS', message: 'Hay 1 sprint sin cerrar.', ids: [9], cantidad: 1 },
          { code: 'INFORME_INVALIDO', message: 'Falta el informe automático.', ids: [], cantidad: 1 },
        ],
        executionFingerprint: null,
      }),
    );
    renderPage();

    expect(await screen.findByText(/Faltan 2 comprobaciones/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enviar solicitud de cierre/i })).toBeDisabled();
    expect(screen.getByText('14 de 16')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sprints: 1 de 2/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Documentos: 3 de 4/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Sprints: 1 de 2/ }));
    expect(await screen.findByText('Hay 1 sprint sin cerrar.')).toBeInTheDocument();
    expect(requestClose).not.toHaveBeenCalled();
  });

  it('el envío manda confirmado:true (literal) y el expectedFingerprint visto, a /solicitar-cierre en fase REQUEST', async () => {
    (requestClose as any).mockResolvedValue({ projectId: 7, estadoProyecto: 'EN_SOLICITUD_CIERRE', revisionId: 5, numeroRevision: 1, fingerprintEntrega: 'b'.repeat(64), informeOficialId: null, cantidades: {} });
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /enviar solicitud de cierre/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /enviar solicitud de cierre/i }));

    await waitFor(() => expect(requestClose).toHaveBeenCalledTimes(1));
    const [pid, input] = (requestClose as any).mock.calls[0];
    expect(pid).toBe(7);
    expect(input).toEqual({ revisionId: 5, confirmado: true, expectedFingerprint: FINGERPRINT });
    expect(input.confirmado === true).toBe(true);
    expect(resubmitClosure).not.toHaveBeenCalled();
    expect(swalFire.mock.calls[0][0].text).toContain('2 postulaciones pendientes');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/projects/7'));
  });

  it('409 de fingerprint muestra «Actualizar» y NO reenvía por sí solo', async () => {
    (requestClose as any).mockRejectedValue(Object.assign(new Error('La huella del informe quedó obsoleta'), { statusCode: 409 }));
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /enviar solicitud de cierre/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /enviar solicitud de cierre/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('quedó obsoleta'));
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 30));
    expect(requestClose).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('fase RESUBMIT (EN_SOLICITUD_CIERRE) toma el borrador de las revisiones y llama a /cierre/reenviar', async () => {
    mockProyecto('EN_SOLICITUD_CIERRE');
    (getClosureRevisions as any).mockResolvedValue({
      page: 1,
      limit: 5,
      total: 2,
      items: [
        { idRevisionCierre: 6, numeroRevision: 2, estadoRevision: 'BORRADOR', documentosEnviados: [], informeOficial: null, puedeEditar: true, puedeEnviar: true, puedeResolver: false, comentarioRevisor: 'Falta una evidencia' },
        { idRevisionCierre: 5, numeroRevision: 1, estadoRevision: 'CORRECCION_DOCUMENTAL', documentosEnviados: [], informeOficial: null, puedeEditar: false, puedeEnviar: false, puedeResolver: false, comentarioRevisor: 'Falta una evidencia' },
      ],
    });
    (getCloseReadiness as any).mockResolvedValue(readiness({ phase: 'RESUBMIT', revisionId: 6, warnings: [] }));
    (resubmitClosure as any).mockResolvedValue({ projectId: 7, estadoProyecto: 'EN_SOLICITUD_CIERRE', revisionId: 6, numeroRevision: 2, fingerprintEntrega: null, informeOficialId: null, cantidades: {} });
    renderPage();

    await screen.findByRole('button', { name: /reenviar entrega corregida/i });
    await waitFor(() => expect(getCloseReadiness).toHaveBeenCalledWith(7, 'RESUBMIT'));
    expect(prepareClosure).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Regenerar informe|Generar informe/ })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /reenviar entrega corregida/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /reenviar entrega corregida/i }));

    await waitFor(() => expect(resubmitClosure).toHaveBeenCalledWith(7, { revisionId: 6, confirmado: true, expectedFingerprint: FINGERPRINT }));
    expect(requestClose).not.toHaveBeenCalled();
  });

  it('un no líder ve el aviso de líder y no se prepara ningún borrador', async () => {
    (useIsProjectLeader as any).mockReturnValue(false);
    renderPage();
    expect(await screen.findByText('¡No eres líder!')).toBeInTheDocument();
    expect(prepareClosure).not.toHaveBeenCalled();
  });
});

describe('useRealtimeNotifications — eventos de cierre (F005)', () => {
  it('CLOSURE_REVIEW_UPDATED invalida borrador, readiness (prefijo) y revisiones', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useRealtimeNotifications(true), { wrapper });

    socket.__emit('CLOSURE_REVIEW_UPDATED', { projectId: 7, revisionId: 5 });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: closureDraftQueryKey(7) }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['close-readiness', 7] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: closureRevisionsPrefix(7) });
    // el prefijo alcanza cualquier fase
    expect(closeReadinessQueryKey(7, 'REQUEST').slice(0, 2)).toEqual(['close-readiness', 7]);
  });

  it('PROJECT_STATE_CHANGED invalida el detalle del proyecto y el readiness sin derivar estado', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useRealtimeNotifications(true), { wrapper });

    socket.__emit('PROJECT_STATE_CHANGED', { projectId: 7, estadoProyecto: 'CERRADO' });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectDetailQueryKey(7) }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['close-readiness', 7] });
    expect(queryClient.getQueryData(projectDetailQueryKey(7))).toBeUndefined();
  });
});
