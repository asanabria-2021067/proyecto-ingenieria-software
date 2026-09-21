import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { UsuarioBusquedaDto } from '@/lib/types/social';

const buscarUsuariosMock = vi.fn();

vi.mock('@/lib/services/social', () => ({
  buscarUsuarios: (filtros: unknown) => buscarUsuariosMock(filtros),
}));

import { useRecomendaciones } from '@/hooks/use-social';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper };
}

function candidato(overrides: Partial<UsuarioBusquedaDto> = {}): UsuarioBusquedaDto {
  return {
    idUsuario: 1,
    nombre: 'Ana',
    apellido: 'Pérez',
    fotoUrl: null,
    esAmigo: false,
    solicitudPendiente: null,
    loSigo: false,
    carrera: 'Ingeniería en Ciencias de la Computación',
    semestre: 5,
    mismaCarrera: false,
    amigosEnComun: 0,
    habilidades: [],
    intereses: [],
    ...overrides,
  };
}

describe('useRecomendaciones', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('recomienda amigos de amigos con su conteo real de amigos en común', async () => {
    buscarUsuariosMock.mockResolvedValueOnce({
      items: [candidato({ idUsuario: 2, amigosEnComun: 2 })],
      hasMore: false,
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRecomendaciones(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(buscarUsuariosMock).toHaveBeenCalledWith({ amigosDeAmigos: true, page: 1 });
    expect(result.current.recomendaciones).toEqual([
      expect.objectContaining({ idUsuario: 2, amigosEnComun: 2 }),
    ]);
  });

  it('excluye de la recomendación a quien ya es amigo', async () => {
    buscarUsuariosMock.mockResolvedValueOnce({
      items: [candidato({ idUsuario: 2, esAmigo: true, amigosEnComun: 3 }), candidato({ idUsuario: 3 })],
      hasMore: false,
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRecomendaciones(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.recomendaciones.map((u) => u.idUsuario)).toEqual([3]);
  });

  it('excluye a quien tiene solicitud pendiente, enviada o recibida', async () => {
    buscarUsuariosMock.mockResolvedValueOnce({
      items: [
        candidato({ idUsuario: 2, solicitudPendiente: { direccion: 'enviada' } }),
        candidato({ idUsuario: 3, solicitudPendiente: { direccion: 'recibida' } }),
        candidato({ idUsuario: 4 }),
      ],
      hasMore: false,
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRecomendaciones(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.recomendaciones.map((u) => u.idUsuario)).toEqual([4]);
  });

  it('sin amigos de amigos, recae en recomendaciones por misma carrera', async () => {
    buscarUsuariosMock
      .mockResolvedValueOnce({ items: [], hasMore: false })
      .mockResolvedValueOnce({
        items: [candidato({ idUsuario: 5, mismaCarrera: true })],
        hasMore: false,
      });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRecomendaciones(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(buscarUsuariosMock).toHaveBeenNthCalledWith(1, { amigosDeAmigos: true, page: 1 });
    expect(buscarUsuariosMock).toHaveBeenNthCalledWith(2, { carrera: true, page: 1 });
    expect(result.current.recomendaciones.map((u) => u.idUsuario)).toEqual([5]);
  });
});
