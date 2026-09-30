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

const getMyProjectsMock = vi.hoisted(() => vi.fn());
const getContributorProjectsMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/projects', () => ({
  getMyProjects: getMyProjectsMock,
  getContributorProjects: getContributorProjectsMock,
}));

const useProjectMembersMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-project-members', () => ({ useProjectMembers: useProjectMembersMock }));

const createMutate = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-chat', () => ({
  useCreateConversation: () => ({ mutateAsync: createMutate, isPending: false }),
}));

const abrirChat = vi.hoisted(() => vi.fn());
vi.mock('@/components/chat-dock/chat-dock-context', () => ({ useChatDock: () => ({ abrirChat }) }));

import { NewChatDialog } from '../components/chat-dock/new-chat-dialog';

// Radix Select no renderiza su listbox (portal posicionado con mediciones
// reales) en jsdom — se interactúa a través del <select> nativo oculto que
// Radix mantiene sincronizado para compatibilidad con formularios, igual que
// ya hace complete-profile-dialog.spec.tsx con los `<select>` nativos.
function nativeSelect(): HTMLSelectElement {
  return document.querySelector('select') as HTMLSelectElement;
}

function elegirProyecto(id: number) {
  fireEvent.change(nativeSelect(), { target: { value: String(id) } });
}

function renderDialog(props: Partial<Parameters<typeof NewChatDialog>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  render(
    createElement(QueryClientProvider, { client }, createElement(NewChatDialog, {
      open: true,
      onOpenChange,
      currentUserId: 1,
      ...props,
    })),
  );
  return { onOpenChange };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NewChatDialog — sin idProyecto (dock global)', () => {
  it('muestra el selector de proyecto y carga el equipo del elegido', async () => {
    getMyProjectsMock.mockResolvedValue([{ idProyecto: 10, tituloProyecto: 'Gestión Académica', estadoProyecto: 'EN_PROGRESO' }]);
    getContributorProjectsMock.mockResolvedValue([{ idProyecto: 20, tituloProyecto: 'Reservas', estadoProyecto: 'PUBLICADO' }]);
    useProjectMembersMock.mockReturnValue({ members: [] });

    renderDialog();

    expect(await screen.findByText('Elige un proyecto para ver a su equipo.')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('excluye proyectos cerrados y no duplica uno presente en ambas listas', async () => {
    getMyProjectsMock.mockResolvedValue([
      { idProyecto: 10, tituloProyecto: 'Gestión Académica', estadoProyecto: 'EN_PROGRESO' },
      { idProyecto: 99, tituloProyecto: 'Proyecto viejo', estadoProyecto: 'CERRADO' },
    ]);
    getContributorProjectsMock.mockResolvedValue([
      { idProyecto: 10, tituloProyecto: 'Gestión Académica', estadoProyecto: 'EN_PROGRESO' },
    ]);
    useProjectMembersMock.mockReturnValue({ members: [] });

    renderDialog();

    await waitFor(() => expect(nativeSelect().querySelectorAll('option')).toHaveLength(1));
    const opciones = Array.from(nativeSelect().querySelectorAll('option')).map((o) => o.textContent);
    expect(opciones.filter((t) => t === 'Gestión Académica')).toHaveLength(1);
    expect(opciones).not.toContain('Proyecto viejo');
  });

  it('al elegir un proyecto, muestra a su equipo y permite crear el chat', async () => {
    getMyProjectsMock.mockResolvedValue([{ idProyecto: 10, tituloProyecto: 'Gestión Académica', estadoProyecto: 'EN_PROGRESO' }]);
    getContributorProjectsMock.mockResolvedValue([]);
    useProjectMembersMock.mockReturnValue({
      members: [{ idUsuario: 2, nombre: 'María', apellido: 'López', correo: 'm@uvg.edu.gt', fotoUrl: null, idRolProyecto: 1 }],
    });
    createMutate.mockResolvedValue({ idConversacion: 55 });

    renderDialog();

    await waitFor(() => expect(nativeSelect().querySelector('option[value="10"]')).toBeTruthy());
    elegirProyecto(10);

    expect(await screen.findByText('María López')).toBeInTheDocument();
    fireEvent.click(screen.getByText('María López'));
    fireEvent.click(screen.getByRole('button', { name: 'Crear chat' }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledWith({ tipo: 'INDIVIDUAL', nombre: undefined, idsParticipantes: [2] }));
    await waitFor(() => expect(abrirChat).toHaveBeenCalledWith(10, 55));
  });

  it('sin proyecto elegido, enviar muestra el error en vez de crear el chat', async () => {
    getMyProjectsMock.mockResolvedValue([]);
    getContributorProjectsMock.mockResolvedValue([]);
    useProjectMembersMock.mockReturnValue({ members: [] });

    renderDialog();
    await waitFor(() => expect(getMyProjectsMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Crear chat' }));

    expect(await screen.findByText('Elige un proyecto.')).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });
});

describe('NewChatDialog — con idProyecto fijo (sidebar de un proyecto)', () => {
  it('no muestra el selector de proyecto', () => {
    renderDialog({ idProyecto: 10, members: [{ idUsuario: 2, nombre: 'María', apellido: 'López', correo: 'm@uvg.edu.gt', fotoUrl: null, idRolProyecto: 1 }] });

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('María López')).toBeInTheDocument();
  });
});
