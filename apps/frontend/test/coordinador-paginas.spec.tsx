import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** ROL-2: panel, bandeja de pendientes y cierres del coordinador, con las piezas de la administración. */

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/coordinador',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('../lib/services/coordinador', () => ({
  getMiAlcance: vi.fn(),
  getPendientesCoordinador: vi.fn(),
}));
vi.mock('../lib/services/projects', () => ({ getAdminReviewInbox: vi.fn() }));

import CoordinadorPanelPage from '../app/dashboard/coordinador/page';
import CoordinadorPendientesPage from '../app/dashboard/coordinador/pendientes/page';
import CoordinadorCierresPage from '../app/dashboard/coordinador/cierres/page';
import { getMiAlcance, getPendientesCoordinador } from '../lib/services/coordinador';
import { getAdminReviewInbox } from '../lib/services/projects';

const REGLA = 'Un proyecto es tuyo si su carrera propia, la de su asociación o la de su líder está en tu alcance.';

function renderConCliente(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(getPendientesCoordinador).mockResolvedValue({
    total: 5,
    items: [
      { clave: 'revisiones', total: 3 },
      { clave: 'cierres', total: 2 },
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('panel del coordinador', () => {
  it('muestra su alcance, la regla de alcance y los contadores de pendientes', async () => {
    vi.mocked(getMiAlcance).mockResolvedValue({
      todas: false,
      carreras: [
        { idCarrera: 1, nombreCarrera: 'Ciencias de la Computación', facultad: 'Ingeniería' },
        { idCarrera: 2, nombreCarrera: 'Ingeniería Civil', facultad: null },
      ],
      regla: REGLA,
    });
    renderConCliente(<CoordinadorPanelPage />);

    const lista = await screen.findByRole('list', { name: 'Carreras de tu alcance' });
    expect(within(lista).getByText('Ciencias de la Computación · Ingeniería')).toBeInTheDocument();
    expect(within(lista).getByText('Ingeniería Civil')).toBeInTheDocument();
    expect(screen.getByText(REGLA)).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: 'Solicitudes de publicación' })).toHaveTextContent('3');
    expect(screen.getByRole('group', { name: 'Solicitudes de cierre' })).toHaveTextContent('2');
    expect(screen.getByRole('link', { name: 'Ver la bandeja de pendientes' })).toHaveAttribute(
      'href',
      '/dashboard/coordinador/pendientes',
    );
  });

  it('sin alcance asignado explica por qué las listas están vacías y a quién pedirlo', async () => {
    vi.mocked(getMiAlcance).mockResolvedValue({ todas: false, carreras: [], regla: REGLA });
    renderConCliente(<CoordinadorPanelPage />);

    expect(await screen.findByText('Aún no tienes carreras asignadas')).toBeInTheDocument();
    expect(screen.getByText(/Pide a un administrador/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Carreras de tu alcance' })).not.toBeInTheDocument();
    expect(screen.getByText(REGLA)).toBeInTheDocument();
  });

  it('si el alcance no carga avisa y permite reintentar', async () => {
    vi.mocked(getMiAlcance).mockRejectedValue(new Error('falla'));
    renderConCliente(<CoordinadorPanelPage />);

    expect(await screen.findByText('No pudimos cargar tu alcance')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('bandeja de pendientes del coordinador', () => {
  it('lista revisiones y cierres con su contador y enlaces a las bandejas que puede abrir', async () => {
    renderConCliente(<CoordinadorPendientesPage />);

    const filaRevisiones = (await screen.findByText('Solicitudes de publicación')).closest('li') as HTMLElement;
    expect(within(filaRevisiones).getByRole('link')).toHaveAttribute('href', '/dashboard/projects/admin/reviews');
    expect(filaRevisiones).toHaveTextContent('3');
    const filaCierres = screen.getByText('Solicitudes de cierre').closest('li') as HTMLElement;
    expect(within(filaCierres).getByRole('link')).toHaveAttribute('href', '/dashboard/coordinador/cierres');
    expect(filaCierres).toHaveTextContent('2');
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs.some((h) => h?.startsWith('/dashboard/admin/') && h !== '/dashboard/admin/horas')).toBe(false);
  });

  it('sin pendientes dice que todo está al día y recuerda revisar el alcance', async () => {
    vi.mocked(getPendientesCoordinador).mockResolvedValue({ total: 0, items: [] });
    renderConCliente(<CoordinadorPendientesPage />);

    expect(await screen.findByText('Todo al día')).toBeInTheDocument();
    expect(screen.getByText(/tengas carreras asignadas/)).toBeInTheDocument();
  });
});

describe('solicitudes de cierre del coordinador', () => {
  it('cada cierre abre la misma revisión de cierre de la administración', async () => {
    vi.mocked(getAdminReviewInbox).mockResolvedValue({
      revisionesPendientes: [],
      correccionesEnviadas: [],
      cierresPendientes: [{ idProyecto: 42, tituloProyecto: 'Huerto escolar', creadoPor: 9, fechaActualizacion: null }],
    });
    renderConCliente(<CoordinadorCierresPage />);

    expect(await screen.findByText('Huerto escolar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revisar cierre: Huerto escolar' })).toHaveAttribute(
      'href',
      '/dashboard/admin/proyectos/42/cierre',
    );
  });

  it('sin cierres en su alcance muestra el vacío', async () => {
    vi.mocked(getAdminReviewInbox).mockResolvedValue({ revisionesPendientes: [], correccionesEnviadas: [], cierresPendientes: [] });
    renderConCliente(<CoordinadorCierresPage />);

    expect(await screen.findByText('No hay solicitudes de cierre en tu alcance')).toBeInTheDocument();
  });
});
