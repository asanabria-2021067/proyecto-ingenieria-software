import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** MEJ-105 (baja de integrante con motivo) y MEJ-104 (carga del equipo), contra el contrato del backend. */

vi.mock('../lib/services/equipo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/services/equipo')>()),
  darDeBajaIntegrante: vi.fn(),
  getCargaEquipo: vi.fn(),
}));
vi.mock('../lib/swal', () => ({ default: { fire: vi.fn() } }));

import { BajaIntegranteDialog } from '../components/projects/baja-integrante-dialog';
import { CargaEquipoPanel } from '../components/projects/carga-equipo-panel';
import { darDeBajaIntegrante, getCargaEquipo } from '../lib/services/equipo';

function conCliente(ui: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PERSONA = { idUsuario: 9, nombre: 'Ana', apellido: 'Pérez' };

describe('diálogo de baja', () => {
  it('no se muestra sin integrante elegido', () => {
    conCliente(<BajaIntegranteDialog idProyecto={3} integrante={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('el motivo es obligatorio: sin 10 caracteres el botón sigue desactivado', () => {
    conCliente(<BajaIntegranteDialog idProyecto={3} integrante={PERSONA} onClose={vi.fn()} />);

    const boton = screen.getByRole('button', { name: 'Dar de baja' });
    expect(boton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motivo de la baja (obligatorio)'), { target: { value: '   corto   ' } });
    expect(boton).toBeDisabled();
    expect(darDeBajaIntegrante).not.toHaveBeenCalled();
  });

  it('con motivo válido envía el motivo limpio y cierra', async () => {
    vi.mocked(darDeBajaIntegrante).mockResolvedValue({
      idProyecto: 3,
      idUsuario: 9,
      estadoParticipacion: 'RETIRADO',
      participacionesRetiradas: 1,
      tareasSinAsignar: 2,
      fechaSalida: '2026-11-04',
    });
    const onClose = vi.fn();
    conCliente(<BajaIntegranteDialog idProyecto={3} integrante={PERSONA} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Motivo de la baja (obligatorio)'), { target: { value: 'No  responde   hace semanas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dar de baja' }));

    await waitFor(() => expect(darDeBajaIntegrante).toHaveBeenCalledWith(3, 9, 'No responde hace semanas'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('si el servidor rechaza la baja muestra el error y no cierra', async () => {
    vi.mocked(darDeBajaIntegrante).mockRejectedValue(new Error('rechazada'));
    const onClose = vi.fn();
    conCliente(<BajaIntegranteDialog idProyecto={3} integrante={PERSONA} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Motivo de la baja (obligatorio)'), { target: { value: 'Motivo suficientemente largo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dar de baja' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('diálogo de baja: mensajes y limpieza', () => {
  it('un 403 muestra el mensaje del backend, sin hablar de administrador', async () => {
    const error = Object.assign(new Error('Este proyecto o estudiante está fuera de tu alcance'), { statusCode: 403 });
    vi.mocked(darDeBajaIntegrante).mockRejectedValue(error);
    conCliente(<BajaIntegranteDialog idProyecto={3} integrante={PERSONA} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Motivo de la baja (obligatorio)'), { target: { value: 'Motivo suficientemente largo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dar de baja' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('fuera de tu alcance');
    expect(screen.getByRole('alert')).not.toHaveTextContent('permisos de administrador');
  });

  it('cancelar limpia el motivo escrito', () => {
    const onClose = vi.fn();
    const { rerender } = conCliente(<BajaIntegranteDialog idProyecto={3} integrante={PERSONA} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Motivo de la baja (obligatorio)'), { target: { value: 'Motivo que se descarta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalled();
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <BajaIntegranteDialog idProyecto={3} integrante={PERSONA} onClose={onClose} />
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText('Motivo de la baja (obligatorio)')).toHaveValue('');
  });
});

describe('panel de carga del equipo', () => {
  it('muestra tareas abiertas y horas de la semana y del Sprint por integrante', async () => {
    vi.mocked(getCargaEquipo).mockResolvedValue({
      semana: { desde: '2026-11-02', hasta: '2026-11-08' },
      sprintActivo: { idSprint: 4, numero: 2 },
      integrantes: [{ idUsuario: 9, nombre: 'Ana', apellido: 'Pérez', tareasAbiertas: 3, horasSemana: 4.5, horasSprint: 12 }],
    });
    conCliente(<CargaEquipoPanel idProyecto={3} />);

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Horas esta semana' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Horas en el Sprint 2' })).toBeInTheDocument();
    expect(screen.getByText(/^4[.,]5 h$/)).toBeInTheDocument();
    expect(screen.getByText('12 h')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('sin Sprint activo lo dice y sin permiso o falla avisa', async () => {
    vi.mocked(getCargaEquipo).mockResolvedValueOnce({
      semana: { desde: '2026-11-02', hasta: '2026-11-08' },
      sprintActivo: null,
      integrantes: [{ idUsuario: 9, nombre: 'Ana', apellido: 'Pérez', tareasAbiertas: 0, horasSemana: 0, horasSprint: 0 }],
    });
    conCliente(<CargaEquipoPanel idProyecto={3} />);
    expect(await screen.findByText('Sin Sprint activo')).toBeInTheDocument();
    cleanup();

    vi.mocked(getCargaEquipo).mockRejectedValueOnce(new Error('403'));
    conCliente(<CargaEquipoPanel idProyecto={4} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la carga del equipo.');
  });
});
