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
    const opciones = toastMock.mock.calls[0][1];
    expect(opciones.position).toBe('bottom-left');
    expect(opciones.duration).toBe(8000);
    expect(opciones.className).toContain('md:ml-52');
    expect(opciones.className).toContain('[html[data-project-sidebar=open]_&]:ml-[calc(16rem_+_223px)]');
    expect(opciones.className).toContain('[html[data-project-sidebar=collapsed]_&]:ml-[calc(3.5rem_+_223px)]');
    expect(localStorage.getItem('uvg-novedades-visto')).not.toBeNull();

    cleanup();
    render(<Novedades />);
    expect(toastMock).toHaveBeenCalledTimes(1);

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent(window, new Event(EVENTO_ABRIR_NOVEDADES));
    expect(await screen.findByRole('dialog', { name: 'Qué hay de nuevo' })).toBeInTheDocument();
  });
});

describe('Novedades con localStorage roto (FIX-42)', () => {
  it('no truena ni muestra el aviso si el storage lanza', async () => {
    const { Novedades } = await import('@/components/layout/novedades');
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => render(<Novedades />)).not.toThrow();
    expect(toastMock).not.toHaveBeenCalled();
    spy.mockRestore();
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
