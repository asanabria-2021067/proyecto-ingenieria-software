import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BurndownChart, construirSerie } from '../components/projects/burndown-chart';
import type { SprintBurndownDto } from '../lib/types/sprints';

/**
 * jsdom no implementa `ResizeObserver`; `recharts.ResponsiveContainer` lo
 * usa para medir su contenedor. Un stub mínimo basta: estas pruebas no
 * verifican dimensiones reales del SVG, solo qué se decide renderizar
 * (mensaje de datos insuficientes vs. gráfico) y el comportamiento del
 * toggle.
 */
beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
});

afterEach(() => {
  cleanup();
});

function burndown(overrides: Partial<SprintBurndownDto> = {}): SprintBurndownDto {
  return {
    idSprint: 1,
    fechaInicio: '2026-01-01T00:00:00.000Z',
    fechaFinPlaneada: '2026-01-15T00:00:00.000Z',
    tareasPlanificadasTotal: 4,
    puntosHistoriaPlanificadosTotal: 13,
    instantaneas: [
      { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 13 },
      { fecha: '2026-01-02T00:00:00.000Z', tareasPendientes: 3, tareasCompletadas: 1, puntosHistoriaRestantes: 10 },
    ],
    ...overrides,
  };
}

describe('BurndownChart', () => {
  it('sin instantáneas: muestra el mensaje de datos insuficientes, nunca un gráfico vacío', () => {
    render(<BurndownChart burndown={burndown({ instantaneas: [] })} />);

    expect(screen.getByText('Aún no hay suficientes datos para el burndown.')).toBeInTheDocument();
    expect(document.querySelector('svg')).not.toBeInTheDocument();
  });

  it('con exactamente 1 instantánea: sigue sin ser suficiente (el AC exige al menos 2)', () => {
    render(
      <BurndownChart
        burndown={burndown({
          instantaneas: [
            { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 13 },
          ],
        })}
      />,
    );

    expect(screen.getByText('Aún no hay suficientes datos para el burndown.')).toBeInTheDocument();
  });

  it('con 2 o más instantáneas: renderiza el gráfico, no el mensaje de datos insuficientes', () => {
    render(<BurndownChart burndown={burndown()} />);

    expect(screen.queryByText('Aún no hay suficientes datos para el burndown.')).not.toBeInTheDocument();
    expect(screen.getByText('Burndown del Sprint')).toBeInTheDocument();
  });

  it('el toggle por defecto muestra "Story points" activo', () => {
    render(<BurndownChart burndown={burndown()} />);

    expect(screen.getByRole('radio', { name: 'Story points' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Número de tareas' })).toHaveAttribute('aria-checked', 'false');
  });

  it('cambiar el toggle a "Número de tareas" lo activa y desactiva "Story points"', () => {
    render(<BurndownChart burndown={burndown()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Número de tareas' }));

    expect(screen.getByRole('radio', { name: 'Número de tareas' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Story points' })).toHaveAttribute('aria-checked', 'false');
  });
});

describe('construirSerie', () => {
  it('un día sin instantánea queda en null (hueco real), nunca interpolado', () => {
    const serie = construirSerie(
      burndown({
        fechaFinPlaneada: '2026-01-04T00:00:00.000Z',
        instantaneas: [
          { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 13 },
          // 2026-01-02 falta a propósito.
          { fecha: '2026-01-03T00:00:00.000Z', tareasPendientes: 2, tareasCompletadas: 2, puntosHistoriaRestantes: 6 },
        ],
      }),
      'puntos',
    );

    const dia2 = serie.find((punto) => punto.fecha.startsWith('2026-01-02'));
    expect(dia2?.real).toBeNull();
    const dia1 = serie.find((punto) => punto.fecha.startsWith('2026-01-01'));
    const dia3 = serie.find((punto) => punto.fecha.startsWith('2026-01-03'));
    expect(dia1?.real).toBe(13);
    expect(dia3?.real).toBe(6);
  });

  it('la línea ideal es una recta desde el total inicial en fechaInicio hasta 0 en fechaFinPlaneada', () => {
    const serie = construirSerie(
      burndown({
        fechaInicio: '2026-01-01T00:00:00.000Z',
        fechaFinPlaneada: '2026-01-05T00:00:00.000Z',
        puntosHistoriaPlanificadosTotal: 20,
        instantaneas: [
          { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 20 },
        ],
      }),
      'puntos',
    );

    expect(serie.find((p) => p.fecha.startsWith('2026-01-01'))?.ideal).toBe(20);
    expect(serie.find((p) => p.fecha.startsWith('2026-01-05'))?.ideal).toBe(0);
    // Punto medio: a mitad de camino, la mitad del trabajo ideal restante.
    expect(serie.find((p) => p.fecha.startsWith('2026-01-03'))?.ideal).toBe(10);
  });

  it('sin fechaFinPlaneada no hay línea ideal (todo null), nunca una recta inventada', () => {
    const serie = construirSerie(burndown({ fechaFinPlaneada: null }), 'puntos');

    expect(serie.every((punto) => punto.ideal === null)).toBe(true);
  });

  it('el eje "tareas" usa tareasPendientes/tareasPlanificadasTotal, nunca los campos de puntos', () => {
    const serie = construirSerie(
      burndown({
        tareasPlanificadasTotal: 4,
        instantaneas: [
          { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 99 },
        ],
      }),
      'tareas',
    );

    expect(serie.find((p) => p.fecha.startsWith('2026-01-01'))?.real).toBe(4);
  });
});
