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

vi.mock('../lib/services/horas-semestre', () => ({
  getHorasActual: vi.fn(),
  getHorasCentral: vi.fn(),
  getHorasTotales: vi.fn(),
  getHorasComparativo: vi.fn(),
  getResumenAsociaciones: vi.fn(),
  getAsociacionesAdmin: vi.fn(),
  descargarHorasCentral: vi.fn(),
}));
vi.mock('../lib/services/catalogs', () => ({ getCarreras: vi.fn() }));
vi.mock('../lib/download-file', () => ({ downloadBlob: vi.fn() }));

import AdminHorasPage from '../app/dashboard/admin/horas/page';
import { downloadBlob } from '../lib/download-file';
import { getCarreras } from '../lib/services/catalogs';
import {
  descargarHorasCentral,
  getAsociacionesAdmin,
  getHorasActual,
  getHorasCentral,
  getHorasComparativo,
  getHorasTotales,
  type FilaHorasCentral,
} from '../lib/services/horas-semestre';

const SEMESTRE = { anio: 2026, periodo: 2 as const, inicio: '2026-07-01', fin: '2026-12-31' };

const fila = (idUsuario: number, p: Partial<FilaHorasCentral> = {}): FilaHorasCentral => ({
  idUsuario,
  nombre: `Nombre${idUsuario}`,
  apellido: 'Apellido',
  carne: `2410${idUsuario}`,
  idCarrera: 1,
  carrera: 'Ciencias de la Computación',
  metaBeca: 100,
  becaDeclarada: 10,
  becaAcreditada: 25,
  faltaBeca: 65,
  metaExtension: null,
  extensionDeclarada: 0,
  extensionAcreditada: 0,
  faltaExtension: null,
  enRiesgo: false,
  ...p,
});

