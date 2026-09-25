import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Swal from 'sweetalert2';
import uvgSwal, { escapeHtml } from '../lib/swal';
import {
  XSS_COMBINADO,
  XSS_IMG,
  expectSinHtmlInyectado,
  instalarCentinelaXss,
} from './xss-payloads';

// T-277: a diferencia de JSX, SweetAlert2 inserta `title`, `html` y `footer`
// como HTML. Este spec usa SweetAlert2 REAL (sin mock de ../lib/swal) para
// demostrar el sink y verificar cada llamada que interpolaba texto de usuario.

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
// SweetAlert2 restaura el scroll al cerrar; jsdom no lo implementa.
window.scrollTo = () => {};
// SweetAlert2 consulta prefers-color-scheme al pintar el ícono.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../lib/api/client', () => ({ apiFetch: vi.fn().mockResolvedValue([]) }));
vi.mock('../lib/services/projects', () => ({
  getMyProjects: vi.fn(),
  getContributorProjects: vi.fn().mockResolvedValue([]),
  deleteProject: vi.fn(),
}));

// DashboardLayout: solo interesa el efecto que muestra el toast de la
// notificación en tiempo real; el resto del shell se stubea.
vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 1 }, isLoading: false, isError: false }),
  isAdminUser: () => false,
}));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('../hooks/use-logout', () => ({ useLogout: () => vi.fn() }));
vi.mock('../lib/hooks/useRealtimeNotifications', () => ({ useRealtimeNotifications: vi.fn() }));
vi.mock('../components/layout/notifications-bell', () => ({ NotificationsBell: () => null }));
vi.mock('../components/dashboard/UserMenu', () => ({ UserMenu: () => null }));
vi.mock('../components/dashboard/OnboardingTour', () => ({ default: () => null }));
vi.mock('../components/projects/project-finalization-banner-host', () => ({
  ProjectFinalizationBannerHost: () => null,
}));
vi.mock('../components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('../components/font-scale-toggle', () => ({ FontScaleToggle: () => null }));

import { ProjectRoleManagementSection } from '../components/projects/detail/project-role-management-section';
import MyProjectsPage from '../app/dashboard/projects/mine/page';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { getMyProjects } from '../lib/services/projects';
import { useRealtimeNotifications } from '../lib/hooks/useRealtimeNotifications';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function mutationStub() {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, variables: undefined } as any;
}

function popup() {
  return document.querySelector('.swal2-popup') as HTMLElement | null;
}

let centinela: ReturnType<typeof instalarCentinelaXss>;

beforeEach(() => {
  centinela = instalarCentinelaXss();
});

afterEach(() => {
  Swal.close();
  document.querySelectorAll('.swal2-container').forEach((el) => el.remove());
  cleanup();
  vi.clearAllMocks();
});

describe('escapeHtml', () => {
  it('escapa los cinco caracteres significativos de HTML', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });

  it('deja intacto el texto sin caracteres especiales', () => {
    expect(escapeHtml('Proyecto de tutorías UVG')).toBe('Proyecto de tutorías UVG');
  });
});

describe('SweetAlert2 como sink de HTML (control)', () => {
  // Demuestra que el riesgo es real y que expectSinHtmlInyectado lo detecta:
  // si esta prueba dejara de fallar la detección, las demás no probarían nada.
  it('`title` interpreta HTML: crea el <img onerror> de la carga', async () => {
    void uvgSwal.fire({ title: XSS_IMG });
    await waitFor(() => expect(popup()).not.toBeNull());
    expect(popup()!.querySelector('img[onerror]')).not.toBeNull();
  });

  it('`html` con escapeHtml conserva el formato propio y muestra la carga como texto', async () => {
    void uvgSwal.fire({ html: `<strong>${escapeHtml(XSS_COMBINADO)}</strong>` });
    await waitFor(() => expect(popup()).not.toBeNull());
    const strong = popup()!.querySelector('.swal2-html-container strong')!;
    expect(strong.textContent).toBe(XSS_COMBINADO);
    expect(strong.childElementCount).toBe(0);
    expectSinHtmlInyectado(document.body);
  });
});

