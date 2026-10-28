import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// HU-158 (T-232): «Mis Horas» entra en «Mi trabajo» justo después de «Mis
// Tareas», en la sidebar de escritorio y en la barra inferior móvil, sin
// mover ni quitar ningún otro destino (INV-H14).

const navegacion = vi.hoisted(() => ({ pathname: '/dashboard/mis-horas', search: '' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navegacion.pathname,
  useSearchParams: () => new URLSearchParams(navegacion.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.mock('@/public/logo.png', () => ({ default: 'logo.png' }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 18, nombre: 'Ana', apellido: 'Pérez', roles: [] }, isLoading: false, isError: false }),
  isAdminUser: () => false,
}));
vi.mock('@/hooks/use-logout', () => ({ useLogout: () => vi.fn() }));
vi.mock('@/lib/hooks/useRealtimeNotifications', () => ({
  useRealtimeNotifications: () => ({ latestNotification: null, isConnected: true }),
}));
vi.mock('@/lib/swal', () => ({ default: { fire: vi.fn(), close: vi.fn() } }));
vi.mock('@/components/layout/notifications-bell', () => ({ NotificationsBell: () => null }));
vi.mock('@/components/layout/global-search-input', () => ({ GlobalSearchInput: () => null }));
vi.mock('@/components/dashboard/UserMenu', () => ({ UserMenu: () => null }));
vi.mock('@/components/projects/project-finalization-banner-host', () => ({ ProjectFinalizationBannerHost: () => null }));
vi.mock('@/components/dashboard/OnboardingTour', () => ({ default: () => null }));
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/components/font-scale-toggle', () => ({ FontScaleToggle: () => null }));

import DashboardLayout from '../components/dashboard/DashboardLayout';

/** Acepta un destino con query (`/dashboard/personas?seccion=amigos`): la ruta va a `usePathname` y la query a `useSearchParams`. */
function renderLayout(destino: string) {
  const [pathname, search = ''] = destino.split('?');
  navegacion.pathname = pathname;
  navegacion.search = search;
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const utils = render(<DashboardLayout>contenido</DashboardLayout>, { wrapper });
  const escritorio = utils.container.querySelector('aside nav') as HTMLElement;
  const movil = utils.container.querySelector('nav.fixed') as HTMLElement;
  return { escritorio, movil };
}

const MI_TRABAJO = [
  ['Mis Tareas', '/dashboard/mis-tareas'],
  ['Mis Horas', '/dashboard/mis-horas'],
  ['Calendario', '/dashboard/calendario'],
  ['Mis Postulaciones', '/dashboard/mis-postulaciones'],
  ['Chats archivados', '/dashboard/chats/archivados'],
];

