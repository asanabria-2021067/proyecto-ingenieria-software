import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '28' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../lib/api/client', () => ({ apiFetch: vi.fn() }));
vi.mock('../lib/services/historical', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/services/historical')>();
  return { ...actual, getHistoricalProject: vi.fn(), getDeletedContributions: vi.fn() };
});
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../hooks/use-project-members', () => ({ useProjectMembers: vi.fn() }));
vi.mock('../hooks/use-exit-request', () => ({
  useCurrentExitRequest: () => ({ request: null }),
  useCreateExitRequest: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null, reset: vi.fn() }),
}));
vi.mock('../hooks/use-project-roles', () => ({
  useProjectRoles: () => ({ roles: [], salirDeRol: { mutate: vi.fn(), isPending: false, variables: undefined } }),
}));
vi.mock('../app/dashboard/projects/[id]/project-detail-client', () => ({
  default: () => createElement('div', { 'data-testid': 'leader-workspace' }, 'WORKSPACE'),
}));
vi.mock('../components/closure/closure-document-viewer', () => ({
  ClosureDocumentViewer: (props: { open: boolean; documentId: number; nombre: string }) =>
    props.open ? createElement('div', { 'data-testid': 'viewer', 'data-document': props.documentId }, props.nombre) : null,
  formatearTamano: (b: number | null) => (b == null ? null : `${(b / 1_048_576).toFixed(1)} MB`),
}));
vi.mock('../lib/swal', () => ({ default: { fire: vi.fn() } }));

import ProyectoDetallePage from '../app/dashboard/proyectos/[id]/page';
import { apiFetch } from '../lib/api/client';
import { getHistoricalProject, type HistoricalProjectView } from '../lib/services/historical';
import { useCurrentUser } from '../hooks/use-current-user';
import { useProjectMembers } from '../hooks/use-project-members';

const PROYECTO_PUBLICO = {
  idProyecto: 28,
  tituloProyecto: 'Sistema de Tutorías Académicas UVG',
  descripcionProyecto: 'Plataforma web para organizar tutorías.',
  objetivosProyecto: 'Conectar tutores',
  tipoProyecto: 'EXPERIENCIA',
  estadoProyecto: 'CERRADO',
  modalidadProyecto: 'PRESENCIAL',
  creador: { idUsuario: 1, nombre: 'V', apellido: 'H', correo: 'vernel@uvg.edu.gt' },
  organizaciones: [],
  intereses: [],
  roles: [{ idRolProyecto: 5, nombreRol: 'Desarrollador', descripcionRolProyecto: 'x', cupos: 1, requisitos: [] }],
};

function historico(overrides: Partial<HistoricalProjectView> = {}): HistoricalProjectView {
  return {
    projectId: 28,
    resumen: {
      idProyecto: 28,
      tituloProyecto: 'Sistema de Tutorías Académicas UVG',
      descripcionProyecto: 'Plataforma web para organizar tutorías.',
      tipoProyecto: 'EXPERIENCIA',
      estadoProyecto: 'CERRADO',
      fechaInicio: '2026-06-11T00:00:00.000Z',
      fechaFinEstimada: '2026-12-31T00:00:00.000Z',
    },
    liderazgo: { liderActual: { idUsuario: 1, nombre: 'V', apellido: 'H' }, historial: [] },
    miembrosHistoricos: [
      { idParticipacion: 1, usuario: { idUsuario: 1, nombre: 'V', apellido: 'H' }, rol: { idRolProyecto: 1, nombreRol: 'Líder del proyecto' }, estadoParticipacion: 'COMPLETADO', fechaIngreso: '2026-06-11T00:00:00.000Z', fechaSalida: null },
      { idParticipacion: 2, usuario: { idUsuario: 2, nombre: 'María', apellido: 'Morales' }, rol: { idRolProyecto: 2, nombreRol: 'Desarrollador UI/UX' }, estadoParticipacion: 'COMPLETADO', fechaIngreso: '2026-06-12T00:00:00.000Z', fechaSalida: null },
    ],
    sprintsCerrados: [{ idSprint: 9, numero: 1, fechaInicio: '2026-06-11T00:00:00.000Z', fechaCierre: '2026-07-25T00:00:00.000Z' }],
    contribucionesEliminadas: [],
    totales: {
      reportadasGranulares: '212.00',
      legacy: '0.00',
      propuestasPendientes: '0.00',
      acreditadas: '212.00',
      tareasDistintas: 48,
      porUsuario: [{ idUsuario: 2, nombre: 'María', apellido: 'Morales', reportadasGranulares: '100.00', legacy: '0.00', propuestasPendientes: '0.00', acreditadas: '106.00', tareasDistintas: 20 }],
    },
    revisiones: [
      {
        idRevisionCierre: 5,
        numeroRevision: 1,
        estadoRevision: 'APROBADA',
        enviadaEn: '2026-07-20T00:00:00.000Z',
        resueltaEn: '2026-07-30T18:00:00.000Z',
        comentarioRevisor: 'El proyecto cumple con todos los objetivos.',
        fingerprintEntrega: 'a'.repeat(64),
        documentosEnviados: [],
      },
    ],
    informeOficial: {
      idDocumentoCierre: 777,
      tipoDocumento: 'INFORME_OFICIAL_FINAL',
      nombreArchivo: 'Informe_Final.pdf',
      tamanoBytes: 2_516_582,
      checksumSha256: 'b'.repeat(64),
      estadoDocumento: 'DISPONIBLE',
    },
    permisos: { puedeEditar: false, puedeEnviar: false, puedeResolver: false, puedeSubirDocumentos: false },
    lector: { perfil: 'MIEMBRO', soloPropio: false },
    ...overrides,
  };
}

