import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// NL-T4: el aviso en vivo de TAREA_ASIGNADA es un toast.info de 10 s con «Ver mi tarea».

const push = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { info: vi.fn() }));
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

describe('DashboardLayout - aviso de tarea asignada (NL-T4)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    realtime.latestNotification = null;
  });

  it('TAREA_ASIGNADA: toast.info de 10 s con «Ver mi tarea» que abre el detalle', () => {
    realtime.latestNotification = {
      ...base,
      tipoNotificacion: 'TAREA_ASIGNADA',
      datosJson: { projectId: 12, taskId: 34 },
    };
    renderLayout();

    expect(toastMock.info).toHaveBeenCalledTimes(1);
    expect(toastMock).not.toHaveBeenCalled();
    const [titulo, opciones] = toastMock.info.mock.calls[0];
    expect(titulo).toBe('Nueva tarea asignada');
    expect(opciones.duration).toBe(10_000);
    expect(opciones.action.label).toBe('Ver mi tarea');
    opciones.action.onClick();
    expect(push).toHaveBeenCalledWith('/dashboard/projects/12/kanban/tasks/34');
  });

  it('otros tipos siguen usando el toast normal', () => {
    realtime.latestNotification = {
      ...base,
      tipoNotificacion: 'TAREA_ACTUALIZADA',
      datosJson: { projectId: 12, taskId: 34 },
    };
    renderLayout();

    expect(toastMock.info).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledTimes(1);
  });
});