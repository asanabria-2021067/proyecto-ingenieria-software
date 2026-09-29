import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// HU-154 (T-215): la página del participante ya no tiene su barra local
// «Resumen / Solicitud de salida / Tablero» ni su propio modal de salida. Los
// destinos viven en la navegación contextual y la salida es una acción de su
// menú. Lo que no puede cambiar: el banner de solicitud en curso y las
// llamadas a la acción por rol (INV-N15).

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '55' }),
  usePathname: () => '/dashboard/proyectos/55',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../lib/api/client', () => ({ apiFetch: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../hooks/use-project-members', () => ({ useProjectMembers: vi.fn() }));
vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-exit-request', () => ({ useCurrentExitRequest: vi.fn() }));
vi.mock('../hooks/use-project-roles', () => ({ useProjectRoles: vi.fn() }));
vi.mock('../hooks/use-historical-project', () => ({
  useHistoricalProject: () => ({ data: undefined, isPending: false, isError: false }),
}));
vi.mock('../components/chat-dock/new-chat-dialog', () => ({ NewChatDialog: () => null }));
vi.mock('../components/projects/leave-project-modal', () => ({
  LeaveProjectModal: ({ open }: { open: boolean }) =>
    open ? createElement('div', { role: 'dialog', 'aria-label': 'Solicitar salida del proyecto' }) : null,
}));
vi.mock('../app/dashboard/projects/[id]/project-detail-client', () => ({
  default: () => createElement('div', { 'data-testid': 'leader-workspace' }),
}));
vi.mock('../lib/swal', () => ({ default: { fire: vi.fn() } }));
const iniciarChatCon = vi.fn();
vi.mock('../components/chat-dock/chat-dock-context', () => ({
  ChatDockProvider: ({ children }: { children: ReactNode }) => children,
  useChatDock: () => ({ iniciarChatCon, windows: [], minimizedIds: new Set(), abrirChat: vi.fn(), cerrarChat: vi.fn(), toggleMinimize: vi.fn() }),
}));

import ProyectoDetallePage from '../app/dashboard/proyectos/[id]/page';
import ProyectoLayout from '../app/dashboard/proyectos/[id]/layout';
import { apiFetch } from '../lib/api/client';
import { useCurrentUser } from '../hooks/use-current-user';
import { useProjectMembers } from '../hooks/use-project-members';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useCurrentExitRequest } from '../hooks/use-exit-request';
import { useProjectRoles } from '../hooks/use-project-roles';
import uvgSwal from '../lib/swal';

const ROL_MIO = { idRolProyecto: 1, nombreRol: 'Frontend', descripcionRolProyecto: 'UI', cupos: 2, requisitos: [], horasSemanalesEstimadas: 8 };
const ROL_POSTULADO = { idRolProyecto: 2, nombreRol: 'Backend', descripcionRolProyecto: 'API', cupos: 2, requisitos: [], horasSemanalesEstimadas: 8 };
const ROL_LIBRE = { idRolProyecto: 3, nombreRol: 'Diseño', descripcionRolProyecto: 'UX', cupos: 1, requisitos: [], horasSemanalesEstimadas: 5 };

const PROYECTO = {
  idProyecto: 55,
  tituloProyecto: 'Portal de voluntariado UVG',
  descripcionProyecto: 'Portal interno de voluntariado.',
  objetivosProyecto: 'Centralizar la oferta de voluntariado',
  tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
  estadoProyecto: 'EN_PROGRESO',
  modalidadProyecto: 'MIXTA',
  fechaInicio: '2026-06-01T00:00:00.000Z',
  fechaFinEstimada: '2026-11-28T00:00:00.000Z',
  creador: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz', correo: 's6.lider@uvg.edu.gt' },
  organizaciones: [],
  intereses: [],
  roles: [ROL_MIO, ROL_POSTULADO, ROL_LIBRE],
};

const MIS_POSTULACIONES = [
  {
    idPostulacion: 9,
    estadoPostulacion: 'PENDIENTE',
    rolProyecto: { idRolProyecto: 2, nombreRol: 'Backend', proyecto: { idProyecto: 55 } },
  },
];

const SOLICITUD = { idSolicitud: 62, idProyecto: 55, idUsuario: 2, estadoSolicitud: 'PREPARACION', motivo: 'x', solicitadaEn: '2026-09-07T06:13:33.268Z' };

const salirDeRol = { mutate: vi.fn(), isPending: false, variables: undefined };

