import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { isCoordinadorUser, rutaInicioDe } from '../lib/permissions/ruta-inicio';

/**
 * ROL-2: el layout raíz de /dashboard decide el shell. El coordinador usa el suyo en sus rutas y en las
 * pantallas del árbol administrativo que el backend le abre; el resto de /dashboard/admin/* sigue pasando por
 * el shell de administración, cuyo guard lo devuelve a /dashboard (y de ahí a su panel).
 */

const navegacion = vi.hoisted(() => ({ pathname: '/dashboard' }));
const replaceMock = vi.hoisted(() => vi.fn());
const sesionMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => navegacion.pathname,
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
}));
vi.mock('@/hooks/use-current-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-current-user')>()),
  useCurrentUser: () => sesionMock(),
}));
vi.mock('@/components/layout/shell-skeleton', () => ({ ShellSkeleton: () => <div data-testid="shell-carga" /> }));
vi.mock('@/components/admin/AdminLayout', () => ({
  default: ({ children, variant = 'admin' }: { children: ReactNode; variant?: string }) => (
    <div data-testid={`shell-${variant}`}>{children}</div>
  ),
}));
vi.mock('@/components/dashboard/DashboardLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="shell-estudiante">{children}</div>,
}));

import DashboardRootLayout from '../app/dashboard/layout';

const sesion = (roles: string[]) => sesionMock.mockReturnValue({ data: { idUsuario: 1, roles }, isLoading: false });

function ir(pathname: string) {
  navegacion.pathname = pathname;
  return render(<DashboardRootLayout>contenido</DashboardRootLayout>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('rutaInicioDe', () => {
  it('cada rol entra a su inicio', () => {
    const usuario = (roles: string[]) => ({ roles });
    expect(rutaInicioDe(usuario(['administrador']))).toBe('/dashboard/admin');
    expect(rutaInicioDe(usuario(['coordinador_academico']))).toBe('/dashboard/coordinador');
    expect(rutaInicioDe(usuario(['estudiante']))).toBe('/dashboard');
    expect(rutaInicioDe(null)).toBe('/dashboard');
  });

  it('un administrador que además es coordinador conserva el panel de administración', () => {
    const doble = { roles: ['coordinador_academico', 'administrador'] };
    expect(isCoordinadorUser(doble)).toBe(false);
    expect(rutaInicioDe(doble)).toBe('/dashboard/admin');
  });
});

describe('layout raíz con el coordinador', () => {
  it('/dashboard lo lleva a su propio dashboard', async () => {
    sesion(['coordinador_academico']);
    ir('/dashboard');
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard/coordinador'));
  });

  it.each([
    '/dashboard/coordinador',
    '/dashboard/coordinador/pendientes',
    '/dashboard/coordinador/cierres',
    '/dashboard/projects/admin/reviews',
    '/dashboard/admin/horas',
    '/dashboard/admin/bandeja',
    '/dashboard/admin/proyectos',
    '/dashboard/admin/sprints',
    '/dashboard/admin/metricas',
    '/dashboard/admin/entidades',
    '/dashboard/admin/proyectos/12/cierre',
    '/dashboard/admin/proyectos/12',
    '/dashboard/mensajes',
    '/dashboard/mensajes/5',
    '/dashboard/calendario',
    '/dashboard/perfil',
  ])('%s usa el shell del coordinador', (ruta) => {
    sesion(['coordinador_academico']);
    ir(ruta);
    expect(screen.getByTestId('shell-coordinador')).toBeInTheDocument();
  });

  it.each([
    '/dashboard/admin',
    '/dashboard/admin/usuarios',
    '/dashboard/admin/asociaciones',
    '/dashboard/admin/apelaciones',
    '/dashboard/admin/cuentas-pendientes',
    '/dashboard/admin/solicitudes-recuperacion',
    '/dashboard/admin/solicitudes-desactivacion',
    '/dashboard/admin/anuncios',
    '/dashboard/admin/seguridad',
    '/dashboard/admin/reportes',
    '/dashboard/admin/mantenimiento',
    '/dashboard/admin/tablas',
    '/dashboard/projects/admin',
  ])('%s sigue en el shell de administración, que lo bloquea', (ruta) => {
    sesion(['coordinador_academico']);
    ir(ruta);
    expect(screen.getByTestId('shell-admin')).toBeInTheDocument();
    expect(screen.queryByTestId('shell-coordinador')).not.toBeInTheDocument();
  });
});

describe('layout raíz con otros roles', () => {
  it('el administrador usa su shell también en las pantallas compartidas', () => {
    sesion(['administrador']);
    ir('/dashboard/admin/horas');
    expect(screen.getByTestId('shell-admin')).toBeInTheDocument();
  });

  it('un estudiante en una pantalla compartida cae al shell de administración, que lo rechaza', () => {
    sesion(['estudiante']);
    ir('/dashboard/projects/admin/reviews');
    expect(screen.getByTestId('shell-admin')).toBeInTheDocument();
  });

  it('el estudiante conserva su shell en mensajes y calendario y no es redirigido', () => {
    sesion(['estudiante']);
    ir('/dashboard/calendario');
    expect(screen.getByTestId('shell-estudiante')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('mientras carga la sesión una pantalla compartida muestra el esqueleto', () => {
    sesionMock.mockReturnValue({ data: undefined, isLoading: true });
    ir('/dashboard/admin/horas');
    expect(screen.getByTestId('shell-carga')).toBeInTheDocument();
  });
});
