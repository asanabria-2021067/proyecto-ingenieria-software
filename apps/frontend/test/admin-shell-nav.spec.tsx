import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

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
  try {
    window.localStorage.clear();
  } catch {
    /* sin almacenamiento */
  }
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

// Sidebar «Enterprise Control Panel»: clases y estados de la variante admin.
describe('AdminLayout — sidebar graphite', () => {
  it('la sidebar de escritorio usa la carcasa graphite, sin estilos en línea', () => {
    renderShell();
    const aside = document.querySelector('aside') as HTMLElement;
    expect(aside).toHaveClass('admin-sidebar');
    expect(aside).toHaveAttribute('data-slot', 'admin-sidebar');
    expect(aside.getAttribute('style')).toBeNull();
  });

  it('el encabezado conserva logo y nombre, en blanco y con divisor sutil', () => {
    renderShell();
    const marca = document.querySelector('[data-slot="admin-sidebar-brand"]') as HTMLElement;
    expect(marca).toHaveClass('admin-sidebar-brand');
    expect(within(marca).getByRole('img', { name: 'UVGENIUS' })).toBeInTheDocument();
    expect(within(marca).getByText('UVGenius')).toHaveClass('admin-sidebar-brand-name', 'font-headline');
    expect(marca.querySelector('[style]')).toBeNull();
  });

  it('la etiqueta «Administración» es pequeña, en mayúsculas, semibold y en gris secundario', () => {
    renderShell();
    const etiqueta = document.querySelector('[data-slot="admin-nav-section-label"]') as HTMLElement;
    expect(etiqueta).toHaveTextContent('Administración');
    expect(etiqueta).toHaveClass('admin-nav-section-label', 'uppercase', 'font-semibold', 'tracking-wider', 'text-[11px]');
    expect(etiqueta).not.toHaveClass('font-black');
    expect(etiqueta.getAttribute('style')).toBeNull();
  });

  it('Panel Admin y los encabezados de grupo comparten `.admin-nav-item`; inactivos, sin color en línea', () => {
    pathnameMock.mockReturnValue('/dashboard/admin/usuarios');
    renderShell();
    const nav = desktopNav();

    const panel = nav.getByRole('link', { name: 'Panel Admin' });
    expect(panel).toHaveClass('admin-nav-item', 'admin-nav-inactive');
    expect(panel.getAttribute('style')).toBeNull();
    for (const grupo of ['Proyectos', 'Gobernanza']) {
      const boton = nav.getByRole('button', { name: new RegExp(grupo) });
      expect(boton).toHaveClass('admin-nav-item', 'w-full');
      expect(boton.getAttribute('style')).toBeNull();
    }
  });

  it('Panel Admin activo: aria-current, clase de item y sin bloque verde en línea', () => {
    renderShell();
    const panel = desktopNav().getByRole('link', { name: 'Panel Admin' });
    expect(panel).toHaveAttribute('aria-current', 'page');
    expect(panel).toHaveClass('admin-nav-item');
    expect(panel).not.toHaveClass('admin-nav-inactive');
    expect(panel.getAttribute('style')).toBeNull();
  });

  it('el grupo desplegado expone su estado y no se pinta de verde aunque contenga la ruta activa', () => {
    pathnameMock.mockReturnValue('/dashboard/admin/proyectos');
    searchParamsMock.mockReturnValue(new URLSearchParams('grupo=activos'));
    renderShell();
    const nav = desktopNav();

    const proyectos = nav.getByRole('button', { name: /Proyectos/ });
    expect(proyectos).toHaveAttribute('aria-expanded', 'true');
    expect(proyectos).toHaveAttribute('data-state', 'open');
    expect(proyectos).toHaveClass('admin-nav-group');
    expect(proyectos.getAttribute('style')).toBeNull();
    expect(proyectos).not.toHaveAttribute('aria-current');
    expect(proyectos.querySelector('.admin-nav-chevron')).toHaveClass('rotate-180');

    const gobernanza = nav.getByRole('button', { name: /Gobernanza/ });
    expect(gobernanza).toHaveAttribute('data-state', 'closed');
    expect(gobernanza.querySelector('.admin-nav-chevron')).not.toHaveClass('rotate-180');
  });

  it('solo el hijo activo se destaca; sus hermanos quedan inactivos y nada lleva color en línea', () => {
    pathnameMock.mockReturnValue('/dashboard/admin/proyectos');
    searchParamsMock.mockReturnValue(new URLSearchParams('grupo=activos'));
    renderShell();
    const nav = desktopNav();

    const activos = nav.getByRole('link', { name: 'Activos' });
    expect(activos).toHaveAttribute('aria-current', 'page');
    expect(activos).toHaveClass('admin-nav-subitem');
    expect(activos).not.toHaveClass('admin-nav-inactive');
    for (const hermano of ['Revisiones', 'Solicitudes de cierre', 'Cerrados']) {
      const enlace = nav.getByRole('link', { name: hermano });
      expect(enlace).toHaveClass('admin-nav-subitem', 'admin-nav-inactive');
      expect(enlace).not.toHaveAttribute('aria-current');
    }
    const guia = activos.parentElement as HTMLElement;
    expect(guia).toHaveClass('admin-nav-children');
    expect(guia.closest('aside')?.querySelectorAll('nav [style]')).toHaveLength(0);
  });

  it('el pie de cuenta va al final de la sidebar, con su divisor y sin estilos en línea', () => {
    renderShell();
    const pie = document.querySelector('[data-slot="admin-sidebar-footer"]') as HTMLElement;
    expect(pie).toHaveClass('admin-sidebar-footer');
    expect(pie.getAttribute('style')).toBeNull();
    expect(within(pie).getByTestId('user-menu-sidebar')).toBeInTheDocument();
    expect(pie.parentElement?.lastElementChild).toBe(pie);
  });

  it('la marca mide lo mismo que la topbar (h-16) para que ambos bordes continúen; sin scroll horizontal', () => {
    renderShell();
    const marca = document.querySelector('[data-slot="admin-sidebar-brand"]') as HTMLElement;
    expect(marca).toHaveClass('h-16', 'shrink-0');
    expect(marca).not.toHaveClass('py-5');
    expect(document.querySelector('main header')).toHaveClass('h-16');
    expect(document.querySelector('aside')).toHaveClass('overflow-x-hidden', 'overflow-y-auto', 'w-64');
  });
});

