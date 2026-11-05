import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/services/asociaciones', () => ({
  contarDestinatariosAviso: vi.fn(),
  enviarAvisoAsociacion: vi.fn(),
}));
const mensajes = vi.hoisted(() => ({ aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() } }));
vi.mock('../lib/mensajes', () => mensajes);

import { AvisoEstudiantes } from '../components/associations/aviso-estudiantes';
import { contarDestinatariosAviso, enviarAvisoAsociacion } from '../lib/services/asociaciones';

function montar(puedeEnviar = true, filtros = { enRiesgo: true, tipo: 'BECA' as const }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AvisoEstudiantes idAsociacion={7} filtros={filtros} puedeEnviar={puedeEnviar} />
    </QueryClientProvider>,
  );
}

const abrir = () => fireEvent.click(screen.getByRole('button', { name: 'Enviar aviso a estos estudiantes' }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MEJ-161: aviso a los estudiantes de la lista filtrada', () => {
  it('quien no es Presidente ni Editor no ve el botón y no consulta nada', () => {
    montar(false);
    expect(screen.queryByRole('button', { name: 'Enviar aviso a estos estudiantes' })).toBeNull();
    expect(contarDestinatariosAviso).not.toHaveBeenCalled();
  });

  it('el diálogo muestra a cuántos estudiantes se enviará según los filtros activos', async () => {
    vi.mocked(contarDestinatariosAviso).mockResolvedValue({ cantidad: 12, maximo: 500 });
    montar();
    expect(contarDestinatariosAviso).not.toHaveBeenCalled();
    abrir();
    expect(await screen.findByText('Se enviará a 12 estudiantes.')).toBeInTheDocument();
    expect(contarDestinatariosAviso).toHaveBeenCalledWith(7, { enRiesgo: true, tipo: 'BECA' });
    expect(screen.getByRole('button', { name: 'Enviar a 12 estudiantes' })).toBeDisabled();
  });

  it('confirma con el mensaje y la cantidad vista; el cliente no manda ids de estudiantes', async () => {
    vi.mocked(contarDestinatariosAviso).mockResolvedValue({ cantidad: 12, maximo: 500 });
    vi.mocked(enviarAvisoAsociacion).mockResolvedValue({ idAnuncio: 4, destinatarios: 12 });
    montar();
    abrir();
    await screen.findByText('Se enviará a 12 estudiantes.');
    fireEvent.change(screen.getByLabelText('Mensaje'), { target: { value: '  Registren sus horas  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a 12 estudiantes' }));

    await waitFor(() => expect(enviarAvisoAsociacion).toHaveBeenCalledTimes(1));
    expect(enviarAvisoAsociacion).toHaveBeenCalledWith(7, { mensaje: 'Registren sus horas', filtros: { enRiesgo: true, tipo: 'BECA' }, cantidadEsperada: 12 });
    await waitFor(() => expect(mensajes.aviso.exito).toHaveBeenCalledWith('Aviso enviado', 'Llegó a 12 estudiantes.'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('sin mensaje no se puede enviar', async () => {
    vi.mocked(contarDestinatariosAviso).mockResolvedValue({ cantidad: 1, maximo: 500 });
    montar();
    abrir();
    expect(await screen.findByText('Se enviará a 1 estudiante.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar a 1 estudiante' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Mensaje'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Enviar a 1 estudiante' })).toBeDisabled();
  });

  it('sin estudiantes en la lista o por encima del máximo no se envía', async () => {
    vi.mocked(contarDestinatariosAviso).mockResolvedValue({ cantidad: 0, maximo: 500 });
    const { unmount } = montar();
    abrir();
    expect(await screen.findByText('Ningún estudiante coincide con los filtros actuales.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mensaje'), { target: { value: 'Hola' } });
    expect(screen.getByRole('button', { name: 'Enviar aviso' })).toBeDisabled();
    unmount();

    vi.mocked(contarDestinatariosAviso).mockResolvedValue({ cantidad: 900, maximo: 500 });
    montar();
    abrir();
    expect(await screen.findByText('La lista tiene 900 estudiantes y el máximo es 500. Acota los filtros.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mensaje'), { target: { value: 'Hola' } });
    expect(screen.getByRole('button', { name: 'Enviar a 900 estudiantes' })).toBeDisabled();
  });

  it('un rechazo del servidor (límite diario) se muestra y el diálogo sigue abierto', async () => {
    vi.mocked(contarDestinatariosAviso).mockResolvedValue({ cantidad: 2, maximo: 500 });
    vi.mocked(enviarAvisoAsociacion).mockRejectedValue(Object.assign(new Error('La asociación ya envió el máximo de avisos de hoy. Inténtalo mañana'), { status: 429 }));
    montar();
    abrir();
    await screen.findByText('Se enviará a 2 estudiantes.');
    fireEvent.change(screen.getByLabelText('Mensaje'), { target: { value: 'Hola' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a 2 estudiantes' }));
    await waitFor(() => expect(mensajes.aviso.error).toHaveBeenCalled());
    expect(mensajes.aviso.error.mock.calls[0][0]).toBe('No se pudo enviar el aviso');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
