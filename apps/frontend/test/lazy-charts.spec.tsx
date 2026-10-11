import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { BurndownChart } from '../components/projects/burndown-chart';
import { VelocityChart } from '../components/projects/velocity-chart';
import type { SprintBurndownDto, SprintComparativeAnalyticsItemDto } from '../lib/types/sprints';

/**
 * HU-176 (T-293): recharts se carga con next/dynamic desde módulos *-plot,
 * así que no viaja en el JS inicial de las páginas de analítica ni del panel
 * de administración. El título y el toggle siguen saliendo de inmediato.
 */

// jsdom no implementa ResizeObserver; ResponsiveContainer de recharts lo usa.
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => cleanup());

const RAIZ = join(__dirname, '..');

describe('gráficos con carga diferida', () => {
  it.each([
    'components/projects/burndown-chart.tsx',
    'components/projects/velocity-chart.tsx',
    'components/admin/AdminMetricsSection.tsx',
  ])('%s no importa recharts de forma estática', (archivo) => {
    const fuente = readFileSync(join(RAIZ, archivo), 'utf8');
    expect(fuente).not.toMatch(/from 'recharts'/);
    expect(fuente).toMatch(/dynamic\(\(\) => import\('\.\/[a-z-]+-plot'\)/);
  });

  it('el burndown muestra el título de inmediato y monta el gráfico al cargar recharts', async () => {
    const burndown: SprintBurndownDto = {
      idSprint: 7,
      fechaInicio: '2026-01-01T00:00:00.000Z',
      fechaFinPlaneada: '2026-01-05T00:00:00.000Z',
      tareasPlanificadasTotal: 4,
      puntosHistoriaPlanificadosTotal: 10,
      instantaneas: [
        { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 10 },
        { fecha: '2026-01-02T00:00:00.000Z', tareasPendientes: 3, tareasCompletadas: 1, puntosHistoriaRestantes: 8 },
      ],
    };

    render(createElement(BurndownChart, { burndown }));

    expect(screen.getByText('Burndown del Sprint')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.recharts-responsive-container')).toBeInTheDocument());
  });

  it('la velocidad monta el gráfico al cargar recharts', async () => {
    const sprints = [
      { idSprint: 1, numero: 1, estado: 'CERRADO', puntosHistoriaCompletados: 8 },
    ] as unknown as SprintComparativeAnalyticsItemDto[];

    render(createElement(VelocityChart, { sprints }));

    expect(screen.getByText('Promedio: 8 pts / sprint')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.recharts-responsive-container')).toBeInTheDocument());
  });
});
