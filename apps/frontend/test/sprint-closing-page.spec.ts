import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SprintClosingSummaryDto } from '../lib/types/sprints';

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

vi.mock('../hooks/use-project-sprints', () => ({
  useSprintClosingSummary: vi.fn(),
  useProjectSprints: vi.fn(),
  useCloseSprint: vi.fn(),
}));
vi.mock('../hooks/use-hour-adjustments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/use-hour-adjustments')>();
  return { ...actual, useHourAdjustments: vi.fn() };
});
vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));

vi.mock('@/lib/swal', () => ({
  default: { fire: vi.fn() },
}));

import SprintClosingPage from '../app/dashboard/proyectos/[id]/sprints/[sprintId]/finalizar/page';
import { useCloseSprint, useProjectSprints, useSprintClosingSummary } from '../hooks/use-project-sprints';
import { useHourAdjustments } from '../hooks/use-hour-adjustments';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useCurrentUser } from '../hooks/use-current-user';
import uvgSwal from '@/lib/swal';

// GET .../resumen-cierre es exclusivo del líder en backend
// (assertCanViewClosingSummary). Todos los tests asumen el punto de vista
// del líder salvo que digan lo contrario explícitamente.
beforeEach(() => {
  (useProjectDetail as any).mockReturnValue({
    data: { idProyecto: 42, tituloProyecto: 'Portal', creador: { idUsuario: 1 } },
    isLoading: false,
  });
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 }, isLoading: false });
  (useProjectSprints as any).mockReturnValue({
    sprints: [{ idSprint: 1, idProyecto: 42, numero: 4, estado: 'EN_FINALIZACION' }],
    isLoading: false,
  });
  (useHourAdjustments as any).mockReturnValue({
    upsert: mutationStub(),
    revert: mutationStub(),
    history: mutationStub(),
  });
});

function participante(overrides: Partial<any> = {}) {
  return {
    idUsuario: 1,
    nombre: 'Andrea',
    apellido: 'Pérez',
    correo: 'andrea@uvg.edu.gt',
    fotoUrl: null,
    roles: [{ idRolProyecto: 1, nombreRol: 'Backend Developer' }],
    tareasRealizadas: 5,
    horasReportadas: 11,
    horasCalculadas: 10,
    horasAprobadas: 10,
    participaciones: [
      {
        idParticipacion: 51,
        idRolProyecto: 1,
        nombreRol: 'Backend Developer',
        horasReportadas: 11,
        horasCalculadas: 10,
        horasAprobadas: 10,
        justificacionAjuste: null,
      },
    ],
    totales: {
      tareasDistintas: 5,
      estimacionAsociada: 10,
      reportadas: '11.00',
      legacy: '0.00',
      exceso: '1.00',
      propuestas: '11.00',
      filasPendientes: 1,
      filasConsumidas: 0,
      tramos: [
        {
          idAsignacion: 300,
          idTarea: 12,
          tituloTarea: 'Integración',
          tareaEliminada: false,
          idParticipacion: 51,
          abierto: false,
          origen: 'GRANULAR',
          reportadas: '11.00',
          ajuste: null,
          justificacionAjuste: null,
          propuestas: '11.00',
          reconocidoEn: null,
        },
      ],
    },
    ...overrides,
  };
}

function summary(overrides: Partial<SprintClosingSummaryDto> = {}): SprintClosingSummaryDto {
  return {
    idProyecto: 42,
    idSprint: 1,
    estadoSprint: 'EN_FINALIZACION',
    blockers: [],
    participantes: [participante()],
    ...overrides,
  } as SprintClosingSummaryDto;
}

function mutationStub(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
    ...overrides,
  };
}