function mockApi(handler: (path: string) => unknown) {
  (apiFetch as any).mockImplementation((path: string) => Promise.resolve(handler(path)));
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(createElement(ProyectoDetallePage), { wrapper });
}

beforeEach(() => {
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 2 }, isLoading: false });
  (useProjectMembers as any).mockReturnValue({ members: [{ idUsuario: 2, idRolProyecto: 2 }], isLoading: false });
  (getHistoricalProject as any).mockResolvedValue(historico());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VIEW-02 — proyecto CERRADO / histórico (F007)', () => {
  it('CERRADO renderiza el banner de solo lectura y el tab Histórico con sus secciones', async () => {
    mockApi((path) => (path === '/proyectos/28' ? PROYECTO_PUBLICO : []));
    renderPage();

    expect(await screen.findByRole('status', { name: /vista histórica de solo lectura/i })).toBeInTheDocument();
    expect(screen.getByText(/Proyecto cerrado el 30 de julio de 2026/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /histórico/i })).toBeInTheDocument();
    expect(screen.getByText('Miembros históricos (2)')).toBeInTheDocument();
    expect(screen.getByText('Sprints cerrados (1)')).toBeInTheDocument();
    expect(screen.getByText('Revisiones de cierre (1)')).toBeInTheDocument();
    expect(screen.getByText('El proyecto cumple con todos los objetivos.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Total de horas' })).toHaveTextContent('212');
    expect(screen.getByRole('group', { name: 'Promedio por miembro' })).toHaveTextContent('106');
    expect(getHistoricalProject).toHaveBeenCalledWith(28);
  });

  it('ninguna acción de escritura en el DOM', async () => {
    mockApi((path) => (path === '/proyectos/28' ? PROYECTO_PUBLICO : []));
    renderPage();

    await screen.findByRole('tab', { name: /histórico/i });
    expect(screen.queryByText(/postularme/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/salir de este rol/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/solicitud de salida/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('leader-workspace')).not.toBeInTheDocument();
  });

  it('«Ver informe oficial» abre ClosureDocumentViewer con el idDocumentoOficial de la revisión aprobada', async () => {
    mockApi((path) => (path === '/proyectos/28' ? PROYECTO_PUBLICO : []));
    renderPage();

    const botones = await screen.findAllByRole('button', { name: 'Ver informe oficial' });
    expect(botones).toHaveLength(2);
    fireEvent.click(botones[0]);
    expect(screen.getByTestId('viewer')).toHaveAttribute('data-document', '777');
    expect(document.body.innerHTML).not.toContain('cloudinary');
  });

  it('cuando el GET público rechaza (403) pero el histórico responde, se muestra el histórico', async () => {
    (apiFetch as any).mockImplementation((path: string) =>
      path === '/proyectos/28'
        ? Promise.reject(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
        : Promise.resolve([]),
    );
    renderPage();

    expect(await screen.findByRole('tab', { name: /histórico/i })).toBeInTheDocument();
  });

  it('403 del histórico muestra un estado de acceso, no un histórico vacío', async () => {
    (apiFetch as any).mockImplementation((path: string) =>
      path === '/proyectos/28'
        ? Promise.reject(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
        : Promise.resolve([]),
    );
    (getHistoricalProject as any).mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }));
    renderPage();

    expect(await screen.findByText('Este proyecto histórico no está disponible para tu cuenta.')).toBeInTheDocument();
    expect(screen.queryByText(/Miembros históricos/)).not.toBeInTheDocument();
  });

  it('un proyecto no cerrado NO monta la query de histórico', async () => {
    mockApi((path) => (path === '/proyectos/28' ? { ...PROYECTO_PUBLICO, estadoProyecto: 'EN_PROGRESO' } : []));
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999 }, isLoading: false });
    (useProjectMembers as any).mockReturnValue({ members: [], isLoading: false });
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sistema de Tutorías'));
    await new Promise((r) => setTimeout(r, 20));
    expect(getHistoricalProject).not.toHaveBeenCalled();
    expect(screen.queryByRole('tab', { name: /histórico/i })).not.toBeInTheDocument();
  });
});
