import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

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

function httpError(statusCode: number) {
  return Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
}

/** Responde por ruta; un Error en la tabla rechaza la petición. Lo no listado devuelve []. */
function mockApi(tabla: Record<string, unknown>) {
  (apiFetch as any).mockImplementation((path: string) => {
    const valor = path in tabla ? tabla[path] : [];
    return valor instanceof Error ? Promise.reject(valor) : Promise.resolve(valor);
  });
}

const llamadasA = (ruta: string) => (apiFetch as any).mock.calls.filter((c: unknown[]) => c[0] === ruta).length;

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

/**
 * GPI01-C04 (H-03): la página de detalle comparte la consulta de la navegación
 * (`useProjectDetail`). Con un proyecto CERRADO el GET público responde 404 y
 * la lectura sale de la ruta autorizada: el histórico se pinta igual, con una
 * sola petición al GET público y sin exponer nada a quien no puede leerlo.
 */
describe('GPI01-C04 — proyecto CERRADO leído por la ruta autorizada', () => {
  it('participante: 404 público, lectura autorizada y vista histórica', async () => {
    mockApi({ '/proyectos/28': httpError(404), '/proyectos/28/owner': PROYECTO_PUBLICO });
    renderPage();

    expect(await screen.findByRole('status', { name: /vista histórica de solo lectura/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /histórico/i })).toBeInTheDocument();
    expect(screen.queryByText('Proyecto no encontrado')).not.toBeInTheDocument();
    expect(llamadasA('/proyectos/28'), 'una sola petición al GET público').toBe(1);
    expect(llamadasA('/proyectos/28/owner')).toBe(1);
  });

  it('tercero: 403 autorizado y 403 del histórico muestran «no disponible», sin datos del proyecto', async () => {
    mockApi({ '/proyectos/28': httpError(404), '/proyectos/28/owner': httpError(403) });
    (getHistoricalProject as any).mockRejectedValue(httpError(403));
    renderPage();

    expect(await screen.findByText('Este proyecto histórico no está disponible para tu cuenta.')).toBeInTheDocument();
    expect(screen.queryByText(PROYECTO_PUBLICO.tituloProyecto)).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /histórico/i })).not.toBeInTheDocument();
  });

  it('inexistente: 404 en ambas rutas y en el histórico muestra «no encontrado»', async () => {
    mockApi({ '/proyectos/28': httpError(404), '/proyectos/28/owner': httpError(404) });
    (getHistoricalProject as any).mockRejectedValue(httpError(404));
    renderPage();

    expect(await screen.findByText('Proyecto no encontrado')).toBeInTheDocument();
  });

  it('lectura autorizada de un proyecto sin publicar: aquí sigue siendo «no encontrado»', async () => {
    mockApi({ '/proyectos/28': httpError(404), '/proyectos/28/owner': { ...PROYECTO_PUBLICO, estadoProyecto: 'EN_REVISION' } });
    (getHistoricalProject as any).mockRejectedValue(httpError(404));
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 }, isLoading: false });
    renderPage();

    expect(await screen.findByText('Proyecto no encontrado')).toBeInTheDocument();
    await waitFor(() => expect(llamadasA('/proyectos/28/owner')).toBe(1));
    expect(screen.queryByTestId('leader-workspace')).not.toBeInTheDocument();
    expect(screen.queryByText(/postularme/i)).not.toBeInTheDocument();
  });

  it('proyecto público: no se consulta la ruta autorizada', async () => {
    mockApi({ '/proyectos/28': { ...PROYECTO_PUBLICO, estadoProyecto: 'EN_PROGRESO' } });
    renderPage();

    expect(await screen.findAllByText(PROYECTO_PUBLICO.tituloProyecto)).not.toHaveLength(0);
    expect(llamadasA('/proyectos/28')).toBe(1);
    expect(llamadasA('/proyectos/28/owner')).toBe(0);
  });
});
