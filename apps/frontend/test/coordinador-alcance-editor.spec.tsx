import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** ROL-2: editor del alcance del coordinador en el detalle de usuario (solo administración). */

vi.mock('../lib/services/coordinador', () => ({
  getAlcanceCoordinador: vi.fn(),
  guardarAlcanceCoordinador: vi.fn(),
}));
vi.mock('../lib/services/catalogs', () => ({ getCarreras: vi.fn() }));
vi.mock('../lib/swal', () => ({ default: { fire: vi.fn() } }));

import { CoordinadorAlcanceEditor } from '../components/admin/CoordinadorAlcanceEditor';
import { getCarreras } from '../lib/services/catalogs';
import { getAlcanceCoordinador, guardarAlcanceCoordinador, type AlcanceCoordinador } from '../lib/services/coordinador';
import uvgSwal from '../lib/swal';

const REGLA = 'Regla de alcance de prueba.';
const CARRERAS = [
  { idCarrera: 1, nombreCarrera: 'Ciencias de la Computación', facultad: 'Ingeniería' },
  { idCarrera: 2, nombreCarrera: 'Ingeniería Civil', facultad: 'Ingeniería' },
  { idCarrera: 3, nombreCarrera: 'Psicología', facultad: 'Humanidades' },
];
const SIN_ALCANCE: AlcanceCoordinador = { idUsuario: 7, carreraIds: [], facultades: [], carreras: [], regla: REGLA };

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CoordinadorAlcanceEditor idUsuario={7} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(getCarreras).mockResolvedValue(CARRERAS);
  vi.mocked(getAlcanceCoordinador).mockResolvedValue(SIN_ALCANCE);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('editor de alcance del coordinador', () => {
  it('muestra la regla y avisa cuando no hay alcance asignado', async () => {
    renderEditor();

    expect(await screen.findByText(REGLA)).toBeInTheDocument();
    expect(screen.getByText(/Sin alcance asignado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar alcance' })).toBeDisabled();
  });

  it('muestra el alcance actual con sus carreras marcadas', async () => {
    vi.mocked(getAlcanceCoordinador).mockResolvedValue({
      ...SIN_ALCANCE,
      carreraIds: [3],
      carreras: [CARRERAS[2]],
    });
    renderEditor();

    const actual = await screen.findByRole('list', { name: 'Carreras del alcance actual' });
    expect(actual).toHaveTextContent('Psicología');
    expect(screen.getByRole('checkbox', { name: 'Psicología' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Ingeniería Civil' })).not.toBeChecked();
  });

  it('guarda carreras sueltas tras confirmar', async () => {
    vi.mocked(guardarAlcanceCoordinador).mockResolvedValue({
      ...SIN_ALCANCE,
      carreraIds: [1, 3],
      carreras: [CARRERAS[0], CARRERAS[2]],
    });
    renderEditor();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Ciencias de la Computación' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Psicología' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar alcance' }));

    // Confirmación antes de escribir.
    expect(guardarAlcanceCoordinador).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Guardar alcance' }).at(-1) as HTMLElement);

    await waitFor(() => expect(guardarAlcanceCoordinador).toHaveBeenCalledWith(7, { carreraIds: [1, 3], facultades: [] }));
    await waitFor(() => expect(uvgSwal.fire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'success' })));
  });

  it('una facultad completa cubre sus carreras y no se envían aparte', async () => {
    vi.mocked(guardarAlcanceCoordinador).mockResolvedValue({
      ...SIN_ALCANCE,
      facultades: ['Ingeniería'],
      carreras: [CARRERAS[0], CARRERAS[1]],
    });
    renderEditor();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Ciencias de la Computación' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Facultad completa: Ingeniería' }));
    expect(screen.getByRole('checkbox', { name: 'Ingeniería Civil' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Ingeniería Civil' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar alcance' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Guardar alcance' }).at(-1) as HTMLElement);

    await waitFor(() => expect(guardarAlcanceCoordinador).toHaveBeenCalledWith(7, { carreraIds: [], facultades: ['Ingeniería'] }));
  });

  it('cancelar la confirmación no escribe nada', async () => {
    renderEditor();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Psicología' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar alcance' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(guardarAlcanceCoordinador).not.toHaveBeenCalled();
  });

  it('si el servidor rechaza el alcance lo avisa', async () => {
    vi.mocked(guardarAlcanceCoordinador).mockRejectedValue(new Error('rechazado'));
    renderEditor();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Psicología' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar alcance' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Guardar alcance' }).at(-1) as HTMLElement);

    await waitFor(() => expect(uvgSwal.fire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'error' })));
  });
});
