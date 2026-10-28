import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.mock('@/public/logo.png', () => ({ default: 'logo.png' }));
vi.mock('@/public/Logo UVG-08.png', () => ({ default: 'logo-claro.png' }));
vi.mock('@/public/Logo claro.png', () => ({ default: 'logo-oscuro.png' }));
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

import Navbar from '../components/landing/Navbar';
import DashboardLayout from '../components/dashboard/DashboardLayout';

afterEach(() => cleanup());

describe('acceso a contacto desde la navbar pública', () => {
  it('muestra «Contacto» junto a los demás destinos de escritorio', () => {
    render(<Navbar />);

    const enlace = screen.getByRole('link', { name: 'Contacto' });
    expect(enlace).toHaveAttribute('href', '/contacto');
    expect(screen.getByRole('link', { name: 'Como Funciona' })).toBeInTheDocument();
  });

  it('el menú móvil también lleva a contacto', () => {
    const { container } = render(<Navbar />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));

    const menuMovil = container.querySelector('nav > div.md\\:hidden') as HTMLElement;
    expect(menuMovil).not.toBeNull();
    expect(within(menuMovil).getByRole('link', { name: 'Contacto' })).toHaveAttribute('href', '/contacto');
  });
});

describe('acceso a contacto con sesión', () => {
  function renderLayout() {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return render(<DashboardLayout>contenido</DashboardLayout>, { wrapper });
  }

  it('la barra superior del dashboard enlaza a contacto en escritorio y móvil', () => {
    const { container } = renderLayout();

    const encabezado = container.querySelector('header') as HTMLElement;
    const enlace = within(encabezado).getByRole('link', { name: 'Contacto y soporte' });
    expect(enlace).toHaveAttribute('href', '/contacto');
    expect(enlace.className).not.toMatch(/\bhidden\b/);
  });

  it('no agrega destinos a la navegación lateral ni a la barra inferior', () => {
    const { container } = renderLayout();

    const lateral = container.querySelector('aside nav') as HTMLElement;
    const movil = container.querySelector('nav.fixed') as HTMLElement;
    expect(within(lateral).queryByRole('link', { name: /contacto/i })).toBeNull();
    expect(within(movil).queryByRole('link', { name: /contacto/i })).toBeNull();
  });
});
