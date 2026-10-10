import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';

const replaceMock = vi.hoisted(() => vi.fn());
const pathnameMock = vi.hoisted(() => vi.fn(() => '/dashboard'));
const toastErrorMock = vi.hoisted(() => vi.fn());
const apiFetchMock = vi.hoisted(() => vi.fn());
const currentUserMock = vi.hoisted(() =>
  vi.fn(() => ({
    data: undefined as { idUsuario: number; roles?: string[] } | undefined,
    isLoading: false,
    isError: false,
  })),
);

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
  useParams: () => ({ id: '12' }),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));
vi.mock('next/image', () => ({ default: (props: { alt: string }) => createElement('img', { alt: props.alt }) }));
vi.mock('@/public/logo.png', () => ({ default: 'logo.png' }));
vi.mock('sonner', () => ({ toast: { error: toastErrorMock } }));
vi.mock('@/lib/api/client', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));
vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: () => currentUserMock(),
  isAdminUser: (u?: { roles?: string[] } | null) => (u?.roles ?? []).some((r) => r.toLowerCase() === 'administrador'),
}));
vi.mock('../hooks/use-logout', () => ({ useLogout: () => vi.fn() }));
vi.mock('../components/layout/notifications-bell', () => ({ NotificationsBell: () => null }));
vi.mock('../components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('../components/dashboard/UserMenu', () => ({ UserMenu: () => null }));
vi.mock('../components/dashboard/DashboardLayout', () => ({
  default: (props: { children: React.ReactNode }) => createElement('div', { 'data-testid': 'shell-estudiante' }, props.children),
}));

import { MENSAJE_SIN_PERMISO, useCan, useRequireCan } from '../hooks/use-can';
import {
  MATRIZ_PERMISOS,
  PERFILES_PERMISO,
  puede,
  resolverPerfil,
  type AccionPermiso,
  type PerfilPermiso,
} from '../lib/permissions/matriz-permisos';
import AdminLayout from '../components/admin/AdminLayout';
import DashboardRootLayout from '../app/dashboard/layout';
import PostulacionesProyectoPage from '../app/dashboard/proyectos/[id]/postulaciones/page';

const ACCIONES = Object.keys(MATRIZ_PERMISOS) as AccionPermiso[];

const ACCIONES_ADMINISTRACION: AccionPermiso[] = [
  'admin.panel',
  'admin.usuarios',
  'admin.solicitudesRecuperacion',
  'admin.apelaciones',
  'admin.proyectos',
  'admin.cierre',
  'admin.revisiones',
];

const ACCIONES_LIDER: AccionPermiso[] = [
  'proyecto.postulaciones.resolver',
  'proyecto.miembros.gestionar',
  'proyecto.miembro.detalle',
  'proyecto.liderazgo',
  'proyecto.reportes',
  'proyecto.sprints.gestionar',
  'proyecto.sprints.finalizar',
  'proyecto.editar',
  'proyecto.vistaDueno',
  'proyecto.cierre.preparar',
];

const ACCIONES_COMPARTIDAS: AccionPermiso[] = [
  'perfil.ver',
  'notificaciones.ver',
  'proyectos.explorar',
  'proyecto.detalle',
  'proyecto.workspace',
];

const ACCIONES_PARTICIPANTE: AccionPermiso[] = [
  'dashboard.inicio',
  'perfil.editar',
  'personal.vistas',
  'personas.ver',
  'proyecto.bitacora',
  'proyecto.sprints.ver',
  'proyecto.sprints.analitica',
  'proyectos.mios',
  'proyecto.crear',
  'proyecto.tablero',
  'proyectos.listadosLegacy',
];

const ACCIONES_NO_LIDER: AccionPermiso[] = ['proyecto.postular', 'proyecto.salida.preparar'];

const ESPERADO: Record<PerfilPermiso, AccionPermiso[]> = {
  estudiante: [...ACCIONES_COMPARTIDAS, ...ACCIONES_PARTICIPANTE, ...ACCIONES_NO_LIDER],
  mentor: [...ACCIONES_COMPARTIDAS, ...ACCIONES_PARTICIPANTE, ...ACCIONES_NO_LIDER],
  coordinador: [...ACCIONES_COMPARTIDAS, ...ACCIONES_PARTICIPANTE, ...ACCIONES_NO_LIDER],
  lider: [...ACCIONES_COMPARTIDAS, ...ACCIONES_PARTICIPANTE, ...ACCIONES_LIDER],
  administracion: [...ACCIONES_COMPARTIDAS, ...ACCIONES_ADMINISTRACION],
};

const USUARIOS: Record<PerfilPermiso, { roles: string[]; esLider: boolean }> = {
  estudiante: { roles: ['estudiante'], esLider: false },
  lider: { roles: ['estudiante'], esLider: true },
  mentor: { roles: ['mentor'], esLider: false },
  coordinador: { roles: ['coordinador_academico'], esLider: false },
  administracion: { roles: ['administrador'], esLider: false },
};

function usarUsuario(roles: string[] | undefined, extra: Partial<{ isLoading: boolean; isError: boolean }> = {}) {
  currentUserMock.mockReturnValue({
    data: roles ? { idUsuario: 5, roles } : undefined,
    isLoading: false,
    isError: false,
    ...extra,
  });
}

function withClient(child: ReturnType<typeof createElement>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, child));
}

