import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ContinuarDondeQuedaste } from '../components/dashboard/continuar-donde-quedaste';

afterEach(() => cleanup());

describe('MEJ-78: Continúa donde te quedaste en móvil', () => {
  it('apila el texto y el botón bajo sm y los pone en fila desde sm', () => {
    render(<ContinuarDondeQuedaste idUsuario={1} />);

    const tarjeta = screen.getByRole('region', { name: 'Continúa donde te quedaste' });
    expect(tarjeta).toHaveClass('flex-col', 'sm:flex-row');
    expect(tarjeta).not.toHaveClass('flex-wrap');
    const boton = screen.getByRole('link', { name: /Explorar proyectos/ });
    expect(boton).toHaveClass('w-full', 'sm:w-auto');
    // el texto va en su propio bloque, no comparte columna angosta con el botón
    expect(tarjeta.children[0]).toContainElement(screen.getByRole('heading', { name: 'Continúa donde te quedaste' }));
    expect(tarjeta.children[0]).not.toContainElement(boton);
  });
});
