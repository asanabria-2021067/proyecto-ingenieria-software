import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { SprintDto } from '../lib/types/sprints';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42', sprintId: '3' }),
}));

vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../hooks/use-project-sprints', () => ({
  useProjectSprints: vi.fn(),
  useFinalizeSprint: vi.fn(),
  useSprintDetail: vi.fn(),
  useSprintAnalytics: vi.fn(),
}));
vi.mock('../lib/swal', () => ({ default: { fire: vi.fn() } }));

import SprintListPage, { proyectoEsReadOnly } from '../app/dashboard/proyectos/[id]/sprints/page';
import SprintDetailPage from '../app/dashboard/proyectos/[id]/sprints/[sprintId]/page';
import SprintAnalyticsPage from '../app/dashboard/proyectos/[id]/sprints/[sprintId]/analytics/page';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useCurrentUser } from '../hooks/use-current-user';
import {
  useFinalizeSprint,
  useProjectSprints,
  useSprintAnalytics,
  useSprintDetail,
} from '../hooks/use-project-sprints';

function sprint(overrides: Partial<SprintDto> = {}): SprintDto {
  return {
    idSprint: 3,
    idProyecto: 42,
    numero: 4,
    estado: 'CERRADO',
    fechaInicio: '2026-05-12T12:00:00.000Z',
    fechaFinalizacionIniciada: '2026-05-25T12:00:00.000Z',
    fechaCierre: '2026-05-26T12:00:00.000Z',
    tareas: 6,
    hitos: 2,
    horasEstimadas: 40,
    ...overrides,
  };
}

function mockProyecto(estadoProyecto = 'EN_PROGRESO', isLeader = true) {
  (useProjectDetail as any).mockReturnValue({
    data: { idProyecto: 42, estadoProyecto, creador: { idUsuario: 1 } },
    isLoading: false,
  });
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: isLeader ? 1 : 999 }, isLoading: false });
}

