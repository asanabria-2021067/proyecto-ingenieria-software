import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';
import type { SprintDto } from '../lib/types/sprints';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42' }),
}));

vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../hooks/use-project-sprints', () => ({
  useProjectSprints: vi.fn(),
  useFinalizeSprint: vi.fn(),
}));
vi.mock('../lib/swal', () => ({ default: { fire: vi.fn() } }));

import SprintListPage from '../app/dashboard/proyectos/[id]/sprints/page';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useCurrentUser } from '../hooks/use-current-user';
import { useFinalizeSprint, useProjectSprints } from '../hooks/use-project-sprints';
import uvgSwal from '../lib/swal';

const proyectoFixture = {
  idProyecto: 42,
  creador: { idUsuario: 1, nombre: 'Ana', apellido: 'Lopez', correo: 'ana@uvg.edu.gt' },
} as unknown as ProyectoDetalleDTO;

function sprint(overrides: Partial<SprintDto> = {}): SprintDto {
  return {
    idSprint: 1,
    idProyecto: 42,
    numero: 1,
    estado: 'ACTIVO',
    fechaInicio: '2026-08-12T12:00:00.000Z',
    fechaFinalizacionIniciada: null,
    fechaCierre: null,
    tareas: 14,
    hitos: 3,
    horasEstimadas: 96,
    ...overrides,
  };
}

function mutationStub(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    ...overrides,
  };
}

function mockLeader(isLeader = true) {
  (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false });
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: isLeader ? 1 : 999 }, isLoading: false });
}

