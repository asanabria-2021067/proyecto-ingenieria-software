import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ArchivedConversacion, ChatMensaje } from '@/lib/types/chat';

// T-236: pantalla de chats archivados. Aísla la página de sus servicios
// reales, igual que personas-page.spec.tsx aísla PersonasPage.

const listArchivedConversationsMock = vi.fn();
const getMessagesMock = vi.fn();

vi.mock('@/lib/services/chat', () => ({
  listArchivedConversations: (filtros: unknown) => listArchivedConversationsMock(filtros),
  getMessages: (idProyecto: number, idConversacion: number) => getMessagesMock(idProyecto, idConversacion),
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 1 }, isLoading: false }),
}));

function conversacion(overrides: Partial<ArchivedConversacion> = {}): ArchivedConversacion {
  return {
    idConversacion: 1,
    tipo: 'INDIVIDUAL',
    nombre: null,
    proyecto: { idProyecto: 17, tituloProyecto: 'Feria de Ciencias UVG 2026' },
    participantes: [
      { idUsuario: 1, nombre: 'Ana', apellido: 'Pérez', fotoUrl: null },
      { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null },
    ],
    ultimoMensaje: null,
    archivada: true,
    ...overrides,
  };
}

async function renderPage() {
  const { default: ChatsArchivadosPage } = await import('@/app/dashboard/chats/archivados/page');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ChatsArchivadosPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listArchivedConversationsMock.mockResolvedValue({ items: [], hasMore: false });
  getMessagesMock.mockResolvedValue([]);
});

describe('ChatsArchivadosPage', () => {
  it('muestra el estado vacío cuando no hay chats archivados', async () => {
    await renderPage();
    expect(await screen.findByText('Todavía no tenés chats archivados')).toBeInTheDocument();
  });

  it('lista una conversación archivada con el nombre del proyecto y un candado', async () => {
    listArchivedConversationsMock.mockResolvedValue({
      items: [conversacion()],
      hasMore: false,
    });
    await renderPage();

    expect(await screen.findByText('Rosa Fuentes')).toBeInTheDocument();
    expect(screen.getByText('Feria de Ciencias UVG 2026')).toBeInTheDocument();
  });

  it('escribir en el buscador dispara la consulta con el texto', async () => {
    await renderPage();
    await new Promise((r) => setTimeout(r, 0));

    fireEvent.change(screen.getByLabelText('Buscar chats archivados'), { target: { value: 'rosa' } });

    expect(listArchivedConversationsMock).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'rosa' }),
    );
  });

  it('al abrir una conversación, muestra el banner de archivado con el proyecto y el historial', async () => {
    listArchivedConversationsMock.mockResolvedValue({
      items: [conversacion()],
      hasMore: false,
    });
    const mensajes: ChatMensaje[] = [
      {
        idMensaje: 1,
        idConversacion: 1,
        contenido: 'Gracias por mentorear el equipo',
        enviadoEn: new Date().toISOString(),
        remitente: { idUsuario: 1, nombre: 'Ana', apellido: 'Pérez', fotoUrl: null },
      },
    ];
    getMessagesMock.mockResolvedValue(mensajes);
    await renderPage();

    fireEvent.click(await screen.findByText('Rosa Fuentes'));

    expect(await screen.findByText(/Archivado.*proyecto/i)).toBeInTheDocument();
    expect(await screen.findByText('Gracias por mentorear el equipo')).toBeInTheDocument();
    expect(getMessagesMock).toHaveBeenCalledWith(17, 1);
  });
});
