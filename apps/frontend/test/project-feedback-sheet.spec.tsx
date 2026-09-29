import { ProjectFeedbackSheet } from '@/components/admin/ProjectFeedbackSheet';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';
import type { RevisionProyectoDTO } from '@/lib/dto/project.dto';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// T-204 (lote 2): sigue el mismo patrón de UserDetailSheet — mock a nivel de
// módulo de las funciones de servicio, fixtures con overrides, wrapper con
// QueryClient (retry:false).

const getAdminProjectByIdMock = vi.fn();
const getProjectRevisionsMock = vi.fn();
vi.mock('@/lib/services/projects', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/projects')>('@/lib/services/projects');
  return {
    ...actual,
    getAdminProjectById: (id: unknown) => getAdminProjectByIdMock(id),
    getProjectRevisions: (id: unknown) => getProjectRevisionsMock(id),
  };
});

function baseProyecto(overrides: Partial<ProyectoDetalleDTO> = {}): ProyectoDetalleDTO {
  return {
    idProyecto: 7,
    tituloProyecto: 'App Movil UVG',
    descripcionProyecto: 'Registro de asistencia por QR.',
    objetivosProyecto: 'Reducir el tiempo de registro manual.',
    tipoProyecto: 'ACADEMICO_EXPERIENCIA',
    estadoProyecto: 'EN_REVISION',
    modalidadProyecto: 'VIRTUAL',
    ubicacionProyecto: null,
    contextoAcademico: 'Curso de ISW',
    urlRecursoExterno: null,
    fechaPublicacion: null,
    fechaInicio: '2026-06-01T00:00:00.000Z',
    fechaFinEstimada: '2026-08-01T00:00:00.000Z',
    fechaCreacion: '2026-05-01T00:00:00.000Z',
    fechaActualizacion: null,
    creador: { idUsuario: 1, nombre: 'Ana', apellido: 'Pérez', correo: 'ana@uvg.edu.gt' },
    organizaciones: [],
    intereses: [],
    roles: [
      {
        idRolProyecto: 1,
        idProyecto: 7,
        nombreRol: 'Desarrollo backend',
        descripcionRolProyecto: null,
        idCarreraRequerida: null,
        cupos: 2,
        horasSemanalesEstimadas: 10,
        carreraRequerida: null,
        requisitos: [
          {
            idRequisitoHabilidad: 1,
            idRolProyecto: 1,
            idHabilidad: 1,
            nivelMinimo: 'INTERMEDIO',
            obligatorio: true,
            habilidad: { idHabilidad: 1, nombreHabilidad: 'Node.js', categoriaHabilidad: 'Backend', descripcionHabilidad: null },
          },
        ],
      },
    ],
    hitos: [],
    ...overrides,
  };
}

function revisionObservada(overrides: Partial<RevisionProyectoDTO> = {}): RevisionProyectoDTO {
  return {
    idRevisionProyecto: 1,
    estadoRevision: 'OBSERVADA',
    comentarioRevision: 'Información general:\nFalta detallar el cronograma.\n\nRoles y habilidades:\nAgrega el nivel mínimo requerido.',
    snapshotProyecto: null,
    numeroEnvio: 1,
    enviadaEn: '2026-06-01T00:00:00.000Z',
    revisadaEn: '2026-06-05T00:00:00.000Z',
    revisor: { idUsuario: 9, nombre: 'Coordinadora', apellido: 'Admin' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getAdminProjectByIdMock.mockResolvedValue(baseProyecto());
  getProjectRevisionsMock.mockResolvedValue([]);
});

function renderSheet(opts: { idProyecto?: number | null; open?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ProjectFeedbackSheet
        idProyecto={opts.idProyecto === undefined ? 7 : opts.idProyecto}
        open={opts.open ?? true}
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe('ProjectFeedbackSheet (T-204)', () => {
  it('con datos, muestra título, campos generales, roles con habilidades y los comentarios de la última revisión observada', async () => {
    getProjectRevisionsMock.mockResolvedValue([revisionObservada()]);
    renderSheet();

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('App Movil UVG');
    expect(screen.getByText('Registro de asistencia por QR.')).toBeInTheDocument();
    expect(screen.getByText('Node.js')).toBeInTheDocument();
    expect(screen.getByText('Falta detallar el cronograma.')).toBeInTheDocument();
    expect(screen.getByText('Agrega el nivel mínimo requerido.')).toBeInTheDocument();
  });

  it('clic en "Ver Revisión N" abre el historial de esa revisión, y "Volver" regresa a la retroalimentación', async () => {
    getProjectRevisionsMock.mockResolvedValue([revisionObservada()]);
    renderSheet();

    const botonVerRevision = await screen.findByRole('button', { name: /Ver Revisión 1/i });
    fireEvent.click(botonVerRevision);

    expect(await screen.findByText(/Historial · Solo lectura · Revisión/i)).toBeInTheDocument();

    const botonesVolver = screen.getAllByRole('button', { name: /Volver/i });
    fireEvent.click(botonesVolver[botonesVolver.length - 1]);

    expect(screen.queryByText(/Historial · Solo lectura · Revisión/i)).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('App Movil UVG');
  });

  it('un proyecto sin roles muestra "Sin roles definidos."', async () => {
    getAdminProjectByIdMock.mockResolvedValue(baseProyecto({ roles: [] }));
    renderSheet();

    expect(await screen.findByText('Sin roles definidos.')).toBeInTheDocument();
  });

  it('clic en Cerrar invoca onOpenChange(false)', async () => {
    const { onOpenChange } = renderSheet();
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('no consulta si el Sheet está cerrado o idProyecto es null', async () => {
    renderSheet({ open: false });
    renderSheet({ idProyecto: null });
    await new Promise((r) => setTimeout(r, 10));

    expect(getAdminProjectByIdMock).not.toHaveBeenCalled();
    expect(getProjectRevisionsMock).not.toHaveBeenCalled();
  });

  it('si la consulta del proyecto falla, el sheet no muestra ningún detalle (sin manejo de error visible)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getAdminProjectByIdMock.mockRejectedValue(new Error('boom'));
    renderSheet();

    await waitFor(() => expect(getAdminProjectByIdMock).toHaveBeenCalled());
    expect(screen.queryByText('Registro de asistencia por QR.')).not.toBeInTheDocument();
    expect(screen.queryByText(/No se pudo cargar/i)).not.toBeInTheDocument();
  });
});
