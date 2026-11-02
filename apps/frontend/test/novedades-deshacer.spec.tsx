import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});
afterEach(cleanup);

describe('Novedades (MEJ-75)', () => {
  it('avisa una sola vez por release y el detalle se abre desde el evento del buscador', async () => {
    const { Novedades } = await import('@/components/layout/novedades');
    const { EVENTO_ABRIR_NOVEDADES } = await import('@/components/layout/command-palette');

    render(<Novedades />);
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0][0]).toBe('Qué hay de nuevo');

    cleanup();
    render(<Novedades />);
    expect(toastMock).toHaveBeenCalledTimes(1);

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent(window, new Event(EVENTO_ABRIR_NOVEDADES));
    expect(await screen.findByRole('dialog', { name: 'Qué hay de nuevo' })).toBeInTheDocument();
  });
});

describe('aviso.deshacer (MEJ-77)', () => {
  it('muestra el aviso con la accion Deshacer que ejecuta la reversion', async () => {
    const { aviso } = await import('@/lib/mensajes');
    const revertir = vi.fn();
    aviso.deshacer('Mensaje fijado', revertir);

    const [titulo, opciones] = toastMock.success.mock.calls[0];
    expect(titulo).toBe('Mensaje fijado');
    expect(opciones.action.label).toBe('Deshacer');
    opciones.action.onClick();
    expect(revertir).toHaveBeenCalledTimes(1);
  });
});
