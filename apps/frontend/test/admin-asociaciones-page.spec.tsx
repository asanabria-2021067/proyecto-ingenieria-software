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

vi.mock('../hooks/use-can', () => ({ useRequireCan: () => ({ permitido: true, denegado: false, verificando: false }) }));
vi.mock('../lib/services/catalogs', () => ({ getCarreras: vi.fn() }));
vi.mock('../lib/services/asociaciones', () => ({
  getAsociacionesAdmin: vi.fn(),
  crearAsociacion: vi.fn(),
  actualizarAsociacion: vi.fn(),
  asignarJunta: vi.fn(),
  actualizarJunta: vi.fn(),
  quitarJunta: vi.fn(),
}));
vi.mock('../lib/services/admin', () => ({ listAdminUsers: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 8, totalPages: 0 }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AdminAsociacionesPage from '../app/dashboard/admin/asociaciones/page';
import { actualizarAsociacion, actualizarJunta, crearAsociacion, getAsociacionesAdmin, type AsociacionAdmin } from '../lib/services/asociaciones';
import { getCarreras } from '../lib/services/catalogs';

const asociacion = (p: Partial<AsociacionAdmin> = {}): AsociacionAdmin => ({
  idAsociacion: 7,
  nombre: 'AEC',
  descripcion: null,
  logoUrl: null,
  archivada: false,
  carreras: [{ carrera: { idCarrera: 1, nombreCarrera: 'Computación' } }],
  junta: [
    {
      idJuntaAsociacion: 1,
      idUsuario: 10,
      cargo: 'PRESIDENTE',
      nivelPermiso: 'ADMINISTRADOR',
      usuario: { idUsuario: 10, nombre: 'Carlos', apellido: 'Mendoza', correo: 'carlos@uvg.edu.gt' },
    },
  ],
  ...p,
});

function montar(lista: AsociacionAdmin[]) {
  vi.mocked(getAsociacionesAdmin).mockResolvedValue(lista);
  vi.mocked(getCarreras).mockResolvedValue([
    { idCarrera: 1, nombreCarrera: 'Computación', facultad: 'Ingeniería' },
    { idCarrera: 2, nombreCarrera: 'Industrial', facultad: 'Ingeniería' },
  ]);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminAsociacionesPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ASO: gestión de asociaciones y juntas en el panel admin', () => {
  it('lista asociaciones con carreras y junta', async () => {
    montar([asociacion()]);
    expect(await screen.findByRole('heading', { level: 2, name: 'AEC' })).toBeInTheDocument();
    expect(screen.getByText(/Carreras: Computación/)).toBeInTheDocument();
    const tabla = screen.getByRole('table', { name: 'Junta directiva de AEC' });
    expect(within(tabla).getByText('Carlos Mendoza')).toBeInTheDocument();
    expect(within(tabla).getByRole('combobox', { name: 'Cargo de Carlos Mendoza' })).toHaveValue('PRESIDENTE');
  });

  it('crea una asociación con nombre y carreras', async () => {
    vi.mocked(crearAsociacion).mockResolvedValue(asociacion());
    montar([]);
    fireEvent.click(await screen.findByRole('button', { name: /Nueva asociación/ }));
    const dialogo = await screen.findByRole('dialog');

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(/al menos 3 caracteres/);

    fireEvent.change(within(dialogo).getByLabelText('Nombre'), { target: { value: 'Asociación Industrial' } });
    fireEvent.click(await within(dialogo).findByRole('checkbox', { name: 'Industrial' }));
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(crearAsociacion).toHaveBeenCalledWith({ nombre: 'Asociación Industrial', descripcion: undefined, idsCarreras: [2] }));
  });

  it('cambia el nivel de permiso de un integrante', async () => {
    vi.mocked(actualizarJunta).mockResolvedValue(asociacion().junta[0]);
    montar([asociacion()]);
    const nivel = await screen.findByRole('combobox', { name: 'Nivel de permiso de Carlos Mendoza' });
    fireEvent.change(nivel, { target: { value: 'LECTURA' } });
    await waitFor(() => expect(actualizarJunta).toHaveBeenCalledWith(7, 10, { nivelPermiso: 'LECTURA' }));
  });

  it('archivar pide confirmación; una archivada solo ofrece restaurar', async () => {
    vi.mocked(actualizarAsociacion).mockResolvedValue(asociacion({ archivada: true }));
    montar([asociacion()]);
    fireEvent.click(await screen.findByRole('button', { name: 'Archivar AEC' }));
    const confirmar = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmar).getByRole('button', { name: 'Archivar' }));
    await waitFor(() => expect(actualizarAsociacion).toHaveBeenCalledWith(7, { archivada: true }));

    cleanup();
    montar([asociacion({ archivada: true })]);
    expect(await screen.findByRole('button', { name: 'Restaurar AEC' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nombrar integrante/ })).toBeNull();
  });
});
