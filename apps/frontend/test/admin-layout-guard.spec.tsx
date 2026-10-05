import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

/**
 * HU-178 (T-302): solo administración entra a /dashboard/admin/*. Sin rol de
 * administrador se redirige a /dashboard; sin sesión, a /login. En ningún
 * caso se pinta el contenido mientras tanto.
 */

const replaceMock = vi.hoisted(() => vi.fn());
const currentUserMock = vi.hoisted(() =>
  vi.fn(() => ({
    data: undefined as { idUsuario: number; roles: string[] } | undefined,
    isLoading: false,
    isError: false,
  })),
);

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/admin',
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
vi.mock('../components/layout/notifications-bell', () => ({ NotificationsBell: () => null }));
vi.mock('../components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('../components/dashboard/UserMenu', () => ({ UserMenu: () => null }));

import AdminLayout from '../components/admin/AdminLayout';

function renderShell() {
  return render(createElement(AdminLayout, null, createElement('div', null, 'contenido admin')));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminLayout — acceso restringido a administración', () => {
  it('un estudiante es redirigido a /dashboard y no ve el contenido', async () => {
    currentUserMock.mockReturnValue({ data: { idUsuario: 2, roles: ['estudiante'] }, isLoading: false, isError: false });
    renderShell();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
    expect(screen.queryByText('contenido admin')).not.toBeInTheDocument();
  });

  it('un administrador ve el contenido y no es redirigido', () => {
    currentUserMock.mockReturnValue({ data: { idUsuario: 1, roles: ['administrador'] }, isLoading: false, isError: false });
    renderShell();

    expect(screen.getByText('contenido admin')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('sin sesión se redirige a /login', async () => {
    currentUserMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderShell();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
    expect(replaceMock).not.toHaveBeenCalledWith('/dashboard');
  });

  it('mientras carga el usuario no redirige ni muestra el contenido', () => {
    currentUserMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderShell();

    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.queryByText('contenido admin')).not.toBeInTheDocument();
  });
});
