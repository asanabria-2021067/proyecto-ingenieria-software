import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { SprintDetailDto, SprintDetailTareaDto } from '../lib/types/sprints';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42', sprintId: '1' }),
}));

vi.mock('../hooks/use-project-sprints', () => ({ useSprintDetail: vi.fn() }));

import SprintDetailPage from '../app/dashboard/proyectos/[id]/sprints/[sprintId]/page';
import { useSprintDetail } from '../hooks/use-project-sprints';

function usuario(overrides: Partial<SprintDetailTareaDto['asignaciones'][number]['usuario']> = {}) {
  return {
    idUsuario: 1,
    nombre: 'Daniel',
    apellido: 'Pérez',
    fotoUrl: null,
    ...overrides,
  };
}

function tarea(overrides: Partial<SprintDetailTareaDto> = {}): SprintDetailTareaDto {
  return {
    idTarea: 1,
    tituloTarea: 'Arquitectura final',
    descripcionTarea: null,
    estadoTarea: 'HECHO',
    prioridad: 'ALTA',
    idHito: null,
    fechaCreacion: '2026-08-01T00:00:00.000Z',
    fechaLimite: null,
    tiempoEstimadoHoras: null,
    asignaciones: [],
    comentarios: [],
    ...overrides,
  };
}

function sprintDetail(overrides: Partial<SprintDetailDto> = {}): SprintDetailDto {
  return {
    idSprint: 1,
    idProyecto: 42,
    numero: 7,
    estado: 'CERRADO',
    fechaInicio: '2026-08-14T00:00:00.000Z',
    fechaFinalizacionIniciada: null,
    fechaCierre: null,
    cerradoPor: null,
    tareas: [],
    hitos: [],
    ...overrides,
  };
}

