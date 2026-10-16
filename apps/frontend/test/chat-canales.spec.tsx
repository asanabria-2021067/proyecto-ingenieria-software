import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: { idUsuario: 1 } }) }));

const abrirChat = vi.hoisted(() => vi.fn());
vi.mock('@/components/chat-dock/chat-dock-context', () => ({ useChatDock: () => ({ abrirChat }) }));

const listAllConversationsMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/chat', () => ({ listAllConversations: (...args: unknown[]) => listAllConversationsMock(...args) }));

const getMyProjectsMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/projects', () => ({
  getMyProjects: getMyProjectsMock,
  getContributorProjects: vi.fn().mockResolvedValue([]),
}));

const useProjectMembersMock = vi.hoisted(() => vi.fn((): { members: unknown[]; isLoading: boolean } => ({ members: [], isLoading: false })));
vi.mock('@/hooks/use-project-members', () => ({ useProjectMembers: useProjectMembersMock }));

const createChannelMutate = vi.hoisted(() => vi.fn());
const updateMembersMutate = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-chat', async () => {
  const actual = await vi.importActual<typeof import('../hooks/use-chat')>('../hooks/use-chat');
  return {
    ...actual,
    useCreateChannel: () => ({ mutateAsync: createChannelMutate, isPending: false }),
    useUpdateChannelMembers: () => ({ mutateAsync: updateMembersMutate, isPending: false }),
  };
});

import { ChatListPopover } from '../components/chat-dock/chat-list-popover';
import { ChannelDialog } from '../components/chat-dock/channel-dialog';
import type { ChatConversacionGlobal } from '../lib/types/chat';

const yo = { idUsuario: 1, nombre: 'Yo', apellido: 'Lider', fotoUrl: null };
const rosa = { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null };
const carlos = { idUsuario: 3, nombre: 'Carlos', apellido: 'Mendoza', fotoUrl: null };

function conversacion(overrides: Partial<ChatConversacionGlobal> = {}): ChatConversacionGlobal {
  return {
    idConversacion: 1,
    idProyecto: 10,
    proyecto: { idProyecto: 10, tituloProyecto: 'Feria de Ciencias' },
    tipo: 'INDIVIDUAL',
    nombre: null,
    nombrePersonalizado: null,
    esCanal: false,
    participantes: [yo, rosa],
    ultimoMensaje: null,
    ultimoMensajeEsPropio: false,
    noLeidos: 0,
    esFavorita: false,
    archivadaManual: false,
    silenciada: false,
    esPrioritaria: true,
    ...overrides,
  };
}

const general = conversacion({
  idConversacion: 5,
  tipo: 'GRUPAL',
  nombre: 'general',
  esCanal: true,
  participantes: [yo, rosa, carlos],
});
const backend = conversacion({
  idConversacion: 6,
  tipo: 'GRUPAL',
  nombre: 'backend',
  esCanal: true,
  participantes: [yo, rosa],
});

function conQuery(node: ReturnType<typeof createElement>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, node);
}

