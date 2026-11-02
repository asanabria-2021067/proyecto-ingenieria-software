import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// FIX-A6: «Mi asociación» en el menú lateral solo para quien es de una junta; con varias, un grupo para elegir.

const estado = vi.hoisted(() => ({ pathname: '/dashboard', juntas: [] as { idAsociacion: number; nombre: string }[] }));

vi.mock('next/navigation', () => ({
  usePathname: () => estado.pathname,
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.mock('@/public/logo.png', () => ({ default: 'logo.png' }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 18, nombre: 'Ana', apellido: 'Pérez', roles: [] }, isLoading: false, isError: false }),
  isAdminUser: () => false,
}));
vi.mock('@/hooks/use-asociaciones', () => ({ useMisJuntas: () => ({ data: estado.juntas }) }));
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

function renderLayout(pathname = '/dashboard') {
  estado.pathname = pathname;
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const utils = render(<DashboardLayout>contenido</DashboardLayout>, { wrapper });
  return {
    escritorio: utils.container.querySelector('aside nav') as HTMLElement,
    movil: utils.container.querySelector('nav.fixed') as HTMLElement,
  };
}

describe('DashboardLayout - «Mi asociación»', () => {
  afterEach(() => {
    cleanup();
    estado.juntas = [];
  });

  it('quien no es de una junta no la ve', () => {
    const { escritorio } = renderLayout();
    expect(within(escritorio).queryByText('Mi asociación')).toBeNull();
  });

  it('con una sola junta es un enlace directo a su vista, antes de «Mi trabajo»', () => {
    estado.juntas = [{ idAsociacion: 7, nombre: 'Asociación de Estudiantes de Computación' }];
    const { escritorio } = renderLayout('/dashboard/asociacion/7');
    const enlace = within(escritorio).getByRole('link', { name: 'Mi asociación' });
    expect(enlace).toHaveAttribute('href', '/dashboard/asociacion/7');
    expect(enlace).toHaveAttribute('aria-current', 'page');
    const etiquetas = within(escritorio).getAllByRole('button').map((b) => b.textContent);
    const orden = [...escritorio.querySelectorAll('a, button')].map((el) => el.textContent);
    expect(orden.indexOf('Mi asociación')).toBeLessThan(orden.indexOf(etiquetas.find((t) => t?.startsWith('Mi trabajo')) ?? ''));
  });

  it('con varias juntas es un grupo con una opción por asociación y marca la que está abierta', () => {
    estado.juntas = [
      { idAsociacion: 7, nombre: 'Asociación de Computación' },
      { idAsociacion: 9, nombre: 'Asociación de Ingeniería Industrial' },
    ];
    const { escritorio } = renderLayout('/dashboard/asociacion/9');
    const grupo = within(escritorio).getByRole('button', { name: /^Mi asociación/ });
    expect(grupo).toHaveAttribute('aria-expanded', 'true');
    const hijos = escritorio.querySelector(`#${grupo.getAttribute('aria-controls')}`) as HTMLElement;
    expect(within(hijos).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Asociación de Computación', '/dashboard/asociacion/7'],
      ['Asociación de Ingeniería Industrial', '/dashboard/asociacion/9'],
    ]);
    expect(within(hijos).getByRole('link', { name: 'Asociación de Ingeniería Industrial' })).toHaveAttribute('aria-current', 'page');
    expect(within(hijos).getByRole('link', { name: 'Asociación de Computación' })).not.toHaveAttribute('aria-current');

    fireEvent.click(grupo);
    expect(within(escritorio).queryByRole('link', { name: 'Asociación de Computación' })).toBeNull();
  });

  it('la barra inferior móvil no cambia (se entra desde el menú de cuenta)', () => {
    estado.juntas = [{ idAsociacion: 7, nombre: 'AEC' }];
    const { movil } = renderLayout();
    expect(within(movil).queryByRole('link', { name: 'Mi asociación' })).toBeNull();
  });
});