describe('DashboardLayout — «Mis Horas» en «Mi trabajo»', () => {
  afterEach(() => cleanup());

  it('escritorio: el grupo queda Mis Tareas → Mis Horas → Calendario → Mis Postulaciones → Chats archivados', () => {
    const { escritorio } = renderLayout('/dashboard/mis-horas');

    const grupo = escritorio.querySelector('#nav-group-mi-trabajo') as HTMLElement;
    expect(within(grupo).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual(MI_TRABAJO);
  });

  it('escritorio: aparece una sola vez, con su href, su id DOM y marcado como página actual', () => {
    const { escritorio } = renderLayout('/dashboard/mis-horas');

    const enlaces = within(escritorio).getAllByRole('link', { name: 'Mis Horas' });
    expect(enlaces).toHaveLength(1);
    expect(enlaces[0]).toHaveAttribute('href', '/dashboard/mis-horas');
    expect(enlaces[0]).toHaveAttribute('id', 'nav-item-mis-horas');
    expect(enlaces[0]).toHaveAttribute('aria-current', 'page');
    expect(within(escritorio).getByRole('link', { name: 'Mis Tareas' })).not.toHaveAttribute('aria-current');
  });

  it('móvil: la barra inferior incluye Mis Horas justo tras Mis Tareas, una sola vez', () => {
    const { movil } = renderLayout('/dashboard/mis-horas');

    const destinos = within(movil).getAllByRole('link').map((a) => a.getAttribute('aria-label'));
    expect(destinos).toEqual([
      'Dashboard',
      'Personas',
      'Explorar Proyectos',
      'Mis Proyectos',
      'Mis Tareas',
      'Mis Horas',
      'Calendario',
      'Mis Postulaciones',
      'Chats archivados',
    ]);
    const misHoras = within(movil).getByRole('link', { name: 'Mis Horas' });
    expect(misHoras).toHaveAttribute('href', '/dashboard/mis-horas');
    expect(misHoras).toHaveAttribute('id', 'nav-item-mobile-mis-horas');
    expect(misHoras).toHaveAttribute('aria-current', 'page');
  });

  it('Calendario, Mis Postulaciones y Chats archivados conservan su destino y se activan en su propia ruta', () => {
    const { escritorio, movil } = renderLayout('/dashboard/calendario');

    expect(within(escritorio).getByRole('link', { name: 'Calendario' })).toHaveAttribute('aria-current', 'page');
    expect(within(escritorio).getByRole('link', { name: 'Mis Horas' })).not.toHaveAttribute('aria-current');
    expect(within(escritorio).getByRole('link', { name: 'Mis Postulaciones' })).toHaveAttribute('id', 'nav-item-mis-postulaciones');
    expect(within(movil).getByRole('link', { name: 'Calendario' })).toHaveAttribute('href', '/dashboard/calendario');
    expect(within(movil).getByRole('link', { name: 'Chats archivados' })).toHaveAttribute('href', '/dashboard/chats/archivados');
  });
});

describe('DashboardLayout — «Explorar Proyectos» solo en su lista', () => {
  afterEach(() => cleanup());

  it('queda marcado en /dashboard/proyectos', () => {
    const { escritorio } = renderLayout('/dashboard/proyectos');
    expect(within(escritorio).getByRole('link', { name: 'Explorar Proyectos' })).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    '/dashboard/proyectos/28',
    '/dashboard/proyectos/28/sprints',
    '/dashboard/proyectos/28/miembros',
    '/dashboard/proyectos/28/liderazgo',
    '/dashboard/proyectos/28/bitacora',
    '/dashboard/proyectos/28/sprints/analytics',
    '/dashboard/proyectos/28/reportes',
  ])('no se marca dentro de un proyecto (%s)', (ruta) => {
    const { escritorio, movil } = renderLayout(ruta);
    for (const nav of [escritorio, movil]) {
      for (const enlace of within(nav).queryAllByRole('link', { name: 'Explorar Proyectos' })) {
        expect(enlace).not.toHaveAttribute('aria-current');
      }
    }
    expect(escritorio.querySelector('[aria-current="page"]')).toBeNull();
  });
});

// Sidebar global del estudiante: secciones fijas (sin acordeón), un único
// destino activo por ruta y «Colapsar» como control del sidebar, no como
// elemento de navegación. La sidebar contextual del proyecto es otra cosa.
describe('DashboardLayout — navegación global del estudiante', () => {
  afterEach(() => {
    cleanup();
    try {
      window.localStorage.clear();
    } catch {
      /* sin almacenamiento */
    }
  });

  const DESTINOS = [
    ['Dashboard', '/dashboard'],
    ['Descubrir personas', '/dashboard/personas'],
    ['Mis amigos', '/dashboard/personas?seccion=amigos'],
    ['Amigos de amigos', '/dashboard/personas?seccion=amigos-de-amigos'],
    ['Explorar Proyectos', '/dashboard/proyectos'],
    ['Mis Proyectos', '/dashboard/projects/mine'],
    ['Mis Tareas', '/dashboard/mis-tareas'],
    ['Mis Horas', '/dashboard/mis-horas'],
    ['Calendario', '/dashboard/calendario'],
    ['Mis Postulaciones', '/dashboard/mis-postulaciones'],
    ['Chats archivados', '/dashboard/chats/archivados'],
  ] as const;

  it('Dashboard suelto; Personas, Proyectos y Mi trabajo como grupos desplegables, abiertos de entrada', () => {
    const { escritorio } = renderLayout('/dashboard');

    expect(escritorio).toHaveAttribute('aria-label', 'Navegación principal');
    expect(within(escritorio).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual(
      DESTINOS.map(([nombre, href]) => [nombre, href]),
    );

    // Los grupos abren de entrada: la guía de bienvenida señala destinos que están dentro.
    const personas = within(escritorio).getByRole('button', { name: /^Personas/ });
    const proyectos = within(escritorio).getByRole('button', { name: /^Proyectos/ });
    const trabajo = within(escritorio).getByRole('button', { name: /^Mi trabajo/ });
    for (const grupo of [personas, proyectos, trabajo]) {
      expect(grupo).toHaveAttribute('aria-expanded', 'true');
      expect(grupo).toHaveAttribute('data-state', 'open');
    }
    const hijosPersonas = escritorio.querySelector(`#${personas.getAttribute('aria-controls')}`) as HTMLElement;
    expect(within(hijosPersonas).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Descubrir personas',
      'Mis amigos',
      'Amigos de amigos',
    ]);
    const hijosProyectos = escritorio.querySelector(`#${proyectos.getAttribute('aria-controls')}`) as HTMLElement;
    expect(within(hijosProyectos).getAllByRole('link').map((a) => a.textContent)).toEqual(['Explorar Proyectos', 'Mis Proyectos']);
    const hijosTrabajo = escritorio.querySelector(`#${trabajo.getAttribute('aria-controls')}`) as HTMLElement;
    expect(within(hijosTrabajo).getAllByRole('link')).toHaveLength(5);
  });

  it('usa la misma barra que el administrador: superficie, marca, grupos con chevron y guía vertical', () => {
    const { escritorio } = renderLayout('/dashboard/mis-horas');
    const aside = escritorio.closest('aside') as HTMLElement;

    expect(aside).toHaveClass('admin-sidebar', 'transition-[width]', 'duration-200');
    expect(aside.querySelector('.admin-sidebar-brand .admin-brand-logo')).toBeInTheDocument();
    expect(aside.querySelector('#dashboard-account-menu')).toHaveClass('admin-sidebar-footer');

    const grupo = within(escritorio).getByRole('button', { name: /^Mi trabajo/ });
    expect(grupo).toHaveClass('admin-nav-item', 'admin-nav-group');
    expect(grupo.querySelector('.admin-nav-chevron')).toHaveClass('transition-transform', 'duration-200', 'rotate-180');
    expect(escritorio.querySelector(`#${grupo.getAttribute('aria-controls')}`)).toHaveClass('admin-nav-children');

    expect(within(escritorio).getByRole('link', { name: 'Dashboard' })).toHaveClass('admin-nav-item');
    const activo = within(escritorio).getByRole('link', { name: 'Mis Horas' });
    expect(activo).toHaveClass('admin-nav-subitem');
    expect(activo).toHaveAttribute('aria-current', 'page');
    expect(activo).not.toHaveClass('admin-nav-inactive');
  });

  it('un grupo se pliega y se vuelve a desplegar con su botón, como en la barra del administrador', () => {
    const { escritorio } = renderLayout('/dashboard');
    const proyectos = within(escritorio).getByRole('button', { name: /^Proyectos/ });

    fireEvent.click(proyectos);
    expect(proyectos).toHaveAttribute('aria-expanded', 'false');
    expect(proyectos.querySelector('.admin-nav-chevron')).not.toHaveClass('rotate-180');
    expect(within(escritorio).queryByRole('link', { name: 'Explorar Proyectos' })).not.toBeInTheDocument();
    // El otro grupo no se ve afectado.
    expect(within(escritorio).getByRole('link', { name: 'Mis Tareas' })).toBeInTheDocument();

    fireEvent.click(proyectos);
    expect(proyectos).toHaveAttribute('aria-expanded', 'true');
    expect(within(escritorio).getByRole('link', { name: 'Explorar Proyectos' })).toHaveAttribute('id', 'nav-item-explorar-proyectos');
  });

  it.each(DESTINOS)('en %s solo ese destino queda activo', (nombre, href) => {
    const { escritorio } = renderLayout(href);
    const activos = escritorio.querySelectorAll('[aria-current="page"]');
    expect(activos).toHaveLength(1);
    expect(activos[0]).toHaveTextContent(nombre);
  });

  it('«Colapsar» es un control del encabezado del sidebar, no un elemento de la navegación', () => {
    const { escritorio } = renderLayout('/dashboard');
    const aside = escritorio.closest('aside') as HTMLElement;

    expect(within(escritorio).queryByRole('button', { name: /colapsar/i })).not.toBeInTheDocument();
    expect(within(escritorio).queryByText('Colapsar')).not.toBeInTheDocument();
    const control = within(aside).getByRole('button', { name: 'Colapsar barra lateral' });
    expect(control).toHaveAttribute('aria-controls', escritorio.id);
    expect(control).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(control);
    expect(within(aside).getByRole('button', { name: 'Expandir barra lateral' })).toBeInTheDocument();
    expect(within(aside).queryByRole('button', { name: 'Colapsar barra lateral' })).not.toBeInTheDocument();
    // Colapsada conserva los mismos destinos, solo con iconos.
    expect(within(aside.querySelector('nav') as HTMLElement).getAllByRole('link')).toHaveLength(DESTINOS.length);
  });

  it('Personas: el grupo sigue abierto con una sección activa, se pliega como los demás y la barra móvil conserva un único destino', () => {
    const { escritorio, movil } = renderLayout('/dashboard/personas?seccion=amigos-de-amigos');
    const personas = within(escritorio).getByRole('button', { name: /^Personas/ });
    expect(personas).toHaveClass('admin-nav-item', 'admin-nav-group');
    expect(personas).toHaveAttribute('aria-expanded', 'true');
    const activo = within(escritorio).getByRole('link', { name: 'Amigos de amigos' });
    expect(activo).toHaveClass('admin-nav-subitem');
    expect(activo).toHaveAttribute('aria-current', 'page');

    fireEvent.click(personas);
    expect(within(escritorio).queryByRole('link', { name: 'Mis amigos' })).not.toBeInTheDocument();
    // Plegar Personas no cierra los otros grupos.
    expect(within(escritorio).getByRole('link', { name: 'Explorar Proyectos' })).toBeInTheDocument();
    expect(within(escritorio).getByRole('link', { name: 'Mis Tareas' })).toBeInTheDocument();

    const enMovil = within(movil).getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/dashboard/personas'));
    expect(enMovil.map((a) => [a.getAttribute('aria-label'), a.getAttribute('href')])).toEqual([['Personas', '/dashboard/personas']]);
    expect(enMovil[0]).toHaveAttribute('aria-current', 'page');
  });
});
