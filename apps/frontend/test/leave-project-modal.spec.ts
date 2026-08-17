import '@testing-library/jest-dom/vitest';
import { createElement, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mutateAsync = vi.fn();
const reset = vi.fn();
let isPending = false;

vi.mock('../hooks/use-exit-request', () => ({
  useCreateExitRequest: vi.fn(() => ({
    mutateAsync,
    reset,
    isPending,
  })),
}));

import { LeaveProjectModal } from '../components/projects/leave-project-modal';
import { useCreateExitRequest } from '../hooks/use-exit-request';

describe('LeaveProjectModal (F8)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    isPending = false;
  });

  it('no renderiza el formulario cuando está cerrado', () => {
    render(createElement(LeaveProjectModal, { open: false, onOpenChange: vi.fn(), idProyecto: 7 }));
    expect(screen.queryByLabelText('Motivo')).not.toBeInTheDocument();
  });

  it('muestra título, advertencia de irreversibilidad y el campo Motivo cuando está abierto', () => {
    render(createElement(LeaveProjectModal, { open: true, onOpenChange: vi.fn(), idProyecto: 7 }));

    expect(screen.getByText('Salir del proyecto')).toBeInTheDocument();
    expect(screen.getByText('Esta acción es irreversible.')).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Describe brevemente por qué deseas salir del proyecto'),
    ).toBeInTheDocument();
  });

  it('usa idProyecto para instanciar la mutation de F7', () => {
    render(createElement(LeaveProjectModal, { open: true, onOpenChange: vi.fn(), idProyecto: 7 }));
    expect(useCreateExitRequest).toHaveBeenCalledWith(7);
  });

  // ── 2. Whitespace-only ──────────────────────────────────────────────────
  it('motivo compuesto solo de espacios ("     ") muestra error visible, no abre confirmación y no llama a la mutación', async () => {
    render(createElement(LeaveProjectModal, { open: true, onOpenChange: vi.fn(), idProyecto: 7 }));

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: '     ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(screen.getByText('Describe el motivo de tu salida.')).toBeInTheDocument());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('Continuar con motivo vacío no abre la confirmación ni llama a la mutación', async () => {
    render(createElement(LeaveProjectModal, { open: true, onOpenChange: vi.fn(), idProyecto: 7 }));

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(screen.getByText('Describe el motivo de tu salida.')).toBeInTheDocument());
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('Continuar con motivo válido cierra el paso 1 y abre la confirmación explícita, sin llamar aún a la mutación', async () => {
    render(createElement(LeaveProjectModal, { open: true, onOpenChange: vi.fn(), idProyecto: 7 }));

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Cambio de proyecto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeInTheDocument());
    expect(screen.queryByLabelText('Motivo')).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  // ── 6. Cancelar en el segundo paso ──────────────────────────────────────
  it('Cancelar en la confirmación vuelve al formulario conservando el motivo, sin llamar a la mutación', async () => {
    render(createElement(LeaveProjectModal, { open: true, onOpenChange: vi.fn(), idProyecto: 7 }));

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Cambio de proyecto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Motivo')).toHaveValue('Cambio de proyecto');
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  // ── 3. Trim del payload ─────────────────────────────────────────────────
  it('confirmar llama a la mutación exactamente con { motivo } recortado (espacios exteriores fuera)', async () => {
    mutateAsync.mockResolvedValue({ idSolicitud: 1 });
    render(createElement(LeaveProjectModal, { open: true, onOpenChange: vi.fn(), idProyecto: 7 }));

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: '   Motivo real   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Salir del proyecto' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ motivo: 'Motivo real' }));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it('en éxito cierra ambos pasos, limpia el formulario y ejecuta onSuccess', async () => {
    mutateAsync.mockResolvedValue({ idSolicitud: 1 });
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    const { rerender } = render(
      createElement(LeaveProjectModal, { open: true, onOpenChange, idProyecto: 7, onSuccess }),
    );

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Cambio de proyecto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Salir del proyecto' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    // Simula que el padre reabre el modal: el formulario debe estar limpio.
    rerender(createElement(LeaveProjectModal, { open: true, onOpenChange, idProyecto: 7, onSuccess }));
    expect(screen.getByLabelText('Motivo')).toHaveValue('');
  });

  it('en fallo NO cierra el modal, NO llama onSuccess, muestra el error real y permite reintentar', async () => {
    const boom = Object.assign(new Error('Ya existe una solicitud de salida pendiente para este proyecto'), {
      statusCode: 409,
    });
    mutateAsync.mockRejectedValueOnce(boom).mockResolvedValueOnce({ idSolicitud: 1 });
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    render(createElement(LeaveProjectModal, { open: true, onOpenChange, idProyecto: 7, onSuccess }));

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Cambio de proyecto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Salir del proyecto' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Ya existe una solicitud de salida pendiente para este proyecto',
      ),
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    // El motivo se conserva para reintentar sin volver a escribirlo.
    expect(screen.getByLabelText('Motivo')).toHaveValue('Cambio de proyecto');

    // Reintento: vuelve a confirmar y esta vez resuelve.
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Salir del proyecto' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  // ── 5. Cancelación completa (paso 1) ────────────────────────────────────
  it('Cancelar en el paso 1 cierra el modal, y al reabrir el textarea está vacío, sin error y sin llamadas a la mutación', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      createElement(LeaveProjectModal, { open: true, onOpenChange, idProyecto: 7 }),
    );

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Motivo temporal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mutateAsync).not.toHaveBeenCalled();

    // El padre cierra (open=false) y vuelve a abrir.
    rerender(createElement(LeaveProjectModal, { open: false, onOpenChange, idProyecto: 7 }));
    rerender(createElement(LeaveProjectModal, { open: true, onOpenChange, idProyecto: 7 }));

    expect(screen.getByLabelText('Motivo')).toHaveValue('');
    expect(screen.queryByText('Describe el motivo de tu salida.')).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  // ── 4. Pending / doble submit ────────────────────────────────────────────
  it('mientras la mutation está pendiente, el botón de confirmación final queda disabled y dos clics rápidos producen una sola llamada a mutateAsync', async () => {
    // Mock dinámico (con estado real de React) exclusivo de este test: el
    // mock estático del módulo (arriba) no puede reflejar la transición
    // isPending=false -> true disparada por la propia mutación, así que aquí
    // se sustituye la implementación por un hook real que sí la reproduce —
    // igual que lo haría `useMutation` de TanStack Query.
    let resolveMutate!: (value: unknown) => void;
    const deferred = new Promise((resolve) => {
      resolveMutate = resolve;
    });
    const dynamicMutateAsync = vi.fn((_input: unknown) => deferred);

    (useCreateExitRequest as any).mockImplementation(() => {
      const [pending, setPending] = useState(false);
      return {
        isPending: pending,
        reset: vi.fn(),
        mutateAsync: async (input: unknown) => {
          setPending(true);
          try {
            return await dynamicMutateAsync(input);
          } finally {
            setPending(false);
          }
        },
      };
    });

    render(createElement(LeaveProjectModal, { open: true, onOpenChange: vi.fn(), idProyecto: 7 }));

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Cambio de proyecto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeInTheDocument());

    const confirmButton = screen.getByRole('button', { name: 'Salir del proyecto' });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(dynamicMutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(confirmButton).toBeDisabled());

    // Segundo clic mientras está pendiente: el botón disabled no dispara onConfirm.
    fireEvent.click(confirmButton);
    expect(dynamicMutateAsync).toHaveBeenCalledTimes(1);

    resolveMutate({ idSolicitud: 1 });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(dynamicMutateAsync).toHaveBeenCalledTimes(1);
  });
});