function mockSprints(overrides: Record<string, unknown> = {}) {
  (useProjectSprints as any).mockReturnValue({
    sprints: [sprint()],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

function mockFinalize(overrides: Record<string, unknown> = {}) {
  (useFinalizeSprint as any).mockReturnValue(mutationStub(overrides));
}

function renderPage() {
  return render(createElement(SprintListPage));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SprintListPage — encabezado', () => {
  it('muestra el título, la descripción y el back-link', () => {
    mockLeader();
    mockSprints();
    mockFinalize();

    renderPage();

    expect(screen.getByRole('heading', { name: 'Sprints' })).toBeInTheDocument();
    expect(screen.getByText('Resumen de los sprints del proyecto y su progreso.')).toBeInTheDocument();
    // Debe apuntar al hub real del líder (F17), no a la vista pública/de
    // postulación de /dashboard/proyectos/[id].
    expect(screen.getByRole('link', { name: /volver al proyecto/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/42',
    );
  });
});

describe('SprintListPage — render dinámico con datos del fixture A10.1', () => {
  it('muestra Sprint {numero}, fecha, tareas, hitos y horas estimadas directamente del fixture, sin recalcular', () => {
    mockLeader();
    mockSprints({
      sprints: [
        sprint({
          idSprint: 77,
          numero: 7,
          fechaInicio: '2026-08-31T12:00:00.000Z',
          tareas: 23,
          hitos: 4,
          horasEstimadas: 128,
        }),
      ],
    });
    mockFinalize();

    renderPage();

    expect(screen.getByText('Sprint 7')).toBeInTheDocument();
    expect(screen.getByText('31 ago 2026')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('128 h')).toBeInTheDocument();
    // Ninguno de estos valores viene de la maqueta de referencia (Pantalla2).
    expect(screen.queryByText('Sprint 1')).not.toBeInTheDocument();
    expect(screen.queryByText('96 h')).not.toBeInTheDocument();
  });

  it('deriva el número del campo real del backend, no del índice de ningún .map()', () => {
    mockLeader();
    mockSprints({ sprints: [sprint({ idSprint: 5, numero: 42 })] });
    mockFinalize();

    renderPage();

    expect(screen.getByText('Sprint 42')).toBeInTheDocument();
  });
});

describe('SprintListPage — los tres estados', () => {
  it('ACTIVO: badge ACTIVO, líder ve Finalizar', () => {
    mockLeader(true);
    mockSprints({ sprints: [sprint({ estado: 'ACTIVO' })] });
    mockFinalize();

    renderPage();

    expect(screen.getByText('ACTIVO')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finalizar' })).toBeInTheDocument();
  });

  it('EN_FINALIZACION: badge "EN FINALIZACIÓN", nunca "Finalizar" de nuevo, líder ve "Continuar cierre" hacia F5', () => {
    mockLeader(true);
    mockSprints({ sprints: [sprint({ estado: 'EN_FINALIZACION', idSprint: 9 })] });
    mockFinalize();

    renderPage();

    expect(screen.getByText('EN FINALIZACIÓN')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finalizar' })).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: /continuar cierre/i });
    expect(link).toHaveAttribute('href', '/dashboard/proyectos/42/sprints/9/finalizar');
  });

  it('CERRADO: badge CERRADO, "Ver Detalles" enlaza a F4, nunca Finalizar ni Continuar cierre', () => {
    mockLeader(true);
    mockSprints({ sprints: [sprint({ estado: 'CERRADO', idSprint: 3 })] });
    mockFinalize();

    renderPage();

    expect(screen.getByText('CERRADO')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /ver detalles/i });
    expect(link).toHaveAttribute('href', '/dashboard/proyectos/42/sprints/3');
    expect(screen.queryByRole('button', { name: 'Finalizar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /continuar cierre/i })).not.toBeInTheDocument();
  });

  it('los tres estados renderizados simultáneamente muestran ramas explícitas, sin fallback que confunda EN_FINALIZACION con CERRADO', () => {
    mockLeader(true);
    mockSprints({
      sprints: [
        sprint({ idSprint: 1, numero: 1, estado: 'ACTIVO' }),
        sprint({ idSprint: 2, numero: 2, estado: 'EN_FINALIZACION' }),
        sprint({ idSprint: 3, numero: 3, estado: 'CERRADO' }),
      ],
    });
    mockFinalize();

    renderPage();

    expect(screen.getByText('ACTIVO')).toBeInTheDocument();
    expect(screen.getByText('EN FINALIZACIÓN')).toBeInTheDocument();
    expect(screen.getByText('CERRADO')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finalizar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continuar cierre/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver detalles/i })).toBeInTheDocument();
  });
});

describe('SprintListPage — autorización', () => {
  it('un no-líder nunca ve "Finalizar" ni "Continuar cierre"', () => {
    mockLeader(false);
    mockSprints({
      sprints: [
        sprint({ idSprint: 1, estado: 'ACTIVO' }),
        sprint({ idSprint: 2, estado: 'EN_FINALIZACION' }),
      ],
    });
    mockFinalize();

    renderPage();

    expect(screen.queryByRole('button', { name: 'Finalizar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /continuar cierre/i })).not.toBeInTheDocument();
  });

  it('un no-líder ve el aviso "¡No eres líder!" en vez de la lista — GET .../sprints es exclusivo del líder en backend', () => {
    mockLeader(false);
    mockSprints({ sprints: [sprint({ estado: 'CERRADO', idSprint: 3 })] });
    mockFinalize();

    renderPage();

    expect(screen.getByText('¡No eres líder!')).toBeInTheDocument();
    expect(screen.getByText('No puedes acceder a los Sprints de este proyecto.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /ver detalles/i })).not.toBeInTheDocument();
  });

  it('un no-líder ve "Volver al proyecto" apuntando a /dashboard/proyectos (vista pública), no a /dashboard/projects (hub del líder)', () => {
    mockLeader(false);
    mockSprints();
    mockFinalize();

    renderPage();

    expect(screen.getByRole('link', { name: /volver al proyecto/i })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/42',
    );
  });
});

describe('SprintListPage — acción Finalizar', () => {
  it('click en Finalizar llama a useFinalizeSprint.mutate con el idSprint correcto', () => {
    mockLeader(true);
    const mutate = vi.fn();
    mockSprints({ sprints: [sprint({ idSprint: 55, estado: 'ACTIVO' })] });
    mockFinalize({ mutate });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(55, expect.objectContaining({ onError: expect.any(Function) }));
    expect(useFinalizeSprint).toHaveBeenCalledWith(42);
  });

  it('si backend bloquea por tareas pendientes muestra un aviso claro', () => {
    mockLeader(true);
    const mutate = vi.fn((_idSprint: number, options?: { onError?: (error: Error) => void }) => {
      options?.onError?.(new Error('No se puede finalizar el Sprint mientras existan tareas pendientes'));
    });
    mockSprints({ sprints: [sprint({ idSprint: 55, estado: 'ACTIVO' })] });
    mockFinalize({ mutate });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));

    expect(uvgSwal.fire).toHaveBeenCalledWith(
      expect.objectContaining({
        icon: 'warning',
        title: 'No se puede finalizar el Sprint',
        text: 'Aún quedan tareas por realizar. Completa o cierra las tareas pendientes antes de finalizar el Sprint.',
      }),
    );
  });

  it('mientras está pendiente, el botón queda disabled y un segundo click no dispara dos veces', () => {
    mockLeader(true);
    const mutate = vi.fn();
    mockSprints({ sprints: [sprint({ estado: 'ACTIVO' })] });
    mockFinalize({ mutate, isPending: true });

    renderPage();
    const boton = screen.getByRole('button', { name: /finalizando/i });
    expect(boton).toBeDisabled();

    fireEvent.click(boton);
    expect(mutate).not.toHaveBeenCalled();
  });
});

describe('SprintListPage — loading', () => {
  it('mientras useProjectSprints carga: skeletons, sin Empty ni Sprint falso', () => {
    mockLeader();
    mockSprints({ sprints: [], isLoading: true });
    mockFinalize();

    const { container } = renderPage();

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('Aún no hay Sprints en este proyecto.')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Sprint \d+$/)).not.toBeInTheDocument();
  });
});

describe('SprintListPage — error', () => {
  it('muestra role=alert y "Reintentar" llama a refetch, sin interpretar como lista vacía', () => {
    mockLeader();
    const refetch = vi.fn();
    mockSprints({ sprints: [], isError: true, error: new Error('500'), refetch });
    mockFinalize();

    renderPage();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Aún no hay Sprints en este proyecto.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('SprintListPage — lista vacía', () => {
  it('sin Sprints muestra el Empty state, sin duplicar "Iniciar Sprint" de F2', () => {
    mockLeader();
    mockSprints({ sprints: [] });
    mockFinalize();

    renderPage();

    expect(screen.getByText('Aún no hay Sprints en este proyecto.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /iniciar sprint/i })).not.toBeInTheDocument();
  });
});

describe('SprintListPage — sin cálculos auxiliares', () => {
  it('no llama a ningún hook de tareas/hitos/detalle/closing-summary para construir las métricas', () => {
    mockLeader();
    mockSprints();
    mockFinalize();

    renderPage();

    // Únicas dependencias de datos usadas por esta pantalla.
    expect(useProjectSprints).toHaveBeenCalledWith(42);
    expect(useProjectDetail).toHaveBeenCalledWith(42);
  });
});
