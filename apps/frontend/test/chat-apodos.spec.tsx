import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

beforeAll(() => {
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: { idUsuario: 1 } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/mensajes', () => ({ confirmar: vi.fn() }));

const mutateAsync = vi.fn();
vi.mock('@/hooks/use-chat', () => ({
  useMessages: () => ({
    messages: [
      {
        idMensaje: 1,
        idConversacion: 5,
        contenido: 'hola',
        enviadoEn: '2026-10-16T10:00:00Z',
        remitente: { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null },
      },
    ],
    isLoading: false,
  }),
  useSendMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useReadReceipts: () => ({ lecturas: [] }),
  useMarkConversationRead: () => ({ mutate: vi.fn() }),
  useSendFileMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useAttachmentThumbnail: () => ({ data: undefined }),
  useLoadOlderMessages: () => async () => [],
  useToggleReaction: () => ({ mutate: vi.fn() }),
  useUpdateChatTheme: () => ({ mutate: vi.fn(), isPending: false }),
  useToggleSavedMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useSilenciarConversation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateConversation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteConversation: () => ({ mutate: vi.fn(), isPending: false }),
  useSetApodo: () => ({ mutateAsync, isPending: false }),
  useAllConversations: () => ({
    conversations: [
      {
        idConversacion: 5,
        idProyecto: 10,
        proyecto: { idProyecto: 10, tituloProyecto: 'Feria' },
        tipo: 'INDIVIDUAL',
        nombre: null,
        nombrePersonalizado: null,
        participantes: [
          { idUsuario: 1, nombre: 'Yo', apellido: 'Usuario', fotoUrl: null, apodo: null },
          { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null, apodo: 'Rosita' },
        ],
        ultimoMensaje: null,
        ultimoMensajeEsPropio: false,
        noLeidos: 0,
        esFavorita: false,
        archivadaManual: false,
        silenciada: false,
        esPrioritaria: true,
      },
    ],
  }),
}));

import { nombreMostrado, nombreReal } from '../lib/chat-apodos';
import { ApodosDialog } from '../components/chat-dock/apodos-dialog';
import { ChatWindow } from '../components/chat-dock/chat-window';

afterEach(() => {
  cleanup();
  mutateAsync.mockReset();
});

describe('nombreMostrado', () => {
  const rosa = { nombre: 'Rosa', apellido: 'Fuentes' };

  it('usa el apodo si existe', () => {
    expect(nombreMostrado({ ...rosa, apodo: 'Rosita' })).toBe('Rosita');
  });

  it('cae al nombre real sin apodo, con apodo vacio o solo espacios', () => {
    expect(nombreMostrado(rosa)).toBe('Rosa Fuentes');
    expect(nombreMostrado({ ...rosa, apodo: null })).toBe('Rosa Fuentes');
    expect(nombreMostrado({ ...rosa, apodo: '  ' })).toBe('Rosa Fuentes');
    expect(nombreReal(rosa)).toBe('Rosa Fuentes');
  });
});

describe('ApodosDialog', () => {
  const participantes = [
    { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null, apodo: 'Rosita' },
    { idUsuario: 3, nombre: 'Luis', apellido: 'Paz', fotoUrl: null, apodo: null },
  ];

  function abrir() {
    const onOpenChange = vi.fn();
    render(createElement(ApodosDialog, { open: true, onOpenChange, idProyecto: 10, idConversacion: 5, participantes }));
    return onOpenChange;
  }

  it('es un dialogo accesible con un campo etiquetado por participante', () => {
    abrir();
    expect(screen.getByRole('dialog', { name: 'Apodos' })).toBeInTheDocument();
    expect(screen.getByLabelText('Rosa Fuentes')).toHaveValue('Rosita');
    expect(screen.getByLabelText('Luis Paz')).toHaveValue('');
  });

  it('guarda solo los cambios y quita el apodo al vaciar el campo', async () => {
    mutateAsync.mockResolvedValue(undefined);
    const onOpenChange = abrir();

    fireEvent.change(screen.getByLabelText('Rosa Fuentes'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Luis Paz'), { target: { value: ' Lucho ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutateAsync).toHaveBeenCalledWith({ idObjetivo: 2, apodo: null });
    expect(mutateAsync).toHaveBeenCalledWith({ idObjetivo: 3, apodo: 'Lucho' });
  });

  it('no llama al servicio si no hay cambios', async () => {
    const onOpenChange = abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('no cierra el dialogo si falla el guardado', async () => {
    mutateAsync.mockRejectedValue(new Error('x'));
    const onOpenChange = abrir();
    fireEvent.change(screen.getByLabelText('Luis Paz'), { target: { value: 'Lucho' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('ChatWindow con apodos', () => {
  it('muestra el apodo del remitente con el nombre real en title', () => {
    render(createElement(ChatWindow, { idProyecto: 10, idConversacion: 5, minimized: false, onMinimize: vi.fn(), onClose: vi.fn() }));
    const nombre = screen.getAllByText('Rosita').find((el) => el.getAttribute('title') === 'Rosa Fuentes');
    expect(nombre).toBeTruthy();
  });
});
