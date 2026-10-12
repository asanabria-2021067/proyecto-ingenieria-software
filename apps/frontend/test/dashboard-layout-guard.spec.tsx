import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * GPI01-C03 (H-02): `/dashboard/mis-proyectos` dejó de ser una página sin shell
 * con su propio permiso (`proyectos.listadosLegacy`) y redirige a
 * `/dashboard/projects/mine`. Las dos rutas pasan por el shell de estudiante,
 * que es quien excluye a administración: la lleva a `/dashboard/admin` y no
 * pinta el contenido. Aquí se prueba ese contrato con el layout raíz y el
 * shell REALES; solo se sustituyen la sesión y las piezas ajenas a la decisión.
 */

type Sesion = { data: { idUsuario: number; roles: string[] } | undefined; isLoading: boolean; isError: boolean };

const navegacion = vi.hoisted(() => ({ pathname: '/dashboard/mis-proyectos' }));
const replaceMock = vi.hoisted(() => vi.fn());
const sesionMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => navegacion.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
}));
vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.mock('@/public/logo.png', () => ({ default: 'logo.png' }));
// `isAdminUser` es el real: la decisión de quién es administración no se simula.
vi.mock('@/hooks/use-current-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-current-user')>()),
  useCurrentUser: () => sesionMock(),
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
// El shell administrativo tiene su propia prueba (admin-layout-guard); aquí solo importa que NO se use.
vi.mock('@/components/admin/AdminLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="shell-admin">{children}</div>,
}));

import DashboardRootLayout from '../app/dashboard/layout';

const CONTENIDO = 'listado protegido de proyectos';
const ESTUDIANTE: Sesion = { data: { idUsuario: 18, roles: ['estudiante'] }, isLoading: false, isError: false };
const ADMIN: Sesion = { data: { idUsuario: 1, roles: ['administrador'] }, isLoading: false, isError: false };
const CARGANDO: Sesion = { data: undefined, isLoading: true, isError: false };
const SIN_SESION: Sesion = { data: undefined, isLoading: false, isError: true };

function arbol() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <DashboardRootLayout>
        <p>{CONTENIDO}</p>
      </DashboardRootLayout>
    </QueryClientProvider>
  );
}

function abrir(pathname: string, sesion: Sesion) {
  navegacion.pathname = pathname;
  sesionMock.mockReturnValue(sesion);
  return render(arbol());
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// La ruta heredada y la canónica a la que redirige.
const RUTAS = ['/dashboard/mis-proyectos', '/dashboard/projects/mine'];

describe.each(RUTAS)('GPI01-C03: acceso a %s por el shell de estudiante', (ruta) => {
  it('un estudiante ve el contenido dentro del shell de estudiante, sin redirección', () => {
    abrir(ruta, ESTUDIANTE);

    expect(screen.getByText(CONTENIDO)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Saltar al contenido principal' })).toBeInTheDocument();
    expect(screen.queryByTestId('shell-admin')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('administración no ve el contenido y es llevada a su panel', async () => {
    abrir(ruta, ADMIN);

    expect(screen.queryByText(CONTENIDO)).not.toBeInTheDocument();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard/admin'));
    expect(replaceMock).toHaveBeenCalledTimes(1);
    // No se le monta ningún shell alrededor del contenido: ni el de estudiante ni el administrativo.
    expect(screen.queryByTestId('shell-admin')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('el rol de administración se reconoce sin importar mayúsculas ni otros roles', async () => {
    abrir(ruta, { data: { idUsuario: 1, roles: ['estudiante', 'Administrador'] }, isLoading: false, isError: false });

    expect(screen.queryByText(CONTENIDO)).not.toBeInTheDocument();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard/admin'));
  });

  it('sin sesión válida va al login y no ve el contenido', async () => {
    abrir(ruta, SIN_SESION);

    expect(screen.queryByText(CONTENIDO)).not.toBeInTheDocument();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
    expect(replaceMock).not.toHaveBeenCalledWith('/dashboard/admin');
  });

  it('mientras se resuelve la sesión no pinta el contenido ni redirige', () => {
    abrir(ruta, CARGANDO);

    expect(screen.queryByText(CONTENIDO)).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('si la sesión resulta ser de administración, el contenido no llega a pintarse en ningún momento', async () => {
    const vista = abrir(ruta, CARGANDO);
    expect(screen.queryByText(CONTENIDO)).not.toBeInTheDocument();

    sesionMock.mockReturnValue(ADMIN);
    vista.rerender(arbol());

    expect(screen.queryByText(CONTENIDO)).not.toBeInTheDocument();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard/admin'));
    expect(screen.queryByText(CONTENIDO)).not.toBeInTheDocument();
  });

  it('si la sesión resulta ser de estudiante, el contenido aparece al resolverse', () => {
    const vista = abrir(ruta, CARGANDO);
    sesionMock.mockReturnValue(ESTUDIANTE);
    vista.rerender(arbol());

    expect(screen.getByText(CONTENIDO)).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

describe('GPI01-C03: la exclusión es de estas rutas, no de todo el shell', () => {
  it('las rutas que admiten a administración en el shell de estudiante siguen admitiéndola', () => {
    abrir('/dashboard/proyectos', ADMIN);

    expect(screen.getByText(CONTENIDO)).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('las rutas heredadas no figuran entre las que admiten a administración', async () => {
    for (const ruta of RUTAS) {
      abrir(ruta, ADMIN);
      expect(screen.queryByText(CONTENIDO), ruta).not.toBeInTheDocument();
      await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard/admin'));
      cleanup();
      replaceMock.mockClear();
    }
  });
});
