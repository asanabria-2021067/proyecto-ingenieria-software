import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

const editMutate = vi.fn();
const deleteMutate = vi.fn();
vi.mock('@/hooks/use-chat', () => ({
  useEditMessage: () => ({ mutate: editMutate, isPending: false }),
  useDeleteMessage: () => ({ mutate: deleteMutate, isPending: false }),
  useToggleSavedMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useAttachmentThumbnail: () => ({ data: undefined }),
  useLinkPreview: () => ({ data: undefined }),
}));

const confirmarMock = vi.fn();
vi.mock('@/lib/mensajes', () => ({ confirmar: (...args: unknown[]) => confirmarMock(...args) }));
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...args: unknown[]) => toastError(...args) } }));

import { ChatMessageItem } from '../components/chat-dock/chat-message-item';
import type { ChatMensaje } from '../lib/types/chat';

const base: ChatMensaje = {
  idMensaje: 7,
  idConversacion: 5,
  contenido: 'hola mundo',
  enviadoEn: '2026-10-16T10:00:00.000Z',
  editadoEn: null,
  eliminadoEn: null,
  remitente: { idUsuario: 1, nombre: 'Ana', apellido: 'Perez', fotoUrl: null },
};

const onResponder = vi.fn();
const onIrAlOriginal = vi.fn();
const onReaccionar = vi.fn();

function renderItem(mensaje: Partial<ChatMensaje> = {}, propio = true, extra: Record<string, unknown> = {}) {
  render(
    createElement(ChatMessageItem, {
      mensaje: { ...base, ...mensaje },
      propio,
      idProyecto: 10,
      idConversacion: 5,
      onResponder,
      onIrAlOriginal,
      onReaccionar,
      ...extra,
    }),
  );
}

