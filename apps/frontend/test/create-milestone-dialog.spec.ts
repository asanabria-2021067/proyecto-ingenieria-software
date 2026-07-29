import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CreateMilestoneDialog } from '../components/projects/create-milestone-dialog';

function mutationStub(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ idHito: 1 }),
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
    ...overrides,
  };
}

describe('CreateMilestoneDialog', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('no renderiza el formulario cuando está cerrado', () => {
    const crearHito = mutationStub();
    render(
      createElement(CreateMilestoneDialog, { open: false, onOpenChange: vi.fn(), crearHito: crearHito as any }),
    );
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
  });

  it('muestra los campos del formulario cuando está abierto', () => {
    const crearHito = mutationStub();
    render(
      createElement(CreateMilestoneDialog, { open: true, onOpenChange: vi.fn(), crearHito: crearHito as any }),
    );
    expect(screen.getByLabelText('Título')).toBeInTheDocument();
    expect(screen.getByLabelText('Descripción (opcional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha límite (opcional)')).toBeInTheDocument();
  });

  it('rechaza el envío con título vacío y no llama a la mutación', () => {
    const crearHito = mutationStub();
    render(
      createElement(CreateMilestoneDialog, { open: true, onOpenChange: vi.fn(), crearHito: crearHito as any }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Crear hito' }));

    expect(screen.getByRole('alert')).toHaveTextContent('El título no puede estar vacío.');
    expect(crearHito.mutateAsync).not.toHaveBeenCalled();
  });

  it('envía la mutación con el payload correcto (título recortado, sin campos vacíos)', async () => {
    const crearHito = mutationStub();
    const onOpenChange = vi.fn();
    render(
      createElement(CreateMilestoneDialog, { open: true, onOpenChange, crearHito: crearHito as any }),
    );

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: '  Entrega de MVP  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear hito' }));

    await waitFor(() =>
      expect(crearHito.mutateAsync).toHaveBeenCalledWith({
        tituloHito: 'Entrega de MVP',
        descripcionHito: undefined,
        fechaLimite: undefined,
      }),
    );
  });

  it('incluye descripcionHito y fechaLimite cuando se completan', async () => {
    const crearHito = mutationStub();
    render(
      createElement(CreateMilestoneDialog, { open: true, onOpenChange: vi.fn(), crearHito: crearHito as any }),
    );

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Entrega de MVP' } });
    fireEvent.change(screen.getByLabelText('Descripción (opcional)'), { target: { value: 'Detalles' } });
    fireEvent.change(screen.getByLabelText('Fecha límite (opcional)'), { target: { value: '2026-12-25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear hito' }));

    await waitFor(() =>
      expect(crearHito.mutateAsync).toHaveBeenCalledWith({
        tituloHito: 'Entrega de MVP',
        descripcionHito: 'Detalles',
        fechaLimite: '2026-12-25',
      }),
    );
  });

  it('cierra el diálogo tras crear el hito exitosamente', async () => {
    const crearHito = mutationStub();
    const onOpenChange = vi.fn();
    render(
      createElement(CreateMilestoneDialog, { open: true, onOpenChange, crearHito: crearHito as any }),
    );

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Entrega de MVP' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear hito' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('un fallo en la mutación no cierra el diálogo y muestra el error', async () => {
    const crearHito = mutationStub({
      mutateAsync: vi.fn().mockRejectedValue(
        Object.assign(new Error('no eres el líder'), { statusCode: 403 }),
      ),
    });
    const onOpenChange = vi.fn();
    render(
      createElement(CreateMilestoneDialog, { open: true, onOpenChange, crearHito: crearHito as any }),
    );

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Entrega de MVP' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear hito' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('No tienes permisos para realizar esta acción.'),
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('cancelar cierra el diálogo sin llamar a la mutación', () => {
    const crearHito = mutationStub();
    const onOpenChange = vi.fn();
    render(
      createElement(CreateMilestoneDialog, { open: true, onOpenChange, crearHito: crearHito as any }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(crearHito.mutateAsync).not.toHaveBeenCalled();
  });
});