describe('Salir del rol — nombre de rol escrito por el líder (T-277)', () => {
  it('la confirmación muestra el nombre del rol como texto, sin crear elementos', async () => {
    render(
      createElement(ProjectRoleManagementSection, {
        isLeader: false,
        proyecto: {
          idProyecto: 42,
          roles: [{ idRolProyecto: 5, nombreRol: XSS_COMBINADO, cupos: 1, requisitos: [] }],
        } as any,
        rolesAdmin: [{ idRolProyecto: 5, isMine: true, canLeave: true } as any],
        asignarmeRol: mutationStub(),
        salirDeRol: mutationStub(),
        crearRol: mutationStub(),
        editarRol: mutationStub(),
        eliminarRol: mutationStub(),
        abrirCrearRol: vi.fn(),
        abrirEditarRol: vi.fn(),
        rolesSheetAbierto: false,
        setRolesSheetAbierto: vi.fn(),
        rolesSheetIntent: { mode: 'CREATE' } as any,
      }),
      { wrapper },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Salir de este rol' }));
    await waitFor(() => expect(popup()).not.toBeNull());

    const titulo = popup()!.querySelector('.swal2-title') as HTMLElement;
    // titleText asigna innerText (jsdom no lo refleja en textContent).
    expect(titulo.innerText).toBe(`¿Salir del rol "${XSS_COMBINADO}"?`);
    expect(titulo.childElementCount).toBe(0);
    expectSinHtmlInyectado(document.body);
    expect(centinela).not.toHaveBeenCalled();
  });
});

describe('Eliminar proyecto — título del proyecto (T-277)', () => {
  it('el diálogo conserva el <strong> y muestra el título como texto', async () => {
    (getMyProjects as any).mockResolvedValue([
      {
        idProyecto: 7,
        tituloProyecto: XSS_COMBINADO,
        tipoProyecto: 'ACADEMICO_HORAS_BECA',
        estadoProyecto: 'BORRADOR',
        modalidadProyecto: 'VIRTUAL',
        descripcionProyecto: 'Borrador',
        fechaCreacion: '2026-01-01T12:00:00.000Z',
        fechaActualizacion: '2026-08-01T12:00:00.000Z',
        revisiones: [],
        avanceProyecto: null,
      },
    ]);
    render(createElement(MyProjectsPage), { wrapper });

    fireEvent.click(await screen.findByRole('button', { name: `Eliminar proyecto ${XSS_COMBINADO}` }));
    await waitFor(() => expect(popup()).not.toBeNull());

    const strong = popup()!.querySelector('.swal2-html-container strong')!;
    expect(strong.textContent).toBe(XSS_COMBINADO);
    expect(strong.childElementCount).toBe(0);
    expectSinHtmlInyectado(document.body);
    expect(centinela).not.toHaveBeenCalled();
  });
});

describe('Toast de notificación en tiempo real (T-277)', () => {
  it('título y mensaje de la notificación se muestran como texto', async () => {
    (useRealtimeNotifications as any).mockReturnValue({
      isConnected: true,
      latestNotification: {
        idNotificacion: 1,
        tipoNotificacion: 'TAREA_ASIGNADA',
        tituloNotificacion: XSS_COMBINADO,
        mensajeNotificacion: XSS_COMBINADO,
        datosJson: null,
      },
    });
    render(createElement(DashboardLayout, null, 'contenido'), { wrapper });

    await waitFor(() => expect(popup()).not.toBeNull());
    const titulo = popup()!.querySelector('.swal2-title') as HTMLElement;
    expect(titulo.innerText).toBe(XSS_COMBINADO);
    expect(titulo.childElementCount).toBe(0);
    expectSinHtmlInyectado(document.body);
    expect(centinela).not.toHaveBeenCalled();
  });
});
