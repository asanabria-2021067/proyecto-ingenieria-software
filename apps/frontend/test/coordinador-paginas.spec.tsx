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
vi.mock('../lib/services/admin-projects', () => ({ getAdminProjects: vi.fn() }));

import CoordinadorPanelPage from '../app/dashboard/coordinador/page';
import CoordinadorPendientesPage from '../app/dashboard/coordinador/pendientes/page';
import CoordinadorCierresPage from '../app/dashboard/coordinador/cierres/page';
import { getMiAlcance, getPendientesCoordinador } from '../lib/services/coordinador';
import { getAdminProjects } from '../lib/services/admin-projects';
import type { AdminProjectListItem } from '../lib/types/admin-projects';

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

function solicitud(idProyecto: number, tituloProyecto: string, cierre: Partial<NonNullable<AdminProjectListItem['cierre']>>): AdminProjectListItem {
  return {
    idProyecto,
    tituloProyecto,
    tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
    estadoProyecto: 'EN_SOLICITUD_CIERRE',
    lider: { idUsuario: 9, nombre: 'Ana', apellido: 'Lopez' },
    usuariosActivos: 3,
    sprintAmbiente: null,
    accion: 'REVISAR_CIERRE',
    cierre: { situacion: 'PENDIENTE_DE_EVALUACION', origen: null, revisionId: null, numeroRevision: null, enviadaEn: null, correccionSolicitadaEn: null, puedeResolver: false, ...cierre },
  };
}

describe('solicitudes de cierre del coordinador', () => {
  it('muestra la bandeja por etapas del admin: enviadas con su fecha y sin entrega solo para consulta', async () => {
    vi.mocked(getAdminProjects).mockResolvedValue({
      items: [
        solicitud(42, 'Huerto escolar', { situacion: 'PENDIENTE_DE_EVALUACION', revisionId: 5, numeroRevision: 1, enviadaEn: '2026-10-01T18:00:00.000Z', puedeResolver: true }),
        solicitud(43, 'Reciclaje', { situacion: 'REENVIADA_PARA_REVISION', revisionId: 6, numeroRevision: 2, enviadaEn: '2026-10-05T18:00:00.000Z', puedeResolver: true }),
        solicitud(44, 'Proyecto legacy', { situacion: 'SIN_ENTREGA_FORMAL' }),
      ],
      total: 3,
      page: 1,
      limit: 20,
      resumenCierre: { PENDIENTE_DE_EVALUACION: 1, REENVIADA_PARA_REVISION: 1, EN_ESPERA_DE_CORRECCIONES: 0, SIN_ENTREGA_FORMAL: 1, SIN_CLASIFICACION: 0 },
    });
    renderConCliente(<CoordinadorCierresPage />);

    expect(await screen.findByText('Huerto escolar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revisar cierre: Huerto escolar' })).toHaveAttribute('href', '/dashboard/admin/proyectos/42/cierre');
    expect(screen.getByRole('link', { name: 'Revisar cierre: Reciclaje' })).toBeInTheDocument();
    expect(screen.getByText(/Envío #1 · Recibida el 1 oct 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Envío #2 · Recibida el 5 oct 2026/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver proyecto: Proyecto legacy' })).toHaveAttribute('href', '/dashboard/admin/proyectos/44');
    expect(screen.getByRole('group', { name: 'Reenviadas para revisión' })).toHaveTextContent('1');
    expect(screen.getByRole('group', { name: 'Sin entrega formal' })).toHaveTextContent('1');
    expect(getAdminProjects).toHaveBeenCalledWith(expect.objectContaining({ grupo: 'cierres' }));
  });

  it('sin cierres en su alcance muestra el vacío', async () => {
    vi.mocked(getAdminProjects).mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    renderConCliente(<CoordinadorCierresPage />);

    expect(await screen.findByText('No hay solicitudes pendientes de evaluación.')).toBeInTheDocument();
  });
});
