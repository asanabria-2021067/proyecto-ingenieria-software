import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SprintAnalyticsDto } from '../lib/types/sprints';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42', sprintId: '7' }),
}));

vi.mock('../hooks/use-project-sprints', () => ({ useSprintAnalytics: vi.fn() }));

import SprintAnalyticsPage from '../app/dashboard/proyectos/[id]/sprints/[sprintId]/analytics/page';
import { useSprintAnalytics } from '../hooks/use-project-sprints';

function analytics(overrides: Partial<SprintAnalyticsDto> = {}): SprintAnalyticsDto {
  return {
    idSprint: 7,
    idProyecto: 42,
    numero: 3,
    estado: 'ACTIVO',
    tareasTotales: 4,
    distribucionPorEstado: { POR_HACER: 1, EN_PROGRESO: 1, EN_REVISION: 0, HECHO: 2 },
    distribucionPorPrioridad: { BAJA: 1, MEDIA: 2, ALTA: 1 },
    hitos: [{ idHito: 1, tituloHito: 'MVP', estadoHito: 'EN_PROGRESO', porcentaje: 50 }],
    planificadoVsCompletado: { tareasPlanificadas: 4, tareasCompletadas: 2, horasEstimadas: 20 },
    ...overrides,
  };
}

function mockAnalytics(overrides: Record<string, unknown> = {}) {
  (useSprintAnalytics as any).mockReturnValue({
    analytics: analytics(),
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

function renderPage() {
  return render(createElement(SprintAnalyticsPage));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SprintAnalyticsPage — encabezado', () => {
  it('muestra el número de Sprint en el título y el back-link al Sprint', () => {
    mockAnalytics();

    renderPage();

    expect(screen.getByRole('heading', { name: 'Analítica del Sprint 3' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /volver al sprint/i })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/42/sprints/7',
    );
  });
});

describe('SprintAnalyticsPage — loading', () => {
  it('mientras carga: skeletons, sin métricas ni contenido', () => {
    mockAnalytics({ analytics: undefined, isLoading: true });

    const { container } = renderPage();

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('Tareas totales')).not.toBeInTheDocument();
  });
});

describe('SprintAnalyticsPage — error', () => {
  it('muestra role=alert y "Reintentar" llama a refetch', () => {
    const refetch = vi.fn();
    mockAnalytics({ analytics: undefined, isError: true, error: new Error('500'), refetch });

    renderPage();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('SprintAnalyticsPage — métricas', () => {
  it('muestra tareas totales, completadas, cumplimiento y horas estimadas', () => {
    mockAnalytics();

    renderPage();

    expect(screen.getByText('Tareas totales')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Tareas completadas')).toBeInTheDocument();
    expect(screen.getByText('Cumplimiento')).toBeInTheDocument();
    // 2 completadas / 4 planificadas = 50%
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('20 h')).toBeInTheDocument();
  });

  it('nunca muestra la palabra "velocity"', () => {
    mockAnalytics();

    renderPage();

    expect(screen.queryByText(/velocity/i)).not.toBeInTheDocument();
  });
});

describe('SprintAnalyticsPage — distribución', () => {
  it('muestra las cuatro etiquetas de estado y las tres de prioridad, incluso en 0', () => {
    mockAnalytics();

    renderPage();

    expect(screen.getByText('Por hacer')).toBeInTheDocument();
    expect(screen.getByText('En progreso')).toBeInTheDocument();
    expect(screen.getByText('En revisión')).toBeInTheDocument();
    expect(screen.getAllByText('Hecho').length).toBeGreaterThan(0);
    expect(screen.getByText('Alta')).toBeInTheDocument();
    expect(screen.getByText('Media')).toBeInTheDocument();
    expect(screen.getByText('Baja')).toBeInTheDocument();
  });
});

describe('SprintAnalyticsPage — hitos', () => {
  it('muestra el título y el porcentaje del hito', () => {
    mockAnalytics();

    renderPage();

    expect(screen.getByText('MVP')).toBeInTheDocument();
    expect(screen.getByText('En progreso · 50%')).toBeInTheDocument();
  });

  it('sin hitos vinculados, muestra el mensaje vacío en vez de una lista vacía', () => {
    mockAnalytics({ analytics: analytics({ hitos: [] }) });

    renderPage();

    expect(
      screen.getByText('Ninguna tarea de este Sprint está vinculada a un hito.'),
    ).toBeInTheDocument();
  });
});
