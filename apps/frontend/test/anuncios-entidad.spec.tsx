import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnuncioEntidad } from '@/lib/services/anuncios';

const state = vi.hoisted(() => ({
  lista: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  crear: vi.fn(),
  despublicar: vi.fn(),
}));

vi.mock('@/hooks/use-anuncios', () => ({
  useAnunciosEntidad: () => state.lista,
  useAnunciosEntidadMutations: () => ({
    crear: { mutate: state.crear, isPending: false },
    despublicar: { mutate: state.despublicar, isPending: false },
  }),
}));
vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn() } }));

import { AnunciosEntidad } from '@/components/anuncios/anuncios-entidad';

const anuncio = (id: number, activo = true): AnuncioEntidad => ({
  idAnuncio: id,
  titulo: `Aviso ${id}`,
  mensaje: 'Reunión el viernes',
  nivel: 'INFO',
  fechaInicio: '2020-01-01T00:00:00.000Z',
  fechaFin: '2099-01-01T00:00:00.000Z',
  activo,
  fechaCreacion: '2020-01-01T00:00:00.000Z',
});

afterEach(cleanup);
beforeEach(() => {
  state.lista = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
  state.crear.mockClear();
  state.despublicar.mockClear();
});

describe('AnunciosEntidad (MEJ-66)', () => {
  it('sin anuncios, quien puede publicar ve el estado vacio con la accion', () => {
    render(<AnunciosEntidad tipo="organizaciones" id={1} puedePublicar />);
    expect(screen.getByText('Todavía no hay anuncios.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Nuevo anuncio/ }).length).toBeGreaterThan(0);
  });

  it('quien solo lee no ve botones para publicar ni despublicar', () => {
    state.lista.data = [anuncio(1)];
    render(<AnunciosEntidad tipo="asociaciones" id={1} puedePublicar={false} />);
    expect(screen.getByText('Aviso 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nuevo anuncio/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Despublicar/ })).not.toBeInTheDocument();
  });

  it('el formulario no pide audiencia y publica sin ese campo', () => {
    render(<AnunciosEntidad tipo="organizaciones" id={1} puedePublicar />);
    fireEvent.click(screen.getAllByRole('button', { name: /Nuevo anuncio/ })[0]);
    expect(screen.queryByLabelText('Audiencia')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Hola' } });
    fireEvent.change(screen.getByLabelText('Mensaje'), { target: { value: 'Mundo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(state.crear).toHaveBeenCalledTimes(1);
    const enviado = state.crear.mock.calls[0][0];
    expect(enviado).toMatchObject({ titulo: 'Hola', mensaje: 'Mundo', nivel: 'INFO' });
    expect(enviado).not.toHaveProperty('audiencia');
  });

  it('despublicar pide confirmacion y solo los activos lo ofrecen', () => {
    state.lista.data = [anuncio(1), anuncio(2, false)];
    render(<AnunciosEntidad tipo="organizaciones" id={1} puedePublicar />);
    expect(screen.queryByRole('button', { name: 'Despublicar Aviso 2' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Despublicar Aviso 1' }));
    expect(state.despublicar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Despublicar' }));
    expect(state.despublicar.mock.calls[0][0]).toBe(1);
  });

  it('muestra esqueleto mientras carga', () => {
    state.lista = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
    render(<AnunciosEntidad tipo="organizaciones" id={1} puedePublicar />);
    expect(screen.getByRole('status', { name: 'Cargando anuncios' })).toBeInTheDocument();
  });
});
