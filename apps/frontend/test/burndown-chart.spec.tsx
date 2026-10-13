import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BurndownChart, construirSerie, formatearFechaEje } from '../components/projects/burndown-chart';
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
    // El único svg permitido es el icono discreto del estado vacío, nunca un gráfico.
    expect(document.querySelector('svg:not(.lucide)')).not.toBeInTheDocument();
  });

  it('el estado vacío es una tarjeta blanca con borde sutil, sin fondo gris ni borde punteado', () => {
    render(<BurndownChart burndown={burndown({ instantaneas: [] })} />);

    const vacio = screen.getByRole('status');
    expect(vacio).toHaveAttribute('data-slot', 'empty');
    expect(vacio).toHaveClass('bg-surface-container-lowest', 'shadow-sm', 'rounded-2xl');
    expect(vacio).not.toHaveClass('border-dashed');
    expect(vacio).not.toHaveClass('bg-surface-container-low');
    expect(vacio.querySelector('[data-slot="empty-icon"] svg')).toHaveClass('lucide');
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

  it('el selector de eje usa el mismo estilo segmentado que Semana/Mes: opción elegida en verde y realce al pasar el cursor', () => {
    render(<BurndownChart burndown={burndown()} />);

    for (const opcion of screen.getAllByRole('radio')) {
      expect(opcion).toHaveClass('px-4', 'data-[state=on]:bg-primary', 'data-[state=on]:text-on-primary', 'hover:bg-primary', 'hover:text-on-primary');
      expect(opcion).not.toHaveClass('data-[state=on]:bg-muted');
    }
    expect(screen.getByRole('radio', { name: 'Story points' })).toHaveAttribute('data-state', 'on');
  });

  it('cambiar el toggle a "Número de tareas" lo activa y desactiva "Story points"', () => {
    render(<BurndownChart burndown={burndown()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Número de tareas' }));

    expect(screen.getByRole('radio', { name: 'Número de tareas' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Story points' })).toHaveAttribute('aria-checked', 'false');
  });

  it('sin story points planificados: abre en número de tareas y lo explica, con Story points aún disponible', () => {
    render(
      <BurndownChart
        burndown={burndown({
          puntosHistoriaPlanificadosTotal: 0,
          instantaneas: [
            { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 0 },
            { fecha: '2026-01-02T00:00:00.000Z', tareasPendientes: 3, tareasCompletadas: 1, puntosHistoriaRestantes: 0 },
          ],
        })}
      />,
    );

    expect(screen.getByRole('note')).toHaveTextContent(
      'Este Sprint no tiene story points asignados; consulta el número de tareas.',
    );
    expect(screen.getByRole('radio', { name: 'Número de tareas' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('radio', { name: 'Story points' }));
    expect(screen.getByRole('radio', { name: 'Story points' })).toHaveAttribute('aria-checked', 'true');
  });

  it('con story points planificados no aparece la nota, aunque ya no quede ninguno pendiente', () => {
    render(
      <BurndownChart
        burndown={burndown({
          instantaneas: [
            { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 13 },
            { fecha: '2026-01-02T00:00:00.000Z', tareasPendientes: 0, tareasCompletadas: 4, puntosHistoriaRestantes: 0 },
          ],
        })}
      />,
    );

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Story points' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('formatearFechaEje', () => {
  const TZ_ORIGINAL = process.env.TZ;

  afterEach(() => {
    if (TZ_ORIGINAL === undefined) delete process.env.TZ;
    else process.env.TZ = TZ_ORIGINAL;
  });

  it('rotula el día calendario UTC del punto, no el día anterior de Guatemala', () => {
    process.env.TZ = 'America/Guatemala';
    const iso = '2026-01-01T00:00:00.000Z';
    // La zona está activa: en hora local esa medianoche UTC es todavía 31 de diciembre.
    expect(new Date(iso).getDate()).toBe(31);

    expect(formatearFechaEje(iso)).toBe('1 ene');
  });

  it.each([
    ['2025-12-31T00:00:00.000Z', '31 dic'],
    ['2026-01-31T00:00:00.000Z', '31 ene'],
    ['2026-02-01T00:00:00.000Z', '1 feb'],
    ['2026-03-17T00:00:00.000Z', '17 mar'],
  ])('%s se rotula «%s» en Guatemala y en UTC', (iso, esperado) => {
    for (const zona of ['America/Guatemala', 'UTC']) {
      process.env.TZ = zona;
      expect(formatearFechaEje(iso)).toBe(esperado);
    }
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

  it('la serie completa de un Sprint de cuatro días conserva sus fechas y valores exactos', () => {
    const serie = construirSerie(
      burndown({
        fechaFinPlaneada: '2026-01-04T00:00:00.000Z',
        puntosHistoriaPlanificadosTotal: 12,
        instantaneas: [
          { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 12 },
          { fecha: '2026-01-03T00:00:00.000Z', tareasPendientes: 2, tareasCompletadas: 2, puntosHistoriaRestantes: 5 },
        ],
      }),
      'puntos',
    );

    expect(serie).toEqual([
      { fecha: '2026-01-01T00:00:00.000Z', ideal: 12, real: 12 },
      { fecha: '2026-01-02T00:00:00.000Z', ideal: 8, real: null },
      { fecha: '2026-01-03T00:00:00.000Z', ideal: 4, real: 5 },
      { fecha: '2026-01-04T00:00:00.000Z', ideal: 0, real: null },
    ]);
  });

  it('sin story points la serie de puntos es cero real, no un hueco: los días con instantánea valen 0', () => {
    const serie = construirSerie(
      burndown({
        fechaFinPlaneada: '2026-01-03T00:00:00.000Z',
        puntosHistoriaPlanificadosTotal: 0,
        instantaneas: [
          { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 0 },
        ],
      }),
      'puntos',
    );

    expect(serie.map((p) => p.ideal)).toEqual([0, 0, 0]);
    expect(serie.map((p) => p.real)).toEqual([0, null, null]);
  });

  it('sin tareas ni puntos el eje de tareas también queda en cero, sin dividir por cero', () => {
    const serie = construirSerie(
      burndown({
        fechaFinPlaneada: '2026-01-02T00:00:00.000Z',
        tareasPlanificadasTotal: 0,
        puntosHistoriaPlanificadosTotal: 0,
        instantaneas: [
          { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 0, tareasCompletadas: 0, puntosHistoriaRestantes: 0 },
        ],
      }),
      'tareas',
    );

    expect(serie).toEqual([
      { fecha: '2026-01-01T00:00:00.000Z', ideal: 0, real: 0 },
      { fecha: '2026-01-02T00:00:00.000Z', ideal: 0, real: null },
    ]);
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
