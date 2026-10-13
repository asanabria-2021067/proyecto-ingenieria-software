import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '../components/ui/empty';

/**
 * Estado «sin registros» compartido: una tarjeta blanca de borde sutil con un
 * icono neutro, igual en todas las vistas (referencia: Chats archivados).
 */

afterEach(cleanup);

function renderVacio(tone?: 'default' | 'muted' | 'danger') {
  render(
    <Empty tone={tone} role="status">
      <EmptyMedia variant="icon">
        <svg data-testid="icono" />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>No hay registros</EmptyTitle>
      </EmptyHeader>
    </Empty>,
  );
  return { tarjeta: screen.getByRole('status'), icono: screen.getByTestId('icono').parentElement as HTMLElement };
}

describe('estado vacío compartido', () => {
  it.each(['default', 'muted'] as const)('con tono «%s» es una tarjeta blanca de borde sutil, sin fondo tintado ni borde punteado', (tono) => {
    const { tarjeta } = renderVacio(tono);

    expect(tarjeta).toHaveClass('bg-surface-container-lowest', 'border-outline-variant/70', 'shadow-sm', 'rounded-2xl');
    expect(tarjeta).not.toHaveClass('border-dashed');
    expect(tarjeta).not.toHaveClass('bg-surface-container-low');
  });

  it('el icono es neutro: sin verde, sin borde ni anillo', () => {
    const { icono } = renderVacio('muted');

    expect(icono).toHaveAttribute('data-variant', 'icon');
    expect(icono).toHaveClass('bg-surface-container', 'text-text-secondary', 'rounded-control', 'size-12');
    expect(icono.className).not.toMatch(/primary|ring-8/);
  });

  it('un error sigue distinguiéndose por el fondo de su tarjeta', () => {
    const { tarjeta } = renderVacio('danger');

    expect(tarjeta).toHaveClass('border-error/25', 'bg-error-container/20');
  });
});
