import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ProyectoDetalleDTO, RevisionProyectoDTO, RolProyectoDTO } from '../lib/dto/project.dto';

/**
 * Cobertura de regresión dedicada a `my-project-view-client.tsx` (T21):
 * demuestra, con los consumidores reales (ProjectGeneralInfoSection /
 * ProjectRolesSkillsSection, sin mockear), que la vista actual y el panel
 * histórico con/sin snapshot permanecen aislados en ambas direcciones.
 */

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

vi.mock('../lib/services/catalogs', () => ({
  getCarreras: vi.fn().mockResolvedValue([]),
  getHabilidades: vi.fn().mockResolvedValue([]),
}));
vi.mock('../lib/swal', () => ({ default: { fire: vi.fn().mockResolvedValue(undefined) } }));

const getMyProjectByIdMock = vi.fn();
const getProjectRevisionsMock = vi.fn();
vi.mock('../lib/services/projects', () => ({
  getMyProjectById: (...a: unknown[]) => getMyProjectByIdMock(...a),
  getProjectRevisions: (...a: unknown[]) => getProjectRevisionsMock(...a),
  updateProject: vi.fn(),
  resubmitProject: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import MyProjectViewClient from '../app/dashboard/projects/mine/[id]/my-project-view-client';

// ─── Fixtures: CURRENT vs SNAPSHOT deliberadamente incompatibles ──────────────

function rolActual(overrides: Partial<RolProyectoDTO> = {}): RolProyectoDTO {
  return {
    idRolProyecto: 1,
    idProyecto: 77,
    nombreRol: 'Rol CURRENT',
    descripcionRolProyecto: 'Descripción de rol CURRENT',
    idCarreraRequerida: 3,
    cupos: 2,
    horasSemanalesEstimadas: 10,
    carreraRequerida: { idCarrera: 3, nombreCarrera: 'Carrera CURRENT', facultad: 'Facultad CURRENT' },
    requisitos: [
      {
        idRequisitoHabilidad: 1,
        idRolProyecto: 1,
        idHabilidad: 1,
        nivelMinimo: 'BASICO',
        obligatorio: true,
        habilidad: { idHabilidad: 1, nombreHabilidad: 'React CURRENT', categoriaHabilidad: null },
      },
    ],
    ...overrides,
  };
}

function proyectoActual(overrides: Partial<ProyectoDetalleDTO> = {}): ProyectoDetalleDTO {
  return {
    idProyecto: 77,
    tituloProyecto: 'Proyecto CURRENT',
    descripcionProyecto: 'Descripción CURRENT',
    objetivosProyecto: 'Objetivo CURRENT',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: 'PUBLICADO',
    modalidadProyecto: 'MIXTA',
    ubicacionProyecto: 'Campus CURRENT',
    contextoAcademico: 'Contexto CURRENT',
    urlRecursoExterno: null,
    fechaPublicacion: null,
    fechaInicio: '2026-02-01',
    fechaFinEstimada: '2026-06-01',
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    roles: [rolActual()],
    hitos: [],
    ...overrides,
  };
}

function snapshotRevision(overrides: Partial<RevisionProyectoDTO> = {}): RevisionProyectoDTO {
  return {
    idRevisionProyecto: 5,
    estadoRevision: 'APROBADA',
    comentarioRevision: null,
    snapshotProyecto: {
      tituloProyecto: 'Proyecto SNAPSHOT',
      descripcionProyecto: 'Descripción SNAPSHOT',
      objetivosProyecto: 'Objetivo SNAPSHOT',
      tipoProyecto: 'ACADEMICO_EXPERIENCIA',
      modalidadProyecto: 'PRESENCIAL',
      ubicacionProyecto: 'Campus SNAPSHOT',
      contextoAcademico: 'Contexto SNAPSHOT',
      urlRecursoExterno: null,
      fechaInicio: '2025-01-01',
      fechaFinEstimada: '2025-06-01',
      roles: [
        {
          idRolProyecto: 9,
          nombreRol: 'Rol SNAPSHOT',
          descripcionRolProyecto: 'Descripción de rol SNAPSHOT',
          cupos: 5,
          horasSemanalesEstimadas: 20,
          carreraRequerida: { idCarrera: 8, nombreCarrera: 'Carrera SNAPSHOT', facultad: 'Facultad SNAPSHOT' },
          requisitos: [
            {
              idRequisitoHabilidad: 9,
              nivelMinimo: 'AVANZADO',
              obligatorio: false,
              habilidad: { idHabilidad: 9, nombreHabilidad: 'Vue SNAPSHOT', categoriaHabilidad: null },
            },
          ],
        },
      ],
    },
    numeroEnvio: 1,
    enviadaEn: '2025-01-01T00:00:00.000Z',
    revisadaEn: '2025-01-05T00:00:00.000Z',
    revisor: null,
    ...overrides,
  };
}

function renderPage(id = 77) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(MyProjectViewClient, { id })));
}

