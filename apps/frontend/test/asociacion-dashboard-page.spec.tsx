import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
Element.prototype.scrollIntoView = () => {};
Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = () => {};

vi.mock('next/navigation', () => ({ useParams: () => ({ id: '7' }) }));
vi.mock('../lib/services/horas-semestre', () => ({ getHorasActual: vi.fn() }));
vi.mock('../lib/services/asociaciones', () => ({
  getMisJuntas: vi.fn(),
  getEstudiantesAsociacion: vi.fn(),
  getProyectosAsociacion: vi.fn(),
  descargarEstudiantesAsociacion: vi.fn(),
  descargarProyectosAsociacion: vi.fn(),
}));
vi.mock('../lib/download-file', () => ({ downloadBlob: vi.fn() }));

import AsociacionDashboardPage from '../app/dashboard/asociacion/[id]/page';
import { downloadBlob } from '../lib/download-file';
import {
  descargarEstudiantesAsociacion,
  getEstudiantesAsociacion,
  getMisJuntas,
  getProyectosAsociacion,
  type FilaEstudianteAsociacion,
} from '../lib/services/asociaciones';
import { getHorasActual } from '../lib/services/horas-semestre';

const SEMESTRE = { anio: 2026, periodo: 2 as const, inicio: '2026-07-01', fin: '2026-12-31' };

const fila = (idUsuario: number, p: Partial<FilaEstudianteAsociacion> = {}): FilaEstudianteAsociacion => ({
  idUsuario,
  nombre: `Nombre${idUsuario}`,
  apellido: 'Apellido',
  carne: `2410${idUsuario}`,
  idCarrera: 1,
  carrera: 'Ciencias de la Computación',
  semestreCarrera: 4,
  metaBeca: 100,
  becaDeclarada: 10,
  becaAcreditada: 25,
  faltaBeca: 65,
  metaExtension: null,
  extensionDeclarada: 0,
  extensionAcreditada: 0,
  faltaExtension: null,
  enRiesgo: false,
  proyectosActivos: 2,
  ...p,
});

