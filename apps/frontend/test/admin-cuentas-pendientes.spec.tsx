import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const pathnameMock = vi.hoisted(() => vi.fn(() => '/dashboard/admin'));
const replaceMock = vi.hoisted(() => vi.fn());
const currentUserMock = vi.hoisted(() =>
  vi.fn(() => ({
    data: { idUsuario: 1, nombre: 'Admin', apellido: 'UVG', roles: ['administrador'] },
    isLoading: false,
    isError: false,
  })),
);

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
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

vi.mock('@/lib/swal', () => ({
  default: {
    fire: vi.fn(),
  },
}));

vi.mock('@/lib/services/admin', () => ({
  getCuentasPendientes: vi.fn(),
  aprobarCuentaPendiente: vi.fn(),
  rechazarCuentaPendiente: vi.fn(),
}));

import uvgSwal from '@/lib/swal';
import {
  aprobarCuentaPendiente,
  getCuentasPendientes,
  rechazarCuentaPendiente,
} from '@/lib/services/admin';
import { getNotificationLink } from '../lib/services/notifications';
import AdminLayout from '../components/admin/AdminLayout';
import AdminCuentasPendientesPage from '../app/dashboard/admin/cuentas-pendientes/page';

const CUENTA = {
  idUsuario: 7,
  nombre: 'Ana',
  apellido: 'Perez',
  correo: 'per23123@uvg.edu.gt',
  carne: '23123',
  carrera: { idCarrera: 2, nombreCarrera: 'Ingeniería en Ciencia de la Computación' },
  fechaRegistro: '2026-08-01T10:00:00.000Z',
};

const RESUELTA = {
  idUsuario: 7,
  nombre: 'Ana',
  apellido: 'Perez',
  correo: 'per23123@uvg.edu.gt',
  estado: 'ACTIVO' as const,
};

function withClient(child: ReturnType<typeof createElement>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, child));
}

function renderPage() {
  return withClient(createElement(AdminCuentasPendientesPage));
}

function renderShell() {
  return withClient(createElement(AdminLayout, null, createElement('div', null, 'contenido admin')));
}

function desktopNav() {
  return within(document.querySelector('aside') as HTMLElement);
}

async function confirmar(nombreAccion: RegExp, etiquetaConfirmacion: string) {
  fireEvent.click(await screen.findByRole('button', { name: nombreAccion }));
  const dialogo = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialogo).getByRole('button', { name: etiquetaConfirmacion }));
}

beforeEach(() => {
  pathnameMock.mockReturnValue('/dashboard/admin');
  currentUserMock.mockReturnValue({
    data: { idUsuario: 1, nombre: 'Admin', apellido: 'UVG', roles: ['administrador'] },
    isLoading: false,
    isError: false,
  });
  vi.mocked(getCuentasPendientes).mockResolvedValue({ total: 1, cuentas: [CUENTA] });
  vi.mocked(aprobarCuentaPendiente).mockResolvedValue(RESUELTA);
  vi.mocked(rechazarCuentaPendiente).mockResolvedValue({ ...RESUELTA, estado: 'INACTIVO' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminCuentasPendientesPage', () => {
  it('renderiza la tabla con nombre completo, correo, carné, carrera y fecha de registro', async () => {
    renderPage();

    expect(await screen.findByText('Ana Perez')).toBeInTheDocument();
    expect(screen.getByText('per23123@uvg.edu.gt')).toBeInTheDocument();
    expect(screen.getByText('23123')).toBeInTheDocument();
    expect(screen.getByText('Ingeniería en Ciencia de la Computación')).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aprobar la cuenta de Ana Perez/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Rechazar la cuenta de Ana Perez/ })).toBeEnabled();
    ['Nombre completo', 'Correo', 'Carné', 'Carrera', 'Fecha de registro'].forEach((columna) => {
      expect(screen.getByRole('columnheader', { name: columna })).toBeInTheDocument();
    });
  });

  it('muestra el estado vacío cuando no hay cuentas', async () => {
    vi.mocked(getCuentasPendientes).mockResolvedValue({ total: 0, cuentas: [] });
    renderPage();

    expect(await screen.findByText('No hay cuentas pendientes de verificación')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aprobar/ })).not.toBeInTheDocument();
  });

  it('muestra el estado de error cuando falla la carga', async () => {
    vi.mocked(getCuentasPendientes).mockRejectedValue(new Error('fallo'));
    renderPage();

    expect(await screen.findByText('No se pudieron cargar las cuentas pendientes.')).toBeInTheDocument();
  });

  it('no aprueba hasta confirmar y cancelar no llama al servicio', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Aprobar la cuenta de Ana Perez/ }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(aprobarCuentaPendiente).not.toHaveBeenCalled();

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(aprobarCuentaPendiente).not.toHaveBeenCalled();
  });

  it('aprueba con confirmación, muestra éxito y vuelve a pedir la lista', async () => {
    renderPage();
    await confirmar(/Aprobar la cuenta de Ana Perez/, 'Aprobar');

    await waitFor(() => expect(aprobarCuentaPendiente).toHaveBeenCalledWith(7));
    expect(rechazarCuentaPendiente).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(uvgSwal.fire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'success', title: 'Cuenta aprobada' })),
    );
    await waitFor(() => expect(getCuentasPendientes).toHaveBeenCalledTimes(2));
  });

  it('rechaza con confirmación, muestra éxito y vuelve a pedir la lista', async () => {
    renderPage();
    await confirmar(/Rechazar la cuenta de Ana Perez/, 'Rechazar');

    await waitFor(() => expect(rechazarCuentaPendiente).toHaveBeenCalledWith(7));
    expect(aprobarCuentaPendiente).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(uvgSwal.fire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'success', title: 'Cuenta rechazada' })),
    );
    await waitFor(() => expect(getCuentasPendientes).toHaveBeenCalledTimes(2));
  });

  it('deshabilita los botones mientras se procesa la acción', async () => {
    let resolver: (value: typeof RESUELTA) => void = () => undefined;
    vi.mocked(aprobarCuentaPendiente).mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );
    renderPage();
    await confirmar(/Aprobar la cuenta de Ana Perez/, 'Aprobar');

    await waitFor(() => expect(screen.getByRole('button', { name: /Aprobar la cuenta de Ana Perez/ })).toBeDisabled());
    expect(screen.getByRole('button', { name: /Rechazar la cuenta de Ana Perez/ })).toBeDisabled();

    resolver(RESUELTA);
    await waitFor(() => expect(uvgSwal.fire).toHaveBeenCalled());
  });

  it('con 409 avisa que la cuenta ya fue atendida y refresca la lista', async () => {
    vi.mocked(aprobarCuentaPendiente).mockRejectedValue(
      Object.assign(new Error('La cuenta ya no está pendiente de verificación'), { statusCode: 409 }),
    );
    renderPage();
    await screen.findByText('Ana Perez');
    vi.mocked(getCuentasPendientes).mockResolvedValue({ total: 0, cuentas: [] });
    await confirmar(/Aprobar la cuenta de Ana Perez/, 'Aprobar');

    await waitFor(() =>
      expect(uvgSwal.fire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'info', title: 'Cuenta ya atendida' })),
    );
    expect(uvgSwal.fire).not.toHaveBeenCalledWith(expect.objectContaining({ icon: 'error' }));
    expect(await screen.findByText('No hay cuentas pendientes de verificación')).toBeInTheDocument();
    expect(getCuentasPendientes).toHaveBeenCalledTimes(2);
  });

  it('con otro error muestra el toast de error', async () => {
    vi.mocked(rechazarCuentaPendiente).mockRejectedValue(
      Object.assign(new Error('Usuario 7 no encontrado'), { statusCode: 404 }),
    );
    renderPage();
    await confirmar(/Rechazar la cuenta de Ana Perez/, 'Rechazar');

    await waitFor(() =>
      expect(uvgSwal.fire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'error', title: 'Error' })),
    );
    await waitFor(() => expect(getCuentasPendientes).toHaveBeenCalledTimes(2));
  });
});

