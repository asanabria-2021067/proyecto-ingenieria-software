import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProjectLabelsDrawer } from '../components/projects/project-labels-drawer';
import type { LabelDTO } from '../lib/services/labels';

function mutationStub(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
    ...overrides,
  };
}

function renderDrawer(overrides: Record<string, unknown> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    labels: [] as LabelDTO[],
    isLoading: false,
    isError: false,
    onRetry: vi.fn(),
    createLabel: mutationStub(),
    updateLabel: mutationStub(),
    deleteLabel: mutationStub(),
    ...overrides,
  };
  const utils = render(createElement(ProjectLabelsDrawer, props as any));
  return { ...utils, props };
}

describe('ProjectLabelsDrawer', () => {
  afterEach(() => cleanup());

  it('muestra encabezado, formulario permanente y lista en la misma pantalla', () => {
    renderDrawer({
      labels: [{ idEtiqueta: 1, nombreEtiqueta: 'Urgente', color: '#FF0000' }],
    });

    expect(screen.getByText('Etiquetas del proyecto')).toBeInTheDocument();
    expect(screen.getByText('Organiza y clasifica las tareas del proyecto mediante etiquetas.')).toBeInTheDocument();
    expect(screen.getByText('Nueva etiqueta')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de la etiqueta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar etiqueta' })).toBeInTheDocument();
    expect(screen.getByText('Etiquetas existentes')).toBeInTheDocument();
    expect(screen.getByText('Urgente')).toBeInTheDocument();
  });

  it('no muestra el botón global obsoleto "Crear etiqueta" ni un guardado global', () => {
    renderDrawer();
    expect(screen.queryByRole('button', { name: 'Crear etiqueta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
  });

  it('muestra loading como filas skeleton y mantiene el formulario deshabilitado', () => {
    renderDrawer({ isLoading: true });
    expect(screen.getByText('Nueva etiqueta')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de la etiqueta')).toBeDisabled();
    expect(screen.getAllByTestId('label-row-skeleton')).toHaveLength(16);
  });

  it('muestra error general con botón de reintentar y no oculta el formulario', () => {
    const onRetry = vi.fn();
    renderDrawer({ isError: true, onRetry });
    expect(screen.getByText('No fue posible cargar las etiquetas del proyecto.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de la etiqueta')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('muestra estado vacío dentro de la sección de existentes', () => {
    renderDrawer({ labels: [] });
    expect(screen.getByText('Aún no hay etiquetas')).toBeInTheDocument();
    expect(screen.getByText('Crea la primera etiqueta para comenzar a clasificar las tareas del proyecto.')).toBeInTheDocument();
  });

  it('lista etiquetas existentes con color y acciones compactas', () => {
    renderDrawer({
      labels: [
        { idEtiqueta: 1, nombreEtiqueta: 'Urgente', color: '#FF0000' },
        { idEtiqueta: 2, nombreEtiqueta: 'Backend', color: '#00FF00' },
      ],
    });

    expect(screen.getByText('Urgente')).toBeInTheDocument();
    expect(screen.getByText('Backend')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar etiqueta Urgente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar etiqueta Backend' })).toBeInTheDocument();
    expect(screen.queryByText('0 tareas')).not.toBeInTheDocument();
  });

  it('crear etiqueta usa el formulario visible, envía y limpia tras éxito', async () => {
    const createLabel = mutationStub();
    renderDrawer({ createLabel });

    fireEvent.change(screen.getByLabelText('Nombre de la etiqueta'), { target: { value: 'Nueva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar color para nueva etiqueta' }));
    fireEvent.change(screen.getByLabelText('Valor hexadecimal del color'), { target: { value: '#123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar etiqueta' }));

    await waitFor(() =>
      expect(createLabel.mutateAsync).toHaveBeenCalledWith({ nombreEtiqueta: 'Nueva', color: '#123456' }),
    );
    await waitFor(() => expect(screen.getByLabelText('Nombre de la etiqueta')).toHaveValue(''));
  });

  it('la paleta integrada selecciona color sin depender de input type=color', () => {
    const { container } = renderDrawer();

    expect(container.querySelector('input[type="color"]')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar color para nueva etiqueta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar color Azul' }));
    expect(screen.getByLabelText('Valor hexadecimal del color')).toHaveValue('#2680C2');
  });

  it('editar etiqueta es inline, conserva la lista y usa la mutation canónica', async () => {
    const updateLabel = mutationStub();
    renderDrawer({
      labels: [
        { idEtiqueta: 5, nombreEtiqueta: 'Backend', color: '#112233' },
        { idEtiqueta: 6, nombreEtiqueta: 'Urgente', color: '#FF0000' },
      ],
      updateLabel,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Editar etiqueta Backend' }));
    expect(screen.getByLabelText('Nombre de la etiqueta Backend')).toHaveValue('Backend');
    expect(screen.getByText('Urgente')).toBeInTheDocument();
    expect(screen.getByText('Nueva etiqueta')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nombre de la etiqueta Backend'), { target: { value: 'Backend v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar color para la etiqueta Backend' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar color Turquesa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios de la etiqueta Backend' }));

    await waitFor(() =>
      expect(updateLabel.mutateAsync).toHaveBeenCalledWith({
        labelId: 5,
        input: { nombreEtiqueta: 'Backend v2', color: '#0F9F9A' },
      }),
    );
  });

  it('solo una fila entra en edición a la vez', () => {
    renderDrawer({
      labels: [
        { idEtiqueta: 5, nombreEtiqueta: 'Backend', color: '#112233' },
        { idEtiqueta: 6, nombreEtiqueta: 'Urgente', color: '#FF0000' },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Editar etiqueta Backend' }));
    expect(screen.getByLabelText('Nombre de la etiqueta Backend')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar etiqueta Urgente' }));
    expect(screen.queryByLabelText('Nombre de la etiqueta Backend')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de la etiqueta Urgente')).toBeInTheDocument();
  });

  it('cancelar edición restaura la fila sin llamar mutation', () => {
    const updateLabel = mutationStub();
    renderDrawer({
      labels: [{ idEtiqueta: 5, nombreEtiqueta: 'Backend', color: '#112233' }],
      updateLabel,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Editar etiqueta Backend' }));
    fireEvent.change(screen.getByLabelText('Nombre de la etiqueta Backend'), { target: { value: 'Cambió' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar edición de la etiqueta Backend' }));

    expect(updateLabel.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Backend')).toBeInTheDocument();
  });

  it('eliminar etiqueta requiere confirmación mediante AlertDialog', async () => {
    const deleteLabel = mutationStub();
    renderDrawer({
      labels: [{ idEtiqueta: 5, nombreEtiqueta: 'Backend', color: '#112233' }],
      deleteLabel,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar etiqueta Backend' }));
    expect(screen.getByText('¿Eliminar la etiqueta "Backend"?')).toBeInTheDocument();
    expect(screen.getByText(/Las tareas no serán eliminadas/i)).toBeInTheDocument();
    expect(deleteLabel.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar etiqueta' }).at(-1)!);
    await waitFor(() => expect(deleteLabel.mutateAsync).toHaveBeenCalledWith({ labelId: 5 }));
  });

  it('cancelar la eliminación no llama a la mutation', () => {
    const deleteLabel = mutationStub();
    renderDrawer({
      labels: [{ idEtiqueta: 5, nombreEtiqueta: 'Backend', color: '#112233' }],
      deleteLabel,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar etiqueta Backend' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(deleteLabel.mutateAsync).not.toHaveBeenCalled();
  });

  it('un 409 al crear muestra el mensaje de duplicado sin cerrar el formulario', async () => {
    const createLabel = mutationStub({
      mutateAsync: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { statusCode: 409 })),
    });
    renderDrawer({ createLabel });

    fireEvent.change(screen.getByLabelText('Nombre de la etiqueta'), { target: { value: 'Dup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar etiqueta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe una etiqueta con ese nombre.');
    expect(screen.getByLabelText('Nombre de la etiqueta')).toHaveValue('Dup');
  });

  it('un 403 al eliminar muestra el mensaje de permisos y conserva la etiqueta', async () => {
    const deleteLabel = mutationStub({
      mutateAsync: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { statusCode: 403 })),
    });
    renderDrawer({
      labels: [{ idEtiqueta: 5, nombreEtiqueta: 'Backend', color: '#112233' }],
      deleteLabel,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar etiqueta Backend' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar etiqueta' }).at(-1)!);

    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permisos para realizar esta acción.');
    expect(screen.getByText('Backend')).toBeInTheDocument();
  });

  it('un 404 al editar muestra el mensaje de recurso ausente y conserva valores escritos', async () => {
    const updateLabel = mutationStub({
      mutateAsync: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { statusCode: 404 })),
    });
    renderDrawer({
      labels: [{ idEtiqueta: 5, nombreEtiqueta: 'Backend', color: '#112233' }],
      updateLabel,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Editar etiqueta Backend' }));
    fireEvent.change(screen.getByLabelText('Nombre de la etiqueta Backend'), { target: { value: 'Backend escrito' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios de la etiqueta Backend' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/ya no está disponible/i);
    expect(screen.getByLabelText('Nombre de la etiqueta Backend')).toHaveValue('Backend escrito');
  });

  it('no envía el nombre normalizado (NFKC) ni lo recalcula del lado del frontend', async () => {
    const createLabel = mutationStub();
    renderDrawer({ createLabel });

    fireEvent.change(screen.getByLabelText('Nombre de la etiqueta'), { target: { value: 'Ñandú' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar etiqueta' }));

    await waitFor(() =>
      expect(createLabel.mutateAsync).toHaveBeenCalledWith({ nombreEtiqueta: 'Ñandú', color: '#006735' }),
    );
    const payload = createLabel.mutateAsync.mock.calls[0][0];
    expect(payload).not.toHaveProperty('nombreNormalizado');
  });

  it('color inválido bloquea el envío con mensaje accesible', async () => {
    const createLabel = mutationStub();
    renderDrawer({ createLabel });

    fireEvent.change(screen.getByLabelText('Nombre de la etiqueta'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar color para nueva etiqueta' }));
    fireEvent.change(screen.getByLabelText('Valor hexadecimal del color'), { target: { value: '#XYZ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar etiqueta' }));

    expect(await screen.findByText('El color debe tener el formato #RRGGBB.')).toBeInTheDocument();
    expect(createLabel.mutateAsync).not.toHaveBeenCalled();
  });
});
