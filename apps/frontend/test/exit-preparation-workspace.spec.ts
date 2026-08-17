import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  useCurrentExitRequest: vi.fn(),
  useExitPreparationSummary: vi.fn(),
  useContinueExitPreparation: vi.fn(),
}));
// F10: el workspace ahora monta <CloseAssignmentForm> (siempre presente,
// visibilidad controlada por `open`), que internamente llama
// `useProjectTasks` (necesita `cerrarAsignacion`). Se mockea aquí solo para
// que el árbol monte sin QueryClientProvider — el comportamiento propio de
// CloseAssignmentForm ya tiene su propia suite completa en
// close-assignment-form.spec.ts; no se duplica aquí.
vi.mock('../hooks/use-project-tasks', () => ({
  useProjectTasks: vi.fn(() => ({
    cerrarAsignacion: { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null },
  })),
}));

import ExitPreparationWorkspaceClient from '../app/dashboard/projects/[id]/salida/preparacion/exit-preparation-workspace-client';
import { useProjectDetail } from '../hooks/use-project-detail';
import {
  useContinueExitPreparation,
  useCurrentExitRequest,
  useExitPreparationSummary,
} from '../hooks/use-exit-request';
import { useProjectTasks } from '../hooks/use-project-tasks';

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

function solicitudAbierta(overrides: Partial<any> = {}) {
  return {
    idSolicitud: 1,
    idProyecto: 7,
    idUsuario: 3,
    motivo: 'Cambio de proyecto',
    solicitadaEn: '2026-01-01T00:00:00.000Z',
    estadoSolicitud: 'PREPARACION',
    ...overrides,
  };
}

