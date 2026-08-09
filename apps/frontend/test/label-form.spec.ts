import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LabelForm } from '../components/projects/label-form';
import type { LabelDTO } from '../lib/services/labels';

function renderForm(overrides: Partial<Parameters<typeof LabelForm>[0]> = {}) {
  const props = {
    mode: 'create' as const,
    label: null as LabelDTO | null,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    isPending: false,
    error: null as string | null,
    ...overrides,
  };
  const utils = render(createElement(LabelForm, props));
  return { ...utils, props };
}

describe('LabelForm', () => {
  afterEach(() => cleanup());

  it('modo creación: campos vacíos con color por defecto', () => {
    renderForm({ mode: 'create', label: null });
    expect(screen.getByLabelText('Nombre')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Crear etiqueta' })).toBeInTheDocument();
  });

  it('modo edición: precarga nombre y color', () => {
    renderForm({ mode: 'edit', label: { idEtiqueta: 1, nombreEtiqueta: 'Backend', color: '#112233' } });
    expect(screen.getByLabelText('Nombre')).toHaveValue('Backend');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
  });

  it('recorta (trim) el nombre al enviar', async () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: '  Urgente  ' } });
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#ABCDEF' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ nombreEtiqueta: 'Urgente', color: '#ABCDEF' }, expect.anything()),
    );
  });

  it('rechaza nombre vacío', async () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#ABCDEF' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));
    expect(await screen.findByText('El nombre no puede estar vacío.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rechaza un color con formato inválido', async () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Backend' } });
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#FFF' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));
    expect(await screen.findByText('El color debe tener el formato #RRGGBB.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('acepta un color válido de 6 dígitos', async () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Backend' } });
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#00ff00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ nombreEtiqueta: 'Backend', color: '#00FF00' }, expect.anything()),
    );
  });

  it('sincroniza el input de texto y el selector de color nativo', () => {
    renderForm();
    const picker = screen.getByLabelText('Selector de color') as HTMLInputElement;
    const texto = screen.getByLabelText('Color') as HTMLInputElement;

    fireEvent.change(texto, { target: { value: '#123abc' } });
    expect(picker.value.toLowerCase()).toBe('#123abc');
  });

  it('muestra el error diferenciado recibido por props', () => {
    renderForm({ error: 'Ya existe una etiqueta con ese nombre.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Ya existe una etiqueta con ese nombre.');
  });

  it('cancelar llama a onCancel', () => {
    const onCancel = vi.fn();
    renderForm({ onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('deshabilita los botones durante isPending', () => {
    renderForm({ isPending: true });
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardando...' })).toBeDisabled();
  });
});