function mockSummary(overrides: Record<string, unknown> = {}) {
  (useSprintClosingSummary as any).mockReturnValue({
    summary: summary(),
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

function mockClose(overrides: Record<string, unknown> = {}) {
  (useCloseSprint as any).mockReturnValue(mutationStub(overrides));
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(createElement(SprintClosingPage), { wrapper });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SprintClosingPage — encabezado', () => {
  it('muestra «Cerrar Sprint N», el badge de estado y la descripción; nunca el banner global de F6', () => {
    mockSummary();
    mockClose();

    renderPage();

    expect(screen.getByRole('heading', { name: 'Cerrar Sprint 4' })).toBeInTheDocument();
    expect(screen.getByText('En finalización')).toBeInTheDocument();
    expect(
      screen.getByText('Revisión final de horas y contribuciones antes de confirmar el cierre.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/temporalmente bloqueado/i)).not.toBeInTheDocument();
  });

  it('route params: pasa idProyecto e idSprint numéricos al hook del summary', () => {
    mockSummary();
    mockClose();

    renderPage();

    expect(useSprintClosingSummary).toHaveBeenCalledWith(42, 1);
    expect(useHourAdjustments).toHaveBeenCalledWith(42, 1);
  });
});

describe('SprintClosingPage — render dinámico', () => {
  it('renderiza cada integrante con sus roles y sus totales reportadas/propuestas', () => {
    mockSummary();
    mockClose();

    renderPage();

    expect(screen.getByText('Andrea Pérez')).toBeInTheDocument();
    expect(screen.getByText('Backend Developer')).toBeInTheDocument();
    expect(screen.getAllByText('11 h').length).toBeGreaterThanOrEqual(2);
  });

  it('al expandir un integrante se ve rol → tarea → tramo con «Horas propuestas» editable', async () => {
    mockSummary();
    mockClose();

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Desglose de Andrea Pérez/ }));

    expect(await screen.findByText('Tarea: Integración')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Horas propuestas' })).toHaveValue(11);
    expect(screen.getByRole('button', { name: /Guardar ajuste/ })).toBeInTheDocument();
  });

  it('ningún tramo ofrece un total editable por participación (E063 retirado)', () => {
    mockSummary();
    mockClose();

    renderPage();

    expect(screen.queryByLabelText(/horas aprobadas/i)).not.toBeInTheDocument();
  });
});

describe('SprintClosingPage — cierre', () => {
  it('sin blockers: confirmar ejecuta el cierre una sola vez con el idSprint correcto y navega al proyecto', async () => {
    const mutateAsyncClose = vi.fn().mockResolvedValue({});
    mockSummary();
    mockClose({ mutateAsync: mutateAsyncClose });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /confirmar cierre del sprint/i }));

    await waitFor(() => expect(mutateAsyncClose).toHaveBeenCalledTimes(1));
    expect(mutateAsyncClose).toHaveBeenCalledWith(1);
    expect(push).toHaveBeenCalledWith('/dashboard/projects/42');
    expect(uvgSwal.fire).toHaveBeenCalled();
  });

  it('el cierre falla: el error queda visible, no se navega y la pantalla permanece disponible', async () => {
    const mutateAsyncClose = vi.fn().mockRejectedValue(new Error('No se pudo cerrar'));
    mockSummary();
    mockClose({ mutateAsync: mutateAsyncClose });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /confirmar cierre del sprint/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cerrar'));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /confirmar cierre del sprint/i })).toBeInTheDocument();
  });

  it('con blockers, el cierre queda deshabilitado y los mensajes del backend se muestran', () => {
    mockSummary({
      summary: summary({
        blockers: [{ code: 'TRAMOS_ABIERTOS', message: 'Hay tramos sin consolidar', ids: [300], cantidad: 1 }],
      }),
    });
    mockClose();

    renderPage();

    expect(screen.getByRole('button', { name: /confirmar cierre del sprint/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Hay tramos sin consolidar');
  });
});

describe('SprintClosingPage — loading', () => {
  it('mientras carga el summary: skeleton visible, sin botón de cierre', () => {
    mockSummary({ summary: undefined, isLoading: true });
    mockClose();

    const { container } = renderPage();

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /confirmar cierre del sprint/i })).not.toBeInTheDocument();
  });
});

describe('SprintClosingPage — error', () => {
  it('summary fallido: role=alert, "Reintentar" llama a refetch, sin acción de cierre', () => {
    const refetch = vi.fn();
    mockSummary({ summary: undefined, isError: true, error: new Error('No eres el líder de este proyecto'), refetch });
    mockClose();

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('No eres el líder de este proyecto');
    expect(screen.queryByRole('button', { name: /confirmar cierre del sprint/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('SprintClosingPage — sin contribuciones', () => {
  it('summary vacío: muestra Empty y conserva la acción de cierre (A9 no exige contribuciones)', async () => {
    const mutateAsyncClose = vi.fn().mockResolvedValue({});
    mockSummary({ summary: summary({ participantes: [] }) });
    mockClose({ mutateAsync: mutateAsyncClose });

    renderPage();

    expect(screen.getByText('Este Sprint no tiene contribuciones registradas.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirmar cierre del sprint/i }));

    await waitFor(() => expect(mutateAsyncClose).toHaveBeenCalledWith(1));
    expect(push).toHaveBeenCalledWith('/dashboard/projects/42');
  });
});

describe('SprintClosingPage — autorización', () => {
  it('un no-líder ve el aviso "¡No eres líder!" en vez del resumen de cierre', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999 }, isLoading: false });
    mockSummary();
    mockClose();

    renderPage();

    expect(screen.getByText('¡No eres líder!')).toBeInTheDocument();
    expect(screen.getByText('No puedes acceder al cierre de este Sprint.')).toBeInTheDocument();
    expect(screen.queryByText('Cerrar Sprint 4')).not.toBeInTheDocument();
  });

  it('un no-líder ve "Volver al proyecto" apuntando a /dashboard/proyectos, no a /dashboard/projects', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999 }, isLoading: false });
    mockSummary();
    mockClose();

    renderPage();

    expect(screen.getByRole('link', { name: /volver al proyecto/i })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/42',
    );
  });
});