/** F11.1 — reader server-authoritative; default PREPARACION para no obligar a cada test PREPARACION-only a repetirlo. */
function mockCurrentHook(overrides: Record<string, unknown> = {}) {
  (useCurrentExitRequest as any).mockReturnValue({
    request: solicitudAbierta(),
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
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

describe('ExitPreparationWorkspaceClient (F9 + F11/F11.1)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('mientras carga el proyecto muestra el skeleton de página completa, sin datos "0 de 0" temporales', () => {
    (useProjectDetail as any).mockReturnValue({ data: undefined, isLoading: true, error: null });
    mockCurrentHook({ request: null, isLoading: true });
    mockSummaryHook({ isLoading: true });
    mockContinueHook();

    renderWorkspace();

    expect(screen.queryByText(/responsabilidades preparadas/)).not.toBeInTheDocument();
    expect(screen.queryByText('Sistema de Tutorías Académicas UVG')).not.toBeInTheDocument();
  });

  it('si useProjectDetail falla, muestra un error y no renderiza el workspace de preparación', () => {
    (useProjectDetail as any).mockReturnValue({ data: undefined, isLoading: false, error: new Error('500') });
    mockCurrentHook();
    mockSummaryHook();
    mockContinueHook();

    renderWorkspace();

    expect(screen.getByText('No se pudo cargar el proyecto. Intenta nuevamente.')).toBeInTheDocument();
  });

  // ── F11.1 — orden de carga / gating del reader server-authoritative ─────
  describe('reader server-authoritative (F11.1)', () => {
    it('Test 28 — loading: mientras useCurrentExitRequest carga, ni F9 ni F11 son visibles (sin flash)', () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: null, isLoading: true });
      mockSummaryHook({ isLoading: true });
      mockContinueHook();

      renderWorkspace();

      expect(screen.getByRole('heading', { name: 'Sistema de Tutorías Académicas UVG' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Solicitud enviada' })).not.toBeInTheDocument();
      expect(screen.queryByText(/responsabilidades preparadas/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Continuar solicitud de salida' })).not.toBeInTheDocument();
    });

    it('Test 29 — error del reader: no muestra F9 ni F11 falsamente, muestra el mensaje real con Reintentar', () => {
      const refetch = vi.fn();
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: null, isError: true, error: new Error('No se pudo verificar tu solicitud.'), refetch });
      mockSummaryHook();
      mockContinueHook();

      renderWorkspace();

      expect(screen.getByText('No se pudo verificar tu solicitud.')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Solicitud enviada' })).not.toBeInTheDocument();
      expect(screen.queryByText(/responsabilidades preparadas/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    // ── TEST CRÍTICO (Sección 24 del prompt) ────────────────────────────
    it('CRÍTICO — fresh mount SIN haber ejecutado B7 en esta sesión: el reader devuelve PENDIENTE_LIDER y la UI muestra "Solicitud enviada" de inmediato', () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({
        request: solicitudAbierta({
          estadoSolicitud: 'PENDIENTE_LIDER',
          motivo: 'Cambio de proyecto',
          solicitadaEn: '2026-08-16T00:00:00.000Z',
        }),
      });
      // B6 no debería ni siquiera dispararse — ver aserción de habilitado=false abajo.
      mockSummaryHook();
      mockContinueHook();

      renderWorkspace();

      expect(screen.getByRole('heading', { name: 'Solicitud enviada' })).toBeInTheDocument();
      expect(
        screen.getByText('Tu solicitud está esperando la revisión del líder del proyecto.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Cambio de proyecto')).toBeInTheDocument();

      // Nada del cuerpo de F9.
      expect(screen.queryByText('Mis responsabilidades para salida')).not.toBeInTheDocument();
      expect(screen.queryByText(/responsabilidades preparadas/)).not.toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Continuar solicitud de salida' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cerrar tramo' })).not.toBeInTheDocument();

      // B6 (ExitPreparationSummary) queda gated: nunca se habilita en PENDIENTE_LIDER.
      expect(useExitPreparationSummary).toHaveBeenCalledWith(7, false);
    });

    // ── Test 25 del prompt — direct URL PREPARACION ──────────────────────
    it('fresh mount con reader PREPARACION: aparece F9 (el nuevo reader no rompe el workspace existente)', () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: solicitudAbierta({ estadoSolicitud: 'PREPARACION' }) });
      mockSummaryHook({ summary: summary({ blockers: [], puedeContinuar: true }) });
      mockContinueHook();

      renderWorkspace();

      expect(screen.getByText('No tienes responsabilidades pendientes de preparar')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continuar solicitud de salida' })).toBeEnabled();
      expect(screen.queryByRole('heading', { name: 'Solicitud enviada' })).not.toBeInTheDocument();
      expect(useExitPreparationSummary).toHaveBeenCalledWith(7, true);
    });

    // ── Test 26 del prompt — no llamar B6 en PENDIENTE_LIDER ─────────────
    it('con reader PENDIENTE_LIDER, useExitPreparationSummary se instancia con habilitado=false', () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: solicitudAbierta({ estadoSolicitud: 'PENDIENTE_LIDER' }) });
      mockSummaryHook();
      mockContinueHook();

      renderWorkspace();

      expect(useExitPreparationSummary).toHaveBeenCalledWith(7, false);
    });

    it('NONE — sin solicitud abierta: no muestra F9 ni F11 falsamente, informa el estado real', () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: null });
      mockSummaryHook();
      mockContinueHook();

      renderWorkspace();

      expect(screen.getByText('No tienes una solicitud de salida en preparación')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Solicitud enviada' })).not.toBeInTheDocument();
      expect(screen.queryByText(/responsabilidades preparadas/)).not.toBeInTheDocument();
      expect(useExitPreparationSummary).toHaveBeenCalledWith(7, false);
    });
  });

  // ── Estado PREPARACION — workspace F9 (regresión) ──────────────────────
  describe('estado PREPARACION (workspace F9)', () => {
    it('con el reader PREPARACION pero el summary aún cargando, muestra el skeleton del cuerpo sin datos falsos', () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: solicitudAbierta({ estadoSolicitud: 'PREPARACION' }) });
      mockSummaryHook({ summary: undefined, isLoading: true });
      mockContinueHook();

      renderWorkspace();

      expect(screen.getByRole('heading', { name: 'Sistema de Tutorías Académicas UVG' })).toBeInTheDocument();
      expect(screen.queryByText(/responsabilidades preparadas/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Continuar solicitud de salida' })).not.toBeInTheDocument();
    });

    it('si ExitPreparationSummary falla, muestra el mensaje real del backend (no un estado vacío silencioso) con Reintentar', async () => {
      const refetch = vi.fn();
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: solicitudAbierta({ estadoSolicitud: 'PREPARACION' }) });
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

    // ── Caso 1: progreso parcial ───────────────────────────────────────
    it('progreso parcial (3 de 5): muestra el contador exacto y el botón Continuar disabled', () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: solicitudAbierta({ estadoSolicitud: 'PREPARACION' }) });
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

    // ── Caso 7: tooltip de bloqueo ─────────────────────────────────────
    it('con blockers, expone el icono informativo con el tooltip de explicación (accesible por foco)', async () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: solicitudAbierta({ estadoSolicitud: 'PREPARACION' }) });
      mockSummaryHook({
        summary: summary({ blockers: [blocker()], cantidadBlockers: 1, puedeContinuar: false }),
      });
      mockContinueHook();

      renderWorkspace();

      const infoTrigger = screen.getByRole('button', { name: 'Por qué no puedo continuar todavía' });
      infoTrigger.focus();
      await waitFor(() =>
        expect(
          screen.getAllByText('Debes preparar todas tus responsabilidades antes de continuar.').length,
        ).toBeGreaterThan(0),
      );
    });

    // ── Caso 2: progreso completo ──────────────────────────────────────
    it('progreso completo (5 de 5, puedeContinuar=true del backend): muestra el contador y habilita el botón', () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: solicitudAbierta({ estadoSolicitud: 'PREPARACION' }) });
      const blockers = Array.from({ length: 5 }, (_, i) =>
        blocker({ idAsignacion: i + 1, estadoPreparacion: 'COMPLETA', tieneHoras: true, tieneAvance: true }),
      );
      mockSummaryHook({ summary: summary({ blockers, cantidadBlockers: 5, puedeContinuar: true }) });
      mockContinueHook();

      renderWorkspace();

      expect(screen.getByText('5 de 5 responsabilidades preparadas')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continuar solicitud de salida' })).toBeEnabled();
      expect(
        screen.queryByRole('button', { name: 'Por qué no puedo continuar todavía' }),
      ).not.toBeInTheDocument();
    });

    // ── Caso 3: click en Continuar ─────────────────────────────────────
    it('click en Continuar invoca exactamente la mutación de F7 (sin variables) y evita doble submit mientras está pendiente', () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: solicitudAbierta({ estadoSolicitud: 'PREPARACION' }) });
      const blockers = [blocker({ estadoPreparacion: 'COMPLETA', tieneHoras: true, tieneAvance: true })];
      mockSummaryHook({ summary: summary({ blockers, cantidadBlockers: 1, puedeContinuar: true }) });
      const mutate = vi.fn();
      mockContinueHook({ mutate, isPending: true });

      renderWorkspace();

      const boton = screen.getByRole('button', { name: 'Continuar solicitud de salida' });
      expect(boton).toBeDisabled();
      fireEvent.click(boton);
      expect(mutate).not.toHaveBeenCalled();
    });

    it('con isPending=false, click en Continuar llama mutate exactamente una vez, sin variables, con solo onError (nunca onSuccess: la transición depende del reader, no de un callback local)', () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: solicitudAbierta({ estadoSolicitud: 'PREPARACION' }) });
      const blockers = [blocker({ estadoPreparacion: 'COMPLETA', tieneHoras: true, tieneAvance: true })];
      mockSummaryHook({ summary: summary({ blockers, cantidadBlockers: 1, puedeContinuar: true }) });
      const mutate = vi.fn();
      mockContinueHook({ mutate, isPending: false });

      renderWorkspace();

      fireEvent.click(screen.getByRole('button', { name: 'Continuar solicitud de salida' }));

      expect(mutate).toHaveBeenCalledTimes(1);
      expect(mutate.mock.calls[0][0]).toBeUndefined();
      expect(typeof mutate.mock.calls[0][1].onError).toBe('function');
      expect(mutate.mock.calls[0][1].onSuccess).toBeUndefined();
    });

    it('en fallo de la transición muestra el error real, permite reintentar, refresca el summary y NO muestra "Solicitud enviada" falsamente', () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: solicitudAbierta({ estadoSolicitud: 'PREPARACION' }) });
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
      expect(screen.queryByRole('heading', { name: 'Solicitud enviada' })).not.toBeInTheDocument();
    });

    // ── Caso 4: responsabilidades filtradas / Caso 8: ausencia de creación ──
    it('el tablero muestra únicamente las responsabilidades del read-model de preparación, agrupadas por estado', () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: solicitudAbierta({ estadoSolicitud: 'PREPARACION' }) });
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

      expect(screen.getByText('Por preparar')).toBeInTheDocument();
      expect(screen.getByText('En preparación')).toBeInTheDocument();
      expect(screen.getByText('Listo para cierre')).toBeInTheDocument();
      expect(screen.getByText('Cerrado')).toBeInTheDocument();

      expect(screen.queryByText('Nueva responsabilidad')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /nueva responsabilidad/i })).not.toBeInTheDocument();
    });

    it('la columna "Cerrado" nunca recibe elementos bajo el contrato actual de B6 (asignaciones ya cerradas quedan excluidas de la respuesta)', () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: solicitudAbierta({ estadoSolicitud: 'PREPARACION' }) });
      const blockers = [blocker({ estadoPreparacion: 'COMPLETA', tieneHoras: true, tieneAvance: true })];
      mockSummaryHook({ summary: summary({ blockers, cantidadBlockers: 1, puedeContinuar: false }) });
      mockContinueHook();

      renderWorkspace();

      const cerradoHeading = screen.getByText('Cerrado');
      const cerradoSection = cerradoHeading.closest('section');
      expect(cerradoSection).not.toBeNull();
      expect(cerradoSection).toHaveTextContent('Sin responsabilidades en este estado.');
    });

    it('total = 0 (sin asignaciones vigentes): muestra el empty state del tablero y habilita Continuar según el backend', () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: solicitudAbierta({ estadoSolicitud: 'PREPARACION' }) });
      mockSummaryHook({ summary: summary({ blockers: [], cantidadBlockers: 0, puedeContinuar: true }) });
      mockContinueHook();

      renderWorkspace();

      expect(screen.getByText('No tienes responsabilidades pendientes de preparar')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continuar solicitud de salida' })).toBeEnabled();
      expect(screen.getByText('No tienes responsabilidades pendientes')).toBeInTheDocument();
    });

    it('usa idProyecto real (no hardcodeado) para instanciar los hooks de F7', () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: solicitudAbierta({ estadoSolicitud: 'PREPARACION' }) });
      mockSummaryHook({ summary: summary({ blockers: [] }) });
      mockContinueHook();

      renderWorkspace();

      expect(useExitPreparationSummary).toHaveBeenCalledWith(7, true);
      expect(useContinueExitPreparation).toHaveBeenCalledWith(7);
    });
  });

  // ── Transición B7 -> F11.1 sin reload (Sección 27 del prompt) ─────────
  describe('transición en la misma sesión (sin reload manual)', () => {
    it('con PREPARACION, tras continuar exitosamente, cuando el reader (invalidado por F7) vuelve a resolver con PENDIENTE_LIDER, la UI cambia a PendingLeaderReview sin reload manual', async () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: solicitudAbierta({ estadoSolicitud: 'PREPARACION' }) });
      const blockers = [blocker({ estadoPreparacion: 'COMPLETA', tieneHoras: true, tieneAvance: true })];
      mockSummaryHook({ summary: summary({ blockers, cantidadBlockers: 1, puedeContinuar: true }) });
      const mutate = vi.fn();
      mockContinueHook({ mutate });

      renderWorkspace();

      expect(screen.getByRole('button', { name: 'Continuar solicitud de salida' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Continuar solicitud de salida' }));
      expect(mutate).toHaveBeenCalledTimes(1);

      // Simula lo que useContinueExitPreparation (F7, probado en
      // use-exit-request.spec.ts) hace en la vida real: sembrar e invalidar
      // currentExitRequestQueryKey con el body real de B7, haciendo que la
      // próxima lectura de useCurrentExitRequest resuelva PENDIENTE_LIDER.
      mockCurrentHook({
        request: solicitudAbierta({
          estadoSolicitud: 'PENDIENTE_LIDER',
          motivo: 'Cambio de proyecto',
          solicitadaEn: '2026-08-16T00:00:00.000Z',
        }),
      });
      cleanup();
      renderWorkspace();

      expect(screen.getByRole('heading', { name: 'Solicitud enviada' })).toBeInTheDocument();
      expect(screen.queryByText(/responsabilidades preparadas/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Continuar solicitud de salida' })).not.toBeInTheDocument();

      // Una invalidación/refetch posterior del reader (p. ej. refocus de
      // ventana) debe mantener el mismo estado — no hay ningún useState
      // efímero que "revierta" a F9.
      mockCurrentHook({
        request: solicitudAbierta({ estadoSolicitud: 'PENDIENTE_LIDER' }),
      });
      cleanup();
      renderWorkspace();
      expect(screen.getByRole('heading', { name: 'Solicitud enviada' })).toBeInTheDocument();
    });
  });

  // ── F10: wiring del punto de entrada compartido CloseAssignmentForm ────
  describe('integración con F10 (Cerrar tramo)', () => {
    it('cada responsabilidad ofrece "Cerrar tramo"; al pulsarlo abre el mismo CloseAssignmentForm con los ids correctos', async () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: solicitudAbierta({ estadoSolicitud: 'PREPARACION' }) });
      const blockers = [
        blocker({ idAsignacion: 55, idTarea: 21, tituloTarea: 'Documentar procesos y procedimientos clave' }),
      ];
      mockSummaryHook({ summary: summary({ blockers, cantidadBlockers: 1, puedeContinuar: false }) });
      mockContinueHook();

      renderWorkspace();

      expect(screen.queryByRole('heading', { name: 'Cerrar tramo' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cerrar tramo' }));

      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Cerrar tramo' })).toBeInTheDocument(),
      );
      expect(useProjectTasks).toHaveBeenCalledWith(7);
    });

    it('tras un cierre exitoso, refresca exit-preparation-summary (B6 vuelve a ser la fuente de verdad)', async () => {
      (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
      mockCurrentHook({ request: solicitudAbierta({ estadoSolicitud: 'PREPARACION' }) });
      const blockers = [blocker({ idAsignacion: 55, idTarea: 21 })];
      const refetch = vi.fn();
      mockSummaryHook({
        summary: summary({ blockers, cantidadBlockers: 1, puedeContinuar: false }),
        refetch,
      });
      mockContinueHook();
      const mutate = vi.fn((_vars: unknown, opts: { onSuccess?: () => void }) => opts.onSuccess?.());
      (useProjectTasks as any).mockReturnValue({
        cerrarAsignacion: { mutate, reset: vi.fn(), isPending: false, isError: false, error: null },
      });

      renderWorkspace();
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar tramo' }));
      const dialog = await screen.findByRole('dialog');

      fireEvent.change(within(dialog).getByLabelText(/Horas reales/), { target: { value: '2' } });
      fireEvent.change(within(dialog).getByLabelText(/Registro de avance/), {
        target: { value: 'a'.repeat(200) },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar tramo' }));

      await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
      expect(refetch).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(screen.queryByRole('heading', { name: 'Cerrar tramo' })).not.toBeInTheDocument(),
      );
    });
  });
});
