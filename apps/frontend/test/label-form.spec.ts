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
    fireEvent.change(screen.getByLabelText('Hexadecimal'), { target: { value: '#ABCDEF' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ nombreEtiqueta: 'Urgente', color: '#ABCDEF' }, expect.anything()),
    );
  });

  it('rechaza nombre vacío', async () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    fireEvent.change(screen.getByLabelText('Hexadecimal'), { target: { value: '#ABCDEF' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));
    expect(await screen.findByText('El nombre no puede estar vacío.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('un color con formato inválido se avisa y se envía el último color válido, nunca el inválido', async () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Backend' } });
    fireEvent.change(screen.getByLabelText('Hexadecimal'), { target: { value: '#FFF' } });
    expect(screen.getByLabelText('Hexadecimal')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/El color debe tener el formato #RRGGBB/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ nombreEtiqueta: 'Backend', color: '#006735' });
    expect(onSubmit.mock.calls[0][0].color).not.toBe('#FFF');
  });

  it('la etiqueta «Color» está asociada al campo del selector', () => {
    renderForm();
    expect(screen.getByLabelText('Color')).toBe(screen.getByLabelText('Hexadecimal'));
  });

  it('acepta un color válido de 6 dígitos', async () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Backend' } });
    fireEvent.change(screen.getByLabelText('Hexadecimal'), { target: { value: '#00ff00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ nombreEtiqueta: 'Backend', color: '#00FF00' }, expect.anything()),
    );
  });

  it('sincroniza el hexadecimal con la paleta', () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Hexadecimal'), { target: { value: '#2680c2' } });
    expect(screen.getByRole('radio', { name: 'Azul' })).toHaveAttribute('aria-checked', 'true');
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
