import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 9 } }),
}));

vi.mock('../lib/services/comments', () => ({
  getMencionables: vi.fn(),
}));

vi.mock('../lib/swal', () => ({ default: { fire: vi.fn() }, swalCustomClass: {} }));

import { CommentThread, type CommentThreadProps } from '../components/comments/comment-thread';
import { getMencionables } from '../lib/services/comments';
import type { ComentarioListado } from '../lib/services/comments';

/** HU-200 (T-376/T-378/T-379): hilo de comentarios con menciones. */

const autor = (idUsuario: number, nombre: string, apellido: string) => ({ idUsuario, nombre, apellido, fotoUrl: null });

const COMENTARIOS: ComentarioListado[] = [
  {
    idComentario: 1,
    idAutor: 2,
    contenido: 'Primero, para @[Yo Mismo](9)',
    creadoEn: '2026-10-01T10:00:00.000Z',
    editadoEn: null,
    autor: autor(2, 'María', 'López'),
    menciones: [{ usuario: autor(9, 'Yo', 'Mismo') }],
  },
  {
    idComentario: 2,
    idAutor: 9,
    contenido: 'Mío, menciono a @[María López](2)',
    creadoEn: '2026-10-02T10:00:00.000Z',
    editadoEn: '2026-10-02T11:00:00.000Z',
    autor: autor(9, 'Yo', 'Mismo'),
    menciones: [{ usuario: autor(2, 'María', 'López') }],
  },
];

function renderThread(props: Partial<CommentThreadProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const handlers = {
    listar: vi.fn().mockResolvedValue(COMENTARIOS),
    crear: vi.fn().mockResolvedValue({}),
    editar: vi.fn().mockResolvedValue({}),
    eliminar: vi.fn().mockResolvedValue({}),
    onMutado: vi.fn(),
  };
  render(
    <CommentThread
      idProyecto={5}
      queryKey={['hilo-prueba']}
      enabled
      descripcionEliminar="Se eliminará."
      scroll={false}
      {...handlers}
      {...props}
    />,
    { wrapper },
  );
  return handlers;
}

describe('CommentThread', () => {
  beforeEach(() => {
    vi.mocked(getMencionables).mockResolvedValue([
      { ...autor(2, 'María', 'López'), esLider: false },
      { ...autor(1, 'Carlos', 'Mendoza'), esLider: true },
    ]);
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('lista lo más reciente primero, con las menciones enlazadas y la marca de editado', async () => {
    renderThread();

    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Mío, menciono a @María López');
    expect(items[0]).toHaveTextContent('· editado');
    expect(items[1]).toHaveTextContent('Primero, para @Yo Mismo');
    expect(screen.getByRole('link', { name: 'Mención a María López, ver perfil' })).toHaveAttribute(
      'href',
      '/dashboard/personas/2',
    );
    expect(getMencionables).toHaveBeenCalledWith(5);
  });

  it('al comentar con una mención elegida envía el token @[Nombre](id)', async () => {
    const { crear, onMutado } = renderThread();
    const textarea = (await screen.findByPlaceholderText('Escribe un comentario...')) as HTMLTextAreaElement;
    await waitFor(() => expect(getMencionables).toHaveBeenCalled());

    fireEvent.change(textarea, { target: { value: 'Hola @mar', selectionStart: 9, selectionEnd: 9 } });
    fireEvent.mouseDown(await screen.findByRole('option', { name: /María López/ }));
    fireEvent.change(textarea, {
      target: { value: 'Hola @María López revisa', selectionStart: 24, selectionEnd: 24 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Comentar' }));

    await waitFor(() => expect(crear).toHaveBeenCalledWith('Hola @[María López](2) revisa'));
    await waitFor(() => expect(onMutado).toHaveBeenCalled());
  });

  it('el autor edita su comentario conservando y agregando menciones', async () => {
    const { editar } = renderThread();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar comentario' }));
    const edicion = screen.getByRole('combobox', { name: 'Editar comentario' }) as HTMLTextAreaElement;
    expect(edicion.value).toBe('Mío, menciono a @María López');

    const valor = 'Mío, menciono a @María López y @car';
    fireEvent.change(edicion, { target: { value: valor, selectionStart: valor.length, selectionEnd: valor.length } });
    fireEvent.mouseDown(await screen.findByRole('option', { name: /Carlos Mendoza/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(editar).toHaveBeenCalledWith(2, 'Mío, menciono a @[María López](2) y @[Carlos Mendoza](1)'),
    );
  });

  it('solo el autor ve las acciones de editar y eliminar', async () => {
    renderThread();

    await screen.findAllByRole('listitem');
    expect(screen.getAllByRole('button', { name: 'Editar comentario' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Eliminar comentario' })).toHaveLength(1);
  });

  it('lleva a la vista el comentario de la notificación y lo ilumina', async () => {
    renderThread({ comentarioDestacado: 1 });

    await waitFor(() => expect(document.getElementById('comentario-1')).toHaveClass('comment-spotlight'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(document.getElementById('comentario-2')).not.toHaveClass('comment-spotlight');
  });

  it('sin permiso de escritura muestra el hilo sin cuadro de comentario ni acciones', async () => {
    renderThread({ puedeComentar: false });

    await screen.findAllByRole('listitem');
    expect(screen.queryByPlaceholderText('Escribe un comentario...')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar comentario' })).not.toBeInTheDocument();
    expect(getMencionables).not.toHaveBeenCalled();
  });
});
