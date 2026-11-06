import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * ROL-2: el coordinador académico tiene su propio shell. Su menú solo enlaza lo que el backend le abre
 * (nada de usuarios, roles, asociaciones, juntas, configuración del sistema ni mantenimiento) y el guard
 * lo saca de las secciones solo de administración.
 */

const replaceMock = vi.hoisted(() => vi.fn());
const currentUserMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/coordinador',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));
vi.mock('next/image', () => ({ default: (props: { alt: string }) => createElement('img', { alt: props.alt }) }));
vi.mock('@/public/logo.png', () => ({ default: 'logo.png' }));
vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: () => currentUserMock(),
  isAdminUser: (u?: { roles?: string[] } | null) => (u?.roles ?? []).some((r) => r.toLowerCase() === 'administrador'),
}));
vi.mock('../hooks/use-logout', () => ({ useLogout: () => vi.fn() }));
vi.mock('../hooks/use-cuentas-pendientes', () => ({ useCuentasPendientes: () => ({ data: undefined }) }));
vi.mock('../components/layout/notifications-bell', () => ({ NotificationsBell: () => null }));
vi.mock('../components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('../components/dashboard/UserMenu', () => ({ UserMenu: () => createElement('div', null, 'Perfil') }));
vi.mock('../components/chat-dock/chat-dock-context', () => ({
  RUTA_MENSAJES: '/dashboard/mensajes',
  ChatDockProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../components/chat-dock/chat-dock', () => ({
  ChatSocketProvider: ({ children }: { children: React.ReactNode }) => children,
  ChatDock: () => null,
}));

import AdminLayout, { adminNavEntries, coordinadorNavEntries, coordinadorNavItemsMobile } from '../components/admin/AdminLayout';
import { flattenNavEntries } from '../components/dashboard/SidebarNav';

const COORDINADOR = { idUsuario: 7, nombre: 'Cora', apellido: 'Dina', roles: ['coordinador_academico'] };

function renderShell() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AdminLayout variant="coordinador">
        <div>contenido coordinador</div>
      </AdminLayout>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('shell del coordinador: menú', () => {
  const destinos = flattenNavEntries(coordinadorNavEntries).map((d) => d.href);
  const destinosAdmin = flattenNavEntries(adminNavEntries).map((d) => d.href);
  const SOLO_ADMIN = [
    '/dashboard/admin/usuarios',
    '/dashboard/admin/solicitudes-recuperacion',
    '/dashboard/admin/solicitudes-desactivacion',
    '/dashboard/admin/asociaciones',
    '/dashboard/admin/apelaciones',
    '/dashboard/admin/anuncios',
    '/dashboard/admin/cuentas-pendientes',
    '/dashboard/admin/seguridad',
    '/dashboard/admin/reportes',
    '/dashboard/admin/mantenimiento',
    '/dashboard/admin/tablas',
  ];

  it('es el menú del admin sin lo exclusivo de administración, más mensajes y calendario', () => {
    expect(destinos).toEqual([
      '/dashboard/coordinador',
      '/dashboard/admin/proyectos?grupo=activos',
      '/dashboard/projects/admin/reviews',
      '/dashboard/admin/proyectos?grupo=cierres',
      '/dashboard/admin/proyectos?grupo=cerrados',
      '/dashboard/admin/sprints',
      '/dashboard/admin/metricas',
      '/dashboard/admin/horas',
      '/dashboard/admin/entidades',
      '/dashboard/admin/bandeja',
      '/dashboard/mensajes',
      '/dashboard/calendario',
    ]);
  });

  it('el menú del admin sí enlaza todo lo exclusivo de administración', () => {
    for (const href of SOLO_ADMIN) expect(destinosAdmin, href).toContain(href);
  });

  it('no enlaza nada de lo que el backend le responde con 403 (menú ni barra móvil)', () => {
    for (const href of [...destinos, ...coordinadorNavItemsMobile.map((d) => d.href)]) {
      expect(SOLO_ADMIN, href).not.toContain(href.split('?')[0]);
    }
  });

  it('la barra móvil solo usa destinos del menú', () => {
    const rutas = destinos.map((d) => d.split('?')[0]);
    for (const { href } of coordinadorNavItemsMobile) expect(rutas).toContain(href);
  });

  it('la sidebar renderizada muestra esos enlaces y ninguno de administración pura', () => {
    currentUserMock.mockReturnValue({ data: COORDINADOR, isLoading: false, isError: false });
    renderShell();
    const nav = within(document.querySelector('aside') as HTMLElement);

    expect(nav.getByRole('link', { name: 'Panel de Coordinación' })).toHaveAttribute('href', '/dashboard/coordinador');
    for (const grupo of ['Proyectos', 'Métricas', 'Verificación y seguridad']) {
      expect(nav.getByRole('button', { name: grupo }), grupo).toBeInTheDocument();
    }
    expect(nav.getByRole('link', { name: 'Mensajes' })).toBeInTheDocument();
    expect(nav.getByRole('link', { name: 'Calendario' })).toBeInTheDocument();
    for (const oculto of ['Usuarios', 'Gobernanza', 'Comunicación', 'Sistema']) {
      expect(nav.queryByRole('button', { name: oculto }), oculto).not.toBeInTheDocument();
    }
    expect(nav.queryByText('Panel Admin')).not.toBeInTheDocument();
  });
});

describe('shell del coordinador: guard', () => {
  it('el coordinador ve el contenido y no es redirigido', () => {
    currentUserMock.mockReturnValue({ data: COORDINADOR, isLoading: false, isError: false });
    renderShell();

    expect(screen.getByText('contenido coordinador')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it.each([
    ['un estudiante', ['estudiante']],
    ['un administrador (tiene su propio shell)', ['administrador']],
  ])('%s es redirigido a /dashboard y no ve el contenido', async (_nombre, roles) => {
    currentUserMock.mockReturnValue({ data: { idUsuario: 2, roles }, isLoading: false, isError: false });
    renderShell();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
    expect(screen.queryByText('contenido coordinador')).not.toBeInTheDocument();
  });

  it('sin sesión se redirige a /login', async () => {
    currentUserMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderShell();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
  });
});
