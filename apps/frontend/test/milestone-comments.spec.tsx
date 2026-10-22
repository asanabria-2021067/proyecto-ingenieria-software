import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';

vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 9 } }),
}));

vi.mock('../lib/services/comments', () => ({
  getComentariosHito: vi.fn(),
  crearComentarioHito: vi.fn(),
  editarComentario: vi.fn(),
  eliminarComentario: vi.fn(),
  getMencionables: vi.fn().mockResolvedValue([]),
  getConteoComentariosHitos: vi.fn(),
}));

vi.mock('../lib/swal', () => ({ default: { fire: vi.fn() }, swalCustomClass: {} }));

import { MilestoneCommentsSheet, useMilestoneCommentCounts } from '../components/projects/milestone-comments';
import { getComentariosHito, getConteoComentariosHitos } from '../lib/services/comments';

/** HU-200 (T-378/T-379): hilo de comentarios de un hito en su panel lateral. */

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('comentarios de hito', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('useMilestoneCommentCounts devuelve el total por hito del proyecto', async () => {
    vi.mocked(getConteoComentariosHitos).mockResolvedValue([
      { idHito: 1, cantidad: 3 },
      { idHito: 2, cantidad: 1 },
    ]);

    const { result } = renderHook(() => useMilestoneCommentCounts(10), { wrapper });

    await waitFor(() => expect(result.current.get(1)).toBe(3));
    expect(result.current.get(2)).toBe(1);
    expect(getConteoComentariosHitos).toHaveBeenCalledWith(10);
  });

  it('el panel muestra el título del hito y carga sus comentarios', async () => {
    vi.mocked(getComentariosHito).mockResolvedValue([
      {
        idComentario: 4,
        idAutor: 2,
        contenido: 'Avance listo @[Yo Mismo](9)',
        creadoEn: '2026-10-01T10:00:00.000Z',
        editadoEn: null,
        autor: { idUsuario: 2, nombre: 'María', apellido: 'López', fotoUrl: null },
        menciones: [{ usuario: { idUsuario: 9, nombre: 'Yo', apellido: 'Mismo', fotoUrl: null } }],
      },
    ]);

    render(<MilestoneCommentsSheet idProyecto={10} hito={{ idHito: 7, tituloHito: 'Entrega 1' }} onOpenChange={() => {}} />, {
      wrapper,
    });

    expect(await screen.findByRole('dialog')).toHaveTextContent('Entrega 1');
    expect(await screen.findByRole('link', { name: 'Mención a ti (Yo Mismo), ver perfil' })).toBeInTheDocument();
    expect(getComentariosHito).toHaveBeenCalledWith(7);
  });

  it('cerrado (sin hito) no consulta nada', () => {
    render(<MilestoneCommentsSheet idProyecto={10} hito={null} onOpenChange={() => {}} />, { wrapper });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getComentariosHito).not.toHaveBeenCalled();
  });
});
