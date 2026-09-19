import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AssignMilestoneDialog } from '../components/projects/assign-milestone-dialog';

const swalFire = vi.hoisted(() => vi.fn());

vi.mock('@/lib/swal', () => ({
  default: {
    fire: swalFire,
  },
}));

function mutationStub(result: unknown) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(result),
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
  };
}

function renderDialog(overrides: Record<string, unknown> = {}) {
  const crearHito = mutationStub({ idHito: 99 });
  const asignarHitoTareas = mutationStub({
    idHito: 7,
    idsTareasAsignadas: [11, 12],
  });
  const onAsignado = vi.fn();
  const onOpenChange = vi.fn();

  render(
    createElement(AssignMilestoneDialog, {
      open: true,
      onOpenChange,
      hitos: [
        { idHito: 7, tituloHito: 'Entrega existente' },
        { idHito: 8, tituloHito: 'Beta' },
      ],
      tareasSeleccionadas: [
        { idTarea: 11, tituloTarea: 'Tarea A' },
        { idTarea: 12, tituloTarea: 'Tarea B' },
      ],
      crearHito: crearHito as any,
      asignarHitoTareas: asignarHitoTareas as any,
      onAsignado,
      ...overrides,
    }),
  );

  return {
    crearHito,
    asignarHitoTareas,
    onAsignado,
    onOpenChange,
  };
}

describe('AssignMilestoneDialog', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('inicia sin elegir hito existente ni nuevo', () => {
    renderDialog();

    expect(screen.getByText('Elige una de las opciones para continuar.')).toBeInTheDocument();
    expect(screen.queryByText('Selecciona un hito')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre del nuevo hito')).not.toBeInTheDocument();
  });

  it('exige elegir el tipo de hito antes de continuar', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(
      screen.getByRole('alert'),
    ).toHaveTextContent('Elige si deseas usar un hito existente o crear uno nuevo.');
  });

  it('muestra el formulario para escribir un hito nuevo en el mismo flujo', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo hito' }));

    expect(screen.getByLabelText('Nombre del nuevo hito')).toBeInTheDocument();
    expect(screen.getByLabelText('Descripción (opcional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha límite (opcional)')).toBeInTheDocument();
  });

  it('pide confirmacion antes de crear y asignar un hito nuevo', () => {
    const { crearHito } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo hito' }));
    fireEvent.change(screen.getByLabelText('Nombre del nuevo hito'), {
      target: { value: 'Entrega final' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(crearHito.mutateAsync).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: 'Confirmar asignación de hito' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Se asignará "Entrega final" a 2 tareas/),
    ).toBeInTheDocument();
  });

  it('al confirmar un hito nuevo lo crea con todos los ids seleccionados', async () => {
    const { crearHito, asignarHitoTareas, onAsignado } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo hito' }));
    fireEvent.change(screen.getByLabelText('Nombre del nuevo hito'), {
      target: { value: 'Entrega final' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 2 tareas' }));

    await waitFor(() =>
      expect(crearHito.mutateAsync).toHaveBeenCalledWith({
        tituloHito: 'Entrega final',
        descripcionHito: undefined,
        fechaLimite: undefined,
        idsTareas: [11, 12],
      }),
    );

    expect(asignarHitoTareas.mutateAsync).not.toHaveBeenCalled();
    expect(onAsignado).toHaveBeenCalledOnce();
    expect(swalFire).toHaveBeenCalled();
  });
});