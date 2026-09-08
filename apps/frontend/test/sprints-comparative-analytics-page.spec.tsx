import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { SprintComparativeAnalyticsItemDto } from '../lib/types/sprints';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42' }),
}));

vi.mock('../hooks/use-project-sprints', () => ({ useSprintsAnalytics: vi.fn() }));

import SprintsAnalyticsPage from '../app/dashboard/proyectos/[id]/sprints/analytics/page';
import { useSprintsAnalytics } from '../hooks/use-project-sprints';

function item(overrides: Partial<SprintComparativeAnalyticsItemDto> = {}): SprintComparativeAnalyticsItemDto {
  return {
    idSprint: 1,
    numero: 1,
    estado: 'CERRADO',
    tareasPlanificadas: 4,
    tareasCompletadas: 3,
    porcentajeCumplimiento: 75,
    hitosTotales: 2,
    hitosCompletados: 1,
    ...overrides,
  };
}

function mockAnalytics(overrides: Record<string, unknown> = {}) {
  (useSprintsAnalytics as any).mockReturnValue({
    sprints: [item()],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

function renderPage() {
  return render(createElement(SprintsAnalyticsPage));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SprintsAnalyticsPage — encabezado', () => {
  it('muestra el título y el back-link a Sprints', () => {
    mockAnalytics();

    renderPage();

    expect(screen.getByRole('heading', { name: 'Analítica comparativa' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /volver a sprints/i })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/42/sprints',
    );
  });
});

describe('SprintsAnalyticsPage — loading', () => {
  it('mientras carga: skeletons, sin tabla ni eventos falsos', () => {
    mockAnalytics({ sprints: [], isLoading: true });

    const { container } = renderPage();

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('Tareas completadas por sprint')).not.toBeInTheDocument();
  });
});

describe('SprintsAnalyticsPage — error', () => {
  it('muestra role=alert y "Reintentar" llama a refetch', () => {
    const refetch = vi.fn();
    mockAnalytics({ sprints: [], isError: true, error: new Error('500'), refetch });

    renderPage();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('SprintsAnalyticsPage — vacío', () => {
  it('sin Sprints muestra el Empty state', () => {
    mockAnalytics({ sprints: [] });

    renderPage();

    expect(screen.getByText('Aún no hay Sprints en este proyecto.')).toBeInTheDocument();
  });
});

describe('SprintsAnalyticsPage — rendering', () => {
  it('muestra "tareas completadas por sprint" — nunca "velocity"', () => {
    mockAnalytics();

    renderPage();

    expect(screen.getByText('Tareas completadas por sprint')).toBeInTheDocument();
    expect(screen.queryByText(/velocity/i)).not.toBeInTheDocument();
  });

  it('muestra planificadas, completadas, cumplimiento y evolución de hitos en la tabla', () => {
    mockAnalytics({ sprints: [item({ numero: 5, tareasPlanificadas: 8, tareasCompletadas: 6, porcentajeCumplimiento: 75, hitosTotales: 3, hitosCompletados: 2 })] });

    renderPage();

    const tabla = within(screen.getByRole('table'));
    expect(tabla.getByText('Sprint 5')).toBeInTheDocument();
    expect(tabla.getByText('8')).toBeInTheDocument();
    expect(tabla.getByText('6')).toBeInTheDocument();
    expect(tabla.getByText('75%')).toBeInTheDocument();
    expect(tabla.getByText('2 / 3')).toBeInTheDocument();
  });

  it('renderiza una fila por cada Sprint del proyecto', () => {
    mockAnalytics({
      sprints: [item({ idSprint: 1, numero: 1 }), item({ idSprint: 2, numero: 2 })],
    });

    renderPage();

    const tabla = within(screen.getByRole('table'));
    expect(tabla.getByText('Sprint 1')).toBeInTheDocument();
    expect(tabla.getByText('Sprint 2')).toBeInTheDocument();
  });
});