async function abrirMenu() {
  const trigger = screen.getByRole('button', { name: 'Acciones del mensaje' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return screen.findByRole('menu');
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChatMessageItem', () => {
  it('un mensaje ajeno no muestra el menu de acciones', () => {
    renderItem({}, false);
    expect(screen.queryByRole('button', { name: 'Acciones del mensaje' })).not.toBeInTheDocument();
  });

  it('muestra la etiqueta (editado) solo si hay editadoEn', () => {
    renderItem({ editadoEn: '2026-10-16T10:05:00.000Z' });
    expect(screen.getByText('(editado)')).toBeInTheDocument();
    cleanup();
    renderItem();
    expect(screen.queryByText('(editado)')).not.toBeInTheDocument();
  });

  it('un mensaje eliminado muestra "Mensaje eliminado", sin contenido, sin menu ni etiqueta de edicion', () => {
    renderItem({ contenido: '', eliminadoEn: '2026-10-16T10:10:00.000Z', editadoEn: '2026-10-16T10:05:00.000Z' });
    expect(screen.getByText('Mensaje eliminado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acciones del mensaje' })).not.toBeInTheDocument();
    expect(screen.queryByText('(editado)')).not.toBeInTheDocument();
  });

  it('Editar abre un campo con el contenido; Enter guarda el texto recortado', async () => {
    renderItem();
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Editar/ }));

    const input = screen.getByRole('textbox', { name: 'Editar mensaje' });
    expect(input).toHaveValue('hola mundo');
    fireEvent.change(input, { target: { value: '  nuevo texto  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(editMutate).toHaveBeenCalledWith({ idMensaje: 7, contenido: 'nuevo texto' }, expect.any(Object));
  });

  it('Escape cancela la edicion sin llamar al backend', async () => {
    renderItem();
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Editar/ }));

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Editar mensaje' }), { key: 'Escape' });

    expect(screen.queryByRole('textbox', { name: 'Editar mensaje' })).not.toBeInTheDocument();
    expect(screen.getByText('hola mundo')).toBeInTheDocument();
    expect(editMutate).not.toHaveBeenCalled();
  });

  it('guardar vacio o sin cambios cierra la edicion sin llamar al backend', async () => {
    renderItem();
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Editar/ }));
    const input = screen.getByRole('textbox', { name: 'Editar mensaje' });

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(editMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Editar mensaje' })).not.toBeInTheDocument();

    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Editar/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Editar mensaje' }), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar edición' }));
    expect(editMutate).not.toHaveBeenCalled();
  });

  it('el boton Cancelar edición cierra el campo', async () => {
    renderItem();
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Editar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar edición' }));
    expect(screen.queryByRole('textbox', { name: 'Editar mensaje' })).not.toBeInTheDocument();
  });

  it('si editar falla muestra un aviso de error; si sale bien cierra la edicion', async () => {
    renderItem();
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Editar/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Editar mensaje' }), { target: { value: 'otro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar edición' }));

    const opciones = editMutate.mock.calls[0][1];
    opciones.onError();
    expect(toastError).toHaveBeenCalledWith('No se pudo editar el mensaje');
    act(() => opciones.onSuccess());
    expect(screen.queryByRole('textbox', { name: 'Editar mensaje' })).not.toBeInTheDocument();
  });

  it('Eliminar pide confirmacion y solo elimina si se confirma', async () => {
    confirmarMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderItem();

    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Eliminar/ }));
    await vi.waitFor(() => expect(confirmarMock).toHaveBeenCalledTimes(1));
    expect(confirmarMock).toHaveBeenCalledWith(expect.objectContaining({ destructiva: true }));
    expect(deleteMutate).not.toHaveBeenCalled();

    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Eliminar/ }));
    await vi.waitFor(() => expect(deleteMutate).toHaveBeenCalledWith(7, expect.any(Object)));

    deleteMutate.mock.calls[0][1].onError();
    expect(toastError).toHaveBeenCalledWith('No se pudo eliminar el mensaje');
  });

  it('expone los atributos de salto y el resalte para la busqueda', () => {
    const { container } = render(
      createElement(ChatMessageItem, { mensaje: base, propio: true, idProyecto: 10, idConversacion: 5, resaltado: true, onResponder, onIrAlOriginal, onReaccionar }),
    );
    const raiz = container.firstElementChild as HTMLElement;
    expect(raiz).toHaveAttribute('data-mensaje-id', '7');
    expect(raiz).toHaveAttribute('data-mensaje', '7');
    expect(raiz.className).toContain('ring-primary');
  });

  it('muestra el apodo del remitente con el nombre real de tooltip', () => {
    renderItem({}, false, { apodo: 'Jefa' });
    expect(screen.getByText('Jefa')).toHaveAttribute('title', 'Ana Perez');
  });

  it('la cita salta al original y Responder avisa con el mensaje', () => {
    renderItem({
      citado: { idMensaje: 3, remitente: { idUsuario: 2, nombre: 'Luis', apellido: 'Gomez', fotoUrl: null }, extracto: 'texto original' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Ir al mensaje original de Luis Gomez/ }));
    expect(onIrAlOriginal).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByRole('button', { name: 'Responder a Ana' }));
    expect(onResponder).toHaveBeenCalledWith(expect.objectContaining({ idMensaje: 7 }));
  });

  it('si el mensaje citado fue eliminado la cita muestra "Mensaje eliminado" y no el contenido', () => {
    renderItem({
      citado: { idMensaje: 3, remitente: { idUsuario: 2, nombre: 'Luis', apellido: 'Gomez', fotoUrl: null }, extracto: '', eliminado: true },
    });
    expect(screen.getByRole('button', { name: /Ir al mensaje original de Luis Gomez: Mensaje eliminado/ })).toBeInTheDocument();
  });

  it('muestra el chip del adjunto y las reacciones, y reaccionar avisa con el emoji', () => {
    renderItem({
      adjunto: { idAdjunto: 9, nombreOriginal: 'hoja.pdf', mime: 'application/pdf', tamanoBytes: 2048 },
      reacciones: [{ emoji: '👍', count: 2, reaccionadoPorMi: false }],
    });
    expect(screen.getByText('hoja.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /👍 2 reacciones/ }));
    expect(onReaccionar).toHaveBeenCalledWith(7, '👍');
  });

  it('un mensaje eliminado no muestra adjunto, reacciones ni acciones de responder o guardar', () => {
    renderItem({
      contenido: '',
      eliminadoEn: '2026-10-16T10:10:00.000Z',
      adjunto: { idAdjunto: 9, nombreOriginal: 'hoja.pdf', mime: 'application/pdf', tamanoBytes: 2048 },
      reacciones: [{ emoji: '👍', count: 2, reaccionadoPorMi: false }],
    });
    expect(screen.queryByText('hoja.pdf')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /👍/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Responder a/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Guardar mensaje')).not.toBeInTheDocument();
  });
});