const miembros = [
  { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', correo: 'r@uvg.edu.gt', fotoUrl: null, idRolProyecto: 1 },
  // Mismo usuario con dos roles: debe listarse una sola vez.
  { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', correo: 'r@uvg.edu.gt', fotoUrl: null, idRolProyecto: 2 },
  { idUsuario: 3, nombre: 'Carlos', apellido: 'Mendoza', correo: 'c@uvg.edu.gt', fotoUrl: null, idRolProyecto: 1 },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChatListPopover - seccion Canales', () => {
  it('muestra los canales con # en su propia seccion, fuera de las pestanas, sin romper los chats', async () => {
    getMyProjectsMock.mockResolvedValue([]);
    listAllConversationsMock.mockResolvedValue([general, backend, conversacion()]);
    render(conQuery(createElement(ChatListPopover, { onClose: vi.fn() })));

    const seccion = await screen.findByRole('region', { name: 'Canales' });
    expect(seccion).toHaveTextContent('#general');
    expect(seccion).toHaveTextContent('#backend');
    expect(screen.getByText('Rosa Fuentes')).toBeInTheDocument();

    // Pestana Otros: los canales siguen visibles aparte, el chat prioritario no.
    fireEvent.click(screen.getByRole('button', { name: 'Otros' }));
    expect(screen.getByRole('region', { name: 'Canales' })).toBeInTheDocument();
    expect(screen.queryByText('Rosa Fuentes')).not.toBeInTheDocument();
  });

  it('sin canales no renderiza la seccion', async () => {
    getMyProjectsMock.mockResolvedValue([]);
    listAllConversationsMock.mockResolvedValue([conversacion()]);
    render(conQuery(createElement(ChatListPopover, { onClose: vi.fn() })));

    await screen.findByText('Rosa Fuentes');
    expect(screen.queryByRole('region', { name: 'Canales' })).not.toBeInTheDocument();
  });

  it('al hacer click en un canal lo abre en el dock y cierra la lista', async () => {
    const onClose = vi.fn();
    getMyProjectsMock.mockResolvedValue([]);
    listAllConversationsMock.mockResolvedValue([general]);
    render(conQuery(createElement(ChatListPopover, { onClose })));

    fireEvent.click(await screen.findByRole('button', { name: /#general/ }));

    expect(abrirChat).toHaveBeenCalledWith(10, 5);
    expect(onClose).toHaveBeenCalled();
  });

  it('el lider ve Crear canal y Gestionar miembros; quien no lidera no', async () => {
    getMyProjectsMock.mockResolvedValue([{ idProyecto: 10, tituloProyecto: 'Feria de Ciencias', estadoProyecto: 'EN_PROGRESO' }]);
    listAllConversationsMock.mockResolvedValue([general]);
    const { unmount } = render(conQuery(createElement(ChatListPopover, { onClose: vi.fn() })));

    expect(await screen.findByRole('button', { name: 'Crear canal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gestionar miembros de #general' })).toBeInTheDocument();
    unmount();

    getMyProjectsMock.mockResolvedValue([]);
    render(conQuery(createElement(ChatListPopover, { onClose: vi.fn() })));
    await screen.findByRole('button', { name: /#general/ });
    expect(screen.queryByRole('button', { name: 'Crear canal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gestionar miembros/ })).not.toBeInTheDocument();
  });

  it('Gestionar miembros abre el dialogo del canal', async () => {
    getMyProjectsMock.mockResolvedValue([{ idProyecto: 10, tituloProyecto: 'Feria de Ciencias', estadoProyecto: 'EN_PROGRESO' }]);
    listAllConversationsMock.mockResolvedValue([backend]);
    useProjectMembersMock.mockReturnValue({ members: miembros, isLoading: false });
    render(conQuery(createElement(ChatListPopover, { onClose: vi.fn() })));

    fireEvent.click(await screen.findByRole('button', { name: 'Gestionar miembros de #backend' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent('Miembros de #backend');
  });

  it('Crear canal abre el dialogo de nuevo canal', async () => {
    getMyProjectsMock.mockResolvedValue([{ idProyecto: 10, tituloProyecto: 'Feria de Ciencias', estadoProyecto: 'EN_PROGRESO' }]);
    listAllConversationsMock.mockResolvedValue([]);
    useProjectMembersMock.mockReturnValue({ members: [], isLoading: false });
    render(conQuery(createElement(ChatListPopover, { onClose: vi.fn() })));

    fireEvent.click(await screen.findByRole('button', { name: 'Crear canal' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent('Nuevo canal');
  });
});

describe('ChannelDialog', () => {
  function renderDialog(props: Partial<Parameters<typeof ChannelDialog>[0]> = {}) {
    const onOpenChange = vi.fn();
    render(conQuery(createElement(ChannelDialog, { currentUserId: 1, onOpenChange, ...props })));
    return { onOpenChange };
  }

  function elegirProyecto(id: number) {
    // Radix Select no abre su listbox en jsdom: se usa el <select> nativo oculto.
    fireEvent.change(document.querySelector('select') as HTMLSelectElement, { target: { value: String(id) } });
  }

  it('crea un canal normalizado con los integrantes marcados y lo abre', async () => {
    getMyProjectsMock.mockResolvedValue([
      { idProyecto: 10, tituloProyecto: 'Feria de Ciencias', estadoProyecto: 'EN_PROGRESO' },
      { idProyecto: 11, tituloProyecto: 'Cerrado', estadoProyecto: 'CERRADO' },
    ]);
    useProjectMembersMock.mockReturnValue({ members: miembros, isLoading: false });
    createChannelMutate.mockResolvedValue({ idConversacion: 77, idProyecto: 10, nombre: 'backend', esGeneral: false });
    const { onOpenChange } = renderDialog();

    await waitFor(() => expect(getMyProjectsMock).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('option[value="10"]')).not.toBeNull());
    expect(document.querySelector('option[value="11"]')).toBeNull();
    elegirProyecto(10);

    // Rosa aparece una sola vez aunque tenga dos roles; el lider no se lista.
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.queryByRole('checkbox', { name: /Yo Lider/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nombre del canal'), { target: { value: ' #Backend ' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Rosa Fuentes/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear canal' }));

    await waitFor(() => expect(createChannelMutate).toHaveBeenCalledWith({ nombre: 'backend', idsMiembros: [2] }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(abrirChat).toHaveBeenCalledWith(10, 77);
  });

  it('rechaza un nombre invalido sin llamar al backend', async () => {
    getMyProjectsMock.mockResolvedValue([{ idProyecto: 10, tituloProyecto: 'Feria', estadoProyecto: 'EN_PROGRESO' }]);
    useProjectMembersMock.mockReturnValue({ members: miembros, isLoading: false });
    renderDialog();
    await waitFor(() => expect(document.querySelector('option[value="10"]')).not.toBeNull());
    elegirProyecto(10);

    fireEvent.change(screen.getByLabelText('Nombre del canal'), { target: { value: 'con espacios' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear canal' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/entre 2 y 40/);
    expect(createChannelMutate).not.toHaveBeenCalled();
  });

  it('pide elegir proyecto antes de crear', async () => {
    getMyProjectsMock.mockResolvedValue([]);
    useProjectMembersMock.mockReturnValue({ members: [], isLoading: false });
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Crear canal' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Elige un proyecto.');
  });

  it('muestra el error del backend (p. ej. nombre duplicado)', async () => {
    getMyProjectsMock.mockResolvedValue([{ idProyecto: 10, tituloProyecto: 'Feria', estadoProyecto: 'EN_PROGRESO' }]);
    useProjectMembersMock.mockReturnValue({ members: miembros, isLoading: false });
    createChannelMutate.mockRejectedValue(new Error('Ya existe un canal llamado #backend'));
    renderDialog();
    await waitFor(() => expect(document.querySelector('option[value="10"]')).not.toBeNull());
    elegirProyecto(10);

    fireEvent.change(screen.getByLabelText('Nombre del canal'), { target: { value: 'backend' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear canal' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(abrirChat).not.toHaveBeenCalled();
  });

  it('gestionar: precarga los miembros del canal y envia solo el diff', async () => {
    useProjectMembersMock.mockReturnValue({ members: miembros, isLoading: false });
    updateMembersMutate.mockResolvedValue(undefined);
    const { onOpenChange } = renderDialog({ canal: backend });

    const rosaBox = screen.getByRole('checkbox', { name: /Rosa Fuentes/ });
    const carlosBox = screen.getByRole('checkbox', { name: /Carlos Mendoza/ });
    expect(rosaBox).toBeChecked();
    expect(carlosBox).not.toBeChecked();

    fireEvent.click(rosaBox);
    fireEvent.click(carlosBox);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(updateMembersMutate).toHaveBeenCalledWith({ agregar: [3], quitar: [2] }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('#general se muestra con todos marcados y bloqueado, sin boton Guardar', () => {
    useProjectMembersMock.mockReturnValue({ members: miembros, isLoading: false });
    renderDialog({ canal: general });

    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).toBeChecked();
      expect(box).toBeDisabled();
    }
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
  });

  it('muestra el error si guardar los miembros falla', async () => {
    useProjectMembersMock.mockReturnValue({ members: miembros, isLoading: false });
    updateMembersMutate.mockRejectedValue(new Error('boom'));
    renderDialog({ canal: backend });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('muestra estados vacios y de carga del equipo', () => {
    useProjectMembersMock.mockReturnValue({ members: [], isLoading: true });
    renderDialog({ canal: backend });
    expect(screen.getByText('Cargando equipo…')).toBeInTheDocument();
    cleanup();

    useProjectMembersMock.mockReturnValue({ members: [], isLoading: false });
    renderDialog({ canal: backend });
    expect(screen.getByText('No hay más integrantes en este proyecto.')).toBeInTheDocument();
  });
});
