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
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42', sprintId: '1' }),
  useRouter: () => ({ push }),
}));
vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('@/lib/swal', () => ({ default: { fire: vi.fn() } }));

vi.mock('../lib/services/sprints', () => ({
  getProjectSprints: vi.fn(),
  getSprintClosingSummary: vi.fn(),
  closeSprint: vi.fn(),
  getSprintClosingMemberDetail: vi.fn(),
}));
vi.mock('../lib/services/hour-adjustments', () => ({
  getHourAdjustment: vi.fn(),
  upsertHourAdjustment: vi.fn(),
  deleteHourAdjustment: vi.fn(),
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

import SprintClosingPage from '../app/dashboard/proyectos/[id]/sprints/[sprintId]/finalizar/page';
import { useRealtimeNotifications } from '../lib/hooks/useRealtimeNotifications';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useCurrentUser } from '../hooks/use-current-user';
import { closeSprint, getProjectSprints, getSprintClosingSummary } from '../lib/services/sprints';
import { deleteHourAdjustment, upsertHourAdjustment } from '../lib/services/hour-adjustments';
import { projectSprintsQueryKey, sprintClosingSummaryQueryKey } from '../lib/query-keys/sprints';
import type { SprintClosingSummaryDto, SprintClosingTramoDto } from '../lib/types/sprints';

function tramo(overrides: Partial<SprintClosingTramoDto> = {}): SprintClosingTramoDto {
  return {
    idAsignacion: 300,
    idTarea: 12,
    tituloTarea: 'Coordinación de jornada',
    tareaEliminada: false,
    idParticipacion: 51,
    abierto: false,
    origen: 'GRANULAR',
    reportadas: '7.00',
    estimacionTarea: null,
    exceso: '0.00',
    justificacionExceso: null,
    ajuste: null,
    justificacionAjuste: null,
    propuestas: '7.00',
    reconocidoEn: null,
    ...overrides,
  };
}

function summary(overrides: Partial<SprintClosingSummaryDto> = {}): SprintClosingSummaryDto {
  return {
    idProyecto: 42,
    idSprint: 1,
    estadoSprint: 'EN_FINALIZACION',
    blockers: [],
    participantes: [
      {
        idUsuario: 9,
        nombre: 'Carlos',
        apellido: 'Pineda',
        correo: 'carlos@uvg.edu.gt',
        fotoUrl: null,
        roles: [{ idRolProyecto: 1, nombreRol: 'Logística de eventos' }],
        tareasRealizadas: 1,
        horasReportadas: 12,
        horasCalculadas: 12,
        horasAprobadas: 12,
        participaciones: [
          {
            idParticipacion: 51,
            idRolProyecto: 1,
            nombreRol: 'Logística de eventos',
            horasReportadas: 12,
            horasCalculadas: 12,
            horasAprobadas: 12,
            justificacionAjuste: null,
          },
        ],
        totales: {
          tareasDistintas: 1,
          estimacionAsociada: 10,
          reportadas: '12.00',
          legacy: '0.00',
          exceso: '2.00',
          propuestas: '12.00',
          filasPendientes: 2,
          filasConsumidas: 0,
          tramos: [tramo(), tramo({ idAsignacion: 301, reportadas: '5.00', propuestas: '5.00' })],
        },
      },
    ],
    ...overrides,
  };
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
  const utils = render(createElement(SprintClosingPage), { wrapper });
  return { ...utils, queryClient };
}

beforeEach(() => {
  (useProjectDetail as any).mockReturnValue({
    data: { idProyecto: 42, tituloProyecto: 'Portal', creador: { idUsuario: 1 } },
    isLoading: false,
  });
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 }, isLoading: false });
  (getProjectSprints as any).mockResolvedValue([
    { idSprint: 1, idProyecto: 42, numero: 4, estado: 'EN_FINALIZACION', fechaInicio: '2026-08-01', fechaFinalizacionIniciada: null, fechaCierre: null },
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SprintClosingPage — ajustes por asignación (F002)', () => {
  it('el upsert envía deltaHoras con signo al endpoint por asignación e invalida sprintClosingSummaryQueryKey', async () => {
    (getSprintClosingSummary as any).mockResolvedValue(summary());
    (upsertHourAdjustment as any).mockResolvedValue({});
    const { queryClient } = renderPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.click(await screen.findByRole('button', { name: /Desglose de Carlos Pineda/ }));
    // El panel del líder solo aparece tras pedir «Ajustar».
    fireEvent.click((await screen.findAllByRole('button', { name: /^Ajustar/ }))[0]);
    fireEvent.change(screen.getAllByLabelText('Horas aceptadas')[0], { target: { value: '5' } });
    fireEvent.change(screen.getAllByLabelText(/Justificación del líder/)[0], { target: { value: 'Se descontaron 2 horas' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Guardar ajuste/ })[0]);

    await waitFor(() =>
      expect(upsertHourAdjustment).toHaveBeenCalledWith(42, 1, 300, {
        deltaHoras: '-2.00',
        justificacion: 'Se descontaron 2 horas',
      }),
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sprintClosingSummaryQueryKey(42, 1) }),
    );
  });

  it('«Revertir» llama al DELETE por asignación', async () => {
    (getSprintClosingSummary as any).mockResolvedValue(
      summary({
        participantes: [
          {
            ...summary().participantes[0],
            totales: {
              ...summary().participantes[0].totales!,
              tramos: [tramo({ ajuste: '-2.00', propuestas: '5.00', justificacionAjuste: 'previo' })],
            },
          },
        ],
      }),
    );
    (deleteHourAdjustment as any).mockResolvedValue(undefined);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Desglose de Carlos Pineda/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Revertir/ }));

    await waitFor(() => expect(deleteHourAdjustment).toHaveBeenCalledWith(42, 1, 300));
  });

  it('con blockers no vacíos, «Confirmar cierre» está deshabilitado con tooltip y no llama al cierre', async () => {
    (getSprintClosingSummary as any).mockResolvedValue(
      summary({
        blockers: [{ code: 'TRAMOS_ABIERTOS', message: 'Hay tramos con horas sin consolidar', ids: [300], cantidad: 1 }],
      }),
    );
    renderPage();

    const boton = await screen.findByRole('button', { name: /confirmar cierre del sprint/i });
    expect(boton).toBeDisabled();
    expect((boton.parentElement as HTMLElement).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('alert')).toHaveTextContent('Hay tramos con horas sin consolidar');
    fireEvent.click(boton);
    expect(closeSprint).not.toHaveBeenCalled();
  });

  it('sin blockers, confirmar cierra el Sprint e invalida project-sprints y el resumen', async () => {
    (getSprintClosingSummary as any).mockResolvedValue(summary());
    (closeSprint as any).mockResolvedValue({});
    const { queryClient } = renderPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.click(await screen.findByRole('button', { name: /confirmar cierre del sprint/i }));

    await waitFor(() => expect(closeSprint).toHaveBeenCalledWith(42, 1));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectSprintsQueryKey(42) }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sprintClosingSummaryQueryKey(42, 1) });
    expect(push).toHaveBeenCalledWith('/dashboard/projects/42');
  });

  it('un 409 al cerrar no pisa nada: refresca el resumen y explica el conflicto', async () => {
    (getSprintClosingSummary as any).mockResolvedValue(summary());
    (closeSprint as any).mockRejectedValue(Object.assign(new Error('El Sprint tiene tramos abiertos'), { statusCode: 409 }));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /confirmar cierre del sprint/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('El Sprint tiene tramos abiertos'));
    await waitFor(() => expect(getSprintClosingSummary).toHaveBeenCalledTimes(2));
    expect(push).not.toHaveBeenCalled();
  });

  it('Sprint CERRADO → solo lectura: sin inputs ni botón de cierre habilitado', async () => {
    (getSprintClosingSummary as any).mockResolvedValue(summary({ estadoSprint: 'CERRADO' }));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Desglose de Carlos Pineda/ }));
    await screen.findAllByText('Horas reportadas');
    // Ni siquiera se ofrece abrir el panel: el Sprint cerrado no admite ajustes.
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Ajustar/ })[0]).toBeDisabled();
    expect(screen.getByText('Cerrado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirmar cierre del sprint/i })).toBeDisabled();
  });

  it('muestra los KPI del resumen: tareas distintas, reportadas, exceso y propuestas', async () => {
    (getSprintClosingSummary as any).mockResolvedValue(summary());
    renderPage();

    const reportadas = await screen.findByRole('group', { name: 'Horas reportadas' });
    expect(reportadas).toHaveTextContent('12 h');
    expect(screen.getByRole('group', { name: 'Exceso sobre estimación' })).toHaveTextContent('2 h');
    expect(screen.getByRole('group', { name: 'Horas propuestas' })).toHaveTextContent('12 h');
    expect(screen.getByRole('group', { name: 'Tareas distintas' })).toHaveTextContent('1');
  });
});

describe('useRealtimeNotifications — SPRINT_HOURS_ADJUSTED (F002)', () => {
  it('invalida sprintClosingSummaryQueryKey con los ids del payload, sin derivar estado', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useRealtimeNotifications(true), { wrapper });

    socket.__emit('SPRINT_HOURS_ADJUSTED', { projectId: 42, sprintId: 1, idAsignacion: 300 });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sprintClosingSummaryQueryKey(42, 1) }),
    );
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(sprintClosingSummaryQueryKey(42, 1))).toBeUndefined();
  });

  it('un evento de otro proyecto/Sprint invalida solo esa key', async () => {
    const socket = createMockSocket();
    mockIo.mockReturnValue(socket);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useRealtimeNotifications(true), { wrapper });

    socket.__emit('SPRINT_HOURS_ADJUSTED', { projectId: 17, sprintId: 9, idAsignacion: 5 });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sprintClosingSummaryQueryKey(17, 9) }),
    );
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: sprintClosingSummaryQueryKey(42, 1) });
  });
});