beforeEach(() => {
  pathnameMock.mockReturnValue('/dashboard');
  usarUsuario(['estudiante']);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('matriz de permisos', () => {
  it('las acciones esperadas cubren toda la matriz', () => {
    const cubiertas = new Set([
      ...ACCIONES_ADMINISTRACION,
      ...ACCIONES_LIDER,
      ...ACCIONES_COMPARTIDAS,
      ...ACCIONES_PARTICIPANTE,
      ...ACCIONES_NO_LIDER,
    ]);
    expect([...cubiertas].sort()).toEqual([...ACCIONES].sort());
  });

  it('resuelve el perfil a partir de los roles de acceso y del liderazgo del proyecto', () => {
    expect(resolverPerfil(['estudiante'])).toBe('estudiante');
    expect(resolverPerfil([])).toBe('estudiante');
    expect(resolverPerfil(undefined)).toBe('estudiante');
    expect(resolverPerfil(['lider_asociacion'])).toBe('estudiante');
    expect(resolverPerfil(['estudiante'], true)).toBe('lider');
    expect(resolverPerfil(['mentor'])).toBe('mentor');
    expect(resolverPerfil(['coordinador_academico'])).toBe('coordinador');
    expect(resolverPerfil(['Administrador'])).toBe('administracion');
    expect(resolverPerfil(['administrador'], true)).toBe('administracion');
  });

  it.each(PERFILES_PERMISO)('el perfil %s tiene exactamente los permisos de la tabla', (perfil) => {
    const { roles, esLider } = USUARIOS[perfil];
    const permitidas = ACCIONES.filter((accion) => puede(accion, roles, esLider));
    expect(permitidas.sort()).toEqual([...ESPERADO[perfil]].sort());
  });
});

describe('useCan', () => {
  it.each(PERFILES_PERMISO)('para %s responde según la tabla en cada acción', (perfil) => {
    const { roles, esLider } = USUARIOS[perfil];
    usarUsuario(roles);

    ACCIONES.forEach((accion) => {
      const { result } = renderHook(() => useCan(accion, { esLider }));
      expect({ accion, puede: result.current }).toEqual({ accion, puede: ESPERADO[perfil].includes(accion) });
    });
  });

  it('un estudiante no puede ninguna acción de líder ni de administración', () => {
    usarUsuario(['estudiante']);

    [...ACCIONES_LIDER, ...ACCIONES_ADMINISTRACION].forEach((accion) => {
      const { result } = renderHook(() => useCan(accion));
      expect({ accion, puede: result.current }).toEqual({ accion, puede: false });
    });
  });

  it('mentor y coordinador tienen los mismos permisos que un estudiante', () => {
    ACCIONES.forEach((accion) => {
      expect(puede(accion, ['mentor'])).toBe(puede(accion, ['estudiante']));
      expect(puede(accion, ['coordinador_academico'])).toBe(puede(accion, ['estudiante']));
    });
  });

  it('un usuario registrado sin rol de acceso se trata como estudiante', () => {
    usarUsuario([]);

    expect(renderHook(() => useCan('proyecto.crear')).result.current).toBe(true);
    expect(renderHook(() => useCan('admin.usuarios')).result.current).toBe(false);
  });

  it('el líder solo lo es dentro de su proyecto', () => {
    usarUsuario(['estudiante']);

    expect(renderHook(() => useCan('proyecto.editar', { esLider: true })).result.current).toBe(true);
    expect(renderHook(() => useCan('proyecto.editar')).result.current).toBe(false);
    expect(renderHook(() => useCan('proyecto.postular', { esLider: true })).result.current).toBe(false);
  });

  it('sin usuario cargado no concede ninguna acción', () => {
    usarUsuario(undefined, { isLoading: true });

    ACCIONES.forEach((accion) => {
      expect(renderHook(() => useCan(accion, { esLider: true })).result.current).toBe(false);
    });
  });
});

describe('useRequireCan', () => {
  it('redirige a /dashboard y avisa cuando el usuario no tiene permiso', async () => {
    usarUsuario(['estudiante']);
    const { result } = renderHook(() => useRequireCan('admin.usuarios'));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
    expect(toastErrorMock).toHaveBeenCalledWith(MENSAJE_SIN_PERMISO, expect.anything());
    expect(result.current.denegado).toBe(true);
  });

  it('no redirige cuando tiene permiso', () => {
    usarUsuario(['administrador']);
    const { result } = renderHook(() => useRequireCan('admin.usuarios'));

    expect(result.current).toEqual({ permitido: true, denegado: false, verificando: false });
    expect(replaceMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('no decide mientras carga el usuario o el dato del que depende el permiso', () => {
    usarUsuario(undefined, { isLoading: true });
    expect(renderHook(() => useRequireCan('admin.usuarios')).result.current.verificando).toBe(true);

    usarUsuario(['estudiante']);
    expect(renderHook(() => useRequireCan('proyecto.editar', { listo: false })).result.current.verificando).toBe(true);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('inactivo no redirige', () => {
    usarUsuario(['estudiante']);
    renderHook(() => useRequireCan('admin.usuarios', { activo: false }));

    expect(replaceMock).not.toHaveBeenCalled();
  });
});

describe('redirección por URL directa', () => {
  it('un estudiante que abre una ruta de administración vuelve a /dashboard con un mensaje', async () => {
    usarUsuario(['estudiante']);
    pathnameMock.mockReturnValue('/dashboard/admin/usuarios');
    render(createElement(AdminLayout, null, createElement('div', null, 'contenido admin')));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
    expect(toastErrorMock).toHaveBeenCalledWith(MENSAJE_SIN_PERMISO, expect.anything());
    expect(screen.queryByText('contenido admin')).not.toBeInTheDocument();
  });

  it('un administrador entra a su panel sin mensaje ni redirección', () => {
    usarUsuario(['administrador']);
    pathnameMock.mockReturnValue('/dashboard/admin/usuarios');
    render(createElement(AdminLayout, null, createElement('div', null, 'contenido admin')));

    expect(screen.getByText('contenido admin')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('un no líder que abre las postulaciones de un proyecto ajeno vuelve a /dashboard con un mensaje', async () => {
    usarUsuario(['estudiante']);
    apiFetchMock.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }));
    withClient(createElement(PostulacionesProyectoPage));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
    expect(toastErrorMock).toHaveBeenCalledWith(MENSAJE_SIN_PERMISO, expect.anything());
    expect(screen.queryByText('Postulaciones recibidas')).not.toBeInTheDocument();
  });

  it('el líder ve las postulaciones de su proyecto sin redirección', async () => {
    usarUsuario(['estudiante']);
    apiFetchMock.mockResolvedValue([]);
    withClient(createElement(PostulacionesProyectoPage));

    expect(await screen.findByText('Aún no hay postulaciones para este proyecto.')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('un error distinto de 403 en postulaciones no redirige', async () => {
    usarUsuario(['estudiante']);
    apiFetchMock.mockRejectedValue(Object.assign(new Error('fallo'), { statusCode: 500 }));
    withClient(createElement(PostulacionesProyectoPage));

    expect(await screen.findByText(/No se pudieron cargar las postulaciones/)).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('administración no entra a los listados legacy sin shell', async () => {
    usarUsuario(['administrador']);
    pathnameMock.mockReturnValue('/dashboard/mis-proyectos');
    render(createElement(DashboardRootLayout, null, createElement('div', null, 'listado legacy')));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
    expect(toastErrorMock).toHaveBeenCalledWith(MENSAJE_SIN_PERMISO, expect.anything());
    expect(screen.queryByText('listado legacy')).not.toBeInTheDocument();
  });

  it('un estudiante sí entra a los listados legacy', () => {
    usarUsuario(['estudiante']);
    pathnameMock.mockReturnValue('/dashboard/projects');
    render(createElement(DashboardRootLayout, null, createElement('div', null, 'listado legacy')));

    expect(screen.getByText('listado legacy')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
