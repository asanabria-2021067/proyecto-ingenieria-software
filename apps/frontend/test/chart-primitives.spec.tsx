import '@testing-library/jest-dom/vitest';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// ResponsiveContainer no pinta a sus hijos en jsdom (mide 0): se deja pasar el contenido.
vi.mock('recharts', async (original) => ({
  ...(await original<typeof import('recharts')>()),
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { CHART_AXIS_PROPS, CHART_GRID_PROPS, ChartContainer, ChartTooltipContent } from '../components/ui/chart';

type TooltipProps = ComponentProps<typeof ChartTooltipContent>;

function renderTooltip(props: Partial<TooltipProps>) {
  const contenido = (
    <ChartTooltipContent
      active
      label="2026-10-05"
      payload={[{ dataKey: 'horas', name: 'horas', value: 0, color: 'red', payload: {} }] as TooltipProps['payload']}
      {...props}
    />
  );
  return render(
    <ChartContainer config={{ horas: { label: 'Horas confirmadas' } }} className="aspect-auto h-[140px]">
      {contenido as ComponentProps<typeof ChartContainer>['children']}
    </ChartContainer>,
  );
}

afterEach(cleanup);

describe('primitivas compartidas de gráficas', () => {
  it('el contenedor acepta un alto explícito en lugar de su proporción por defecto', () => {
    const { container } = renderTooltip({});
    const chart = container.querySelector('[data-slot="chart"]');

    expect(chart).toHaveClass('aspect-auto', 'h-[140px]');
    expect(chart).not.toHaveClass('aspect-video');
  });

  it('el tooltip muestra la etiqueta de la serie y un valor 0 como valor, con su estilo', () => {
    renderTooltip({});

    expect(screen.getByText('Horas confirmadas')).toBeInTheDocument();
    expect(screen.getByText('0')).toHaveClass('tabular-nums');
  });

  it('valueFormatter da el texto del valor sin perder la etiqueta de la serie', () => {
    renderTooltip({ valueFormatter: (valor) => `${String(valor)} h` });

    expect(screen.getByText('0 h')).toHaveClass('tabular-nums');
    expect(screen.getByText('Horas confirmadas')).toBeInTheDocument();
  });

  it('valueFormatter también se aplica a un valor ausente, para poder decir «sin dato»', () => {
    renderTooltip({
      payload: [{ dataKey: 'horas', name: 'horas', value: undefined, color: 'red', payload: {} }] as TooltipProps['payload'],
      valueFormatter: (valor) => (valor == null ? 'Sin dato' : String(valor)),
    });

    expect(screen.getByText('Sin dato')).toBeInTheDocument();
  });

  it('labelFormatter rotula el punto', () => {
    renderTooltip({ labelFormatter: (valor) => `Semana del ${String(valor)}` });

    expect(screen.getByText('Semana del 2026-10-05')).toBeInTheDocument();
  });

  it('el criterio de rejilla y ejes es único: rejilla horizontal y ejes sin línea', () => {
    expect(CHART_GRID_PROPS).toEqual({ vertical: false, strokeDasharray: '3 3' });
    expect(CHART_AXIS_PROPS).toEqual({ tick: { fontSize: 11 }, tickLine: false, axisLine: false });
  });
});
