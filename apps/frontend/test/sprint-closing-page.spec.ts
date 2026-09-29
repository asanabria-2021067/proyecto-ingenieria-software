import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  useSprintDetail: vi.fn(),
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
import { useCloseSprint, useProjectSprints, useSprintClosingSummary, useSprintDetail } from '../hooks/use-project-sprints';
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
  (useSprintDetail as any).mockReturnValue({ detail: undefined, isLoading: false });
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
          estimacionTarea: null,
          exceso: '0.00',
          justificacionExceso: null,
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

  it('al expandir un integrante se ve rol → tarea → tramo, en lectura y con «Ajustar»', async () => {
    mockSummary();
    mockClose();

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Desglose de Andrea Pérez/ }));

    expect(await screen.findByText('Tarea: Integración')).toBeInTheDocument();
    // El registro del estudiante se lee; el líder ajusta aparte y bajo petición.
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Ajustar/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Ajustar/ }));
    expect(screen.getByRole('spinbutton', { name: 'Horas aceptadas' })).toHaveValue(11);
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
    expect(mutateAsyncClose).toHaveBeenCalledWith({ idSprint: 1, destino: undefined });
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

    await waitFor(() => expect(mutateAsyncClose).toHaveBeenCalledWith({ idSprint: 1, destino: undefined }));
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

