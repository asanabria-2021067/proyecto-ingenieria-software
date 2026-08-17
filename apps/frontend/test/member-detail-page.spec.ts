import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';
import type {
  DetalleIntegranteProyectoDTO,
  HistorialSprintIntegranteDTO,
  TareaHistorialIntegranteDTO,
} from '../lib/dto/member-detail.dto';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42', idUsuario: '7' }),
}));

vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../hooks/use-project-member-detail', () => ({ useProjectMemberDetail: vi.fn() }));

import DetalleIntegranteProyectoPage from '../app/dashboard/proyectos/[id]/equipo/[idUsuario]/page';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useCurrentUser } from '../hooks/use-current-user';
import { useProjectMemberDetail } from '../hooks/use-project-member-detail';

const proyectoFixture = {
  idProyecto: 42,
  creador: { idUsuario: 1, nombre: 'Ana', apellido: 'Lopez', correo: 'ana@uvg.edu.gt' },
} as unknown as ProyectoDetalleDTO;

function detalle(overrides: Partial<DetalleIntegranteProyectoDTO> = {}): DetalleIntegranteProyectoDTO {
  return {
    usuario: { idUsuario: 7, nombre: 'Carlos', apellido: 'Mendoza', correo: 'carlos@uvg.edu.gt', fotoUrl: null },
    participaciones: [
      {
        idParticipacion: 10,
        estadoParticipacion: 'ACTIVO',
        fechaIngreso: '2026-01-05',
        fechaSalida: null,
        rolProyecto: { idRolProyecto: 3, nombreRol: 'Backend' },
      },
    ],
    tareas: [],
    sprints: [],
    ...overrides,
  };
}

/** Tarea de historial con valores por defecto — usada dentro de fixtures de `sprints`. */
function tareaHistorial(overrides: Partial<TareaHistorialIntegranteDTO>): TareaHistorialIntegranteDTO {
  return {
    idTarea: 1,
    idSprint: 1,
    tituloTarea: 'Tarea sin título',
    estadoTarea: 'HECHO',
    prioridad: 'MEDIA',
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    fechaLimite: null,
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
    horasReales: null,
    fechaAsignacion: '2026-01-01T00:00:00.000Z',
    desasignadaEn: null,
    ...overrides,
  };
}

/** Grupo de Sprint del read-model B14 (`TeamService.findTeamMemberDetail`) — mismo shape real, con valores por defecto razonables. */
function sprintGrupo(overrides: Partial<HistorialSprintIntegranteDTO>): HistorialSprintIntegranteDTO {
  return {
    idSprint: 1,
    numero: 1,
    estado: 'CERRADO',
    fechaInicio: '2026-01-01T00:00:00.000Z',
    fechaFinalizacionIniciada: '2026-01-14T00:00:00.000Z',
    fechaCierre: '2026-01-15T00:00:00.000Z',
    horasCalculadas: 0,
    horasAprobadas: 0,
    tareas: [],
    registrosHoras: [],
    ...overrides,
  };
}

function mockHooks({
  isLeader = true,
  detalleData = detalle(),
  isError = false,
  error = null as Error | null,
}: { isLeader?: boolean; detalleData?: DetalleIntegranteProyectoDTO; isError?: boolean; error?: Error | null } = {}) {
  (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false });
  (useCurrentUser as any).mockReturnValue({
    data: { idUsuario: isLeader ? 1 : 999 },
    isLoading: false,
  });
  (useProjectMemberDetail as any).mockReturnValue({
    data: isError ? undefined : detalleData,
    isLoading: false,
    isError,
    error,
  });
}

function renderPage() {
  return render(createElement(DetalleIntegranteProyectoPage));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DetalleIntegranteProyectoPage — guard de liderazgo', () => {
  it('un no-líder ve el mensaje de acceso restringido, no el desglose', () => {
    mockHooks({ isLeader: false });
    renderPage();

    expect(screen.getByText('Solo el líder puede ver este detalle')).toBeInTheDocument();
    expect(screen.queryByText('Total de horas reales')).not.toBeInTheDocument();
  });

  it('el líder ve el desglose', () => {
    mockHooks({ isLeader: true });
    renderPage();

    expect(screen.queryByText('Solo el líder puede ver este detalle')).not.toBeInTheDocument();
    expect(screen.getByText('Total de horas reales')).toBeInTheDocument();
  });
});

describe('DetalleIntegranteProyectoPage — error del backend', () => {
  it('muestra el mensaje de error devuelto por el backend', () => {
    mockHooks({ isLeader: true, isError: true, error: new Error('No eres el líder de este proyecto') });
    renderPage();

    expect(screen.getByText('No eres el líder de este proyecto')).toBeInTheDocument();
    // No debe mostrarse un "Historial por Sprint" falso mientras hay error.
    expect(screen.queryByText('Historial por Sprint')).not.toBeInTheDocument();
  });
});

