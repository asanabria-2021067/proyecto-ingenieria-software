import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BurndownChartPlotProps } from '../components/projects/burndown-chart-plot';
import type { SprintBurndownDto } from '../lib/types/sprints';

/**
 * Contrato entre BurndownChart y su módulo de dibujo: qué serie, qué rótulo
 * de eje y qué formateador de fechas recibe. recharts no dibuja marcas en
 * jsdom (el contenedor mide 0), así que el dibujo se sustituye por un doble
 * que guarda sus props.
 */
const recibido = vi.hoisted(() => ({ props: null as unknown }));

vi.mock('../components/projects/burndown-chart-plot', () => ({
  default: (props: unknown) => {
    recibido.props = props;
    return <div data-testid="plot" />;
  },
}));

import { BurndownChart } from '../components/projects/burndown-chart';

const props = () => recibido.props as BurndownChartPlotProps;

function burndown(overrides: Partial<SprintBurndownDto> = {}): SprintBurndownDto {
  return {
    idSprint: 1,
    fechaInicio: '2026-01-01T00:00:00.000Z',
    fechaFinPlaneada: '2026-01-03T00:00:00.000Z',
    tareasPlanificadasTotal: 4,
    puntosHistoriaPlanificadosTotal: 12,
    instantaneas: [
      { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 12 },
      { fecha: '2026-01-03T00:00:00.000Z', tareasPendientes: 1, tareasCompletadas: 3, puntosHistoriaRestantes: 2 },
    ],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  recibido.props = null;
});

describe('BurndownChart → BurndownChartPlot', () => {
  it('entrega la serie de story points con sus huecos y el rótulo del eje', async () => {
    render(<BurndownChart burndown={burndown()} />);
    await screen.findByTestId('plot');

    expect(props().etiquetaEje).toBe('Story points');
    expect(props().serie.map((p) => [p.ideal, p.real])).toEqual([
      [12, 12],
      [6, null],
      [0, 2],
    ]);
  });

  it('eje y tooltip comparten un formateador que rotula el día UTC de cada punto', async () => {
    render(<BurndownChart burndown={burndown()} />);
    await screen.findByTestId('plot');

    expect(props().serie.map((p) => props().formatearFecha(p.fecha))).toEqual(['1 ene', '2 ene', '3 ene']);
  });

  it('al cambiar a número de tareas entrega la otra serie y el otro rótulo', async () => {
    render(<BurndownChart burndown={burndown()} />);
    await screen.findByTestId('plot');

    fireEvent.click(screen.getByRole('radio', { name: 'Número de tareas' }));

    await waitFor(() => expect(props().etiquetaEje).toBe('Tareas'));
    expect(props().serie.map((p) => p.real)).toEqual([4, null, 1]);
  });

  it('sin story points planificados entrega de entrada la serie de tareas', async () => {
    render(<BurndownChart burndown={burndown({ puntosHistoriaPlanificadosTotal: 0 })} />);
    await screen.findByTestId('plot');

    expect(props().etiquetaEje).toBe('Tareas');
    expect(props().serie.map((p) => p.real)).toEqual([4, null, 1]);
  });
});