function montar() {
  vi.mocked(getHorasActual).mockResolvedValue({ semestre: SEMESTRE, registro: null, necesitaRegistro: false });
  vi.mocked(getCarreras).mockResolvedValue([{ idCarrera: 1, nombreCarrera: 'Ciencias de la Computación', facultad: 'Ingeniería' }]);
  vi.mocked(getAsociacionesAdmin).mockResolvedValue([
    { idAsociacion: 7, nombre: 'Asociación CC', archivada: false, carreras: [{ carrera: { idCarrera: 1, nombreCarrera: 'CC' } }] },
  ]);
  vi.mocked(getHorasComparativo).mockResolvedValue({ semestres: [] });
  vi.mocked(getHorasTotales).mockResolvedValue({
    semestre: SEMESTRE,
    porCarrera: [
      {
        idCarrera: 1,
        carrera: 'Ciencias de la Computación',
        estudiantes: 3,
        enRiesgo: 1,
        metaBeca: 300,
        becaDeclarada: 30,
        becaAcreditada: 75,
        faltaBeca: 195,
        metaExtension: 0,
        extensionDeclarada: 0,
        extensionAcreditada: 0,
        faltaExtension: 0,
      },
    ],
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminHorasPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('HRS: vista central de horas del admin', () => {
  it('muestra la tabla con declaradas y acreditadas separadas y el aviso de riesgo', async () => {
    vi.mocked(getHorasCentral).mockResolvedValue({
      semestre: SEMESTRE,
      filas: [fila(1), fila(2, { enRiesgo: true })],
      siguienteCursor: null,
    });
    montar();

    expect(screen.getByRole('heading', { level: 1, name: 'Horas por semestre' })).toBeInTheDocument();
    const tabla = await screen.findByRole('table', { name: /por estudiante/i });
    expect(within(tabla).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Estudiante',
      'Horas beca',
      'Horas de extensión',
    ]);
    const filas = within(tabla).getAllByRole('row');
    expect(filas).toHaveLength(3);
    expect(within(filas[1]).getAllByText('Declaradas')).toHaveLength(2);
    expect(within(filas[1]).getAllByText('Acreditadas')).toHaveLength(2);
    expect(within(filas[1]).getByText('25 h')).toBeInTheDocument();
    expect(within(filas[1]).queryByText('En riesgo')).toBeNull();
    expect(within(filas[2]).getByText('En riesgo')).toHaveClass('pill');
    expect(screen.getByText(/Mostrando 2 estudiantes\./)).toBeInTheDocument();
  });

  it('totales por asociacion a partir de las carreras que representa', async () => {
    vi.mocked(getHorasCentral).mockResolvedValue({ semestre: SEMESTRE, filas: [fila(1)], siguienteCursor: null });
    montar();
    const tabla = await screen.findByRole('table', { name: /Totales de horas del semestre por asociación/ });
    const celdas = within(within(tabla).getAllByRole('row')[1]).getAllByRole('cell');
    expect(celdas[0]).toHaveTextContent('Asociación CC');
    expect(celdas[1]).toHaveTextContent('3');
    expect(celdas[2]).toHaveTextContent('1');
    expect(celdas[4]).toHaveTextContent('75 h');
  });

  it('carga incremental: Cargar más pide la siguiente pagina con el cursor', async () => {
    vi.mocked(getHorasCentral)
      .mockResolvedValueOnce({ semestre: SEMESTRE, filas: [fila(1)], siguienteCursor: 1 })
      .mockResolvedValueOnce({ semestre: SEMESTRE, filas: [fila(2)], siguienteCursor: null });
    montar();

    fireEvent.click(await screen.findByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(screen.getByText('Nombre2 Apellido')).toBeInTheDocument());
    expect(screen.getByText('Nombre1 Apellido')).toBeInTheDocument();
    expect(getHorasCentral).toHaveBeenLastCalledWith({}, 1);
    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();
  });

  it('el filtro En riesgo vuelve a consultar con enRiesgo', async () => {
    vi.mocked(getHorasCentral).mockResolvedValue({ semestre: SEMESTRE, filas: [fila(1)], siguienteCursor: null });
    montar();
    await screen.findByRole('table', { name: /por estudiante/i });

    fireEvent.click(screen.getByRole('switch', { name: 'En riesgo' }));
    await waitFor(() => expect(getHorasCentral).toHaveBeenLastCalledWith({ enRiesgo: true }, undefined));
    expect(getHorasTotales).toHaveBeenLastCalledWith({ enRiesgo: true });
  });

  it('la asociacion llega al servidor, a la lista, a los totales y a los reportes', async () => {
    vi.mocked(getHorasCentral).mockResolvedValue({ semestre: SEMESTRE, filas: [fila(1)], siguienteCursor: null });
    vi.mocked(descargarHorasCentral).mockResolvedValue(new Blob(['x']));
    montar();
    await screen.findByRole('table', { name: /por estudiante/i });

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Asociación' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'Asociación CC' }));
    await waitFor(() => expect(getHorasCentral).toHaveBeenLastCalledWith({ idAsociacion: 7 }, undefined));
    expect(getHorasTotales).toHaveBeenLastCalledWith({ idAsociacion: 7 });
    await screen.findByRole('table', { name: /por estudiante/i });
    fireEvent.click(screen.getByRole('button', { name: 'Descargar CSV' }));
    await waitFor(() => expect(descargarHorasCentral).toHaveBeenCalledWith('csv', { idAsociacion: 7 }));
  });

  it('CSV y PDF descargan con los filtros activos', async () => {
    vi.mocked(getHorasCentral).mockResolvedValue({ semestre: SEMESTRE, filas: [fila(1)], siguienteCursor: null });
    const blob = new Blob(['x']);
    vi.mocked(descargarHorasCentral).mockResolvedValue(blob);
    montar();
    await screen.findByRole('table', { name: /por estudiante/i });

    fireEvent.click(screen.getByRole('switch', { name: 'En riesgo' }));
    await waitFor(() => expect(getHorasCentral).toHaveBeenLastCalledWith({ enRiesgo: true }, undefined));
    await screen.findByRole('table', { name: /por estudiante/i });
    fireEvent.click(screen.getByRole('button', { name: 'Descargar CSV' }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(blob, 'horas-2026-2.csv'));
    expect(descargarHorasCentral).toHaveBeenCalledWith('csv', { enRiesgo: true });

    fireEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(blob, 'horas-2026-2.pdf'));
  });

  it('avisa si el reporte falla', async () => {
    vi.mocked(getHorasCentral).mockResolvedValue({ semestre: SEMESTRE, filas: [fila(1)], siguienteCursor: null });
    vi.mocked(descargarHorasCentral).mockRejectedValue(new Error('x'));
    montar();
    await screen.findByRole('table', { name: /por estudiante/i });
    fireEvent.click(screen.getByRole('button', { name: 'Descargar CSV' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/No pudimos generar el reporte/);
  });

  it('estado vacio con accion para quitar filtros', async () => {
    vi.mocked(getHorasCentral).mockResolvedValue({ semestre: SEMESTRE, filas: [], siguienteCursor: null });
    montar();
    expect(await screen.findByText('Ningún estudiante coincide con estos filtros')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar filtros' })).toBeInTheDocument();
  });

  it('error con reintento', async () => {
    vi.mocked(getHorasCentral).mockRejectedValueOnce(new Error('boom'));
    montar();
    expect(await screen.findByText('No pudimos cargar las horas')).toBeInTheDocument();
    vi.mocked(getHorasCentral).mockResolvedValue({ semestre: SEMESTRE, filas: [fila(1)], siguienteCursor: null });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table', { name: /por estudiante/i })).toBeInTheDocument();
  });
});
