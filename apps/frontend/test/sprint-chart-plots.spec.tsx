import '@testing-library/jest-dom/vitest';
import { cloneElement, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// En jsdom el contenedor mide 0 y recharts no dibuja: se le da un tamaño fijo a la gráfica.
vi.mock('recharts', async (original) => ({
  ...(await original<typeof import('recharts')>()),
  ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
    cloneElement(children, { width: 600, height: 280 }),
}));

import BurndownChartPlot from '../components/projects/burndown-chart-plot';
import VelocityChartPlot from '../components/projects/velocity-chart-plot';

afterEach(cleanup);

const dia = (n: number) => `2026-01-0${n}T00:00:00.000Z`;
const rotulo = (iso: string) => `d${iso.slice(8, 10)}`;

describe('BurndownChartPlot', () => {
  const serie = [
    { fecha: dia(1), ideal: 12, real: 12 },
    { fecha: dia(2), ideal: 8, real: null },
    { fecha: dia(3), ideal: 4, real: 0 },
    { fecha: dia(4), ideal: 0, real: null },
  ];

  it('usa el contenedor con tema y conserva su alto de 280 px', () => {
    const { container } = render(<BurndownChartPlot serie={serie} etiquetaEje="Story points" formatearFecha={rotulo} />);

    const chart = container.querySelector('[data-slot="chart"]');
    expect(chart).toHaveClass('aspect-auto', 'h-[280px]');
    expect(container.querySelector('.recharts-wrapper')).toBeInTheDocument();
  });

  it('conserva las dos series, su leyenda y el rótulo del eje', () => {
    const { container } = render(<BurndownChartPlot serie={serie} etiquetaEje="Story points" formatearFecha={rotulo} />);

    expect(container.querySelectorAll('.recharts-line')).toHaveLength(2);
    expect(screen.getByText('Ideal')).toBeInTheDocument();
    expect(screen.getByText('Real')).toBeInTheDocument();
    expect(screen.getByText('Story points')).toBeInTheDocument();
  });

  it('la línea Real dibuja un punto por día con instantánea, incluido el 0, y ninguno en los huecos', () => {
    const { container } = render(<BurndownChartPlot serie={serie} etiquetaEje="Story points" formatearFecha={rotulo} />);

    // 2 de 4 días tienen instantánea (12 y 0); la Ideal no dibuja puntos.
    expect(container.querySelectorAll('.recharts-line-dot')).toHaveLength(2);
  });

  it('la Ideal va punteada y atenuada; la Real, continua', () => {
    const { container } = render(<BurndownChartPlot serie={serie} etiquetaEje="Tareas" formatearFecha={rotulo} />);

    const [ideal, real] = [...container.querySelectorAll('.recharts-line-curve')];
    expect(ideal).toHaveAttribute('stroke-dasharray', '6 4');
    expect(ideal).toHaveAttribute('stroke-opacity', '0.45');
    expect(real).not.toHaveAttribute('stroke-opacity');
    expect(screen.getByText('Tareas')).toBeInTheDocument();
  });

  it('la rejilla es solo horizontal', () => {
    const { container } = render(<BurndownChartPlot serie={serie} etiquetaEje="Story points" formatearFecha={rotulo} />);

    expect(container.querySelector('.recharts-cartesian-grid-horizontal')).toBeInTheDocument();
    expect(container.querySelector('.recharts-cartesian-grid-vertical')).not.toBeInTheDocument();
  });
});

describe('VelocityChartPlot', () => {
  const serie = [
    { sprint: 'Sprint 1', puntos: 4 },
    { sprint: 'Sprint 2', puntos: 0 },
    { sprint: 'Sprint 3', puntos: null },
  ];

  it('usa el contenedor con tema y conserva su alto de 260 px', () => {
    const { container } = render(<VelocityChartPlot serie={serie} promedio={2} />);

    expect(container.querySelector('[data-slot="chart"]')).toHaveClass('aspect-auto', 'h-[260px]');
  });

  it('dibuja la línea de promedio con su valor y el rótulo del eje', () => {
    const { container } = render(<VelocityChartPlot serie={serie} promedio={2} />);

    expect(container.querySelector('.recharts-reference-line')).toBeInTheDocument();
    expect(screen.getByText('Promedio: 2')).toBeInTheDocument();
    expect(screen.getByText('Story points')).toBeInTheDocument();
  });

  it('sin promedio no hay línea de referencia', () => {
    const { container } = render(<VelocityChartPlot serie={serie} promedio={null} />);

    expect(container.querySelector('.recharts-reference-line')).not.toBeInTheDocument();
  });

  it('la rejilla es solo horizontal', () => {
    const { container } = render(<VelocityChartPlot serie={serie} promedio={2} />);

    expect(container.querySelector('.recharts-cartesian-grid-horizontal')).toBeInTheDocument();
    expect(container.querySelector('.recharts-cartesian-grid-vertical')).not.toBeInTheDocument();
  });
});
