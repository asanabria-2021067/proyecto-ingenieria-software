import '@testing-library/jest-dom/vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
vi.mock('../hooks/use-cuentas-pendientes', () => ({ useCuentasPendientes: () => ({ data: undefined }) }));
vi.mock('../components/layout/notifications-bell', () => ({ NotificationsBell: () => createElement('div', { 'data-testid': 'bell' }) }));
vi.mock('../components/theme-toggle', () => ({ ThemeToggle: () => createElement('div', { 'data-testid': 'theme' }) }));
vi.mock('../components/dashboard/UserMenu', () => ({
  UserMenu: (props: { variant: string }) => createElement('div', { 'data-testid': `user-menu-${props.variant}` }, 'Perfil'),
}));

import AdminLayout, { adminNavEntries, adminNavItemsMobile } from '../components/admin/AdminLayout';
import { flattenNavEntries } from '../components/dashboard/SidebarNav';

function renderShell() {
  // La barra superior lleva el botón «Actualizar», que invalida las consultas.
  const queryClient = new QueryClient();
  const utils = render(
    createElement(QueryClientProvider, { client: queryClient }, createElement(AdminLayout, null, createElement('div', null, 'contenido'))),
  );
  return { ...utils, queryClient };
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
    expect(nav.getByRole('link', { name: 'Solicitudes de publicación' })).toHaveAttribute('href', '/dashboard/projects/admin/reviews');
    expect(nav.getByRole('link', { name: 'Solicitudes de cierre' })).toHaveAttribute('href', '/dashboard/admin/proyectos?grupo=cierres');
    expect(nav.getByRole('link', { name: 'Cerrados' })).toHaveAttribute('href', '/dashboard/admin/proyectos?grupo=cerrados');
    expect(nav.getByRole('button', { name: /Gobernanza/ })).toBeInTheDocument();
  });

  it('Proyectos agrupa los tres grupos de la bandeja, la revisión de publicación y el calendario de Sprints, sin un «todos»', () => {
    const proyectos = adminNavEntries.find((e) => e.type === 'group' && e.label === 'Proyectos');
    expect(proyectos && proyectos.type === 'group' ? proyectos.items.map((i) => i.href) : []).toEqual([
      '/dashboard/admin/proyectos?grupo=activos',
      '/dashboard/projects/admin/reviews',
      '/dashboard/admin/proyectos?grupo=cierres',
      '/dashboard/admin/proyectos?grupo=cerrados',
      '/dashboard/admin/sprints',
    ]);
  });

  it('en /dashboard/admin/sprints el grupo Proyectos queda abierto y «Calendario de Sprints» es el destino activo', () => {
    pathnameMock.mockReturnValue('/dashboard/admin/sprints');
    searchParamsMock.mockReturnValue(new URLSearchParams('vista=lista'));
    renderShell();
    const nav = desktopNav();

    expect(nav.getByRole('button', { name: /Proyectos/ })).toHaveAttribute('aria-expanded', 'true');
    const enlace = nav.getByRole('link', { name: 'Calendario de Sprints' });
    expect(enlace).toHaveAttribute('href', '/dashboard/admin/sprints');
    expect(enlace).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Cerrados' })).not.toHaveAttribute('aria-current');
  });

  it('«Solicitudes de publicación» aparece una sola vez, abre su grupo y ya no queda ningún destino al grupo retirado', () => {
    // Estando en la propia ruta de Solicitudes de publicación, el grupo Proyectos se despliega:
    // la vista quedó integrada entre los otros tres destinos, no suelta.
    pathnameMock.mockReturnValue('/dashboard/projects/admin/reviews');
    searchParamsMock.mockReturnValue(new URLSearchParams());
    renderShell();
    expect(desktopNav().getAllByRole('link', { name: 'Solicitudes de publicación' })).toHaveLength(1);

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
    // El escudo original va dentro de una tarjeta marfil cuadrada, centrado y sin deformar.
    const tarjeta = marca.querySelector('[data-slot="admin-brand-logo"]') as HTMLElement;
    expect(tarjeta).toHaveClass('admin-brand-logo', 'size-13', 'rounded-lg', 'border', 'items-center', 'justify-center');
    expect(tarjeta).toContainElement(within(marca).getByRole('img', { name: 'UVGENIUS' }));
    expect(within(marca).getByText('UVGenius')).toHaveClass('admin-sidebar-brand-name', 'font-headline');
    expect(marca.querySelector('[style]')).toBeNull();
  });

  it('la etiqueta «Administración» es pequeña, en mayúsculas, semibold y en gris secundario', () => {
    renderShell();
    const etiqueta = document.querySelector('[data-slot="admin-nav-section-label"]') as HTMLElement;
    expect(etiqueta).toHaveTextContent('Administración');
    // T-320: el tamaño sale de la escala (`type-micro`, 11 px), no de un literal.
    expect(etiqueta).toHaveClass('admin-nav-section-label', 'uppercase', 'font-semibold', 'tracking-wider', 'type-micro');
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
    for (const hermano of ['Solicitudes de publicación', 'Solicitudes de cierre', 'Cerrados']) {
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
    'Gestión de Usuarios',
    'Recuperación de contraseña',
    'Activos',
    'Solicitudes de publicación',
    'Solicitudes de cierre',
    'Cerrados',
    'Calendario de Sprints',
    'Apelaciones',
    'Tendencias de uso',
    'Cuentas pendientes',
    'Eventos de seguridad',
    // TEMPORAL: inventario de etiquetas; quitar junto con su página.
    'Etiquetas (temporal)',
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

describe('AdminLayout — «Actualizar» en la barra superior', () => {
  it('es un botón de icono situado entre las notificaciones y el cambio de tema', () => {
    renderShell();
    const boton = screen.getByRole('button', { name: 'Actualizar' });
    expect(boton.querySelector('svg')).not.toBeNull();
    expect(boton).toHaveTextContent('');
    // Mismo botón de icono de la barra del estudiante.
    expect(boton).toHaveClass('size-10', 'rounded-control', 'bg-muted');
    expect(boton.previousElementSibling).toBe(screen.getByTestId('bell'));
    expect(boton.nextElementSibling).toBe(screen.getByTestId('theme'));
  });

  it('vuelve a pedir los datos de la vista: invalida las consultas y se desactiva mientras tanto', async () => {
    const { queryClient } = renderShell();
    let resolver: () => void = () => {};
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries').mockReturnValue(new Promise<void>((r) => (resolver = r)));

    const boton = screen.getByRole('button', { name: 'Actualizar' });
    fireEvent.click(boton);
    expect(invalidar).toHaveBeenCalledTimes(1);
    expect(invalidar).toHaveBeenCalledWith();
    expect(boton).toBeDisabled();

    resolver();
    await waitFor(() => expect(boton).toBeEnabled());
  });
});

describe('AdminLayout — acceso al visor de eventos de seguridad (T-310, FG02-C07)', () => {
  const HREF = '/dashboard/admin/seguridad';

  it('«Eventos de seguridad» vive en «Verificación y seguridad» junto a «Cuentas pendientes», enlazado una sola vez', () => {
    const grupo = adminNavEntries.find((e) => 'type' in e && e.type === 'group' && e.label === 'Verificación y seguridad');
    const items = grupo && 'items' in grupo ? grupo.items : [];
    expect(items.map((i) => i.label)).toEqual(['Cuentas pendientes', 'Eventos de seguridad']);

    const destinos = flattenNavEntries(adminNavEntries);
    expect(destinos.filter((d) => d.href === HREF)).toHaveLength(1);
    expect(destinos.filter((d) => d.label === 'Eventos de seguridad')).toHaveLength(1);
    // Ningún destino quedó duplicado al añadirlo.
    expect(new Set(destinos.map((d) => d.href)).size).toBe(destinos.length);
  });

  it('la ruta enlazada existe como página de la aplicación', () => {
    expect(existsSync(join(__dirname, '../app/dashboard/admin/seguridad/page.tsx'))).toBe(true);
  });

  it('en la ruta del visor, su grupo se abre y «Eventos de seguridad» es el único destino activo', () => {
    pathnameMock.mockReturnValue(HREF);
    renderShell();
    const nav = desktopNav();

    expect(nav.getByRole('button', { name: /Verificación y seguridad/ })).toHaveAttribute('aria-expanded', 'true');
    const enlace = nav.getByRole('link', { name: 'Eventos de seguridad' });
    expect(enlace).toHaveAttribute('href', HREF);
    expect(enlace).toHaveAttribute('aria-current', 'page');
    expect(nav.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page')).toEqual([enlace]);
  });

  it('desde otra vista su grupo está plegado; al abrirlo el enlace está y no figura como activo', () => {
    pathnameMock.mockReturnValue('/dashboard/admin/usuarios');
    renderShell();
    const nav = desktopNav();
    expect(nav.queryByRole('link', { name: 'Eventos de seguridad' })).not.toBeInTheDocument();
    fireEvent.click(nav.getByRole('button', { name: /Verificación y seguridad/ }));
    const enlace = nav.getByRole('link', { name: 'Eventos de seguridad' });
    expect(enlace).toHaveAttribute('href', HREF);
    expect(enlace).not.toHaveAttribute('aria-current');
  });

  it('con la sidebar colapsada sigue alcanzable como icono con nombre', () => {
    pathnameMock.mockReturnValue(HREF);
    renderShell();
    const aside = document.querySelector('aside') as HTMLElement;
    fireEvent.click(within(aside).getByRole('button', { name: 'Colapsar barra lateral' }));
    expect(aside).toHaveClass('w-[72px]');
    const enlace = within(aside).getByRole('link', { name: 'Eventos de seguridad' });
    expect(enlace).toHaveAttribute('href', HREF);
    expect(enlace).toHaveAttribute('aria-current', 'page');
  });

  it('la barra móvil conserva sus cuatro destinos curados: el visor no la satura', () => {
    expect(adminNavItemsMobile.map((i) => i.href)).toEqual([
      '/dashboard/admin',
      '/dashboard/admin/proyectos',
      '/dashboard/admin/apelaciones',
      '/dashboard/admin/usuarios',
    ]);
  });
});

describe('Inventario de navegación administrativa (T-319, FG06-C01)', () => {
  const RAIZ = join(__dirname, '..');
  const inventario = readFileSync(join(RAIZ, '../../docs/architecture/sprint9-admin-navigation-inventory.md'), 'utf8');
  const destinos = flattenNavEntries(adminNavEntries);

  /** Rutas de página bajo un directorio de `app/`, con sus segmentos dinámicos tal como están en disco. */
  function rutasDePagina(directorio: string, base: string): string[] {
    return readdirSync(join(RAIZ, directorio), { withFileTypes: true }).flatMap((entrada) => {
      if (entrada.isDirectory()) return rutasDePagina(join(directorio, entrada.name), `${base}/${entrada.name}`);
      return entrada.name === 'page.tsx' ? [base] : [];
    });
  }
  const paginas = [...rutasDePagina('app/dashboard/admin', '/dashboard/admin'), ...rutasDePagina('app/dashboard/projects/admin', '/dashboard/projects/admin')];
  /** Ruta de la página de un destino: sin `?grupo=` ni `#ancla`. */
  const sinQuery = (href: string) => href.split(/[?#]/)[0];

  it('cada destino del menú apunta a una página que existe', () => {
    for (const { href, label } of destinos) {
      expect(paginas, `${label} → ${href}`).toContain(sinQuery(href));
    }
  });

  it('ningún destino ni etiqueta se repite, y cada grupo tiene al menos un destino', () => {
    expect(new Set(destinos.map((d) => d.href)).size).toBe(destinos.length);
    expect(new Set(destinos.map((d) => d.label)).size).toBe(destinos.length);
    const grupos = adminNavEntries.filter((e) => 'type' in e && e.type === 'group');
    expect(new Set(grupos.map((g) => g.label)).size).toBe(grupos.length);
    for (const grupo of grupos) expect('items' in grupo ? grupo.items.length : 0, grupo.label).toBeGreaterThan(0);
  });

  it('el inventario documenta cada destino del menú con su ruta y su etiqueta', () => {
    for (const { href, label } of destinos) {
      expect(inventario, href).toContain(`| \`${href}\` | ${label} |`);
    }
  });

  it('toda página administrativa está en el inventario: enlazada o explicada como vista de detalle', () => {
    const enlazadas = new Set(destinos.map((d) => sinQuery(d.href)));
    const noEnlazadas = paginas.filter((ruta) => !enlazadas.has(ruta));
    expect(noEnlazadas.sort()).toEqual([
      '/dashboard/admin/apelaciones/[apelacionId]',
      '/dashboard/admin/proyectos/[id]',
      '/dashboard/admin/proyectos/[id]/cierre',
    ]);
    for (const ruta of noEnlazadas) expect(inventario, ruta).toContain(`| \`${ruta}\` |`);
    // Las que el inventario lista como no enlazadas son todas vistas con identificador.
    expect(noEnlazadas.every((ruta) => ruta.includes('['))).toBe(true);
  });

  it('la pantalla de HU-179 existe (PR #270): se enlaza una sola vez y el inventario la registra', () => {
    expect(paginas.filter((ruta) => /pendientes|verificacion/.test(ruta))).toEqual(['/dashboard/admin/cuentas-pendientes']);
    expect(destinos.filter((d) => /pendientes|verificaci[oó]n de cuentas/i.test(d.label)).map((d) => d.href)).toEqual([
      '/dashboard/admin/cuentas-pendientes',
    ]);
    expect(inventario).toContain('| `/dashboard/admin/cuentas-pendientes` | Cuentas pendientes |');
    expect(inventario).not.toMatch(/HU-179 \| \*\*No existe\*\*/);
  });

  it('la barra móvil descrita en el inventario es la del código', () => {
    for (const { label } of adminNavItemsMobile) expect(inventario).toContain(label);
    expect(adminNavItemsMobile).toHaveLength(4);
    expect(inventario).toContain('lista\n**curada** de cuatro destinos');
  });
});

describe('Menú agrupado por tema (T-319, FG06-C02)', () => {
  const grupos = () =>
    adminNavEntries.map((e) => ('type' in e && e.type === 'group' ? { grupo: e.label, items: e.items.map((i) => i.label) } : { enlace: e.label }));

  it('el orden es estable: panel, usuarios, proyectos, gobernanza, métricas, verificación y diagnóstico', () => {
    expect(grupos()).toEqual([
      { enlace: 'Panel Admin' },
      { grupo: 'Usuarios', items: ['Gestión de Usuarios', 'Recuperación de contraseña'] },
      {
        grupo: 'Proyectos',
        items: ['Activos', 'Solicitudes de publicación', 'Solicitudes de cierre', 'Cerrados', 'Calendario de Sprints'],
      },
      { grupo: 'Gobernanza', items: ['Apelaciones'] },
      { grupo: 'Métricas', items: ['Tendencias de uso'] },
      { grupo: 'Verificación y seguridad', items: ['Cuentas pendientes', 'Eventos de seguridad'] },
      { grupo: 'Diagnóstico', items: ['Etiquetas (temporal)'] },
    ]);
  });

  it('ya no existe el grupo genérico «Administración»: cada destino está en el tema que le corresponde', () => {
    expect(adminNavEntries.some((e) => 'type' in e && e.type === 'group' && e.label === 'Administración')).toBe(false);
  });

  it('la página temporal de etiquetas sigue enlazada, aparte del trabajo diario', () => {
    const destinos = flattenNavEntries(adminNavEntries);
    expect(destinos.filter((d) => d.href === '/dashboard/admin/etiquetas')).toHaveLength(1);
    expect(existsSync(join(__dirname, '../app/dashboard/admin/etiquetas/page.tsx'))).toBe(true);
  });

  it('no enlaza pantallas que no existen: cuentas pendientes (HU-179) solo porque su página existe, y ninguna ruta de métricas inventada', () => {
    const destinos = flattenNavEntries(adminNavEntries);
    const pendientes = destinos.filter((d) => /pendiente/i.test(`${d.label} ${d.href}`));
    expect(pendientes.map((d) => d.href)).toEqual(['/dashboard/admin/cuentas-pendientes']);
    expect(existsSync(join(__dirname, '../app/dashboard/admin/cuentas-pendientes/page.tsx'))).toBe(true);
    // Métricas no tiene ruta propia: ningún destino apunta a una página `/metricas`.
    expect(destinos.filter((d) => /\/metricas\b/.test(d.href))).toEqual([]);
  });

  it('cada grupo y su destino usan iconos distintos entre sí dentro del mismo grupo', () => {
    for (const entrada of adminNavEntries) {
      if (!('type' in entrada) || entrada.type !== 'group') continue;
      const iconos = entrada.items.map((i) => i.icon);
      expect(new Set(iconos).size, entrada.label).toBe(iconos.length);
      expect(iconos, entrada.label).not.toContain(entrada.icon);
    }
  });

  it.each([
    ['/dashboard/admin/usuarios', 'Usuarios', 'Gestión de Usuarios'],
    ['/dashboard/admin/solicitudes-recuperacion', 'Usuarios', 'Recuperación de contraseña'],
    ['/dashboard/admin/sprints', 'Proyectos', 'Calendario de Sprints'],
    ['/dashboard/admin/apelaciones', 'Gobernanza', 'Apelaciones'],
    ['/dashboard/admin/seguridad', 'Verificación y seguridad', 'Eventos de seguridad'],
    ['/dashboard/admin/etiquetas', 'Diagnóstico', 'Etiquetas (temporal)'],
  ])('en %s se abre «%s» y «%s» es el único destino activo', (ruta, grupo, destino) => {
    pathnameMock.mockReturnValue(ruta);
    renderShell();
    const nav = desktopNav();
    expect(nav.getByRole('button', { name: new RegExp(`^${grupo}`) })).toHaveAttribute('aria-expanded', 'true');
    const activos = nav.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page');
    expect(activos.map((a) => a.textContent)).toEqual([destino]);
  });

  it('los grupos son botones: se abren y cierran con el teclado y exponen su estado', () => {
    renderShell();
    const nav = desktopNav();
    const usuarios = nav.getByRole('button', { name: /^Usuarios/ });
    expect(usuarios.tagName).toBe('BUTTON');
    expect(usuarios).toHaveAttribute('aria-expanded', 'false');
    expect(nav.queryByRole('link', { name: 'Gestión de Usuarios' })).not.toBeInTheDocument();

    usuarios.focus();
    expect(usuarios).toHaveFocus();
    fireEvent.click(usuarios);
    expect(usuarios).toHaveAttribute('aria-expanded', 'true');
    expect(nav.getByRole('link', { name: 'Gestión de Usuarios' })).toHaveAttribute('href', '/dashboard/admin/usuarios');

    fireEvent.click(usuarios);
    expect(usuarios).toHaveAttribute('aria-expanded', 'false');
  });

  it('colapsada, todos los destinos siguen alcanzables como enlaces con nombre', () => {
    renderShell();
    const aside = document.querySelector('aside') as HTMLElement;
    fireEvent.click(within(aside).getByRole('button', { name: 'Colapsar barra lateral' }));
    const nombres = within(aside).getAllByRole('link').map((a) => a.getAttribute('aria-label') ?? a.textContent);
    expect(nombres).toEqual(flattenNavEntries(adminNavEntries).map((d) => d.label));
  });

  it('el inventario describe esta misma estructura', () => {
    const inventario = readFileSync(join(__dirname, '../../../docs/architecture/sprint9-admin-navigation-inventory.md'), 'utf8');
    for (const entrada of adminNavEntries) {
      if (!('type' in entrada) || entrada.type !== 'group') continue;
      expect(inventario, entrada.label).toContain(`| ${entrada.label} | ${entrada.items.map((i) => i.label).join(' · ')} |`);
    }
  });
});

describe('Miga de pan y menú comparten nombres (T-319, FG06-C03)', () => {
  const fuente = (ruta: string) => readFileSync(join(__dirname, '..', ruta), 'utf8');
  const grupoDe = (href: string) =>
    adminNavEntries.find((e) => 'type' in e && e.type === 'group' && e.items.some((i) => i.href === href))?.label;

  it.each([
    ['app/dashboard/admin/usuarios/page.tsx', '/dashboard/admin/usuarios', 'Gestión de Usuarios'],
    ['app/dashboard/admin/solicitudes-recuperacion/page.tsx', '/dashboard/admin/solicitudes-recuperacion', 'Recuperación de contraseña'],
    ['app/dashboard/admin/seguridad/page.tsx', '/dashboard/admin/seguridad', 'Eventos de seguridad'],
    ['app/dashboard/admin/etiquetas/page.tsx', '/dashboard/admin/etiquetas', 'Etiquetas (temporal)'],
    ['app/dashboard/admin/apelaciones/appeals-inbox-client.tsx', '/dashboard/admin/apelaciones', 'Apelaciones'],
    ['app/dashboard/projects/admin/reviews/page.tsx', '/dashboard/projects/admin/reviews', 'Solicitudes de publicación'],
  ])('%s: la sección de la miga es el grupo del menú y la página, su etiqueta', (archivo, href, etiqueta) => {
    const grupo = grupoDe(href);
    expect(grupo, href).toBeTruthy();
    const miga = fuente(archivo).match(/<AdminBreadcrumb\s+seccion="([^"]+)"[^>]*?pagina="([^"]+)"/);
    expect(miga, archivo).not.toBeNull();
    expect(miga?.[1]).toBe(grupo);
    expect(miga?.[2]).toBe(etiqueta);
  });

  it('ninguna vista administrativa conserva el nombre del grupo retirado', () => {
    for (const archivo of [
      'app/dashboard/admin/usuarios/page.tsx',
      'app/dashboard/admin/solicitudes-recuperacion/page.tsx',
      'app/dashboard/admin/seguridad/page.tsx',
      'app/dashboard/admin/etiquetas/page.tsx',
    ]) {
      expect(fuente(archivo), archivo).not.toContain('seccion="Administración"');
    }
  });

  it('todas las vistas administrativas, también las de detalle, llevan miga de pan', () => {
    for (const archivo of [
      'app/dashboard/admin/proyectos/admin-projects-client.tsx',
      'app/dashboard/admin/proyectos/[id]/admin-project-detail-client.tsx',
      'app/dashboard/admin/proyectos/[id]/cierre/closure-review-client.tsx',
      'app/dashboard/admin/apelaciones/[apelacionId]/appeal-review-client.tsx',
      'app/dashboard/admin/sprints/admin-sprints-client.tsx',
    ]) {
      expect(fuente(archivo), archivo).toMatch(/<AdminBreadcrumb|<Breadcrumb/);
    }
  });

  it('la barra lateral mide 256 px expandida y 72 px plegada, y la barra móvil nombra cada destino', () => {
    renderShell();
    const aside = document.querySelector('aside') as HTMLElement;
    expect(aside).toHaveClass('w-64');
    fireEvent.click(within(aside).getByRole('button', { name: 'Colapsar barra lateral' }));
    expect(aside).toHaveClass('w-[72px]');

    const movil = screen.getByRole('navigation', { name: 'Navegación administrativa móvil' });
    const enlaces = within(movil).getAllByRole('link');
    expect(enlaces.map((a) => a.getAttribute('aria-label'))).toEqual(adminNavItemsMobile.map((i) => i.label));
    // Cada destino es un enlace real: funciona sin pasar el cursor por encima.
    for (const enlace of enlaces) expect(enlace).toHaveAttribute('href');
  });

  it('en la barra móvil el destino actual lleva aria-current, también dentro de una sección', () => {
    pathnameMock.mockReturnValue('/dashboard/admin/usuarios');
    renderShell();
    const movil = within(screen.getByRole('navigation', { name: 'Navegación administrativa móvil' }));
    expect(movil.getByRole('link', { name: 'Gestión de Usuarios' })).toHaveAttribute('aria-current', 'page');
    expect(movil.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page')).toHaveLength(1);
  });
});

describe('Métricas de uso en la estructura (T-321 · HU-178, FG08-C01)', () => {
  const fuente = (ruta: string) => readFileSync(join(__dirname, '..', ruta), 'utf8');
  const HREF = '/dashboard/admin#metricas';

  it('«Tendencias de uso» está en el grupo «Métricas», una sola vez', () => {
    const grupo = adminNavEntries.find((e) => 'type' in e && e.type === 'group' && e.label === 'Métricas');
    expect(grupo && 'items' in grupo ? grupo.items.map((i) => [i.label, i.href]) : []).toEqual([['Tendencias de uso', HREF]]);
    expect(flattenNavEntries(adminNavEntries).filter((d) => /m[eé]trica|tendencia/i.test(d.label))).toHaveLength(1);
  });

  it('el destino es el ancla de la sección real de HU-178 en el Panel Admin, no una página duplicada', () => {
    const panel = fuente('app/dashboard/admin/page.tsx');
    expect(fuente('components/admin/admin-page.ts')).toContain("export const ADMIN_METRICS_ANCHOR = 'metricas';");
    expect(panel).toMatch(/<div id=\{ADMIN_METRICS_ANCHOR\}[^>]*>\s*<AdminMetricsSection \/>/);
    // La sección de HU-178 se monta una sola vez en toda la aplicación.
    expect(panel.match(/<AdminMetricsSection \/>/g)).toHaveLength(1);
    expect(existsSync(join(__dirname, '../app/dashboard/admin/metricas'))).toBe(false);
  });

  it('el componente y el servicio de HU-178 no se modificaron: siguen leyendo GET /admin/metricas', () => {
    expect(fuente('components/admin/AdminMetricsSection.tsx')).toContain('Tendencias de uso');
    expect(fuente('lib/services/admin.ts')).toContain('`/admin/metricas?periodo=${periodo}`');
  });

  it('el enlace se muestra al abrir su grupo y lleva al ancla', () => {
    renderShell();
    const nav = desktopNav();
    fireEvent.click(nav.getByRole('button', { name: /^Métricas/ }));
    expect(nav.getByRole('link', { name: 'Tendencias de uso' })).toHaveAttribute('href', HREF);
  });

  it('en el Panel Admin el destino activo sigue siendo «Panel Admin»: las métricas son una sección suya', () => {
    pathnameMock.mockReturnValue('/dashboard/admin');
    renderShell();
    const nav = desktopNav();
    fireEvent.click(nav.getByRole('button', { name: /^Métricas/ }));
    const activos = nav.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page');
    expect(activos.map((a) => a.textContent)).toEqual(['Panel Admin']);
  });

  it('colapsada, «Tendencias de uso» sigue alcanzable como icono con nombre', () => {
    renderShell();
    const aside = document.querySelector('aside') as HTMLElement;
    fireEvent.click(within(aside).getByRole('button', { name: 'Colapsar barra lateral' }));
    expect(within(aside).getByRole('link', { name: 'Tendencias de uso' })).toHaveAttribute('href', HREF);
  });
});
