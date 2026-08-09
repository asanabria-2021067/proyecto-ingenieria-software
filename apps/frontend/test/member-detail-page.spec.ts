import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';
import type { DetalleIntegranteProyectoDTO } from '../lib/dto/member-detail.dto';

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
  });
});

describe('DetalleIntegranteProyectoPage — desglose de tareas y horas', () => {
  it('agrupa tareas por estado y muestra el total de horas con su desglose', () => {
    mockHooks({
      isLeader: true,
      detalleData: detalle({
        tareas: [
          {
            idTarea: 1,
            tituloTarea: 'Diseñar wireframes',
            estadoTarea: 'HECHO',
            prioridad: 'ALTA',
            fechaCreacion: '2026-01-01T00:00:00.000Z',
            fechaLimite: '2026-01-20',
            actualizadaEn: '2026-01-19T09:00:00.000Z',
            tiempoEstimadoHoras: 8,
            horasReales: 7.5,
            fechaAsignacion: '2026-01-10T12:00:00.000Z',
            desasignadaEn: '2026-01-19T09:00:00.000Z',
          },
          {
            idTarea: 2,
            tituloTarea: 'Implementar formulario',
            estadoTarea: 'EN_PROGRESO',
            prioridad: 'MEDIA',
            fechaCreacion: '2026-02-01T00:00:00.000Z',
            fechaLimite: null,
            actualizadaEn: null,
            tiempoEstimadoHoras: null,
            horasReales: 2,
            fechaAsignacion: '2026-02-01T00:00:00.000Z',
            desasignadaEn: null,
          },
        ],
      }),
    });
    renderPage();

    // Cabecera del integrante.
    expect(screen.getByRole('heading', { level: 1, name: 'Carlos Mendoza' })).toBeInTheDocument();
    expect(screen.getByText(/Backend/)).toBeInTheDocument();

    // Total general: 7.5 + 2 = 9.5 h.
    expect(screen.getByText('9.5 h')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // cantidad de tareas

    // Cada tarea agrupada bajo el encabezado humano de su estado.
    expect(screen.getByText('Hecho')).toBeInTheDocument();
    expect(screen.getByText('En progreso')).toBeInTheDocument();
    expect(screen.getByText('Diseñar wireframes')).toBeInTheDocument();
    expect(screen.getByText('Implementar formulario')).toBeInTheDocument();
    expect(screen.queryByText('HECHO')).not.toBeInTheDocument();
  });

  it('sin tareas asignadas muestra el estado vacío en vez de grupos', () => {
    mockHooks({ isLeader: true, detalleData: detalle({ tareas: [] }) });
    renderPage();

    expect(
      screen.getByText('Este integrante no tiene tareas asignadas (activas ni pasadas) en el proyecto.'),
    ).toBeInTheDocument();
  });
});