// Misma opción de colapsar que la sidebar del estudiante, con su propia
// preferencia y el lenguaje graphite.
describe('AdminLayout — sidebar colapsable', () => {
  const DESTINOS = [
    'Panel Admin',
    'Activos',
    'Revisiones',
    'Solicitudes de cierre',
    'Cerrados',
    'Apelaciones',
    'Gestión de Usuarios',
    'Recuperación de contraseña',
  ];

  function colapsar() {
    const aside = document.querySelector('aside') as HTMLElement;
    fireEvent.click(within(aside).getByRole('button', { name: 'Colapsar barra lateral' }));
    return aside;
  }

  it('expandida: el control de colapsar vive en el encabezado de marca y controla la navegación', () => {
    renderShell();
    const marca = document.querySelector('[data-slot="admin-sidebar-brand"]') as HTMLElement;
    const control = within(marca).getByRole('button', { name: 'Colapsar barra lateral' });
    expect(control).toHaveClass('admin-collapse-toggle');
    expect(control).toHaveAttribute('aria-controls', 'admin-global-nav');
    expect(document.getElementById('admin-global-nav')).toHaveAttribute('aria-label', 'Navegación administrativa');
    expect(document.querySelector('aside')).toHaveClass('w-64');
  });

  it('colapsada: 72px, solo logo, sin etiqueta de sección y todos los destinos como iconos con nombre', () => {
    pathnameMock.mockReturnValue('/dashboard/admin/proyectos');
    searchParamsMock.mockReturnValue(new URLSearchParams('grupo=cierres'));
    renderShell();
    const aside = colapsar();

    expect(aside).toHaveClass('w-[72px]');
    expect(aside).toHaveAttribute('data-collapsed', 'true');
    expect(within(aside).queryByText('UVGenius')).not.toBeInTheDocument();
    expect(aside.querySelector('[data-slot="admin-nav-section-label"]')).toBeNull();

    const nav = within(aside.querySelector('nav') as HTMLElement);
    const enlaces = nav.getAllByRole('link');
    expect(enlaces.map((a) => a.getAttribute('aria-label'))).toEqual(DESTINOS);
    for (const enlace of enlaces) expect(enlace).toHaveClass('admin-nav-item', 'admin-nav-icon');
    // El destino activo se conserva y sigue identificable.
    expect(nav.getByRole('link', { name: 'Solicitudes de cierre' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Activos' })).not.toHaveAttribute('aria-current');
    expect(nav.getByRole('group', { name: 'Proyectos' })).toBeInTheDocument();
    expect(nav.getByRole('group', { name: 'Gobernanza' })).toBeInTheDocument();
  });

  it('colapsada: el pie usa la cuenta compacta y «Expandir» devuelve la sidebar completa', () => {
    renderShell();
    const aside = colapsar();
    const pie = aside.querySelector('[data-slot="admin-sidebar-footer"]') as HTMLElement;
    expect(within(pie).getByTestId('user-menu-compact')).toBeInTheDocument();

    const expandir = within(aside).getByRole('button', { name: 'Expandir barra lateral' });
    expect(expandir).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expandir);
    expect(aside).toHaveClass('w-64');
    expect(within(aside).getByText('UVGenius')).toBeInTheDocument();
    expect(within(pie).getByTestId('user-menu-sidebar')).toBeInTheDocument();
  });

  it('la preferencia del administrador es independiente de la del estudiante', () => {
    renderShell();
    colapsar();
    expect(window.localStorage.getItem('uvg-collab-admin-sidebar')).toBe('collapsed');
    expect(window.localStorage.getItem('uvg-collab-dashboard-sidebar')).toBeNull();
  });
});
