import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FontScaleToggle } from '@/components/font-scale-toggle';

const STORAGE_KEY = 'uvg-collab-font-scale';

describe('FontScaleToggle', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.style.fontSize = '';
  });

  it('renderiza los 3 botones', () => {
    render(<FontScaleToggle />);
    expect(screen.getByRole('button', { name: 'Reducir tamaño de texto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restablecer tamaño de texto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aumentar tamaño de texto' })).toBeInTheDocument();
  });

  it('clic en A+ aumenta el fontSize y lo persiste en localStorage', () => {
    render(<FontScaleToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar tamaño de texto' }));
    expect(document.documentElement.style.fontSize).toBe('112.5%');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('2');
  });

  it('restaura el nivel guardado en localStorage al montar', () => {
    localStorage.setItem(STORAGE_KEY, '3');
    render(<FontScaleToggle />);
    expect(document.documentElement.style.fontSize).toBe('125%');
  });

  it('deshabilita A- cuando el nivel esta en el minimo', () => {
    localStorage.setItem(STORAGE_KEY, '0');
    render(<FontScaleToggle />);
    expect(screen.getByRole('button', { name: 'Reducir tamaño de texto' })).toBeDisabled();
  });
});
