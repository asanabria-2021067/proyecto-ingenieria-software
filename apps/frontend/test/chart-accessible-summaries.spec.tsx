import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

/**
 * Alternativa accesible de las gráficas: los valores que dibuja el SVG se
 * pueden leer también como texto, punto por punto. El dibujo se sustituye por
 * un doble: aquí solo importa lo que queda fuera de él.
 */
vi.mock('../components/admin/metric-trend-plot', () => ({ default: () => <div data-testid="plot" /> }));
vi.mock('../components/projects/burndown-chart-plot', () => ({ default: () => <div data-testid="plot" /> }));
vi.mock('../components/projects/velocity-chart-plot', () => ({ default: () => <div data-testid="plot" /> }));
vi.mock('../lib/services/admin', () => ({ getAdminMetricas: vi.fn() }));
const url = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/admin/metricas',
  useSearchParams: () => new URLSearchParams(url.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { AdminMetricsSection } from '../components/admin/AdminMetricsSection';
import { BurndownChart } from '../components/projects/burndown-chart';
import { VelocityChart } from '../components/projects/velocity-chart';
import { getAdminMetricas, type AdminMetricasPeriodo } from '../lib/services/admin';
import type { SprintBurndownDto, SprintComparativeAnalyticsItemDto } from '../lib/types/sprints';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  url.search = '';
});

/** Filas del cuerpo de una tabla como textos de sus celdas. */
const filas = (tabla: HTMLElement) =>
  within(tabla)
    .getAllByRole('row')
    .slice(1)
    .map((fila) => [...fila.children].map((celda) => celda.textContent));

