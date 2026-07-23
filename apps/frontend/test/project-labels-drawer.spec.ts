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

  it('muestra el título "Etiquetas del proyecto"', () => {
    renderDrawer();
    expect(screen.getByText('Etiquetas del proyecto')).toBeInTheDocument();
  });

  it('muestra loading', () => {
    renderDrawer({ isLoading: true });
    expect(screen.getByText('Cargando etiquetas...')).toBeInTheDocument();
  });

  it('muestra error con botón de reintentar', () => {
    const onRetry = vi.fn();
    renderDrawer({ isError: true, onRetry });
    expect(screen.getByText('No se pudieron cargar las etiquetas.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('muestra estado vacío', () => {
    renderDrawer({ labels: [] });
    expect(screen.getByText('Este proyecto todavía no tiene etiquetas.')).toBeInTheDocument();
  });

  it('lista las etiquetas existentes', () => {
    renderDrawer({
      labels: [
        { idEtiqueta: 1, nombreEtiqueta: 'Urgente', color: '#FF0000' },
        { idEtiqueta: 2, nombreEtiqueta: 'Backend', color: '#00FF00' },
      ],
    });
    expect(screen.getByText('Urgente')).toBeInTheDocument();
    expect(screen.getByText('Backend')).toBeInTheDocument();
  });

  it('crear etiqueta: abre el formulario, envía y vuelve al listado', async () => {
    const createLabel = mutationStub();
    renderDrawer({ createLabel });

    fireEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nueva' } });
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));

    await waitFor(() =>
      expect(createLabel.mutateAsync).toHaveBeenCalledWith({ nombreEtiqueta: 'Nueva', color: '#123456' }),
    );
    await waitFor(() => expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument());
  });

  it('editar etiqueta: precarga, envía y usa la mutation canónica', async () => {
    const updateLabel = mutationStub();
    renderDrawer({
      labels: [{ idEtiqueta: 5, nombreEtiqueta: 'Backend', color: '#112233' }],
      updateLabel,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Editar etiqueta "Backend"' }));
    expect(screen.getByLabelText('Nombre')).toHaveValue('Backend');

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Backend v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(updateLabel.mutateAsync).toHaveBeenCalledWith({
        labelId: 5,
        input: { nombreEtiqueta: 'Backend v2', color: '#112233' },
      }),
    );
  });

  it('eliminar etiqueta: requiere confirmación mediante AlertDialog', async () => {
    const deleteLabel = mutationStub();
    renderDrawer({
      labels: [{ idEtiqueta: 5, nombreEtiqueta: 'Backend', color: '#112233' }],
      deleteLabel,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar etiqueta "Backend"' }));
    expect(screen.getByText(/se eliminará y desaparecerá de las tareas asociadas/i)).toBeInTheDocument();
    expect(screen.getByText(/las tareas no serán eliminadas/i)).toBeInTheDocument();
    expect(deleteLabel.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(deleteLabel.mutateAsync).toHaveBeenCalledWith({ labelId: 5 }));
  });

  it('cancelar la eliminación no llama a la mutation', () => {
    const deleteLabel = mutationStub();
    renderDrawer({
      labels: [{ idEtiqueta: 5, nombreEtiqueta: 'Backend', color: '#112233' }],
      deleteLabel,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar etiqueta "Backend"' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(deleteLabel.mutateAsync).not.toHaveBeenCalled();
  });

  it('un 409 al crear muestra el mensaje de duplicado', async () => {
    const createLabel = mutationStub({
      mutateAsync: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { statusCode: 409 })),
    });
    renderDrawer({ createLabel });

    fireEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Dup' } });
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe una etiqueta con ese nombre.');
  });

  it('un 403 al eliminar muestra el mensaje de permisos', async () => {
    const deleteLabel = mutationStub({
      mutateAsync: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { statusCode: 403 })),
    });
    renderDrawer({
      labels: [{ idEtiqueta: 5, nombreEtiqueta: 'Backend', color: '#112233' }],
      deleteLabel,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar etiqueta "Backend"' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permisos para realizar esta acción.');
  });

  it('un 404 al editar muestra el mensaje de recurso ausente', async () => {
    const updateLabel = mutationStub({
      mutateAsync: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { statusCode: 404 })),
    });
    renderDrawer({
      labels: [{ idEtiqueta: 5, nombreEtiqueta: 'Backend', color: '#112233' }],
      updateLabel,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Editar etiqueta "Backend"' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/ya no está disponible/i);
  });

  it('no envía el nombre normalizado (NFKC) ni lo recalcula del lado del frontend', async () => {
    const createLabel = mutationStub();
    renderDrawer({ createLabel });

    fireEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ñandú' } });
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));

    await waitFor(() =>
      expect(createLabel.mutateAsync).toHaveBeenCalledWith({ nombreEtiqueta: 'Ñandú', color: '#123456' }),
    );
    const payload = createLabel.mutateAsync.mock.calls[0][0];
    expect(payload).not.toHaveProperty('nombreNormalizado');
  });

  it('color inválido bloquea el envío con mensaje accesible', async () => {
    const createLabel = mutationStub();
    renderDrawer({ createLabel });

    fireEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#XYZ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));

    expect(await screen.findByText('El color debe tener el formato #RRGGBB.')).toBeInTheDocument();
    expect(createLabel.mutateAsync).not.toHaveBeenCalled();
  });
});
