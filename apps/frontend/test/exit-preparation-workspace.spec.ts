import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';
import type { ExitPreparationBlockerDto, ExitPreparationSummaryDto } from '../lib/types/exit-requests';

// Radix Tooltip mide su contenido con ResizeObserver, ausente en jsdom —
// mismo polyfill mínimo que task-board.spec.ts.
beforeAll(() => {
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-exit-request', () => ({
  useExitPreparationSummary: vi.fn(),
  useContinueExitPreparation: vi.fn(),
}));

import ExitPreparationWorkspaceClient from '../app/dashboard/projects/[id]/salida/preparacion/exit-preparation-workspace-client';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useContinueExitPreparation, useExitPreparationSummary } from '../hooks/use-exit-request';

const proyectoFixture: ProyectoDetalleDTO = {
  idProyecto: 7,
  tituloProyecto: 'Sistema de Tutorías Académicas UVG',
  descripcionProyecto: null,
  objetivosProyecto: null,
  tipoProyecto: 'EXPERIENCIA',
  estadoProyecto: 'PUBLICADO',
  modalidadProyecto: 'PRESENCIAL',
  ubicacionProyecto: null,
  contextoAcademico: null,
  urlRecursoExterno: null,
  fechaPublicacion: null,
  fechaInicio: null,
  fechaFinEstimada: null,
  fechaCreacion: '2026-01-01T00:00:00.000Z',
  creador: { idUsuario: 1, nombre: 'Ana', apellido: 'Lopez', correo: 'ana@uvg.edu.gt' },
  organizaciones: [],
  intereses: [],
  roles: [],
  hitos: [],
  tareas: [],
};

function blocker(overrides: Partial<ExitPreparationBlockerDto> = {}): ExitPreparationBlockerDto {
  return {
    idAsignacion: 1,
    idTarea: 1,
    tituloTarea: 'Documentar procesos y procedimientos clave',
    estadoTarea: 'EN_PROGRESO',
    fechaAsignacion: '2026-01-01T00:00:00.000Z',
    horasReales: null,
    tieneHoras: false,
    tieneAvance: false,
    estadoPreparacion: 'PENDIENTE',
    ...overrides,
  };
}

function summary(overrides: Partial<ExitPreparationSummaryDto> = {}): ExitPreparationSummaryDto {
  const blockers = overrides.blockers ?? [];
  return {
    solicitud: {
      idSolicitud: 1,
      idProyecto: 7,
      idUsuario: 3,
      estadoSolicitud: 'PREPARACION',
      solicitadaEn: '2026-01-01T00:00:00.000Z',
    },
    blockers,
    cantidadBlockers: blockers.length,
    puedeContinuar: blockers.length === 0,
    ...overrides,
  };
}

