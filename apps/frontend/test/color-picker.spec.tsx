import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ColorPicker, PALETA_COLORES } from '@/components/ui/color-picker';

afterEach(cleanup);

function renderPicker(value = '#006735') {
  const onChange = vi.fn();
  const utils = render(createElement(ColorPicker, { value, onChange }));
  return { onChange, ...utils };
}

describe('ColorPicker (paleta cerrada + hex)', () => {
  it('muestra una opción por color del sistema y marca la vigente', () => {
    renderPicker('#2680c2');
    expect(screen.getAllByRole('radio')).toHaveLength(PALETA_COLORES.length);
    expect(screen.getByRole('radio', { name: 'Azul' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Rojo' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByLabelText('Hexadecimal')).toHaveValue('#2680c2');
  });

  it('hacer clic en un color de la paleta lo notifica', () => {
    const { onChange } = renderPicker();
    fireEvent.click(screen.getByRole('radio', { name: 'Rojo' }));
    expect(onChange).toHaveBeenCalledWith('#e5484d');
  });

  it('con el teclado las flechas recorren la paleta, con vuelta al final y salto con Fin', () => {
    const { onChange } = renderPicker('#006735');
    const ultimo = PALETA_COLORES[PALETA_COLORES.length - 1].valor;
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Verde UVG' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('#2680c2');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Verde UVG' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith(ultimo);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Verde UVG' }), { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith(ultimo);
  });

  it('solo la opción vigente entra en el orden de tabulación', () => {
    renderPicker('#f97316');
    const enTab = screen.getAllByRole('radio').filter((r) => r.getAttribute('tabindex') === '0');
    expect(enTab).toHaveLength(1);
    expect(enTab[0]).toHaveAccessibleName('Naranja');
  });

  it('un hex válido, con o sin #, notifica el color normalizado', () => {
    const { onChange } = renderPicker();
    fireEvent.change(screen.getByLabelText('Hexadecimal'), { target: { value: '#1E408C' } });
    expect(onChange).toHaveBeenLastCalledWith('#1e408c');
    fireEvent.change(screen.getByLabelText('Hexadecimal'), { target: { value: 'ABCDEF' } });
    expect(onChange).toHaveBeenLastCalledWith('#abcdef');
  });

  it('un hex inválido no notifica, avisa y marca el campo', () => {
    const { onChange } = renderPicker();
    const campo = screen.getByLabelText('Hexadecimal');
    fireEvent.change(campo, { target: { value: '#59f7' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('#RRGGBB');
  });

  it('al salir con un hex inválido vuelve al color vigente', () => {
    renderPicker('#006735');
    const campo = screen.getByLabelText('Hexadecimal');
    fireEvent.change(campo, { target: { value: 'zzz' } });
    fireEvent.blur(campo);
    expect(campo).toHaveValue('#006735');
    expect(campo).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('un color fuera de la paleta se acepta por hex y ninguna opción queda marcada', () => {
    renderPicker('#123456');
    expect(screen.getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(screen.getByTestId('color-muestra')).toHaveStyle({ backgroundColor: 'rgb(18, 52, 86)' });
  });

  it('refleja los cambios que llegan desde fuera (value controlado)', () => {
    const onChange = vi.fn();
    const { rerender } = render(createElement(ColorPicker, { value: '#006735', onChange }));
    rerender(createElement(ColorPicker, { value: '#e5484d', onChange }));
    expect(screen.getByLabelText('Hexadecimal')).toHaveValue('#e5484d');
    expect(screen.getByRole('radio', { name: 'Rojo' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('ColorPicker (accesibilidad y estado)', () => {
  it('disabled deshabilita la paleta y el campo', () => {
    render(createElement(ColorPicker, { value: '#006735', onChange: vi.fn(), disabled: true }));
    expect(screen.getByLabelText('Hexadecimal')).toBeDisabled();
    expect(screen.getAllByRole('radio').every((r) => (r as HTMLButtonElement).disabled)).toBe(true);
  });

  it('dos selectores a la vez no comparten el id del mensaje de error', () => {
    render(
      createElement('div', null, [
        createElement(ColorPicker, { key: 'a', value: '#006735', onChange: vi.fn() }),
        createElement(ColorPicker, { key: 'b', value: '#006735', onChange: vi.fn() }),
      ]),
    );
    const campos = screen.getAllByLabelText('Hexadecimal');
    campos.forEach((c) => fireEvent.change(c, { target: { value: 'zz' } }));
    const ids = campos.map((c) => c.getAttribute('aria-describedby'));
    expect(new Set(ids).size).toBe(2);
    ids.forEach((id) => expect(document.getElementById(id as string)).toHaveTextContent('#RRGGBB'));
  });
});
