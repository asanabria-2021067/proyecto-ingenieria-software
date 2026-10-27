import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * IESUC-568 (B2, NeuroLab): la vista del proyecto ofrece un acceso fijo al
 * chat del equipo. No hay una ventana nueva: abre el canal #general en el
 * dock «Mensajes» de siempre (useChatDock().abrirChat).
 */

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const abrirChat = vi.hoisted(() => vi.fn());
const listChannels = vi.hoisted(() => vi.fn());
const avisoError = vi.hoisted(() => vi.fn());

vi.mock('@/components/chat-dock/chat-dock-context', () => ({ useChatDock: () => ({ abrirChat }) }));
vi.mock('@/lib/services/chat', () => ({ listChannels }));
vi.mock('@/lib/mensajes', () => ({ aviso: { error: avisoError, exito: vi.fn(), advertencia: vi.fn() } }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/projects/42' }));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('@/hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('@/hooks/use-project-members', () => ({ useProjectMembers: vi.fn() }));
vi.mock('@/components/chat-dock/new-chat-dialog', () => ({ NewChatDialog: () => null }));
vi.mock('@/hooks/use-exit-request', () => ({ useCurrentExitRequest: vi.fn(() => ({ request: null })) }));
vi.mock('@/components/projects/leave-project-modal', () => ({ LeaveProjectModal: () => null }));

import { ProjectTeamChatButton } from '@/components/chat-dock/project-team-chat-button';
import { ProjectSidebar } from '@/components/projects/project-sidebar';
import { ProjectMobileNav } from '@/components/projects/navigation/project-mobile-nav';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectMembers } from '@/hooks/use-project-members';

const CANALES = [
  { idConversacion: 31, idProyecto: 42, nombre: 'backend', esGeneral: false },
  { idConversacion: 30, idProyecto: 42, nombre: 'general', esGeneral: true },
];

function sesion(idUsuario: number) {
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario } });
  (useProjectDetail as any).mockReturnValue({
    data: { idProyecto: 42, tituloProyecto: 'Proyecto de prueba', creador: { idUsuario: 1 }, estadoProyecto: 'EN_PROGRESO' },
  });
  (useProjectMembers as any).mockReturnValue({ members: [] });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProjectTeamChatButton', () => {
  it('abre el canal #general del proyecto en el dock de mensajes', async () => {
    listChannels.mockResolvedValue(CANALES);
    render(createElement(ProjectTeamChatButton, { idProyecto: 42, variant: 'sidebar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Chat del equipo' }));

    await waitFor(() => expect(abrirChat).toHaveBeenCalledWith(42, 30));
    expect(listChannels).toHaveBeenCalledWith(42);
    expect(avisoError).not.toHaveBeenCalled();
  });

  it('si el proyecto no tiene #general avisa en lugar de abrir otra conversación', async () => {
    listChannels.mockResolvedValue([CANALES[0]]);
    render(createElement(ProjectTeamChatButton, { idProyecto: 42, variant: 'bar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Chat del equipo' }));

    await waitFor(() => expect(avisoError).toHaveBeenCalledWith('No se encontró el chat del equipo', expect.any(String)));
    expect(abrirChat).not.toHaveBeenCalled();
  });

  it('si la petición falla avisa y el botón vuelve a estar disponible', async () => {
    listChannels.mockRejectedValue(new Error('red'));
    render(createElement(ProjectTeamChatButton, { idProyecto: 42, variant: 'compact' }));
    const boton = screen.getByRole('button', { name: 'Chat del equipo' });

    fireEvent.click(boton);

    await waitFor(() => expect(avisoError).toHaveBeenCalledWith('No se pudo abrir el chat del equipo', expect.any(String)));
    expect(boton).toBeEnabled();
  });
});

describe('acceso fijo en la vista del proyecto', () => {
  it('la sidebar del proyecto lo muestra al líder y a los integrantes', () => {
    sesion(1);
    render(createElement(ProjectSidebar, { idProyecto: 42 }));

    expect(screen.getByRole('button', { name: 'Chat del equipo' })).toBeInTheDocument();
  });

  it('un visitante no lo ve', () => {
    sesion(99);
    render(createElement(ProjectSidebar, { idProyecto: 42 }));

    expect(screen.queryByRole('button', { name: 'Chat del equipo' })).not.toBeInTheDocument();
  });

  it('la barra del proyecto en tablet también lo ofrece, solo desde md (donde existe el dock)', async () => {
    sesion(1);
    listChannels.mockResolvedValue(CANALES);
    render(createElement(ProjectMobileNav, { idProyecto: 42 }));
    const boton = screen.getByRole('button', { name: 'Chat del equipo' });

    expect(boton).toHaveClass('hidden', 'md:flex');
    fireEvent.click(boton);

    await waitFor(() => expect(abrirChat).toHaveBeenCalledWith(42, 30));
  });
});
