import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/services/horas', () => ({
  getDesgloseHoras: vi.fn(),
  cerrarParticipacion: vi.fn(),
}));

import { CerrarParticipacionDialog } from '../components/projects/cerrar-participacion-dialog';
import { getDesgloseHoras, cerrarParticipacion } from '../lib/services/horas';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

const desgloseBase = {
  idParticipacion: 100,
  usuario: { nombre: 'Ana', apellido: 'Lopez' },
  horasCalculadas: 8,
  tareas: [{ idTarea: 1, tituloTarea: 'Implementar login', horas: 8 }],
};

describe('CerrarParticipacionDialog', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('muestra loading mientras carga el desglose', () => {
    (getDesgloseHoras as any).mockReturnValue(new Promise(() => {}));
    const { wrapper } = createWrapper();

    render(
      createElement(CerrarParticipacionDialog, {
        open: true,
        onOpenChange: vi.fn(),
        idProyecto: 1,
        idParticipacion: 100,
        nombreCompleto: 'Ana Lopez',
      }),
      { wrapper },
    );

    expect(document.querySelector('.animate-spin, [class*="spinner"], svg')).toBeTruthy();
  });

  it('muestra un mensaje de error si falla la carga del desglose', async () => {
    (getDesgloseHoras as any).mockRejectedValue(new Error('fallo'));
    const { wrapper } = createWrapper();

    render(
      createElement(CerrarParticipacionDialog, {
        open: true,
        onOpenChange: vi.fn(),
        idProyecto: 1,
        idParticipacion: 100,
        nombreCompleto: 'Ana Lopez',
      }),
      { wrapper },
    );

    await waitFor(() =>
      expect(screen.getByText(/no se pudo cargar el desglose/i)).toBeInTheDocument(),
    );
  });

  it('estado vacío: sin tareas completadas muestra el mensaje correspondiente', async () => {
    (getDesgloseHoras as any).mockResolvedValue({ ...desgloseBase, horasCalculadas: 0, tareas: [] });
    const { wrapper } = createWrapper();

    render(
      createElement(CerrarParticipacionDialog, {
        open: true,
        onOpenChange: vi.fn(),
        idProyecto: 1,
        idParticipacion: 100,
        nombreCompleto: 'Ana Lopez',
      }),
      { wrapper },
    );

    await waitFor(() =>
      expect(screen.getByText(/no hay tareas completadas/i)).toBeInTheDocument(),
    );
  });

  it('cierre sin ajuste llama a cerrarParticipacion sin horasReconocidas/justificacion', async () => {
    (getDesgloseHoras as any).mockResolvedValue(desgloseBase);
    (cerrarParticipacion as any).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const onOpenChange = vi.fn();

    render(
      createElement(CerrarParticipacionDialog, {
        open: true,
        onOpenChange,
        idProyecto: 1,
        idParticipacion: 100,
        nombreCompleto: 'Ana Lopez',
      }),
      { wrapper },
    );

    await waitFor(() => expect(screen.getByText('Horas calculadas (tareas completadas)')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /confirmar cierre/i }));

    await waitFor(() =>
      expect(cerrarParticipacion).toHaveBeenCalledWith(1, 100, {
        horasReconocidas: undefined,
        justificacion: undefined,
      }),
    );
  });

  it('ajuste con justificación válida se envía correctamente', async () => {
    (getDesgloseHoras as any).mockResolvedValue(desgloseBase);
    (cerrarParticipacion as any).mockResolvedValue({});
    const { wrapper } = createWrapper();

    render(
      createElement(CerrarParticipacionDialog, {
        open: true,
        onOpenChange: vi.fn(),
        idProyecto: 1,
        idParticipacion: 100,
        nombreCompleto: 'Ana Lopez',
      }),
      { wrapper },
    );

    await waitFor(() => expect(screen.getByText('Horas calculadas (tareas completadas)')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/ajustar el valor final/i));
    fireEvent.change(screen.getByLabelText('Horas reconocidas'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Justificación'), {
      target: { value: 'Ausencia justificada por certificado médico' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirmar cierre/i }));

    await waitFor(() =>
      expect(cerrarParticipacion).toHaveBeenCalledWith(1, 100, {
        horasReconocidas: 6,
        justificacion: 'Ausencia justificada por certificado médico',
      }),
    );
  });

  it('previene doble submit: el botón se deshabilita mientras la mutación está en curso', async () => {
    (getDesgloseHoras as any).mockResolvedValue(desgloseBase);
    let resolveMutation: () => void = () => {};
    (cerrarParticipacion as any).mockReturnValue(
      new Promise((resolve) => {
        resolveMutation = () => resolve({});
      }),
    );
    const { wrapper } = createWrapper();

    render(
      createElement(CerrarParticipacionDialog, {
        open: true,
        onOpenChange: vi.fn(),
        idProyecto: 1,
        idParticipacion: 100,
        nombreCompleto: 'Ana Lopez',
      }),
      { wrapper },
    );

    await waitFor(() => expect(screen.getByText('Horas calculadas (tareas completadas)')).toBeInTheDocument());
    const boton = screen.getByRole('button', { name: /confirmar cierre/i });
    fireEvent.click(boton);

    await waitFor(() => expect(boton).toBeDisabled());
    expect(cerrarParticipacion).toHaveBeenCalledTimes(1);

    resolveMutation();
  });
});
