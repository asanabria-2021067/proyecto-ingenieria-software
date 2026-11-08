import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// NL-T4: el aviso en vivo de TAREA_ASIGNADA es un toast.custom (NotificacionToast) con «Ver mi tarea».

const push = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { info: vi.fn(), custom: vi.fn(), dismiss: vi.fn() }));
const realtime = vi.hoisted(() => ({ latestNotification: null as unknown }));

vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.mock('@/public/logo.png', () => ({ default: 'logo.png' }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 18, nombre: 'Ana', apellido: 'Pérez', roles: [] }, isLoading: false, isError: false }),
  isAdminUser: () => false,
}));
vi.mock('@/hooks/use-logout', () => ({ useLogout: () => vi.fn() }));
vi.mock('@/lib/hooks/useRealtimeNotifications', () => ({
  useRealtimeNotifications: () => ({ latestNotification: realtime.latestNotification, isConnected: true }),
}));
vi.mock('@/lib/swal', () => ({ default: { fire: vi.fn(), close: vi.fn() } }));
vi.mock('@/components/layout/notifications-bell', () => ({ NotificationsBell: () => null }));
vi.mock('@/components/layout/global-search-input', () => ({ GlobalSearchInput: () => null }));
vi.mock('@/components/dashboard/UserMenu', () => ({ UserMenu: () => null }));
vi.mock('@/components/projects/project-finalization-banner-host', () => ({ ProjectFinalizationBannerHost: () => null }));
vi.mock('@/components/dashboard/OnboardingTour', () => ({ default: () => null }));
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/components/layout/dashboard-extras', () => ({ DashboardExtras: () => null }));
vi.mock('@/components/font-scale-toggle', () => ({ FontScaleToggle: () => null }));

import DashboardLayout from '../components/dashboard/DashboardLayout';

function renderLayout() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  );
  render(<DashboardLayout>contenido</DashboardLayout>, { wrapper });
}

const base = {
  idNotificacion: 1,
  tituloNotificacion: 'Nueva tarea asignada',
  mensajeNotificacion: 'Te asignaron «Diseñar login»',
  leidaEn: null,
  creadaEn: '2026-01-01T00:00:00.000Z',
};

describe('DashboardLayout - aviso en vivo (NL-T4)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    realtime.latestNotification = null;
  });

  function montarToast() {
    const [render_, opciones] = toastMock.custom.mock.calls[0];
    expect(opciones.duration).toBe(Infinity);
    render(<QueryClientProvider client={new QueryClient()}>{render_('t1')}</QueryClientProvider>);
  }

  it('TAREA_ASIGNADA: toast personalizado con «Ver mi tarea» que abre el detalle', () => {
    realtime.latestNotification = {
      ...base,
      tipoNotificacion: 'TAREA_ASIGNADA',
      datosJson: { projectId: 12, taskId: 34, assignedBy: 'Luis Gómez' },
    };
    renderLayout();

    expect(toastMock.custom).toHaveBeenCalledTimes(1);
    expect(toastMock.info).not.toHaveBeenCalled();
    montarToast();
    expect(screen.getByText('Nueva tarea asignada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver mi tarea' }));
    expect(push).toHaveBeenCalledWith('/dashboard/projects/12/kanban/tasks/34');
    expect(toastMock.dismiss).toHaveBeenCalledWith('t1');
  });

  it('otros tipos también usan el toast personalizado, con su botón por categoría', () => {
    realtime.latestNotification = {
      ...base,
      tipoNotificacion: 'TAREA_ACTUALIZADA',
      datosJson: { projectId: 12, taskId: 34 },
    };
    renderLayout();

    expect(toastMock.custom).toHaveBeenCalledTimes(1);
    montarToast();
    expect(screen.getByRole('button', { name: 'Ver tarea' })).toBeInTheDocument();
  });

  it('en horario de silencio no hay aviso emergente', () => {
    realtime.latestNotification = { ...base, tipoNotificacion: 'TAREA_ASIGNADA', datosJson: { projectId: 12, taskId: 34 }, silenciada: true };
    renderLayout();
    expect(toastMock.custom).not.toHaveBeenCalled();
  });
});
