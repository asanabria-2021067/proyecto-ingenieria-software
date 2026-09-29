import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ColorPicker } from '@/components/ui/color-picker';

/**
 * Selector de color de la exportación (referencia: cuadro matiz × saturación,
 * muestra del color a la derecha, barra de brillo, hex y canales RGB).
 */

beforeAll(() => {
  // jsdom no trae PointerEvent: MouseEvent conserva clientX/clientY.
  (window as unknown as { PointerEvent: unknown }).PointerEvent = window.MouseEvent;
});

afterEach(() => {
  cleanup();
});

function renderPicker(value = '#59f7ff') {
  const onChange = vi.fn();
  render(createElement(ColorPicker, { value, onChange }));
  return { onChange };
}

describe('ColorPicker', () => {
  it('muestra el color actual en hex, en los tres canales RGB y en la muestra', () => {
    renderPicker('#59f7ff');

    expect(screen.getByLabelText('Hexadecimal')).toHaveValue('#59f7ff');
    expect(screen.getByLabelText('Rojo')).toHaveValue(89);
    expect(screen.getByLabelText('Verde')).toHaveValue(247);
    expect(screen.getByLabelText('Azul')).toHaveValue(255);
    expect(screen.getByTestId('color-muestra')).toHaveStyle({ backgroundColor: 'rgb(89, 247, 255)' });
  });

  it('escribir un hex completo válido notifica el color normalizado', () => {
    const { onChange } = renderPicker('#59f7ff');

    fireEvent.change(screen.getByLabelText('Hexadecimal'), { target: { value: '#1E408C' } });

    expect(onChange).toHaveBeenCalledWith('#1e408c');
  });

  it('un hex incompleto o inválido no notifica y marca el campo como inválido', () => {
    const { onChange } = renderPicker('#59f7ff');
    const campo = screen.getByLabelText('Hexadecimal');

    fireEvent.change(campo, { target: { value: '#59f7' } });

    expect(onChange).not.toHaveBeenCalled();
    expect(campo).toHaveAttribute('aria-invalid', 'true');
  });

  it('al salir del campo con un hex inválido vuelve al color vigente', () => {
    renderPicker('#59f7ff');
    const campo = screen.getByLabelText('Hexadecimal');

    fireEvent.change(campo, { target: { value: 'zzz' } });
    fireEvent.blur(campo);

    expect(campo).toHaveValue('#59f7ff');
    expect(campo).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('cambiar un canal RGB notifica el hex resultante', () => {
    const { onChange } = renderPicker('#59f7ff');

    fireEvent.change(screen.getByLabelText('Rojo'), { target: { value: '0' } });

    expect(onChange).toHaveBeenCalledWith('#00f7ff');
  });

  it('un canal fuera de 0–255 se acota', () => {
    const { onChange } = renderPicker('#59f7ff');

    fireEvent.change(screen.getByLabelText('Azul'), { target: { value: '999' } });

    expect(onChange).toHaveBeenCalledWith('#59f7ff');
  });

  it('la barra de brillo oscurece el color conservando matiz y saturación', () => {
    const { onChange } = renderPicker('#ff0000');

    fireEvent.change(screen.getByLabelText('Brillo'), { target: { value: '50' } });

    expect(onChange).toHaveBeenCalledWith('#800000');
  });

  it('arrastrar sobre el cuadro elige matiz (x) y saturación (y)', () => {
    const { onChange } = renderPicker('#ffffff');
    const area = screen.getByLabelText('Matiz y saturación');
    vi.spyOn(area, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 360, height: 100, right: 360, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
    });

    // x = 120/360 → matiz 120° (verde); y = 0 → saturación 1; brillo 1.
    fireEvent.pointerDown(area, { clientX: 120, clientY: 0, pointerId: 1 });

    expect(onChange).toHaveBeenLastCalledWith('#00ff00');
  });

  it('con el teclado, las flechas del cuadro mueven matiz y saturación', () => {
    const { onChange } = renderPicker('#ff0000');

    fireEvent.keyDown(screen.getByLabelText('Matiz y saturación'), { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).not.toBe('#ff0000');
  });

  it('muestra los cambios que llegan desde fuera (value controlado)', () => {
    const onChange = vi.fn();
    const { rerender } = render(createElement(ColorPicker, { value: '#59f7ff', onChange }));

    rerender(createElement(ColorPicker, { value: '#991b1b', onChange }));

    expect(screen.getByLabelText('Hexadecimal')).toHaveValue('#991b1b');
    expect(screen.getByLabelText('Rojo')).toHaveValue(153);
  });
});
