import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { MetricTrendPlotProps } from '../components/admin/metric-trend-plot';

/**
 * Contrato entre AdminMetricsSection y su módulo de dibujo: qué serie, qué
 * rótulos y qué formato de valor recibe cada una de las cinco gráficas.
 * El dibujo se sustituye por un doble que guarda sus props.
 */
const recibidos = vi.hoisted(() => new Map<string, unknown>());

vi.mock('../components/admin/metric-trend-plot', () => ({
  default: (props: { dataKey: string }) => {
    recibidos.set(props.dataKey, props);
    return <div data-testid={`plot-${props.dataKey}`} />;
  },
}));
vi.mock('../lib/services/admin', () => ({ getAdminMetricas: vi.fn() }));
const url = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/admin/metricas',
  useSearchParams: () => new URLSearchParams(url.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { AdminMetricsSection, formatearValorConUnidad, METRICAS } from '../components/admin/AdminMetricsSection';
import { getAdminMetricas, type AdminMetricasPeriodo, type AdminMetricasPunto } from '../lib/services/admin';

const plot = (serie: string) => recibidos.get(serie) as MetricTrendPlotProps;

const SERIE: AdminMetricasPunto[] = [
  { inicio: '2026-09-28', usuariosNuevos: 3, usuariosActivos: 0, proyectosCreados: 1, tareasCompletadas: 0, horasConfirmadas: 4.5 },
  { inicio: '2026-10-05', usuariosNuevos: 1, usuariosActivos: 2, proyectosCreados: 0, tareasCompletadas: 4, horasConfirmadas: 5.25 },
];

async function renderSection(periodo: AdminMetricasPeriodo = 'semana') {
  url.search = `periodo=${periodo}`;
  vi.mocked(getAdminMetricas).mockResolvedValue({ periodo, serie: SERIE });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  render(createElement(AdminMetricsSection), { wrapper });
  await screen.findByTestId('plot-usuariosNuevos');
  await waitFor(() => expect(recibidos.size).toBe(METRICAS.length));
}

afterEach(() => {
  cleanup();
  recibidos.clear();
  vi.clearAllMocks();
});

describe('AdminMetricsSection → MetricTrendPlot', () => {
  it('dibuja una gráfica por métrica, todas con la misma serie del servidor', async () => {
    await renderSection();

    expect([...recibidos.keys()].sort()).toEqual(METRICAS.map((m) => m.serie).sort());
    for (const m of METRICAS) {
      expect(plot(m.serie).serie).toBe(SERIE);
      expect(plot(m.serie).label).toBe(m.label);
    }
  });

  it('solo las horas admiten decimales en el eje', async () => {
    await renderSection();

    expect(METRICAS.filter((m) => plot(m.serie).esHoras).map((m) => m.serie)).toEqual(['horasConfirmadas']);
  });

  it('por semana: el eje rotula el día de inicio y el tooltip dice «Semana del…»', async () => {
    await renderSection('semana');

    expect(plot('usuariosNuevos').formatearEje('2026-10-05')).toBe('5 oct');
    expect(plot('usuariosNuevos').formatearEtiqueta('2026-10-05')).toBe('Semana del 5 oct');
  });

  it('por mes: eje y tooltip rotulan el mes y el año', async () => {
    await renderSection('mes');

    expect(plot('usuariosNuevos').formatearEje('2026-10-01')).toBe('oct 2026');
    expect(plot('usuariosNuevos').formatearEtiqueta('2026-10-01')).toBe('oct 2026');
  });

  it('el tooltip lleva la unidad de cada métrica, en singular o plural', async () => {
    await renderSection();

    expect(plot('usuariosNuevos').formatearValor(1)).toBe('1 usuario');
    expect(plot('usuariosActivos').formatearValor(2)).toBe('2 usuarios');
    expect(plot('proyectosCreados').formatearValor(0)).toBe('0 proyectos');
    expect(plot('tareasCompletadas').formatearValor(4)).toBe('4 tareas');
  });

  it('las horas conservan hasta dos decimales y su unidad; los conteos nunca llevan decimales', async () => {
    await renderSection();

    expect(plot('horasConfirmadas').formatearValor(5.25)).toBe('5.25 h');
    expect(plot('horasConfirmadas').formatearValor(4.5)).toBe('4.5 h');
    expect(plot('horasConfirmadas').formatearValor(10)).toBe('10 h');
  });
});

describe('formatearValorConUnidad', () => {
  it('no añade una segunda unidad a las horas', () => {
    const horas = METRICAS.find((m) => m.serie === 'horasConfirmadas')!;
    expect(formatearValorConUnidad(1, horas)).toBe('1 h');
  });
});