function montar(juntas = [{ idAsociacion: 7, nombre: 'AEC', logoUrl: null, cargo: 'PRESIDENTE' as const, nivelPermiso: 'ADMINISTRADOR' as const }]) {
  vi.mocked(getHorasActual).mockResolvedValue({ semestre: SEMESTRE, registro: null, necesitaRegistro: false });
  vi.mocked(getMisJuntas).mockResolvedValue(juntas);
  vi.mocked(getProyectosAsociacion).mockResolvedValue([
    { idProyecto: 5, titulo: 'Feria de Ciencias', estado: 'EN_PROGRESO', avanceTareasPct: 40, avanceSprintsPct: 50, integrantes: 6, horasAcreditadas: 12 },
  ]);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AsociacionDashboardPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ASO: dashboard de asociación', () => {
  it('lista estudiantes con declaradas y acreditadas separadas, resalta en riesgo y muestra la regla', async () => {
    vi.mocked(getEstudiantesAsociacion).mockResolvedValue({
      semestre: SEMESTRE,
      filas: [fila(1), fila(2, { enRiesgo: true })],
      siguienteCursor: null,
    });
    montar();

    expect(await screen.findByRole('heading', { level: 1, name: 'AEC' })).toBeInTheDocument();
    const tabla = await screen.findByRole('table', { name: /estudiante de la asociación/i });
    expect(within(tabla).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Estudiante',
      'Horas beca',
      'Horas de extensión',
      'Proyectos activos',
    ]);
    const filas = within(tabla).getAllByRole('row');
    expect(within(filas[1]).getAllByText('Declaradas')).toHaveLength(2);
    expect(within(filas[1]).getAllByText('Acreditadas')).toHaveLength(2);
    expect(within(filas[1]).getByText(/4\.º semestre/)).toBeInTheDocument();
    expect(within(filas[1]).queryByText('En riesgo')).toBeNull();
    expect(within(filas[2]).getByText('En riesgo')).toHaveClass('pill');
    expect(screen.getByText(/más de 20 puntos por debajo de lo esperado/)).toBeVisible();
    expect(screen.queryByText(/tel[eé]fono/i)).toBeNull();
  });

  it('el título muestra solo el nombre, sin anteponer «Asociación» (FIX-A1)', async () => {
    vi.mocked(getEstudiantesAsociacion).mockResolvedValue({ semestre: SEMESTRE, filas: [], siguienteCursor: null });
    montar([{ idAsociacion: 7, nombre: 'Asociación de Estudiantes de Computación', logoUrl: null, cargo: 'PRESIDENTE', nivelPermiso: 'ADMINISTRADOR' }]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Asociación de Estudiantes de Computación' })).toBeInTheDocument();
  });

  it('el estudiante sin metas se rotula con texto claro en vez de «—» (FIX-A2)', async () => {
    vi.mocked(getEstudiantesAsociacion).mockResolvedValue({ semestre: SEMESTRE, filas: [fila(1, { metaBeca: null, becaDeclarada: 0, becaAcreditada: 0, faltaBeca: null })], siguienteCursor: null });
    montar();
    const tabla = await screen.findByRole('table', { name: /estudiante de la asociación/i });
    expect(within(tabla).getAllByText('Aún no registra sus metas del semestre')).toHaveLength(2);
    expect(within(tabla).queryByText('—')).toBeNull();
  });

  it('los filtros llegan al servidor: en riesgo, tipo de horas y búsqueda', async () => {
    vi.mocked(getEstudiantesAsociacion).mockResolvedValue({ semestre: SEMESTRE, filas: [fila(1)], siguienteCursor: null });
    montar();
    await screen.findByRole('table', { name: /estudiante de la asociación/i });

    fireEvent.click(screen.getByRole('switch', { name: 'En riesgo' }));
    await waitFor(() => expect(getEstudiantesAsociacion).toHaveBeenLastCalledWith(7, { enRiesgo: true }, undefined));

    fireEvent.click(screen.getByRole('radio', { name: 'Beca' }));
    await waitFor(() => expect(getEstudiantesAsociacion).toHaveBeenLastCalledWith(7, { enRiesgo: true, tipo: 'BECA' }, undefined));
    const tabla = await screen.findByRole('table', { name: /estudiante de la asociación/i });
    expect(within(tabla).queryByText('Horas de extensión')).toBeNull();

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'ana' } });
    await waitFor(() => expect(getEstudiantesAsociacion).toHaveBeenLastCalledWith(7, { enRiesgo: true, tipo: 'BECA', busqueda: 'ana' }, undefined));
  });

  it('carga incremental con el cursor', async () => {
    vi.mocked(getEstudiantesAsociacion)
      .mockResolvedValueOnce({ semestre: SEMESTRE, filas: [fila(1)], siguienteCursor: 1 })
      .mockResolvedValueOnce({ semestre: SEMESTRE, filas: [fila(2)], siguienteCursor: null });
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(screen.getByText('Nombre2 Apellido')).toBeInTheDocument());
    expect(getEstudiantesAsociacion).toHaveBeenLastCalledWith(7, {}, 1);
  });

  it('los reportes descargan con los filtros activos; el de en riesgo fuerza enRiesgo', async () => {
    vi.mocked(getEstudiantesAsociacion).mockResolvedValue({ semestre: SEMESTRE, filas: [fila(1)], siguienteCursor: null });
    const blob = new Blob(['x']);
    vi.mocked(descargarEstudiantesAsociacion).mockResolvedValue(blob);
    montar();
    await screen.findByRole('table', { name: /estudiante de la asociación/i });

    fireEvent.click(screen.getByRole('button', { name: 'Estudiantes CSV' }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(blob, 'estudiantes-2026-2.csv'));
    expect(descargarEstudiantesAsociacion).toHaveBeenLastCalledWith(7, 'csv', {});

    fireEvent.click(screen.getByRole('button', { name: 'En riesgo PDF' }));
    await waitFor(() => expect(descargarEstudiantesAsociacion).toHaveBeenLastCalledWith(7, 'pdf', { enRiesgo: true }));
  });

  it('la pestaña Proyectos muestra avance de tareas y sprints, integrantes y horas', async () => {
    vi.mocked(getEstudiantesAsociacion).mockResolvedValue({ semestre: SEMESTRE, filas: [], siguienteCursor: null });
    montar();
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Proyectos' }), { button: 0 });
    fireEvent.click(screen.getByRole('tab', { name: 'Proyectos' }));
    const tabla = await screen.findByRole('table', { name: /Proyectos publicados a nombre de la asociación/ });
    expect(within(tabla).getByText('Feria de Ciencias')).toBeInTheDocument();
    expect(within(tabla).getByText(/Tareas:/)).toHaveTextContent('40 %');
    expect(within(tabla).getByText(/Sprints:/)).toHaveTextContent('50 %');
    expect(within(tabla).getByText('12 h')).toBeInTheDocument();
  });

  it('quien no es de la junta no ve datos', async () => {
    vi.mocked(getEstudiantesAsociacion).mockRejectedValue(new Error('403'));
    montar([]);
    expect(await screen.findByText('No perteneces a la junta de esta asociación')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(getEstudiantesAsociacion).not.toHaveBeenCalled();
  });
});