/** Localiza el panel histórico mediante su frontera real de producto (overlay full-screen). */
function getHistoryPanel(container: HTMLElement): HTMLElement {
  const panel = container.querySelector('.fixed.inset-0');
  if (!panel) throw new Error('Panel histórico no encontrado');
  return panel as HTMLElement;
}

describe('MyProjectViewClient — vista actual vs panel histórico', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('vista actual: renderiza Información general y Roles y habilidades reales', async () => {
    getMyProjectByIdMock.mockResolvedValue(proyectoActual());
    getProjectRevisionsMock.mockResolvedValue([]);
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Proyecto CURRENT' });

    expect(screen.getByRole('heading', { name: 'Información general' })).toBeInTheDocument();
    expect(screen.getByText('Descripción CURRENT')).toBeInTheDocument();
    expect(screen.getByText('Objetivo CURRENT')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Roles y habilidades' })).toBeInTheDocument();
    expect(screen.getByText('Rol CURRENT')).toBeInTheDocument();
    expect(screen.getByText('Descripción de rol CURRENT')).toBeInTheDocument();
    expect(screen.getByText('Carrera CURRENT')).toBeInTheDocument();
    expect(screen.getByText('React CURRENT')).toBeInTheDocument();
  });

  it('campos opcionales ausentes muestran el fallback "—" en su fila correspondiente', async () => {
    getMyProjectByIdMock.mockResolvedValue(
      proyectoActual({ contextoAcademico: null, ubicacionProyecto: null }),
    );
    getProjectRevisionsMock.mockResolvedValue([]);
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Proyecto CURRENT' });

    const contextoRow = screen.getByText('Contexto académico').closest('div') as HTMLElement;
    expect(within(contextoRow).getByText('—')).toBeInTheDocument();

    const ubicacionRow = screen.getByText('Ubicación').closest('div') as HTMLElement;
    expect(within(ubicacionRow).getByText('—')).toBeInTheDocument();
  });

  it('roles vacíos muestran "Sin roles definidos."', async () => {
    getMyProjectByIdMock.mockResolvedValue(proyectoActual({ roles: [] }));
    getProjectRevisionsMock.mockResolvedValue([]);
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Proyecto CURRENT' });
    expect(screen.getByText('Sin roles definidos.')).toBeInTheDocument();
  });

  it('vista actual: muestra los comentarios del revisor cuando el proyecto está OBSERVADO', async () => {
    getMyProjectByIdMock.mockResolvedValue(
      proyectoActual({
        estadoProyecto: 'OBSERVADO',
        revisiones: [
          {
            idRevisionProyecto: 1,
            estadoRevision: 'OBSERVADA',
            comentarioRevision:
              'Información general:\nComentario actual general.\n\nRoles y habilidades:\nComentario actual roles.',
            numeroEnvio: 1,
            enviadaEn: '2026-01-01T00:00:00.000Z',
            revisadaEn: '2026-01-02T00:00:00.000Z',
          },
        ],
      }),
    );
    getProjectRevisionsMock.mockResolvedValue([]);
    renderPage();

    await screen.findByText('Tu proyecto tiene observaciones del revisor');
    expect(screen.getByText('Comentario actual general.')).toBeInTheDocument();
    expect(screen.getByText('Comentario actual roles.')).toBeInTheDocument();
  });

  it('panel histórico con snapshot: datos y comentarios aislados, sin contaminación en ninguna dirección', async () => {
    getMyProjectByIdMock.mockResolvedValue(proyectoActual());
    getProjectRevisionsMock.mockResolvedValue([
      snapshotRevision({
        comentarioRevision:
          'Información general:\nComentario histórico snapshot general.\n\nRoles y habilidades:\nComentario histórico snapshot roles.',
      }),
    ]);
    const { container } = renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Proyecto CURRENT' });

    // SNAPSHOT → CURRENT: antes de abrir el historial, la vista actual sigue
    // mostrando sus propios datos (no fue sustituida por el snapshot).
    expect(screen.getByText('Descripción CURRENT')).toBeInTheDocument();
    expect(screen.getByText('Rol CURRENT')).toBeInTheDocument();
    expect(screen.getByText('React CURRENT')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /ver revisión 1/i }));

    const panel = await within(container).findByText('Descripción SNAPSHOT').then(() => getHistoryPanel(container));

    // CURRENT → SNAPSHOT: dentro del panel histórico solo aparecen datos del
    // snapshot; los datos actuales NO se filtran hacia el historial.
    // ("Proyecto SNAPSHOT" aparece tanto en el título del panel como en el
    // campo "Título del proyecto"; getAllByText tolera ambas apariciones.)
    expect(within(panel).getAllByText('Proyecto SNAPSHOT').length).toBeGreaterThan(0);
    expect(within(panel).getByText('Descripción SNAPSHOT')).toBeInTheDocument();
    expect(within(panel).getByText('Rol SNAPSHOT')).toBeInTheDocument();
    expect(within(panel).getByText('Vue SNAPSHOT')).toBeInTheDocument();
    expect(within(panel).getByText('Comentario histórico snapshot general.')).toBeInTheDocument();
    expect(within(panel).getByText('Comentario histórico snapshot roles.')).toBeInTheDocument();

    expect(within(panel).queryByText('Descripción CURRENT')).not.toBeInTheDocument();
    expect(within(panel).queryByText('Rol CURRENT')).not.toBeInTheDocument();
    expect(within(panel).queryByText('React CURRENT')).not.toBeInTheDocument();

    // Cerrar el panel y confirmar que la vista actual sigue intacta (sin
    // leakage de estado tras el ciclo abrir/cerrar historial).
    fireEvent.click(within(panel).getByRole('button', { name: /volver/i }));
    expect(screen.getByText('Descripción CURRENT')).toBeInTheDocument();
  });

  it('panel histórico sin snapshot: solo muestra comentarios, sin usar datos actuales como fallback', async () => {
    getMyProjectByIdMock.mockResolvedValue(proyectoActual());
    getProjectRevisionsMock.mockResolvedValue([
      snapshotRevision({
        idRevisionProyecto: 6,
        numeroEnvio: 2,
        estadoRevision: 'OBSERVADA',
        snapshotProyecto: null,
        comentarioRevision:
          'Información general:\nComentario histórico sin snapshot general.\n\nRoles y habilidades:\nComentario histórico sin snapshot roles.',
      }),
    ]);
    const { container } = renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Proyecto CURRENT' });

    fireEvent.click(screen.getByRole('button', { name: /ver revisión 2/i }));

    const panel = await within(container)
      .findByText('Comentario histórico sin snapshot general.')
      .then(() => getHistoryPanel(container));

    expect(
      within(panel).getByText(/los datos del formulario de esta revisión no están disponibles/i),
    ).toBeInTheDocument();
    expect(within(panel).getByText('Comentario histórico sin snapshot general.')).toBeInTheDocument();
    expect(within(panel).getByText('Comentario histórico sin snapshot roles.')).toBeInTheDocument();

    // Sin snapshot no debe existir fallback a datos actuales dentro del panel:
    // ni los campos generales ni la lista de roles actuales se filtran aquí
    // (ambas secciones con datos, `ProjectGeneralInfoSection`/`ProjectRolesSkillsSection`,
    // no se montan en absoluto cuando `snap` es null — solo el JSX de comentario).
    expect(within(panel).queryByText('Descripción CURRENT')).not.toBeInTheDocument();
    expect(within(panel).queryByText('Rol CURRENT')).not.toBeInTheDocument();
    expect(within(panel).queryByText('React CURRENT')).not.toBeInTheDocument();
  });
});