function mockSprints(sprints: SprintDto[]) {
  (useProjectSprints as any).mockReturnValue({
    sprints,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  (useFinalizeSprint as any).mockReturnValue({ mutate: vi.fn(), isPending: false });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('proyectoEsReadOnly', () => {
  it('solo EN_SOLICITUD_CIERRE y CERRADO congelan los Sprints', () => {
    expect(proyectoEsReadOnly('EN_SOLICITUD_CIERRE')).toBe(true);
    expect(proyectoEsReadOnly('CERRADO')).toBe(true);
    expect(proyectoEsReadOnly('EN_PROGRESO')).toBe(false);
    expect(proyectoEsReadOnly(undefined)).toBe(false);
  });
});

describe('VIEW-11 — Sprint CERRADO en la lista (F003)', () => {
  it('un Sprint CERRADO no renderiza «Finalizar», «Cerrar» ni «Continuar cierre» y muestra la nota histórica', () => {
    mockProyecto('EN_PROGRESO');
    mockSprints([sprint()]);

    render(createElement(SprintListPage));

    expect(screen.queryByRole('button', { name: /finalizar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cerrar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /continuar cierre/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver detalles/i })).toHaveAttribute('href', '/dashboard/proyectos/42/sprints/3');
    expect(screen.getByText(/solo lectura/i)).toBeInTheDocument();
    expect(screen.getByText(/26 may 2026/)).toBeInTheDocument();
  });

  it('un Sprint ACTIVO sí ofrece «Finalizar» al líder', () => {
    mockProyecto('EN_PROGRESO');
    mockSprints([sprint({ estado: 'ACTIVO', fechaCierre: null })]);

    render(createElement(SprintListPage));

    expect(screen.getByRole('button', { name: 'Finalizar' })).toBeInTheDocument();
  });

  it('con el proyecto en EN_SOLICITUD_CIERRE ningún Sprint ofrece acciones de ciclo de vida', () => {
    mockProyecto('EN_SOLICITUD_CIERRE');
    mockSprints([sprint({ idSprint: 5, estado: 'ACTIVO', fechaCierre: null }), sprint({ idSprint: 6, estado: 'EN_FINALIZACION', fechaCierre: null })]);

    render(createElement(SprintListPage));

    expect(screen.queryByRole('button', { name: 'Finalizar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /continuar cierre/i })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/solicitud de cierre/i);
  });

  it('con el proyecto CERRADO se explica que los Sprints son históricos', () => {
    mockProyecto('CERRADO');
    mockSprints([sprint()]);

    render(createElement(SprintListPage));

    expect(screen.getByRole('status')).toHaveTextContent(/cerrado/i);
    expect(screen.queryByRole('button', { name: 'Finalizar' })).not.toBeInTheDocument();
  });
});

describe('VIEW-11 — detalle de un Sprint CERRADO', () => {
  it('muestra la vista histórica de solo lectura con acceso a las horas acreditadas y sin controles de escritura', () => {
    mockProyecto('EN_PROGRESO');
    (useSprintDetail as any).mockReturnValue({
      detail: {
        idSprint: 3,
        idProyecto: 42,
        numero: 4,
        estado: 'CERRADO',
        fechaInicio: '2026-05-12T12:00:00.000Z',
        fechaFinalizacionIniciada: '2026-05-25T12:00:00.000Z',
        fechaCierre: '2026-05-26T12:00:00.000Z',
        cerradoPor: 1,
        tareas: [],
        hitos: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(createElement(SprintDetailPage));

    expect(screen.getByText('Cerrado')).toBeInTheDocument();
    expect(screen.getByText('Resumen histórico del sprint y sus contribuciones registradas.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /horas acreditadas/i })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/42/sprints/3/finalizar',
    );
    expect(screen.getByText(/fecha de cierre/i)).toBeInTheDocument();
    for (const nombre of ['Finalizar', 'Cerrar Sprint', 'Guardar', 'Editar', 'Revocar', 'Registrar']) {
      expect(screen.queryByRole('button', { name: nombre })).not.toBeInTheDocument();
    }
  });

  it('un Sprint ACTIVO no ofrece el acceso a horas acreditadas (aún no existen)', () => {
    mockProyecto('EN_PROGRESO');
    (useSprintDetail as any).mockReturnValue({
      detail: {
        idSprint: 3,
        idProyecto: 42,
        numero: 4,
        estado: 'ACTIVO',
        fechaInicio: '2026-05-12T12:00:00.000Z',
        fechaFinalizacionIniciada: null,
        fechaCierre: null,
        cerradoPor: null,
        tareas: [],
        hitos: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(createElement(SprintDetailPage));

    expect(screen.queryByRole('link', { name: /horas acreditadas/i })).not.toBeInTheDocument();
  });
});

describe('VIEW-11 — analítica accesible para integrantes', () => {
  it('un integrante (no líder) ve la analítica del Sprint sin el aviso de líder', () => {
    mockProyecto('EN_PROGRESO', false);
    (useSprintAnalytics as any).mockReturnValue({
      analytics: {
        idSprint: 3,
        idProyecto: 42,
        numero: 4,
        estado: 'CERRADO',
        tareasTotales: 6,
        distribucionPorEstado: { POR_HACER: 0, EN_PROGRESO: 0, EN_REVISION: 0, HECHO: 6 },
        distribucionPorPrioridad: { BAJA: 2, MEDIA: 2, ALTA: 2 },
        hitos: [],
        planificadoVsCompletado: { tareasPlanificadas: 6, tareasCompletadas: 6, horasEstimadas: 40 },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(createElement(SprintAnalyticsPage));

    expect(screen.getByRole('heading', { name: 'Analítica del Sprint 4' })).toBeInTheDocument();
    expect(screen.queryByText('¡No eres líder!')).not.toBeInTheDocument();
    expect(screen.getByText('Tareas completadas')).toBeInTheDocument();
  });
});
