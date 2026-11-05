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

import AdminLayout, { coordinadorNavEntries, coordinadorNavItemsMobile } from '../components/admin/AdminLayout';
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

  it('enlaza revisiones, cierres, horas, bandeja de pendientes, mensajes y calendario', () => {
    expect(destinos).toEqual([
      '/dashboard/coordinador',
      '/dashboard/coordinador/pendientes',
      '/dashboard/projects/admin/reviews',
      '/dashboard/coordinador/cierres',
      '/dashboard/admin/horas',
      '/dashboard/mensajes',
      '/dashboard/calendario',
    ]);
  });

  it('no enlaza nada de lo que el backend le responde con 403', () => {
    const prohibidos = [
      '/dashboard/admin/usuarios',
      '/dashboard/admin/solicitudes-recuperacion',
      '/dashboard/admin/asociaciones',
      '/dashboard/admin/cuentas-pendientes',
      '/dashboard/admin/entidades',
      '/dashboard/admin/anuncios',
      '/dashboard/admin/apelaciones',
      '/dashboard/admin/seguridad',
      '/dashboard/admin/metricas',
      '/dashboard/admin/sprints',
      '/dashboard/admin/bandeja',
      '/dashboard/admin/proyectos',
      '/dashboard/configuracion',
    ];
    for (const href of [...destinos, ...coordinadorNavItemsMobile.map((d) => d.href)]) {
      expect(prohibidos, href).not.toContain(href.split('?')[0]);
      expect(href).not.toMatch(/mantenimiento|tablas|juntas|roles/);
    }
  });

  it('la barra móvil solo usa destinos del menú', () => {
    for (const { href } of coordinadorNavItemsMobile) expect(destinos).toContain(href);
  });

  it('la sidebar renderizada muestra esos enlaces y ninguno de administración', () => {
    currentUserMock.mockReturnValue({ data: COORDINADOR, isLoading: false, isError: false });
    renderShell();
    const nav = within(document.querySelector('aside') as HTMLElement);

    expect(nav.getByRole('link', { name: 'Panel del coordinador' })).toHaveAttribute('href', '/dashboard/coordinador');
    expect(nav.getByRole('link', { name: 'Bandeja de pendientes' })).toBeInTheDocument();
    expect(nav.getByRole('link', { name: 'Horas y estudiantes en riesgo' })).toHaveAttribute('href', '/dashboard/admin/horas');
    expect(nav.getByRole('link', { name: 'Mensajes' })).toBeInTheDocument();
    expect(nav.getByRole('link', { name: 'Calendario' })).toBeInTheDocument();
    expect(nav.queryByRole('link', { name: /Usuarios/ })).not.toBeInTheDocument();
    expect(nav.queryByRole('link', { name: /Asociaciones/ })).not.toBeInTheDocument();
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