describe('Tendencias de uso — valores por periodo', () => {
  const SERIE = [
    { inicio: '2026-09-21', usuariosNuevos: 0, usuariosActivos: 1, proyectosCreados: 0, tareasCompletadas: 3, horasConfirmadas: 0 },
    { inicio: '2026-09-28', usuariosNuevos: 3, usuariosActivos: 0, proyectosCreados: 1, tareasCompletadas: 0, horasConfirmadas: 4.5 },
    { inicio: '2026-10-05', usuariosNuevos: 1, usuariosActivos: 2, proyectosCreados: 0, tareasCompletadas: 4, horasConfirmadas: 5.25 },
  ];

  async function renderSection(periodo: AdminMetricasPeriodo = 'semana') {
    url.search = `periodo=${periodo}`;
    vi.mocked(getAdminMetricas).mockResolvedValue({ periodo, serie: SERIE });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    render(createElement(AdminMetricsSection), { wrapper });
    await screen.findAllByRole('table');
  }

  it('cada una de las cinco gráficas tiene su tabla con nombre propio', async () => {
    await renderSection();

    expect(screen.getAllByRole('table').map((tabla) => within(tabla).getByRole('caption').textContent)).toEqual([
      'Usuarios nuevos por semana, las últimas 8 semanas',
      'Usuarios activos por semana, las últimas 8 semanas',
      'Proyectos creados por semana, las últimas 8 semanas',
      'Tareas completadas por semana, las últimas 8 semanas',
      'Horas confirmadas por semana, las últimas 8 semanas',
    ]);
  });

  it('la tabla da el valor de cada periodo —no solo el actual y el total— con su unidad, y marca el que está en curso', async () => {
    await renderSection();

    expect(filas(screen.getByRole('table', { name: /^Usuarios nuevos/ }))).toEqual([
      ['Semana del 21 sep', '0 usuarios'],
      ['Semana del 28 sep', '3 usuarios'],
      ['Semana del 5 oct (en curso)', '1 usuario'],
    ]);
    expect(filas(screen.getByRole('table', { name: /^Horas confirmadas/ }))).toEqual([
      ['Semana del 21 sep', '0 h'],
      ['Semana del 28 sep', '4.5 h'],
      ['Semana del 5 oct (en curso)', '5.25 h'],
    ]);
  });

  it('por mes, la tabla rotula meses', async () => {
    await renderSection('mes');

    const tabla = screen.getByRole('table', { name: 'Proyectos creados por mes, los últimos 6 meses' });
    expect(filas(tabla).map(([periodo]) => periodo)).toEqual(['sep 2026', 'sep 2026', 'oct 2026 (en curso)']);
  });

  it('la tabla se oculta a la vista desde un contenedor: un `<table>` con `sr-only` no se recorta y desborda la página', async () => {
    await renderSection();

    for (const tabla of screen.getAllByRole('table')) {
      expect(tabla).not.toHaveClass('sr-only');
      expect(tabla.parentElement).toHaveClass('sr-only');
      expect(tabla.parentElement?.tagName).toBe('DIV');
    }
  });

  it('las cabeceras de fila y columna están marcadas como tales', async () => {
    await renderSection();

    const tabla = screen.getByRole('table', { name: /^Tareas completadas/ });
    expect(within(tabla).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Periodo', 'Valor']);
    expect(within(tabla).getAllByRole('rowheader')).toHaveLength(SERIE.length);
  });
});

describe('Burndown — valores por día', () => {
  const burndown: SprintBurndownDto = {
    idSprint: 1,
    fechaInicio: '2026-01-01T00:00:00.000Z',
    fechaFinPlaneada: '2026-01-04T00:00:00.000Z',
    tareasPlanificadasTotal: 4,
    puntosHistoriaPlanificadosTotal: 12,
    instantaneas: [
      { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 12 },
      { fecha: '2026-01-03T00:00:00.000Z', tareasPendientes: 0, tareasCompletadas: 4, puntosHistoriaRestantes: 0 },
    ],
  };

  it('la tabla da Ideal y Real de cada día; un día sin instantánea es «Sin dato» y un 0 real es 0', () => {
    render(<BurndownChart burndown={burndown} />);

    const tabla = screen.getByRole('table', { name: 'Burndown del Sprint, en story points pendientes por día' });
    expect(within(tabla).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Día', 'Ideal', 'Real']);
    expect(tabla).not.toHaveClass('sr-only');
    expect(tabla.parentElement).toHaveClass('sr-only');
    expect(filas(tabla)).toEqual([
      ['1 ene', '12', '12'],
      ['2 ene', '8', 'Sin dato'],
      ['3 ene', '4', '0'],
      ['4 ene', '0', 'Sin dato'],
    ]);
  });

  it('al cambiar de eje la tabla cambia con la gráfica', () => {
    render(<BurndownChart burndown={burndown} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Número de tareas' }));

    const tabla = screen.getByRole('table', { name: 'Burndown del Sprint, en tareas pendientes por día' });
    expect(filas(tabla).map(([, , real]) => real)).toEqual(['4', 'Sin dato', '0', 'Sin dato']);
  });

  it('sin fecha planeada de fin, la columna Ideal dice «Sin dato» en vez de inventar una recta', () => {
    render(<BurndownChart burndown={{ ...burndown, fechaFinPlaneada: null }} />);

    const tabla = screen.getByRole('table', { name: /^Burndown del Sprint/ });
    expect(new Set(filas(tabla).map(([, ideal]) => ideal))).toEqual(new Set(['Sin dato']));
  });

  it('con datos insuficientes no hay gráfica ni tabla: solo el estado vacío', () => {
    render(<BurndownChart burndown={{ ...burndown, instantaneas: [] }} />);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Aún no hay suficientes datos para el burndown.');
  });
});

describe('Velocidad — la lista en texto que ya existía', () => {
  const sprint = (overrides: Partial<SprintComparativeAnalyticsItemDto>): SprintComparativeAnalyticsItemDto => ({
    idSprint: 1,
    numero: 1,
    estado: 'CERRADO',
    tareasPlanificadas: 4,
    tareasCompletadas: 3,
    porcentajeCumplimiento: 75,
    hitosTotales: 2,
    hitosCompletados: 1,
    puntosHistoriaCompletados: 8,
    ...overrides,
  });

  it('da el valor de cada Sprint cerrado y el promedio sin depender del SVG, y distingue 0 de «sin puntos»', () => {
    render(
      <VelocityChart
        sprints={[
          sprint({ idSprint: 1, numero: 1, puntosHistoriaCompletados: 8 }),
          sprint({ idSprint: 2, numero: 2, puntosHistoriaCompletados: 0 }),
          sprint({ idSprint: 3, numero: 3, puntosHistoriaCompletados: null }),
          sprint({ idSprint: 4, numero: 4, estado: 'ACTIVO', puntosHistoriaCompletados: null }),
        ]}
      />,
    );

    expect(screen.getByText('Sprint 1:').parentElement).toHaveTextContent('Sprint 1: 8 pts');
    expect(screen.getByText('Sprint 2:').parentElement).toHaveTextContent('Sprint 2: 0 pts');
    expect(screen.getByText('Sprint 3:').parentElement).toHaveTextContent('Sprint 3: Sin puntos asignados');
    expect(screen.queryByText('Sprint 4:')).not.toBeInTheDocument();
    expect(screen.getByText('Promedio: 4 pts / sprint')).toBeInTheDocument();
    // No se duplica: la velocidad no necesita una tabla además de su lista.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