describe('DetalleIntegranteProyectoPage — cabecera y resumen preservados', () => {
  it('preserva nombre, correo, roles y el resumen de horas reales / tareas del contrato actual', () => {
    mockHooks({
      isLeader: true,
      detalleData: detalle({
        tareas: [
          tareaHistorial({ idTarea: 1, idSprint: 1, horasReales: 7.5 }),
          tareaHistorial({ idTarea: 2, idSprint: 1, horasReales: 2 }),
        ],
      }),
    });
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Carlos Mendoza' })).toBeInTheDocument();
    expect(screen.getByText('carlos@uvg.edu.gt')).toBeInTheDocument();
    expect(screen.getByText(/Backend/)).toBeInTheDocument();

    // "Total de horas reales" sigue viniendo de `tareas` (flat), nunca de
    // `sprints[].horasAprobadas`: 7.5 + 2 = 9.5 h, no confundir con reconocidas.
    expect(screen.getByText('9.5 h')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // TAREAS
  });
});

describe('DetalleIntegranteProyectoPage — Historial por Sprint (F15)', () => {
  function detalleConDosSprints() {
    return detalle({
      sprints: [
        sprintGrupo({
          idSprint: 201,
          numero: 1,
          horasAprobadas: 10,
          tareas: [
            tareaHistorial({
              idTarea: 1001,
              idSprint: 201,
              tituloTarea: 'Configurar entorno del proyecto',
              estadoTarea: 'HECHO',
              horasReales: 3,
            }),
          ],
        }),
        sprintGrupo({
          idSprint: 202,
          numero: 2,
          horasAprobadas: 8,
          tareas: [
            tareaHistorial({
              idTarea: 1002,
              idSprint: 202,
              tituloTarea: 'Ajustar validaciones',
              estadoTarea: 'HECHO',
              horasReales: 5,
            }),
          ],
        }),
      ],
    });
  }

  /** Localiza el `<section>` de un Sprint por su heading accesible "Sprint N". */
  function getSprintSection(numero: number): HTMLElement {
    const heading = screen.getByRole('heading', { name: `Sprint ${numero}` });
    const section = heading.closest('section');
    if (!section) throw new Error(`No se encontró la sección del Sprint ${numero}`);
    return section as HTMLElement;
  }

  it('renderiza cada Sprint como un grupo independiente', () => {
    mockHooks({ isLeader: true, detalleData: detalleConDosSprints() });
    renderPage();

    expect(screen.getByRole('heading', { name: 'Historial por Sprint' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sprint 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sprint 2' })).toBeInTheDocument();
  });

  it('el Sprint más reciente (numero mayor) se presenta primero', () => {
    mockHooks({ isLeader: true, detalleData: detalleConDosSprints() });
    renderPage();

    const headings = screen.getAllByRole('heading', { name: /^Sprint \d$/ });
    expect(headings.map((h) => h.textContent)).toEqual(['Sprint 2', 'Sprint 1']);
  });

  it('las tareas no se mezclan entre Sprints', () => {
    mockHooks({ isLeader: true, detalleData: detalleConDosSprints() });
    renderPage();

    const sprint1 = getSprintSection(1);
    const sprint2 = getSprintSection(2);

    expect(within(sprint1).getByText('Configurar entorno del proyecto')).toBeInTheDocument();
    expect(within(sprint1).queryByText('Ajustar validaciones')).not.toBeInTheDocument();

    expect(within(sprint2).getByText('Ajustar validaciones')).toBeInTheDocument();
    expect(within(sprint2).queryByText('Configurar entorno del proyecto')).not.toBeInTheDocument();
  });

  it('las horas reconocidas no se mezclan entre Sprints', () => {
    mockHooks({ isLeader: true, detalleData: detalleConDosSprints() });
    renderPage();

    const sprint1 = getSprintSection(1);
    const sprint2 = getSprintSection(2);

    expect(within(sprint1).getByText('10 h')).toBeInTheDocument();
    expect(within(sprint1).queryByText('8 h')).not.toBeInTheDocument();

    expect(within(sprint2).getByText('8 h')).toBeInTheDocument();
    expect(within(sprint2).queryByText('10 h')).not.toBeInTheDocument();
  });

  it('muestra el estado de cada tarea a partir del DTO real (no asume HECHO para todo el historial)', () => {
    mockHooks({
      isLeader: true,
      detalleData: detalle({
        sprints: [
          sprintGrupo({
            idSprint: 301,
            numero: 1,
            horasAprobadas: 4,
            tareas: [
              tareaHistorial({
                idTarea: 2001,
                idSprint: 301,
                tituloTarea: 'Tarea en progreso',
                estadoTarea: 'EN_PROGRESO',
                horasReales: 4,
              }),
            ],
          }),
        ],
      }),
    });
    renderPage();

    const sprint1 = getSprintSection(1);
    expect(within(sprint1).getByText('En progreso')).toBeInTheDocument();
    expect(within(sprint1).queryByText('Hecho')).not.toBeInTheDocument();
  });

  it('un Sprint sin tareas muestra un aviso discreto en vez de una card vacía o datos falsos', () => {
    mockHooks({
      isLeader: true,
      detalleData: detalle({
        sprints: [sprintGrupo({ idSprint: 401, numero: 1, horasAprobadas: 0, tareas: [] })],
      }),
    });
    renderPage();

    const sprint1 = getSprintSection(1);
    expect(within(sprint1).getByText('No hay tareas registradas para este Sprint.')).toBeInTheDocument();
  });

  it('sin historial de Sprints, muestra el estado vacío y no fabrica un Sprint 1', () => {
    mockHooks({ isLeader: true, detalleData: detalle({ sprints: [] }) });
    renderPage();

    expect(
      screen.getByText('Este integrante aún no tiene actividad registrada en Sprints.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Sprint \d/)).not.toBeInTheDocument();
  });
});
