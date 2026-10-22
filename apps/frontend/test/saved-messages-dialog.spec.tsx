import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

beforeAll(() => {
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const abrirChat = vi.fn();
vi.mock('@/components/chat-dock/chat-dock-context', () => ({ useChatDock: () => ({ abrirChat }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const quitarMutate = vi.fn();
const cargarMas = vi.fn();
const estado = vi.hoisted(() => ({
  value: { guardados: [] as unknown[], hasMore: false, isLoading: false, isError: false, cargandoMas: false },
}));
vi.mock('@/hooks/use-chat', () => ({
  useSavedMessages: () => ({ ...estado.value, cargarMas }),
  useToggleSavedMessage: () => ({ mutate: quitarMutate, isPending: false }),
}));

import { SavedMessagesDialog } from '../components/chat-dock/saved-messages-dialog';

const yo = { idUsuario: 1, nombre: 'Yo', apellido: 'Usuario', fotoUrl: null };
const rosa = { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null };

function guardado(idMensaje: number, conversacion: Record<string, unknown> = {}) {
  return {
    idMensaje,
    contenido: `contenido ${idMensaje}`,
    enviadoEn: '2026-10-16T09:00:00.000Z',
    guardadoEn: '2026-10-16T10:00:00.000Z',
    remitente: rosa,
    conversacion: {
      idConversacion: 5,
      idProyecto: 10,
      tipo: 'INDIVIDUAL',
      nombre: null,
      nombrePersonalizado: null,
      participantes: [yo, rosa],
      ...conversacion,
    },
  };
}

function renderDialog(onOpenChange = vi.fn()) {
  render(createElement(SavedMessagesDialog, { open: true, onOpenChange, currentUserId: 1 }));
  return onOpenChange;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  estado.value = { guardados: [], hasMore: false, isLoading: false, isError: false, cargandoMas: false };
});

describe('SavedMessagesDialog', () => {
  it('lista los guardados con el contenido y el nombre de la conversacion', () => {
    estado.value.guardados = [guardado(1), guardado(2, { tipo: 'GRUPAL', nombre: 'Equipo' })];
    renderDialog();

    expect(screen.getByText('contenido 1')).toBeInTheDocument();
    expect(screen.getByText('contenido 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir a la conversación Rosa Fuentes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir a la conversación Equipo' })).toBeInTheDocument();
  });

  it('usa el nombre personalizado y cae a "Conversación" sin otro participante', () => {
    estado.value.guardados = [guardado(1, { nombrePersonalizado: 'Mis notas' }), guardado(2, { participantes: [yo] })];
    renderDialog();

    expect(screen.getByRole('button', { name: 'Ir a la conversación Mis notas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir a la conversación Conversación' })).toBeInTheDocument();
  });

  it('saltar a la conversacion abre el chat y cierra el dialogo', () => {
    estado.value.guardados = [guardado(1)];
    const onOpenChange = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Ir a la conversación Rosa Fuentes' }));

    expect(abrirChat).toHaveBeenCalledWith(10, 5);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('quitar de guardados alterna el mensaje', () => {
    estado.value.guardados = [guardado(3)];
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar de guardados' }));

    expect(quitarMutate).toHaveBeenCalledWith(3, expect.any(Object));
  });

  it('muestra estado vacio, carga y error', () => {
    renderDialog();
    expect(screen.getByText('Aún no has guardado mensajes.')).toBeInTheDocument();
    cleanup();

    estado.value.isLoading = true;
    renderDialog();
    expect(screen.getByText('Cargando guardados…')).toBeInTheDocument();
    expect(screen.queryByText('Aún no has guardado mensajes.')).not.toBeInTheDocument();
    cleanup();

    estado.value = { ...estado.value, isLoading: false, isError: true };
    renderDialog();
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar');
  });

  it('"Cargar más" aparece solo si hay más páginas', () => {
    estado.value.guardados = [guardado(1)];
    estado.value.hasMore = true;
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(cargarMas).toHaveBeenCalled();
  });
});