// Misma identidad que Miembros, Postulaciones y Solicitudes de salida: título
// sobre el fondo, KPIs en línea, aviso de atención naranja, una sola
// superficie para la revisión por integrante y acciones al final de la página.
describe('SprintClosingPage — alineada con el workspace del proyecto', () => {
  it('el título y la descripción van en ProjectPageHeader, fuera de tarjetas, con una sola vuelta a Sprints', () => {
    mockSummary();
    mockClose();

    renderPage();

    const encabezado = screen.getByRole('banner');
    expect(encabezado).toHaveAttribute('data-slot', 'project-page-header');
    const titulo = within(encabezado).getByRole('heading', { level: 1, name: 'Cerrar Sprint 4' });
    expect(titulo.closest('.card-base, .rounded-xl')).toBeNull();
    expect(within(encabezado).getByText('En finalización')).toHaveClass('rounded-full', 'bg-status-warning');
    expect(screen.getByRole('link', { name: 'Volver a Sprints' })).toHaveAttribute('href', '/dashboard/proyectos/42/sprints');
    expect(screen.queryByRole('link', { name: /volver al proyecto/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="project-page-shell"]')).not.toBeNull();
  });

  it('los cuatro KPIs son los de Miembros: tarjeta blanca, icono sin caja y cifra grande', () => {
    mockSummary();
    mockClose();

    renderPage();

    const kpis = document.querySelector('[data-slot="closing-kpis"]')!;
    expect(kpis).toHaveClass('grid-cols-2', '@3xl/project:grid-cols-4');
    for (const nombre of ['Tareas distintas', 'Horas reportadas', 'Exceso sobre estimación', 'Horas propuestas']) {
      const kpi = screen.getByRole('group', { name: nombre });
      expect(kpi).toHaveClass('card-base');
      expect(kpi.querySelector('.bg-primary\\/10, .rounded-xl')).toBeNull();
      expect(kpi.querySelector('svg')).toHaveClass('text-text-primary');
    }
    expect(within(screen.getByRole('group', { name: 'Horas reportadas' })).getByText('11 h')).toHaveClass('text-3xl');
  });

  it('el exceso se pinta en naranja solo cuando hay exceso', () => {
    mockSummary();
    mockClose();
    renderPage();
    expect(within(screen.getByRole('group', { name: 'Exceso sobre estimación' })).getByText('1 h')).toHaveClass(
      'text-attention-strong',
    );
    cleanup();

    mockSummary({
      summary: summary({
        participantes: [participante({ totales: { ...participante().totales, exceso: '0.00' } })],
      }),
    });
    renderPage();
    expect(within(screen.getByRole('group', { name: 'Exceso sobre estimación' })).getByText('0 h')).toHaveClass(
      'text-text-primary',
    );
  });

  it('el aviso de bloqueos es de atención (naranja), no verde ni de error', () => {
    mockSummary({
      summary: summary({
        blockers: [{ code: 'TRAMOS_ABIERTOS', message: 'Hay tramos sin consolidar', ids: [300], cantidad: 5 }],
      }),
    });
    mockClose();

    renderPage();

    const aviso = screen.getByRole('alert');
    expect(aviso).toHaveAttribute('data-slot', 'alert');
    expect(aviso).toHaveClass('bg-attention/10', 'border-attention/35', 'text-attention-strong');
    expect(aviso).not.toHaveClass('bg-status-warning/10');
    expect(aviso).toHaveTextContent('El Sprint aún no puede cerrarse');
    expect(aviso).toHaveTextContent('Hay tramos sin consolidar (5)');
  });

  it('la revisión por integrante es una sola superficie con columnas alineadas y filas expandibles', () => {
    mockSummary({
      summary: summary({
        participantes: [
          participante(),
          participante({ idUsuario: 2, nombre: 'Luis', apellido: 'Gómez', roles: [{ idRolProyecto: 2, nombreRol: 'Logística' }] }),
        ],
      }),
    });
    mockClose();

    renderPage();

    expect(screen.getByRole('heading', { level: 2, name: 'Revisión por integrante' })).toBeInTheDocument();
    const superficie = document.querySelector('[data-slot="revision-integrantes"]')!;
    expect(superficie).toHaveClass('rounded-xl', 'border', 'bg-surface-container-lowest');
    const filas = within(superficie as HTMLElement).getAllByRole('button', { name: /Desglose de/ });
    expect(filas).toHaveLength(2);

    // El encabezado y cada fila comparten la misma rejilla de columnas.
    const encabezado = superficie.firstElementChild as HTMLElement;
    expect(encabezado).toHaveTextContent('IntegranteRolReportadasPropuestas');
    const rejilla = [...encabezado.classList].find((c) => c.startsWith('@3xl/project:grid-cols-'));
    expect(rejilla).toBeDefined();
    for (const fila of filas) {
      expect(fila.firstElementChild).toHaveClass(rejilla!);
      expect(fila).not.toHaveTextContent(/Total reportadas|Total propuestas/);
    }
    expect(screen.getByText('Logística')).toHaveClass('rounded-full', 'bg-secondary-container/30');

    fireEvent.click(filas[0]);
    expect(filas[0]).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Tarea: Integración')).toBeInTheDocument();
  });

  it('las acciones van al final de la página, no en una barra fija', () => {
    mockSummary();
    mockClose();

    renderPage();

    const acciones = document.querySelector('[data-slot="closing-actions"]')!;
    expect(acciones).not.toHaveClass('fixed');
    expect(acciones).toHaveClass('border-t');
    expect(within(acciones as HTMLElement).getByRole('link', { name: 'Cancelar' })).toHaveAttribute('href', '/dashboard/projects/42');
    expect(within(acciones as HTMLElement).getByRole('button', { name: /confirmar cierre del sprint/i })).toHaveClass('bg-primary');
  });

  it('deshabilitado, el botón de cierre se ve apagado y no como una acción disponible', () => {
    mockSummary({
      summary: summary({
        blockers: [{ code: 'TRAMOS_ABIERTOS', message: 'Hay tramos sin consolidar', ids: [300], cantidad: 1 }],
      }),
    });
    mockClose();

    renderPage();

    const boton = screen.getByRole('button', { name: /confirmar cierre del sprint/i });
    expect(boton).toBeDisabled();
    expect(boton).toHaveClass('disabled:bg-surface-container-high', 'disabled:text-text-secondary', 'disabled:opacity-100');
    expect(boton.parentElement).toHaveClass('cursor-not-allowed');
  });
});
