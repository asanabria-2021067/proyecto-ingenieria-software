import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../lib/services/asociaciones', () => ({
  getMetasAsociacion: vi.fn(),
  crearMetaAsociacion: vi.fn(),
  actualizarMetaAsociacion: vi.fn(),
  eliminarMetaAsociacion: vi.fn(),
}));
const mensajes = vi.hoisted(() => ({ aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() } }));
vi.mock('../lib/mensajes', () => mensajes);

import { AsociacionMetas } from '../components/associations/asociacion-metas';
import { actualizarMetaAsociacion, crearMetaAsociacion, eliminarMetaAsociacion, getMetasAsociacion, type MetaAsociacion } from '../lib/services/asociaciones';

const SEMESTRE = { anio: 2026, periodo: 2 as const };
const beca: MetaAsociacion = { idMeta: 1, tipo: 'BECA', porcentajeObjetivo: 80, avance: { alDia: 3, total: 4, porcentaje: 75 }, cumplida: false };
const extension: MetaAsociacion = { idMeta: 2, tipo: 'EXTENSION', porcentajeObjetivo: 50, avance: { alDia: 5, total: 6, porcentaje: 83 }, cumplida: true };

function montar(metas: MetaAsociacion[], puedeEditar = true) {
  vi.mocked(getMetasAsociacion).mockResolvedValue({ semestre: SEMESTRE, metas });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AsociacionMetas idAsociacion={7} puedeEditar={puedeEditar} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MEJ-162: metas de la asociación', () => {
  it('muestra cada meta con su barra de avance, el conteo y si está cumplida', async () => {
    montar([beca, extension]);
    const horasBeca = await screen.findByRole('listitem', { name: 'Meta de horas beca' });
    expect(within(horasBeca).getByText('80 % al día en horas beca')).toBeInTheDocument();
    expect(within(horasBeca).getByText('En camino')).toBeInTheDocument();
    expect(within(horasBeca).getByText('3 de 4 estudiantes al día (75 %). Meta: 80 %.')).toBeInTheDocument();
    expect(within(horasBeca).getByRole('progressbar', { name: 'Avance de la meta de horas beca: 75 %' })).toBeInTheDocument();
    const ext = screen.getByRole('listitem', { name: 'Meta de horas de extensión' });
    expect(within(ext).getByText('Cumplida')).toBeInTheDocument();
    expect(screen.getByText('Semestre 2 de 2026. Al día: sin riesgo en sus horas.')).toBeInTheDocument();
  });

  it('quien solo consulta no ve crear, cambiar ni quitar', async () => {
    montar([beca], false);
    await screen.findByRole('listitem', { name: 'Meta de horas beca' });
    expect(screen.queryByRole('button', { name: 'Nueva meta' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Cambiar meta/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Quitar meta/ })).toBeNull();
  });

  it('sin metas lo dice con un texto distinto según el permiso', async () => {
    const { unmount } = montar([], false);
    expect(await screen.findByText('La junta aún no define metas para este semestre.')).toBeInTheDocument();
    unmount();
    montar([], true);
    expect(await screen.findByText(/Aún no hay metas este semestre/)).toBeInTheDocument();
  });

  it('crea una meta del semestre mostrado y solo ofrece el tipo que falta', async () => {
    vi.mocked(crearMetaAsociacion).mockResolvedValue({});
    montar([beca]);
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva meta' }));
    const tipo = await screen.findByLabelText('Tipo de horas');
    expect(within(tipo).getAllByRole('option').map((o) => o.textContent)).toEqual(['Horas de extensión']);
    fireEvent.change(screen.getByLabelText('Meta (% de estudiantes al día)'), { target: { value: '70' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar meta' }));
    await waitFor(() => expect(crearMetaAsociacion).toHaveBeenCalledWith(7, { anio: 2026, periodo: 2, tipo: 'EXTENSION', porcentajeObjetivo: 70 }));
    await waitFor(() => expect(mensajes.aviso.exito).toHaveBeenCalledWith('Meta creada'));
  });

  it('rechaza un porcentaje fuera de 1 a 100 antes de enviar', async () => {
    montar([]);
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva meta' }));
    fireEvent.change(await screen.findByLabelText('Meta (% de estudiantes al día)'), { target: { value: '150' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe un número entero entre 1 y 100.');
    expect(screen.getByRole('button', { name: 'Guardar meta' })).toBeDisabled();
    expect(crearMetaAsociacion).not.toHaveBeenCalled();
  });

  it('cambia el porcentaje de una meta y la quita con confirmación', async () => {
    vi.mocked(actualizarMetaAsociacion).mockResolvedValue({});
    vi.mocked(eliminarMetaAsociacion).mockResolvedValue({});
    montar([beca]);
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar meta de horas beca' }));
    fireEvent.change(await screen.findByLabelText('Meta (% de estudiantes al día)'), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar meta' }));
    await waitFor(() => expect(actualizarMetaAsociacion).toHaveBeenCalledWith(7, 1, 90));

    fireEvent.click(await screen.findByRole('button', { name: 'Quitar meta de horas beca' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Quitar meta' }));
    await waitFor(() => expect(eliminarMetaAsociacion).toHaveBeenCalledWith(7, 1));
  });
});
