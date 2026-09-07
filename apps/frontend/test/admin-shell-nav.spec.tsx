import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const pathnameMock = vi.hoisted(() => vi.fn(() => '/dashboard/admin'));
const searchParamsMock = vi.hoisted(() => vi.fn(() => new URLSearchParams()));
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
  useSearchParams: () => searchParamsMock(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('next/image', () => ({ default: (props: { alt: string }) => createElement('img', { alt: props.alt }) }));
vi.mock('@/public/logo.png', () => ({ default: 'logo.png' }));
vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 1, nombre: 'Admin', apellido: 'UVG', roles: ['administrador'] }, isLoading: false, isError: false }),
  isAdminUser: (u?: { roles?: string[] } | null) => (u?.roles ?? []).some((r) => r.toLowerCase() === 'administrador'),
}));
vi.mock('../hooks/use-logout', () => ({ useLogout: () => vi.fn() }));
vi.mock('../components/layout/notifications-bell', () => ({ NotificationsBell: () => createElement('div', { 'data-testid': 'bell' }) }));
vi.mock('../components/theme-toggle', () => ({ ThemeToggle: () => createElement('div', { 'data-testid': 'theme' }) }));
vi.mock('../components/dashboard/UserMenu', () => ({
  UserMenu: (props: { variant: string }) => createElement('div', { 'data-testid': `user-menu-${props.variant}` }, 'Perfil'),
}));

import AdminLayout, { adminNavEntries, adminNavItemsMobile } from '../components/admin/AdminLayout';
import { flattenNavEntries } from '../components/dashboard/SidebarNav';

function renderShell() {
  return render(createElement(AdminLayout, null, createElement('div', null, 'contenido')));
}

function desktopNav() {
  const asides = document.querySelectorAll('aside');
  return within(asides[0] as HTMLElement);
}

beforeEach(() => {
  pathnameMock.mockReturnValue('/dashboard/admin');
  searchParamsMock.mockReturnValue(new URLSearchParams());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminLayout — shell administrativo S7 (F011)', () => {
  it('la sidebar renderiza los cuatro destinos de Proyectos y Apelaciones (grupos expandidos a demanda)', () => {
    pathnameMock.mockReturnValue('/dashboard/admin/proyectos');
    searchParamsMock.mockReturnValue(new URLSearchParams('grupo=activos'));
    renderShell();
    const nav = desktopNav();

    expect(nav.getByRole('link', { name: 'Activos' })).toHaveAttribute('href', '/dashboard/admin/proyectos?grupo=activos');
    expect(nav.getByRole('link', { name: 'Revisiones' })).toHaveAttribute('href', '/dashboard/projects/admin/reviews');
    expect(nav.getByRole('link', { name: 'Solicitudes de cierre' })).toHaveAttribute('href', '/dashboard/admin/proyectos?grupo=cierres');
    expect(nav.getByRole('link', { name: 'Cerrados' })).toHaveAttribute('href', '/dashboard/admin/proyectos?grupo=cerrados');
    expect(nav.getByRole('button', { name: /Gobernanza/ })).toBeInTheDocument();
  });

  it('Proyectos agrupa los tres grupos de la bandeja más la revisión de publicación, sin un «todos»', () => {
    const proyectos = adminNavEntries.find((e) => e.type === 'group' && e.label === 'Proyectos');
    expect(proyectos && proyectos.type === 'group' ? proyectos.items.map((i) => i.href) : []).toEqual([
      '/dashboard/admin/proyectos?grupo=activos',
      '/dashboard/projects/admin/reviews',
      '/dashboard/admin/proyectos?grupo=cierres',
      '/dashboard/admin/proyectos?grupo=cerrados',
    ]);
  });

  it('«Revisiones» aparece una sola vez, abre su grupo y ya no queda ningún destino al grupo retirado', () => {
    // Estando en la propia ruta de Revisiones, el grupo Proyectos se despliega:
    // la vista quedó integrada entre los otros tres destinos, no suelta.
    pathnameMock.mockReturnValue('/dashboard/projects/admin/reviews');
    searchParamsMock.mockReturnValue(new URLSearchParams());
    renderShell();
    expect(desktopNav().getAllByRole('link', { name: 'Revisiones' })).toHaveLength(1);

    const hrefs = desktopNav()
      .getAllByRole('link')
      .map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.filter((h) => h.includes('grupo=revision'))).toEqual([]);
    expect(hrefs.filter((h) => h === '/dashboard/projects/admin/reviews')).toHaveLength(1);
  });

  it('el grupo que contiene la ruta actual aparece expandido y el destino activo lleva aria-current="page"', () => {
    pathnameMock.mockReturnValue('/dashboard/admin/proyectos');
    searchParamsMock.mockReturnValue(new URLSearchParams('grupo=cierres'));
    renderShell();
    const nav = desktopNav();

    expect(nav.getByRole('button', { name: /Proyectos/ })).toHaveAttribute('aria-expanded', 'true');
    expect(nav.getByRole('link', { name: 'Solicitudes de cierre' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Activos' })).not.toHaveAttribute('aria-current');
    expect(nav.getByRole('link', { name: 'Panel Admin' })).not.toHaveAttribute('aria-current');
  });

  it('Gobernanza se expande al entrar en Apelaciones', () => {
    pathnameMock.mockReturnValue('/dashboard/admin/apelaciones');
    renderShell();
    const nav = desktopNav();

    expect(nav.getByRole('button', { name: /Gobernanza/ })).toHaveAttribute('aria-expanded', 'true');
    expect(nav.getByRole('link', { name: 'Apelaciones' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('button', { name: /Proyectos/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('la barra móvil está limitada a 5 destinos (4 enlaces + Perfil), no a los 9 aplanados', () => {
    pathnameMock.mockReturnValue('/dashboard/admin/apelaciones');
    renderShell();
    const mobile = within(screen.getByRole('navigation', { name: 'Navegación administrativa móvil' }));

    const links = mobile.getAllByRole('link');
    expect(links).toHaveLength(4);
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/dashboard/admin',
      '/dashboard/admin/proyectos',
      '/dashboard/admin/apelaciones',
      '/dashboard/admin/usuarios',
    ]);
    expect(mobile.getByTestId('user-menu-compact')).toBeInTheDocument();
    expect(mobile.getByRole('link', { name: 'Apelaciones' })).toHaveAttribute('aria-current', 'page');
    expect(adminNavItemsMobile).toHaveLength(4);
    expect(flattenNavEntries(adminNavEntries).length).toBeGreaterThan(5);
  });
});