describe('AdminLayout — sección y contador de cuentas pendientes', () => {
  it('administración ve la sección dentro del grupo Administración', async () => {
    pathnameMock.mockReturnValue('/dashboard/admin/cuentas-pendientes');
    renderShell();

    const enlace = desktopNav().getByRole('link', { name: /Cuentas pendientes/ });
    expect(enlace).toHaveAttribute('href', '/dashboard/admin/cuentas-pendientes');
    expect(enlace).toHaveAttribute('aria-current', 'page');
    await waitFor(() => expect(getCuentasPendientes).toHaveBeenCalled());
  });

  it('muestra el contador con el total del endpoint', async () => {
    vi.mocked(getCuentasPendientes).mockResolvedValue({ total: 3, cuentas: [] });
    pathnameMock.mockReturnValue('/dashboard/admin/cuentas-pendientes');
    renderShell();

    await waitFor(() =>
      expect(desktopNav().getByRole('link', { name: /Cuentas pendientes/ })).toHaveTextContent('3 por atender'),
    );
  });

  it('con el grupo colapsado el contador se muestra en Administración', async () => {
    vi.mocked(getCuentasPendientes).mockResolvedValue({ total: 3, cuentas: [] });
    renderShell();

    await waitFor(() =>
      expect(desktopNav().getByRole('button', { name: /Administración/ })).toHaveTextContent('3 por atender'),
    );
  });

  it('oculta el contador cuando el total es 0', async () => {
    vi.mocked(getCuentasPendientes).mockResolvedValue({ total: 0, cuentas: [] });
    pathnameMock.mockReturnValue('/dashboard/admin/cuentas-pendientes');
    renderShell();

    await waitFor(() => expect(getCuentasPendientes).toHaveBeenCalled());
    await screen.findByText('contenido admin');
    expect(desktopNav().getByRole('link', { name: /Cuentas pendientes/ })).toHaveTextContent(/^Cuentas pendientes$/);
    expect(screen.queryByText(/por atender/)).not.toBeInTheDocument();
  });

  it('un no administrador no ve la sección ni el contador y no se consulta el endpoint', async () => {
    currentUserMock.mockReturnValue({
      data: { idUsuario: 2, nombre: 'Est', apellido: 'UVG', roles: ['estudiante'] },
      isLoading: false,
      isError: false,
    });
    pathnameMock.mockReturnValue('/dashboard/admin/cuentas-pendientes');
    renderShell();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
    expect(screen.queryByRole('link', { name: /Cuentas pendientes/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/por atender/)).not.toBeInTheDocument();
    expect(screen.queryByText('contenido admin')).not.toBeInTheDocument();
    expect(getCuentasPendientes).not.toHaveBeenCalled();
  });
});

describe('Notificación de cuenta pendiente', () => {
  it('enlaza a la sección de cuentas pendientes', () => {
    expect(
      getNotificationLink({ tipoNotificacion: 'CUENTA_PENDIENTE_VERIFICACION', datosJson: { userId: 7 } }),
    ).toBe('/dashboard/admin/cuentas-pendientes');
  });
});