function mockParticipante({ solicitud = null }: { solicitud?: unknown } = {}) {
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 2 }, isLoading: false });
  (useProjectMembers as any).mockReturnValue({ members: [{ idUsuario: 2 }], isLoading: false });
  (useProjectDetail as any).mockReturnValue({ data: PROYECTO });
  (useCurrentExitRequest as any).mockReturnValue({ request: solicitud });
  (useProjectRoles as any).mockReturnValue({
    roles: [
      { idRolProyecto: 1, isMine: true, canLeave: true },
      { idRolProyecto: 2, isMine: false, canLeave: false },
      { idRolProyecto: 3, isMine: false, canLeave: false },
    ],
    salirDeRol,
  });
  (apiFetch as any).mockImplementation((path: string) => {
    if (path === '/proyectos/55') return Promise.resolve(PROYECTO);
    if (path === '/postulaciones/mis-postulaciones') return Promise.resolve(MIS_POSTULACIONES);
    return Promise.resolve(null);
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

async function renderPage() {
  render(createElement(ProyectoDetallePage), { wrapper });
  await screen.findByRole('heading', { level: 2, name: 'Portal de voluntariado UVG' });
}

async function renderPageEnLayout() {
  render(createElement(ProyectoLayout, null, createElement(ProyectoDetallePage)), { wrapper });
  await screen.findByRole('heading', { level: 2, name: 'Portal de voluntariado UVG' });
}

async function abrirPrimerMenuDeAcciones() {
  const trigger = screen.getAllByRole('button', { name: 'Acciones del proyecto' })[0];
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return within(await screen.findByRole('menu'));
}

beforeEach(() => {
  (uvgSwal.fire as any).mockResolvedValue({ isConfirmed: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Página del participante sin barra de pestañas local', () => {
  it('no renderiza la barra «Resumen / Solicitud de salida / Tablero»', async () => {
    mockParticipante();
    await renderPage();

    expect(screen.queryByRole('link', { name: /tablero/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /solicitud de salida/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /solicitud de salida/i })).not.toBeInTheDocument();
    // Sin barra de pestañas local: «Resumen» solo existe como título de la página (encabezado estándar).
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /resumen/i })).not.toBeInTheDocument();
    expect(screen.getAllByText('Resumen')).toEqual([screen.getByRole('heading', { level: 1, name: 'Resumen' })]);
  });

  it('la página no monta su propio modal de salida', async () => {
    mockParticipante();
    await renderPage();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('con solicitud en curso conserva el banner y su enlace a la preparación', async () => {
    mockParticipante({ solicitud: SOLICITUD });
    await renderPage();

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Tienes una solicitud de salida en curso');
    expect(within(banner).getByRole('link', { name: 'Ver solicitud de salida' })).toHaveAttribute(
      'href',
      '/dashboard/projects/55/salida/preparacion',
    );
    // Mismo tamaño que «Postularme a este rol»: 36 px y texto meta.
    expect(within(banner).getByRole('link', { name: 'Ver solicitud de salida' })).toHaveClass(
      'h-9',
      'px-4',
      'type-meta',
      'font-semibold',
      'text-on-primary',
    );
  });

  it('sin solicitud en curso no muestra el banner', async () => {
    mockParticipante();
    await renderPage();

    expect(screen.queryByText('Tienes una solicitud de salida en curso')).not.toBeInTheDocument();
  });

  it('las llamadas a la acción por rol no cambian (INV-N15)', async () => {
    mockParticipante();
    await renderPage();

    expect(await screen.findByRole('link', { name: 'Ver mi postulación para el rol Backend' })).toHaveAttribute(
      'href',
      '/dashboard/mis-postulaciones',
    );
    expect(screen.getByRole('link', { name: 'Postularme al rol Diseño' })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/55/postular/3',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Salir del rol Frontend' }));
    await waitFor(() => expect(salirDeRol.mutate).toHaveBeenCalledWith({ roleId: 1 }));
  });
});

describe('La salida se ofrece desde la navegación contextual', () => {
  it('sin solicitud: el menú de acciones ofrece «Solicitar salida» y abre el modal', async () => {
    mockParticipante();
    await renderPageEnLayout();

    const menu = await abrirPrimerMenuDeAcciones();
    fireEvent.click(menu.getByRole('menuitem', { name: 'Solicitar salida' }));
    expect(await screen.findByRole('dialog', { name: 'Solicitar salida del proyecto' })).toBeInTheDocument();
  });

  it('con solicitud: el menú de acciones lleva a «Ver solicitud de salida»', async () => {
    mockParticipante({ solicitud: SOLICITUD });
    await renderPageEnLayout();

    const menu = await abrirPrimerMenuDeAcciones();
    expect(menu.getByRole('menuitem', { name: 'Ver solicitud de salida' })).toHaveAttribute(
      'href',
      '/dashboard/projects/55/salida/preparacion',
    );
    expect(menu.queryByRole('menuitem', { name: 'Solicitar salida' })).not.toBeInTheDocument();
  });

  it('Resumen y Tablero siguen accesibles desde la navegación contextual', async () => {
    mockParticipante();
    await renderPageEnLayout();

    const navegaciones = screen.getAllByRole('navigation', { name: 'Navegación del proyecto' });
    const nav = within(navegaciones[0]);
    expect(nav.getByRole('link', { name: 'Resumen' })).toHaveAttribute('href', '/dashboard/proyectos/55');
    expect(nav.getByRole('link', { name: 'Tablero' })).toHaveAttribute('href', '/dashboard/projects/55/kanban');
    expect(screen.getByRole('button', { name: 'Secciones' })).toBeInTheDocument();
  });
});

// ── HU-154 (T-216): esqueleto compartido en la vista del participante ────
describe('Página del participante sobre el esqueleto compartido', () => {
  function slot(nombre: string) {
    return document.querySelector(`[data-slot="${nombre}"]`) as HTMLElement;
  }

  it('encabezado a ancho completo con la ruta de vuelta a Proyectos disponibles', async () => {
    mockParticipante();
    await renderPage();

    const grid = slot('project-content-grid');
    expect(Array.from(grid.children).map((el) => el.getAttribute('data-slot'))).toEqual([
      'project-grid-full',
      'project-grid-main',
      'project-grid-aside',
    ]);
    const full = slot('project-grid-full');
    expect(within(full).getByRole('heading', { level: 2, name: 'Portal de voluntariado UVG' })).toBeInTheDocument();
    expect(within(full).getByRole('heading', { level: 1, name: 'Resumen' })).toBeInTheDocument();
    expect(within(full).getByRole('link', { name: 'Volver a Proyectos disponibles' })).toHaveAttribute('href', '/dashboard/proyectos');
    expect(within(full).getByText('Extensión')).toHaveClass('pill');
  });

  it('principal: descripción y objetivos, banner de salida, aviso de postulaciones y roles, en ese orden', async () => {
    mockParticipante({ solicitud: SOLICITUD });
    await renderPage();

    const main = slot('project-grid-main');
    const descripcion = within(main).getByRole('region', { name: 'Descripción y objetivos' });
    expect(within(descripcion).getByText('Portal interno de voluntariado.')).toBeInTheDocument();
    expect(within(descripcion).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Centralizar la oferta de voluntariado',
    ]);

    const banner = within(main).getByRole('status');
    const aviso = await within(main).findByText('Ya registraste una postulación para este proyecto.');
    const roles = within(main).getByRole('region', { name: 'Roles disponibles (3)' });
    const sigue = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(sigue(descripcion, banner)).toBe(true);
    expect(sigue(banner, aviso)).toBe(true);
    expect(sigue(aviso, within(roles).getByRole('heading', { name: 'Roles disponibles (3)' }))).toBe(false);
    expect(roles).toContainElement(aviso);
  });

  it('lateral: responsable con chat, detalles y resumen de oportunidades', async () => {
    mockParticipante();
    await renderPage();

    const aside = screen.getByRole('complementary', { name: 'Información del proyecto' });
    const responsable = within(aside).getByRole('region', { name: 'Responsable del proyecto' });
    expect(within(responsable).getByText('Valeria Ortiz')).toBeInTheDocument();
    expect(within(responsable).getByText('s6.lider@uvg.edu.gt')).toBeInTheDocument();
    fireEvent.click(within(responsable).getByRole('button', { name: 'Chat' }));
    expect(iniciarChatCon).toHaveBeenCalledWith(55, 1);

    expect(within(aside).getByText('Detalles del proyecto')).toBeInTheDocument();
    expect(within(aside).getByText('Modalidad')).toBeInTheDocument();
    expect(within(aside).getByText('Resumen de oportunidades')).toBeInTheDocument();
    expect(within(aside).getByText('3 roles')).toBeInTheDocument();
    expect(within(aside).getByText('5 cupos')).toBeInTheDocument();
  });

  it('un visitante no recibe chat, ni banner de salida, y puede postularse a todos los roles', async () => {
    mockParticipante();
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 9 }, isLoading: false });
    (useProjectMembers as any).mockReturnValue({ members: [{ idUsuario: 2 }], isLoading: false });
    (useProjectRoles as any).mockReturnValue({ roles: [], salirDeRol });
    (apiFetch as any).mockImplementation((path: string) =>
      Promise.resolve(path === '/proyectos/55' ? PROYECTO : []),
    );
    await renderPage();

    expect(screen.queryByRole('button', { name: 'Chat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    for (const rol of [ROL_MIO, ROL_POSTULADO, ROL_LIBRE]) {
      expect(screen.getByRole('link', { name: `Postularme al rol ${rol.nombreRol}` })).toHaveAttribute(
        'href',
        `/dashboard/proyectos/55/postular/${rol.idRolProyecto}`,
      );
    }
    expect(screen.queryByRole('button', { name: /salir del rol/i })).not.toBeInTheDocument();
  });

  it('«Salir de este rol» sigue deshabilitado con su explicación cuando es el último rol', async () => {
    mockParticipante();
    (useProjectRoles as any).mockReturnValue({
      roles: [{ idRolProyecto: 1, isMine: true, canLeave: false }],
      salirDeRol,
    });
    await renderPage();

    expect(screen.getByLabelText('No puedes abandonar tu último rol desde esta opción.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salir de este rol' })).toBeDisabled();
  });
});
