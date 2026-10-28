import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnuncioVigente } from '@/lib/services/anuncios';

const state = vi.hoisted(() => ({ data: undefined as unknown, cerrar: vi.fn() }));

vi.mock('@/hooks/use-anuncios', () => ({
  useAnunciosVigentes: () => ({ data: state.data }),
  useCerrarAnuncio: () => ({ mutate: state.cerrar, isPending: false }),
}));

import { AnuncioBanner } from '@/components/anuncios/anuncio-banner';
import { estadoAnuncio, validarFormulario, valoresIniciales } from '@/components/anuncios/anuncio-form';

const anuncio = (nivel: AnuncioVigente['nivel'], id = 1): AnuncioVigente => ({
  idAnuncio: id,
  titulo: `Aviso ${id}`,
  mensaje: 'Mantenimiento programado',
  nivel,
  fechaInicio: '2026-10-01T00:00:00.000Z',
  fechaFin: '2026-12-01T00:00:00.000Z',
});

afterEach(cleanup);

describe('AnuncioBanner (T-351)', () => {
  beforeEach(() => {
    state.cerrar.mockClear();
    state.data = undefined;
  });

  it('no pinta nada sin anuncios vigentes', () => {
    state.data = [];
    const { container } = render(<AnuncioBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['URGENTE', 'alert', 'Urgente'],
    ['ADVERTENCIA', 'alert', 'Advertencia'],
    ['INFO', 'status', 'Información'],
  ] as const)('%s usa role=%s y muestra el nivel como texto', (nivel, role, texto) => {
    state.data = [anuncio(nivel)];
    render(<AnuncioBanner />);
    const banner = screen.getByRole(role);
    expect(banner).toHaveTextContent(`${texto}:`);
    expect(banner).toHaveTextContent('Aviso 1');
  });

  it('muestra solo el primero (el más importante) y cerrarlo avisa con su id', () => {
    state.data = [anuncio('URGENTE', 5), anuncio('INFO', 6)];
    render(<AnuncioBanner />);
    expect(screen.queryByText(/Aviso 6/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar anuncio: Aviso 5' }));
    expect(state.cerrar).toHaveBeenCalledWith(5);
  });
});

describe('formulario de anuncios (T-352)', () => {
  const base = valoresIniciales(undefined, new Date('2026-10-16T12:00:00Z'));

  it('los valores por defecto son válidos y la vigencia es posterior al inicio', () => {
    expect(validarFormulario({ ...base, titulo: 'a', mensaje: 'b' })).toBeNull();
  });

  it('rechaza título vacío, mensaje vacío y fin no posterior al inicio', () => {
    expect(validarFormulario({ ...base, titulo: ' ', mensaje: 'b' })).toMatch(/título/);
    expect(validarFormulario({ ...base, titulo: 'a', mensaje: '' })).toMatch(/mensaje/);
    expect(validarFormulario({ ...base, titulo: 'a', mensaje: 'b', fechaFin: base.fechaInicio })).toMatch(/posterior/);
  });

  it('estadoAnuncio distingue vigente, programado, vencido y despublicado', () => {
    const ahora = new Date('2026-10-16T12:00:00Z');
    const a = { activo: true, fechaInicio: '2026-10-01T00:00:00Z', fechaFin: '2026-11-01T00:00:00Z' };
    expect(estadoAnuncio(a, ahora)).toBe('VIGENTE');
    expect(estadoAnuncio({ ...a, fechaInicio: '2026-10-20T00:00:00Z' }, ahora)).toBe('PROGRAMADO');
    expect(estadoAnuncio({ ...a, fechaFin: '2026-10-10T00:00:00Z' }, ahora)).toBe('VENCIDO');
    expect(estadoAnuncio({ ...a, activo: false }, ahora)).toBe('DESPUBLICADO');
  });
});
