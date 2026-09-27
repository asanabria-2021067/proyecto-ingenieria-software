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
vi.mock('../components/projects/project-chat-panel', () => ({ ProjectChatPanel: () => null }));
vi.mock('../components/projects/leave-project-modal', () => ({
  LeaveProjectModal: ({ open }: { open: boolean }) =>
    open ? createElement('div', { role: 'dialog', 'aria-label': 'Solicitar salida del proyecto' }) : null,
}));
vi.mock('../app/dashboard/projects/[id]/project-detail-client', () => ({
  default: () => createElement('div', { 'data-testid': 'leader-workspace' }),
}));
vi.mock('../lib/swal', () => ({ default: { fire: vi.fn() } }));

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
  await screen.findByRole('heading', { level: 1, name: 'Portal de voluntariado UVG' });
}

async function renderPageEnLayout() {
  render(createElement(ProyectoLayout, null, createElement(ProyectoDetallePage)), { wrapper });
  await screen.findByRole('heading', { level: 1, name: 'Portal de voluntariado UVG' });
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
    expect(document.querySelector('[aria-current="page"]')).toBeNull();
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
