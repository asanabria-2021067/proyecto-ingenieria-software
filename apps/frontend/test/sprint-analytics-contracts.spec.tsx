import '@testing-library/jest-dom/vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SprintBurndownDto, SprintComparativeAnalyticsItemDto } from '../lib/types/sprints';

/**
 * Contratos de la analítica de Sprint que no dependen de ver la gráfica: la
 * serie de velocidad, la paridad entre la serie del burndown en pantalla y la
 * del PDF, y que un fallo de la vista previa no desaparezca en silencio.
 */

vi.mock('next/navigation', () => ({ useParams: () => ({ id: '42' }) }));
const burndownMock = vi.hoisted(() => vi.fn());
vi.mock('../hooks/use-project-sprints', () => ({
  useSprintsAnalytics: vi.fn(),
  useSprintBurndown: (...args: unknown[]) => burndownMock(...args),
}));
vi.mock('../hooks/use-is-project-leader', () => ({ useIsProjectLeader: () => false }));
vi.mock('../hooks/use-current-user', () => ({ useIsAdmin: () => false }));
vi.mock('../hooks/use-project-export', () => ({
  useProjectExport: () => ({
    exportCsv: { mutate: vi.fn(), isPending: false, isError: false },
    exportPdf: { mutate: vi.fn(), isPending: false, isError: false },
  }),
}));
vi.mock('../components/projects/burndown-chart-plot', () => ({ default: () => createElement('div', { 'data-testid': 'burndown-plot' }) }));
vi.mock('../components/projects/velocity-chart-plot', () => ({ default: () => createElement('div', { 'data-testid': 'velocity-plot' }) }));

import SprintsAnalyticsPage from '../app/dashboard/proyectos/[id]/sprints/analytics/page';
import { construirSerie, type Eje } from '../components/projects/burndown-chart';
import { construirSerieVelocidad } from '../components/projects/velocity-chart';
import { useSprintsAnalytics } from '../hooks/use-project-sprints';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function sprint(overrides: Partial<SprintComparativeAnalyticsItemDto> = {}): SprintComparativeAnalyticsItemDto {
  return {
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
  };
}

describe('construirSerieVelocidad', () => {
  it('solo entran los Sprints cerrados, en el orden recibido y con su número como rótulo', () => {
    const { serie } = construirSerieVelocidad([
      sprint({ idSprint: 1, numero: 1, puntosHistoriaCompletados: 5 }),
      sprint({ idSprint: 2, numero: 2, estado: 'ACTIVO', puntosHistoriaCompletados: null }),
      sprint({ idSprint: 3, numero: 3, estado: 'EN_FINALIZACION', puntosHistoriaCompletados: null }),
      sprint({ idSprint: 4, numero: 4, puntosHistoriaCompletados: 9 }),
    ]);

    expect(serie).toEqual([
      { sprint: 'Sprint 1', puntos: 5 },
      { sprint: 'Sprint 4', puntos: 9 },
    ]);
  });

  it('un Sprint cerrado sin puntos asignados conserva su barra vacía (null), distinta de un 0', () => {
    const { serie } = construirSerieVelocidad([
      sprint({ idSprint: 1, numero: 1, puntosHistoriaCompletados: 0 }),
      sprint({ idSprint: 2, numero: 2, puntosHistoriaCompletados: null }),
    ]);

    expect(serie).toEqual([
      { sprint: 'Sprint 1', puntos: 0 },
      { sprint: 'Sprint 2', puntos: null },
    ]);
  });

  it('el promedio cuenta los 0 pero no los «sin puntos», y se redondea a un decimal', () => {
    expect(
      construirSerieVelocidad([
        sprint({ idSprint: 1, puntosHistoriaCompletados: 0 }),
        sprint({ idSprint: 2, puntosHistoriaCompletados: 5 }),
        sprint({ idSprint: 3, puntosHistoriaCompletados: 5 }),
        sprint({ idSprint: 4, puntosHistoriaCompletados: null }),
      ]).promedio,
    ).toBe(3.3);
  });

  it('sin Sprints cerrados, o con todos «sin puntos», no hay promedio', () => {
    expect(construirSerieVelocidad([])).toEqual({ serie: [], promedio: null });
    expect(construirSerieVelocidad([sprint({ estado: 'ACTIVO', puntosHistoriaCompletados: null })])).toEqual({ serie: [], promedio: null });
    expect(construirSerieVelocidad([sprint({ puntosHistoriaCompletados: null })]).promedio).toBeNull();
  });

  it('no modifica la lista que recibe', () => {
    const sprints = [sprint({ idSprint: 2, numero: 2 }), sprint({ idSprint: 1, numero: 1 })];
    const copia = structuredClone(sprints);

    construirSerieVelocidad(sprints);

    expect(sprints).toEqual(copia);
  });
});

