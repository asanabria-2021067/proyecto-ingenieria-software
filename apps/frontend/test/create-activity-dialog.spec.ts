import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

import { toast } from 'sonner';
import { CreateActivityDialog } from '../components/projects/attendance/create-activity-dialog';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  // Radix Select mide su trigger con ResizeObserver, no implementado en jsdom.
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

function mutationStub(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ idActividad: 1 }),
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
    ...overrides,
  };
}

describe('CreateActivityDialog', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('no renderiza el formulario cuando está cerrado', () => {
    const crearActividad = mutationStub();
    render(
      createElement(CreateActivityDialog, { open: false, onOpenChange: vi.fn(), crearActividad: crearActividad as any }),
    );
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
  });

  it('muestra los campos del formulario cuando está abierto', () => {
    const crearActividad = mutationStub();
    render(
      createElement(CreateActivityDialog, { open: true, onOpenChange: vi.fn(), crearActividad: crearActividad as any }),
    );
    expect(screen.getByLabelText('Título')).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha')).toBeInTheDocument();
    expect(screen.getByLabelText('Horas que vale')).toBeInTheDocument();
  });

  it('rechaza el envío con título vacío y no llama a la mutación', () => {
    const crearActividad = mutationStub();
    render(
      createElement(CreateActivityDialog, { open: true, onOpenChange: vi.fn(), crearActividad: crearActividad as any }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Crear actividad' }));

    expect(screen.getByRole('alert')).toHaveTextContent('El título no puede estar vacío.');
    expect(crearActividad.mutateAsync).not.toHaveBeenCalled();
  });

  it('rechaza horas en cero o negativas', () => {
    const crearActividad = mutationStub();
    render(
      createElement(CreateActivityDialog, { open: true, onOpenChange: vi.fn(), crearActividad: crearActividad as any }),
    );

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Reunión semanal' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-01-15' } });
    fireEvent.change(screen.getByLabelText('Horas que vale'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear actividad' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Las horas deben ser un número mayor a 0.');
    expect(crearActividad.mutateAsync).not.toHaveBeenCalled();
  });

  it('envía la mutación con el payload correcto (título recortado, tipo por defecto REUNION)', async () => {
    const crearActividad = mutationStub();
    const onOpenChange = vi.fn();
    render(createElement(CreateActivityDialog, { open: true, onOpenChange, crearActividad: crearActividad as any }));

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: '  Reunión semanal  ' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-01-15' } });
    fireEvent.change(screen.getByLabelText('Horas que vale'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear actividad' }));

    await waitFor(() =>
      expect(crearActividad.mutateAsync).toHaveBeenCalledWith({
        tituloActividad: 'Reunión semanal',
        tipoActividad: 'REUNION',
        fechaActividad: '2026-01-15',
        horasValor: 1.5,
      }),
    );
  });

  it('cierra el diálogo y muestra un toast de éxito tras crear la actividad', async () => {
    const crearActividad = mutationStub();
    const onOpenChange = vi.fn();
    render(createElement(CreateActivityDialog, { open: true, onOpenChange, crearActividad: crearActividad as any }));

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Reunión semanal' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-01-15' } });
    fireEvent.change(screen.getByLabelText('Horas que vale'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear actividad' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.success).toHaveBeenCalled();
  });

  it('un fallo en la mutación no cierra el diálogo y muestra el error', async () => {
    const crearActividad = mutationStub({
      mutateAsync: vi.fn().mockRejectedValue(Object.assign(new Error('no eres el líder'), { statusCode: 403 })),
    });
    const onOpenChange = vi.fn();
    render(createElement(CreateActivityDialog, { open: true, onOpenChange, crearActividad: crearActividad as any }));

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Reunión semanal' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-01-15' } });
    fireEvent.change(screen.getByLabelText('Horas que vale'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear actividad' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('No tienes permisos para realizar esta acción.'),
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('cancelar cierra el diálogo sin llamar a la mutación', () => {
    const crearActividad = mutationStub();
    const onOpenChange = vi.fn();
    render(createElement(CreateActivityDialog, { open: true, onOpenChange, crearActividad: crearActividad as any }));

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(crearActividad.mutateAsync).not.toHaveBeenCalled();
  });
});