function mockDetail(overrides: Record<string, unknown> = {}) {
  (useSprintDetail as any).mockReturnValue({
    detail: sprintDetail(),
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

function renderPage() {
  return render(createElement(SprintDetailPage));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SprintDetailPage — route params (F4)', () => {
  it('pasa idProyecto e idSprint (numéricos) exactamente al hook, sin confundirlos', () => {
    mockDetail();
    renderPage();

    expect(useSprintDetail).toHaveBeenCalledWith(42, 1);
    expect(useSprintDetail).toHaveBeenCalledTimes(1);
  });
});

describe('SprintDetailPage — render completo con datos dinámicos', () => {
  it('muestra Sprint {numero}, estado, fecha, una tarea, un participante, horas y un hito reales del fixture', () => {
    mockDetail({
      detail: sprintDetail({
        numero: 7,
        estado: 'CERRADO',
        // Mediodía UTC (no medianoche) para que el resultado formateado no
        // dependa de si el entorno de test corre en una zona horaria detrás
        // de UTC (mismo cuidado documentado en formatearFechaLimite).
        fechaInicio: '2026-08-14T12:00:00.000Z',
        tareas: [
          tarea({
            idTarea: 5,
            tituloTarea: 'Arquitectura final',
            idHito: 9,
            asignaciones: [
              {
                idAsignacion: 1,
                usuario: usuario({ idUsuario: 3, nombre: 'Daniel', apellido: 'Pérez' }),
                fechaAsignacion: '2026-08-15T00:00:00.000Z',
                desasignadaEn: null,
                horasReales: 27,
              },
            ],
          }),
        ],
        hitos: [{ idHito: 9, tituloHito: 'Hito de integración', estadoHito: 'EN_PROGRESO', porcentaje: 75 }],
      }),
    });

    renderPage();

    expect(screen.getByRole('heading', { name: 'Sprint 7' })).toBeInTheDocument();
    expect(screen.getByText('Cerrado')).toBeInTheDocument();
    expect(screen.getByText('14 ago 2026')).toBeInTheDocument();
    expect(screen.getByText('Arquitectura final')).toBeInTheDocument();
    // "Daniel Pérez"/"27 h" aparecen tanto en la fila de la tarea (asignación)
    // como en la tabla de Participantes: ambas apariciones son correctas.
    expect(screen.getAllByText('Daniel Pérez').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('27 h').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Hito de integración').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('75%')).toBeInTheDocument();
    // Ninguno de estos valores viene de la maqueta de referencia (Pantalla2).
    expect(screen.queryByText('Sprint 1')).not.toBeInTheDocument();
    expect(screen.queryByText('12/08/2026')).not.toBeInTheDocument();
  });

  it('deriva el número del campo real del backend, no del índice de ningún .map()', () => {
    mockDetail({ detail: sprintDetail({ numero: 42 }) });
    renderPage();

    expect(screen.getByRole('heading', { name: 'Sprint 42' })).toBeInTheDocument();
  });
});

describe('SprintDetailPage — solo lectura', () => {
  it('no expone ningún control de mutación de F5/otros flujos', () => {
    mockDetail({
      detail: sprintDetail({
        estado: 'ACTIVO',
        tareas: [tarea()],
        hitos: [{ idHito: 1, tituloHito: 'Hito', estadoHito: 'PENDIENTE', porcentaje: 0 }],
      }),
    });
    renderPage();

    for (const nombre of ['Finalizar', 'Cerrar Sprint', 'Guardar', 'Editar horas', 'Nueva tarea', 'Aprobar', 'Reabrir']) {
      expect(screen.queryByRole('button', { name: nombre })).not.toBeInTheDocument();
    }
  });
});

describe('SprintDetailPage — los tres estados de Sprint', () => {
  it('ACTIVO se representa explícitamente', () => {
    mockDetail({ detail: sprintDetail({ estado: 'ACTIVO' }) });
    renderPage();
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('EN_FINALIZACION se representa explícitamente (no se confunde con CERRADO)', () => {
    mockDetail({
      detail: sprintDetail({ estado: 'EN_FINALIZACION', fechaFinalizacionIniciada: '2026-08-20T00:00:00.000Z' }),
    });
    renderPage();
    expect(screen.getByText('En finalización')).toBeInTheDocument();
    expect(screen.queryByText('Cerrado')).not.toBeInTheDocument();
    expect(screen.getByText('Finalización iniciada:')).toBeInTheDocument();
  });

  it('CERRADO se representa explícitamente', () => {
    mockDetail({ detail: sprintDetail({ estado: 'CERRADO', fechaCierre: '2026-08-25T00:00:00.000Z' }) });
    renderPage();
    expect(screen.getByText('Cerrado')).toBeInTheDocument();
    expect(screen.getByText('Fecha de cierre:')).toBeInTheDocument();
  });

  it('sin fechaFinalizacionIniciada/fechaCierre no muestra esos campos (nunca un placeholder "—")', () => {
    mockDetail({ detail: sprintDetail({ estado: 'ACTIVO', fechaFinalizacionIniciada: null, fechaCierre: null }) });
    renderPage();
    expect(screen.queryByText('Finalización iniciada:')).not.toBeInTheDocument();
    expect(screen.queryByText('Fecha de cierre:')).not.toBeInTheDocument();
  });
});

describe('SprintDetailPage — Tareas del Sprint', () => {
  it('varias tareas aparecen con sus estados reales, sin mezclar datos', () => {
    mockDetail({
      detail: sprintDetail({
        tareas: [
          tarea({ idTarea: 1, tituloTarea: 'Diseñar wireframes', estadoTarea: 'HECHO' }),
          tarea({ idTarea: 2, tituloTarea: 'Implementar API', estadoTarea: 'EN_PROGRESO' }),
        ],
      }),
    });
    renderPage();

    expect(screen.getByText('Diseñar wireframes')).toBeInTheDocument();
    expect(screen.getByText('Implementar API')).toBeInTheDocument();
    expect(screen.getAllByText('Hecho')).toHaveLength(1);
    expect(screen.getAllByText('En progreso')).toHaveLength(1);
    expect(screen.queryByText('Tarea inexistente')).not.toBeInTheDocument();
  });

  it('resuelve el título del hito de la tarea contra `detail.hitos`, sin pedirlo aparte', () => {
    mockDetail({
      detail: sprintDetail({
        tareas: [tarea({ idTarea: 1, idHito: 3 })],
        hitos: [{ idHito: 3, tituloHito: 'Entrega de MVP', estadoHito: 'PENDIENTE', porcentaje: 0 }],
      }),
    });
    renderPage();

    // Aparece en la columna "Hito" de la tabla de Tareas y en la sección
    // "Hitos del Sprint" — ambas resueltas contra el mismo `detail.hitos`,
    // sin ninguna consulta adicional.
    const tablaTareas = screen.getAllByRole('table')[0];
    expect(within(tablaTareas).getByText('Entrega de MVP')).toBeInTheDocument();
  });

  it('una tarea sin hito muestra "Sin hito"', () => {
    mockDetail({ detail: sprintDetail({ tareas: [tarea({ idHito: null })] }) });
    renderPage();
    expect(screen.getByText('Sin hito')).toBeInTheDocument();
  });
});

describe('SprintDetailPage — Participantes y contribución', () => {
  it('dos participantes distintos muestran nombres, horas y tareas propias sin mezclarse', () => {
    mockDetail({
      detail: sprintDetail({
        tareas: [
          tarea({
            idTarea: 1,
            tituloTarea: 'Tarea A',
            asignaciones: [
              {
                idAsignacion: 1,
                usuario: usuario({ idUsuario: 1, nombre: 'Daniel', apellido: 'Pérez' }),
                fechaAsignacion: '2026-08-15T00:00:00.000Z',
                desasignadaEn: null,
                horasReales: 10,
              },
            ],
          }),
          tarea({
            idTarea: 2,
            tituloTarea: 'Tarea B',
            asignaciones: [
              {
                idAsignacion: 2,
                usuario: usuario({ idUsuario: 2, nombre: 'María', apellido: 'Gómez' }),
                fechaAsignacion: '2026-08-16T00:00:00.000Z',
                desasignadaEn: null,
                horasReales: 5,
              },
            ],
          }),
        ],
      }),
    });
    renderPage();

    const tablas = screen.getAllByRole('table');
    const tablaParticipantes = tablas[1];
    expect(within(tablaParticipantes).getByText('Daniel Pérez')).toBeInTheDocument();
    expect(within(tablaParticipantes).getByText('María Gómez')).toBeInTheDocument();
    expect(within(tablaParticipantes).getByText('10 h')).toBeInTheDocument();
    expect(within(tablaParticipantes).getByText('5 h')).toBeInTheDocument();
  });

  it('un mismo participante asignado a dos tareas del Sprint acumula ambas sin duplicarse como fila', () => {
    mockDetail({
      detail: sprintDetail({
        tareas: [
          tarea({
            idTarea: 1,
            asignaciones: [
              {
                idAsignacion: 1,
                usuario: usuario({ idUsuario: 1 }),
                fechaAsignacion: '2026-08-15T00:00:00.000Z',
                desasignadaEn: null,
                horasReales: 4,
              },
            ],
          }),
          tarea({
            idTarea: 2,
            asignaciones: [
              {
                idAsignacion: 2,
                usuario: usuario({ idUsuario: 1 }),
                fechaAsignacion: '2026-08-16T00:00:00.000Z',
                desasignadaEn: null,
                horasReales: 6,
              },
            ],
          }),
        ],
      }),
    });
    renderPage();

    const tablas = screen.getAllByRole('table');
    const tablaParticipantes = tablas[1];
    // Una sola fila de participante en la tabla de Participantes, con las horas de
    // ambas tareas ya sumadas (4 + 6 = 10), agregado del lado del cliente sobre
    // datos que el propio backend ya entregó en la misma respuesta.
    expect(within(tablaParticipantes).getAllByText('Daniel Pérez')).toHaveLength(1);
    expect(within(tablaParticipantes).getByText('10 h')).toBeInTheDocument();
    // La cantidad de tareas distintas del participante también es 2, no 1 ni 3.
    const filaParticipante = within(tablaParticipantes).getByText('Daniel Pérez').closest('tr')!;
    expect(within(filaParticipante).getByText('2')).toBeInTheDocument();
  });
});

describe('SprintDetailPage — Hitos del Sprint', () => {
  it('los tres estados de hito se representan con su porcentaje real del backend', () => {
    mockDetail({
      detail: sprintDetail({
        hitos: [
          { idHito: 1, tituloHito: 'Hito pendiente', estadoHito: 'PENDIENTE', porcentaje: 0 },
          { idHito: 2, tituloHito: 'Hito en progreso', estadoHito: 'EN_PROGRESO', porcentaje: 40 },
          { idHito: 3, tituloHito: 'Hito completado', estadoHito: 'COMPLETADO', porcentaje: 100 },
        ],
      }),
    });
    renderPage();

    expect(screen.getByText('Hito pendiente')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();

    expect(screen.getByText('Hito en progreso')).toBeInTheDocument();
    expect(screen.getByText('En progreso')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();

    expect(screen.getByText('Hito completado')).toBeInTheDocument();
    expect(screen.getByText('Completado')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});

describe('SprintDetailPage — loading', () => {
  it('muestra skeletons y no renderiza un Sprint falso mientras carga', () => {
    mockDetail({ detail: undefined, isLoading: true });
    const { container } = renderPage();

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Sprint \d+$/)).not.toBeInTheDocument();
    expect(screen.queryByText('Este Sprint no tiene tareas registradas.')).not.toBeInTheDocument();
  });
});

describe('SprintDetailPage — error', () => {
  it('muestra role=alert y no interpreta el error como datos históricos vacíos/falsos', () => {
    mockDetail({ detail: undefined, isError: true, error: new Error('500') });
    renderPage();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/^Sprint \d+$/)).not.toBeInTheDocument();
  });

  it('"Reintentar" ejecuta refetch', () => {
    const refetch = vi.fn();
    mockDetail({ detail: undefined, isError: true, error: new Error('500'), refetch });
    renderPage();

    screen.getByRole('button', { name: /reintentar/i }).click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('SprintDetailPage — subsecciones vacías', () => {
  it('sin tareas ni hitos muestra los Empty state de cada subsección, sin crash', () => {
    mockDetail({ detail: sprintDetail({ tareas: [], hitos: [] }) });
    renderPage();

    expect(screen.getByText('Este Sprint no tiene tareas registradas.')).toBeInTheDocument();
    expect(screen.getByText('No hay participantes registrados para este Sprint.')).toBeInTheDocument();
    expect(screen.getByText('Este Sprint no tiene hitos asociados.')).toBeInTheDocument();
  });
});