/**
 * La serie del PDF (`apps/backend/src/exports/burndown-series.util.ts`) es una
 * copia mantenida a mano de `construirSerie`. Es un módulo puro (su único
 * `import` es de tipos), así que aquí se lee su fuente, se transpila y se
 * ejecuta —sin `import` entre paquetes— para compararla con la de pantalla
 * sobre los mismos datos. Donde el backend no está junto al frontend (imagen
 * Docker del frontend) estos casos se omiten.
 */
const UTIL_BACKEND = join(__dirname, '../../backend/src/exports/burndown-series.util.ts');

function cargarSerieDelPdf(): (burndown: SprintBurndownDto, eje: Eje) => unknown {
  const { outputText } = ts.transpileModule(readFileSync(UTIL_BACKEND, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const modulo: { construirSerieBurndown?: (burndown: SprintBurndownDto, eje: Eje) => unknown } = {};
  new Function('exports', outputText)(modulo);
  if (!modulo.construirSerieBurndown) throw new Error('burndown-series.util.ts ya no exporta construirSerieBurndown');
  return modulo.construirSerieBurndown;
}

describe('paridad entre la serie del burndown en pantalla y la del PDF', () => {
  const dia = (n: number) => `2026-0${Math.ceil(n / 28)}-${String(((n - 1) % 28) + 1).padStart(2, '0')}T00:00:00.000Z`;
  const instantanea = (n: number, tareasPendientes: number, puntosHistoriaRestantes: number) => ({
    fecha: dia(n),
    tareasPendientes,
    tareasCompletadas: 10 - tareasPendientes,
    puntosHistoriaRestantes,
  });
  const base: SprintBurndownDto = {
    idSprint: 1,
    fechaInicio: dia(1),
    fechaFinPlaneada: dia(10),
    tareasPlanificadasTotal: 10,
    puntosHistoriaPlanificadosTotal: 34,
    instantaneas: [instantanea(1, 10, 34), instantanea(2, 9, 30), instantanea(5, 4, 13), instantanea(9, 1, 2)],
  };
  const CASOS: Array<[string, SprintBurndownDto]> = [
    ['Sprint con huecos', base],
    ['sin fecha planeada de fin', { ...base, fechaFinPlaneada: null }],
    ['sin instantáneas', { ...base, instantaneas: [] }],
    ['instantáneas después de la fecha planeada', { ...base, instantaneas: [...base.instantaneas, instantanea(13, 1, 2)] }],
    ['sin story points', { ...base, puntosHistoriaPlanificadosTotal: 0, instantaneas: base.instantaneas.map((i) => ({ ...i, puntosHistoriaRestantes: 0 })) }],
    ['Sprint de un solo día', { ...base, fechaFinPlaneada: dia(1), instantaneas: [instantanea(1, 10, 34)] }],
    ['cruza un fin de mes', { ...base, fechaInicio: dia(26), fechaFinPlaneada: dia(31), instantaneas: [instantanea(26, 10, 34), instantanea(30, 3, 8)] }],
  ];

  it.skipIf(!existsSync(UTIL_BACKEND)).each(CASOS)('%s: misma serie, punto por punto, en los dos ejes', (_caso, burndown) => {
    const construirSerieDelPdf = cargarSerieDelPdf();

    for (const eje of ['puntos', 'tareas'] as const) {
      expect(construirSerieDelPdf(burndown, eje), eje).toEqual(construirSerie(burndown, eje));
    }
  });

  it('los casos de paridad cubren series con contenido: no se comparan dos listas vacías', () => {
    for (const [caso, burndown] of CASOS) expect(construirSerie(burndown, 'puntos').length, caso).toBeGreaterThan(0);
    expect(construirSerie(base, 'puntos')).toHaveLength(10);
    expect(construirSerie(base, 'puntos').filter((p) => p.real === null)).toHaveLength(6);
  });
});

describe('comparativa — vista previa del burndown', () => {
  const consulta = (overrides: Record<string, unknown> = {}) => ({
    burndown: undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
  const burndown: SprintBurndownDto = {
    idSprint: 7,
    fechaInicio: '2026-01-01T00:00:00.000Z',
    fechaFinPlaneada: '2026-01-03T00:00:00.000Z',
    tareasPlanificadasTotal: 4,
    puntosHistoriaPlanificadosTotal: 12,
    instantaneas: [
      { fecha: '2026-01-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 12 },
      { fecha: '2026-01-02T00:00:00.000Z', tareasPendientes: 2, tareasCompletadas: 2, puntosHistoriaRestantes: 5 },
    ],
  };

  function renderPagina(sprints: SprintComparativeAnalyticsItemDto[]) {
    vi.mocked(useSprintsAnalytics).mockReturnValue({ sprints, isLoading: false, isError: false, error: null, refetch: vi.fn() } as never);
    return render(createElement(SprintsAnalyticsPage));
  }

  it('si el burndown falla, lo dice con una alerta que nombra el Sprint y ofrece reintentar', () => {
    const refetch = vi.fn();
    burndownMock.mockReturnValue(consulta({ isError: true, error: new Error('500'), refetch }));
    renderPagina([sprint({ idSprint: 7, numero: 3, estado: 'ACTIVO', puntosHistoriaCompletados: null })]);

    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('No fue posible cargar el burndown del Sprint 3.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('el fallo de la vista previa no tumba el resto de la comparativa', () => {
    burndownMock.mockReturnValue(consulta({ isError: true, error: new Error('500') }));
    renderPagina([sprint({ idSprint: 7, numero: 3 })]);

    expect(screen.getByRole('heading', { name: 'Velocidad (story points completados)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tareas completadas por sprint' })).toBeInTheDocument();
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
  });

  it('pide el burndown del Sprint operable si lo hay, y si no del cerrado más reciente', () => {
    burndownMock.mockReturnValue(consulta());
    renderPagina([sprint({ idSprint: 1, numero: 1 }), sprint({ idSprint: 2, numero: 2 }), sprint({ idSprint: 3, numero: 3, estado: 'ACTIVO' })]);
    expect(burndownMock).toHaveBeenLastCalledWith(42, 3);

    cleanup();
    renderPagina([sprint({ idSprint: 1, numero: 1 }), sprint({ idSprint: 2, numero: 2 })]);
    expect(burndownMock).toHaveBeenLastCalledWith(42, 2);
  });

  it('sin error y sin datos no muestra nada: no confunde «no disponible» con un fallo', () => {
    burndownMock.mockReturnValue(consulta());
    renderPagina([sprint({ idSprint: 7, numero: 3 })]);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Burndown del Sprint')).not.toBeInTheDocument();
  });

  it('mientras carga reserva el sitio y no anuncia ningún error', () => {
    burndownMock.mockReturnValue(consulta({ isLoading: true }));
    const { container } = renderPagina([sprint({ idSprint: 7, numero: 3 })]);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('con datos muestra el burndown real, con sus dos ejes disponibles', async () => {
    burndownMock.mockReturnValue(consulta({ burndown }));
    renderPagina([sprint({ idSprint: 7, numero: 3 })]);

    expect(screen.getByText('Burndown del Sprint')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Story points' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Número de tareas' })).toBeInTheDocument();
    expect(await screen.findByTestId('burndown-plot')).toBeInTheDocument();
  });

  it('con pocas instantáneas muestra el estado de datos insuficientes, no un error', () => {
    burndownMock.mockReturnValue(consulta({ burndown: { ...burndown, instantaneas: burndown.instantaneas.slice(0, 1) } }));
    renderPagina([sprint({ idSprint: 7, numero: 3 })]);

    expect(screen.getByText('Aún no hay suficientes datos para el burndown.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sin story points planificados la vista previa abre en número de tareas y lo explica', () => {
    burndownMock.mockReturnValue(consulta({ burndown: { ...burndown, puntosHistoriaPlanificadosTotal: 0 } }));
    renderPagina([sprint({ idSprint: 7, numero: 3 })]);

    expect(screen.getByRole('radio', { name: 'Número de tareas' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('note')).toHaveTextContent('Este Sprint no tiene story points asignados');
  });
});