function mockSummaryHook(overrides: Record<string, unknown> = {}) {
  (useExitPreparationSummary as any).mockReturnValue({
    summary: undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

function mockContinueHook(overrides: Record<string, unknown> = {}) {
  (useContinueExitPreparation as any).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    ...overrides,
  });
}

function renderWorkspace() {
  return render(createElement(ExitPreparationWorkspaceClient, { id: 7 }));
}

describe('ExitPreparationWorkspaceClient (F9)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // ── Caso 5: loading ──────────────────────────────────────────────────────
  it('mientras carga el proyecto muestra el skeleton de página completa, sin datos "0 de 0" temporales', () => {
    (useProjectDetail as any).mockReturnValue({ data: undefined, isLoading: true, error: null });
    mockSummaryHook({ summary: undefined, isLoading: true });
    mockContinueHook();

    renderWorkspace();

    expect(screen.queryByText(/responsabilidades preparadas/)).not.toBeInTheDocument();
    expect(screen.queryByText('Sistema de Tutorías Académicas UVG')).not.toBeInTheDocument();
  });

  it('con el proyecto cargado pero el summary aún cargando, muestra el skeleton del cuerpo sin datos falsos', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockSummaryHook({ summary: undefined, isLoading: true });
    mockContinueHook();

    renderWorkspace();

    expect(screen.getByRole('heading', { name: 'Sistema de Tutorías Académicas UVG' })).toBeInTheDocument();
    expect(screen.queryByText(/responsabilidades preparadas/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continuar solicitud de salida' })).not.toBeInTheDocument();
  });

  // ── Caso 6: error ─────────────────────────────────────────────────────────
  it('si useProjectDetail falla, muestra un error y no renderiza el workspace de preparación', () => {
    (useProjectDetail as any).mockReturnValue({ data: undefined, isLoading: false, error: new Error('500') });
    mockSummaryHook();
    mockContinueHook();

    renderWorkspace();

    expect(screen.getByText('No se pudo cargar el proyecto. Intenta nuevamente.')).toBeInTheDocument();
  });

  it('si ExitPreparationSummary falla, muestra el mensaje real del backend (no un estado vacío silencioso) con Reintentar', async () => {
    const refetch = vi.fn();
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockSummaryHook({
      isError: true,
      error: new Error('No existe una solicitud de salida en estado PREPARACION'),
      refetch,
    });
    mockContinueHook();

    renderWorkspace();

    expect(
      screen.getByText('No existe una solicitud de salida en estado PREPARACION'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  // ── Caso 1: progreso parcial ─────────────────────────────────────────────
  it('progreso parcial (3 de 5): muestra el contador exacto y el botón Continuar disabled', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    const blockers = [
      blocker({ idAsignacion: 1, estadoPreparacion: 'COMPLETA', tieneHoras: true, tieneAvance: true }),
      blocker({ idAsignacion: 2, estadoPreparacion: 'COMPLETA', tieneHoras: true, tieneAvance: true }),
      blocker({ idAsignacion: 3, estadoPreparacion: 'COMPLETA', tieneHoras: true, tieneAvance: true }),
      blocker({ idAsignacion: 4, estadoPreparacion: 'PENDIENTE', tieneHoras: true, tieneAvance: false }),
      blocker({ idAsignacion: 5, estadoPreparacion: 'PENDIENTE', tieneHoras: false, tieneAvance: false }),
    ];
    mockSummaryHook({ summary: summary({ blockers, cantidadBlockers: 5, puedeContinuar: false }) });
    mockContinueHook();

    renderWorkspace();

    expect(screen.getByText('3 de 5 responsabilidades preparadas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar solicitud de salida' })).toBeDisabled();
  });

  // ── Caso 7: tooltip de bloqueo ───────────────────────────────────────────
  it('con blockers, expone el icono informativo con el tooltip de explicación (accesible por foco)', async () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockSummaryHook({
      summary: summary({ blockers: [blocker()], cantidadBlockers: 1, puedeContinuar: false }),
    });
    mockContinueHook();

    renderWorkspace();

    const infoTrigger = screen.getByRole('button', { name: 'Por qué no puedo continuar todavía' });
    infoTrigger.focus();
    // Radix Tooltip renderiza el contenido dos veces (visible + descripción
    // accesible duplicada); se usa `getAllByText` para no fallar por
    // "múltiples elementos encontrados".
    await waitFor(() =>
      expect(
        screen.getAllByText('Debes preparar todas tus responsabilidades antes de continuar.').length,
      ).toBeGreaterThan(0),
    );
  });

  // ── Caso 2: progreso completo ────────────────────────────────────────────
  it('progreso completo (5 de 5, puedeContinuar=true del backend): muestra el contador y habilita el botón', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    const blockers = Array.from({ length: 5 }, (_, i) =>
      blocker({ idAsignacion: i + 1, estadoPreparacion: 'COMPLETA', tieneHoras: true, tieneAvance: true }),
    );
    // puedeContinuar viene del backend (B7): se fija explícitamente en el
    // fixture, no se deriva de prepared === total dentro del componente.
    mockSummaryHook({ summary: summary({ blockers, cantidadBlockers: 5, puedeContinuar: true }) });
    mockContinueHook();

    renderWorkspace();

    expect(screen.getByText('5 de 5 responsabilidades preparadas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar solicitud de salida' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Por qué no puedo continuar todavía' }),
    ).not.toBeInTheDocument();
  });

  // ── Caso 3: transición ───────────────────────────────────────────────────
  it('click en Continuar invoca exactamente la mutación de F7 (sin variables) y evita doble submit mientras está pendiente', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    const blockers = [blocker({ estadoPreparacion: 'COMPLETA', tieneHoras: true, tieneAvance: true })];
    mockSummaryHook({ summary: summary({ blockers, cantidadBlockers: 1, puedeContinuar: true }) });
    const mutate = vi.fn();
    mockContinueHook({ mutate, isPending: true });

    renderWorkspace();

    const boton = screen.getByRole('button', { name: 'Continuar solicitud de salida' });
    // isPending=true (una mutación ya en curso): el botón debe estar disabled,
    // así que el clic no debe siquiera disparar el handler — cero llamadas
    // adicionales a mutate.
    expect(boton).toBeDisabled();
    fireEvent.click(boton);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('con isPending=false, click en Continuar llama mutate exactamente una vez, sin variables', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    const blockers = [blocker({ estadoPreparacion: 'COMPLETA', tieneHoras: true, tieneAvance: true })];
    mockSummaryHook({ summary: summary({ blockers, cantidadBlockers: 1, puedeContinuar: true }) });
    const mutate = vi.fn();
    mockContinueHook({ mutate, isPending: false });

    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar solicitud de salida' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toBeUndefined();
  });

  it('en éxito de la transición muestra la confirmación y deja de mostrar el tablero de preparación', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    const blockers = [blocker({ estadoPreparacion: 'COMPLETA', tieneHoras: true, tieneAvance: true })];
    mockSummaryHook({ summary: summary({ blockers, cantidadBlockers: 1, puedeContinuar: true }) });
    const mutate = vi.fn((_vars: unknown, opts: { onSuccess?: () => void }) => opts.onSuccess?.());
    mockContinueHook({ mutate });

    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar solicitud de salida' }));

    expect(screen.getByText('Tu solicitud de salida fue enviada a tu líder.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Continuar solicitud de salida' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Mis responsabilidades para salida')).not.toBeInTheDocument();
  });

  it('en fallo de la transición muestra el error real, permite reintentar y refresca el summary', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    const blockers = [blocker({ estadoPreparacion: 'COMPLETA', tieneHoras: true, tieneAvance: true })];
    const refetch = vi.fn();
    mockSummaryHook({ summary: summary({ blockers, cantidadBlockers: 1, puedeContinuar: true }), refetch });
    const boom = Object.assign(new Error('No puedes continuar mientras tengas asignaciones de tareas vigentes'), {
      statusCode: 409,
    });
    const mutate = vi.fn((_vars: unknown, opts: { onError?: (e: unknown) => void }) => opts.onError?.(boom));
    mockContinueHook({ mutate });

    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar solicitud de salida' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No puedes continuar mientras tengas asignaciones de tareas vigentes',
    );
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Continuar solicitud de salida' })).toBeInTheDocument();
  });

  // ── Caso 4: responsabilidades filtradas / Caso 8: ausencia de creación ───
  it('el tablero muestra únicamente las responsabilidades del read-model de preparación, agrupadas por estado', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    const blockers = [
      blocker({ idAsignacion: 1, tituloTarea: 'Documentar procesos y procedimientos clave', tieneHoras: false, tieneAvance: false, estadoPreparacion: 'PENDIENTE' }),
      blocker({ idAsignacion: 2, tituloTarea: 'Transferir materiales y recursos compartidos', tieneHoras: true, tieneAvance: false, estadoPreparacion: 'PENDIENTE' }),
      blocker({ idAsignacion: 3, tituloTarea: 'Validar solicitudes de tutoría pendientes', tieneHoras: false, tieneAvance: true, estadoPreparacion: 'PENDIENTE' }),
      blocker({ idAsignacion: 4, tituloTarea: 'Comunicar estado y notas de seguimiento', tieneHoras: true, tieneAvance: true, estadoPreparacion: 'COMPLETA' }),
    ];
    mockSummaryHook({ summary: summary({ blockers, cantidadBlockers: 4, puedeContinuar: false }) });
    mockContinueHook();

    renderWorkspace();

    expect(screen.getByText('4 responsabilidades')).toBeInTheDocument();
    expect(screen.getByText('Documentar procesos y procedimientos clave')).toBeInTheDocument();
    expect(screen.getByText('Transferir materiales y recursos compartidos')).toBeInTheDocument();
    expect(screen.getByText('Validar solicitudes de tutoría pendientes')).toBeInTheDocument();
    expect(screen.getByText('Comunicar estado y notas de seguimiento')).toBeInTheDocument();
    expect(screen.getAllByText('Pendiente de cierre')).toHaveLength(4);

    // Columnas reales, ningún elemento ajeno al read-model de preparación.
    expect(screen.getByText('Por preparar')).toBeInTheDocument();
    expect(screen.getByText('En preparación')).toBeInTheDocument();
    expect(screen.getByText('Listo para cierre')).toBeInTheDocument();
    expect(screen.getByText('Cerrado')).toBeInTheDocument();

    // F9 no implementa creación de responsabilidades (Sección 6/24/34 del prompt).
    expect(screen.queryByText('Nueva responsabilidad')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nueva responsabilidad/i })).not.toBeInTheDocument();
  });

  it('la columna "Cerrado" nunca recibe elementos bajo el contrato actual de B6 (asignaciones ya cerradas quedan excluidas de la respuesta)', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    const blockers = [blocker({ estadoPreparacion: 'COMPLETA', tieneHoras: true, tieneAvance: true })];
    mockSummaryHook({ summary: summary({ blockers, cantidadBlockers: 1, puedeContinuar: false }) });
    mockContinueHook();

    renderWorkspace();

    const cerradoHeading = screen.getByText('Cerrado');
    const cerradoSection = cerradoHeading.closest('section');
    expect(cerradoSection).not.toBeNull();
    expect(cerradoSection).toHaveTextContent('Sin responsabilidades en este estado.');
  });

  // ── total = 0 ─────────────────────────────────────────────────────────────
  it('total = 0 (sin asignaciones vigentes): muestra el empty state del tablero y habilita Continuar según el backend', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockSummaryHook({ summary: summary({ blockers: [], cantidadBlockers: 0, puedeContinuar: true }) });
    mockContinueHook();

    renderWorkspace();

    expect(screen.getByText('No tienes responsabilidades pendientes de preparar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar solicitud de salida' })).toBeEnabled();
    expect(screen.getByText('No tienes responsabilidades pendientes')).toBeInTheDocument();
  });

  it('usa idProyecto real (no hardcodeado) para instanciar los hooks de F7', () => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    mockSummaryHook({ summary: summary({ blockers: [] }) });
    mockContinueHook();

    renderWorkspace();

    expect(useExitPreparationSummary).toHaveBeenCalledWith(7);
    expect(useContinueExitPreparation).toHaveBeenCalledWith(7);
  });
});
