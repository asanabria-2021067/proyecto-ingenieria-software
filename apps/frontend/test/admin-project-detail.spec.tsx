import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const searchParamsMock = vi.hoisted(() => vi.fn(() => new URLSearchParams()));
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('../lib/services/admin-projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/services/admin-projects')>();
  return { ...actual, getAdminProjects: vi.fn(), getAdminProjectDetail: vi.fn() };
});
vi.mock('../lib/services/leadership', () => ({
  getLeadershipHistory: vi.fn(),
  getLeadershipContext: vi.fn(),
  getLeadershipCandidates: vi.fn(),
  getLeadershipAppeals: vi.fn(),
  createLeadershipAppeal: vi.fn(),
  cancelLeadershipAppeal: vi.fn(),
}));

import AdminProjectDetailClient, { grupoDeEstado } from '../app/dashboard/admin/proyectos/[id]/admin-project-detail-client';
import { getAdminProjectDetail } from '../lib/services/admin-projects';
import { getLeadershipHistory } from '../lib/services/leadership';
import type { AdminProjectDetail } from '../lib/types/admin-projects';
import type { HistoricalProjectView } from '../lib/services/historical';

function detalleVivo(overrides: Partial<AdminProjectDetail> = {}): AdminProjectDetail {
  return {
    projectId: 37,
    resumen: {
      idProyecto: 37,
      tituloProyecto: 'Plataforma de Seguimiento de Laboratorios',
      descripcionProyecto: 'Registro de uso de equipo.',
      tipoProyecto: 'EXPERIENCIA',
      estadoProyecto: 'EN_PROGRESO',
      creador: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' },
    },
    liderazgo: { liderActual: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' }, historial: [] },
    miembros: [
      { idParticipacion: 1, estadoParticipacion: 'ACTIVO', usuario: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' }, rolProyecto: { idRolProyecto: 1, nombreRol: 'Líder de proyecto' } },
      { idParticipacion: 2, estadoParticipacion: 'ACTIVO', usuario: { idUsuario: 2, nombre: 'José', apellido: 'Ramírez' }, rolProyecto: { idRolProyecto: 2, nombreRol: 'Desarrollo backend' } },
      { idParticipacion: 3, estadoParticipacion: 'RETIRADO', usuario: { idUsuario: 3, nombre: 'Elena', apellido: 'Gómez' }, rolProyecto: { idRolProyecto: 3, nombreRol: 'Análisis de datos' } },
    ],
    // El backend filtra en la consulta: en vivo SOLO llegan Sprints CERRADO.
    sprints: [
      { idSprint: 4, numero: 4, estado: 'CERRADO' },
      { idSprint: 5, numero: 5, estado: 'CERRADO' },
    ],
    permisos: { puedeEditar: false, puedeOperar: false },
    lector: { perfil: 'ADMIN', sprintEstados: ['CERRADO'] },
    ...overrides,
  };
}

function historico(): HistoricalProjectView {
  return {
    projectId: 37,
    resumen: {
      idProyecto: 37,
      tituloProyecto: 'Plataforma de Seguimiento de Laboratorios',
      descripcionProyecto: 'Registro de uso de equipo.',
      tipoProyecto: 'EXPERIENCIA',
      estadoProyecto: 'CERRADO',
      fechaInicio: '2026-06-11T00:00:00.000Z',
      fechaFinEstimada: '2026-12-31T00:00:00.000Z',
    },
    liderazgo: { liderActual: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' }, historial: [] },
    miembrosHistoricos: [
      { idParticipacion: 1, usuario: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' }, rol: { idRolProyecto: 1, nombreRol: 'Líder de proyecto' }, estadoParticipacion: 'COMPLETADO', fechaIngreso: '2026-06-11T00:00:00.000Z', fechaSalida: null },
    ],
    sprintsCerrados: [{ idSprint: 4, numero: 4, fechaInicio: '2026-06-11T00:00:00.000Z', fechaCierre: '2026-07-01T00:00:00.000Z' }],
    contribucionesEliminadas: [],
    totales: {
      reportadasGranulares: '120.00',
      legacy: '0.00',
      propuestasPendientes: '0.00',
      acreditadas: '120.00',
      tareasDistintas: 28,
      porUsuario: [{ idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz', reportadasGranulares: '120.00', legacy: '0.00', propuestasPendientes: '0.00', acreditadas: '120.00', tareasDistintas: 28 }],
    },
    revisiones: [
      { idRevisionCierre: 9, numeroRevision: 1, estadoRevision: 'APROBADA', enviadaEn: '2026-07-20T00:00:00.000Z', resueltaEn: '2026-07-30T18:00:00.000Z', comentarioRevisor: 'Ok', fingerprintEntrega: 'a'.repeat(64), documentosEnviados: [] },
    ],
    informeOficial: null,
    permisos: { puedeEditar: false, puedeEnviar: false, puedeResolver: false, puedeSubirDocumentos: false },
    lector: { perfil: 'ADMIN', soloPropio: false },
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(createElement(AdminProjectDetailClient, { id: 37 }), { wrapper });
}

beforeEach(() => {
  searchParamsMock.mockReturnValue(new URLSearchParams());
  (getAdminProjectDetail as any).mockResolvedValue(detalleVivo());
  (getLeadershipHistory as any).mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VIEW-16 — detalle administrativo (F013)', () => {
  it('proyecto vivo → solo Sprints CERRADO; ningún ACTIVO en el DOM', async () => {
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Plataforma de Seguimiento de Laboratorios' });
    fireEvent.mouseDown(screen.getByRole('tab', { name: /sprints/i }));
    const lista = await screen.findByRole('list', { name: 'Sprints cerrados' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2);
    expect(within(lista).getByText('Sprint 4')).toBeInTheDocument();
    expect(screen.queryByText(/ACTIVO|En finalización|Activo$/)).not.toBeInTheDocument();
    expect(screen.getByText(/El Sprint operable no es visible para administración/)).toBeInTheDocument();
    expect(getAdminProjectDetail).toHaveBeenCalledWith(37);
  });

  it('permisos en false → cero controles de escritura sobre tareas/Sprint/roles; la única acción es el botón general de liderazgo (F014)', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1 });

    for (const tab of ['miembros', 'sprints', 'liderazgo']) {
      fireEvent.mouseDown(screen.getByRole('tab', { name: new RegExp(tab, 'i') }));
    }
    expect(screen.queryByRole('button', { name: /editar|eliminar|finalizar|cerrar sprint|iniciar|aprobar|rechazar|agregar/i })).not.toBeInTheDocument();
    // Un solo botón general, nunca uno por integrante.
    expect(screen.getAllByRole('button', { name: /cambiar liderazgo/i })).toHaveLength(1);
  });

  it('los cuatro tabs se montan y el breadcrumb vuelve a la bandeja con su grupo', async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('grupo=activos'));
    renderPage();
    await screen.findByRole('heading', { level: 1 });

    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Resumen', 'Miembros', 'Sprints', 'Liderazgo']);
    expect(screen.getByRole('link', { name: 'Activos' })).toHaveAttribute('href', '/dashboard/admin/proyectos?grupo=activos');
    expect(grupoDeEstado('EN_SOLICITUD_CIERRE')).toBe('cierres');
    expect(grupoDeEstado('EN_REVISION')).toBe('revision');
    expect(grupoDeEstado('CERRADO')).toBe('cerrados');
    expect(grupoDeEstado('EN_PROGRESO')).toBe('activos');
  });

  it('cabecera: líder, integrantes activos (usuarios distintos) y Sprints cerrados', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1 });

    expect(screen.getByText('2 integrantes')).toBeInTheDocument();
    expect(screen.getByText(/2 Sprints cerrados/)).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /miembros/i }));
    expect(await screen.findByText('Elena Gómez')).toBeInTheDocument();
    expect(screen.getByText('Retirada')).toBeInTheDocument();
  });

  it('proyecto CERRADO → se renderiza el histórico (miembros históricos, horas acreditadas, banner)', async () => {
    (getAdminProjectDetail as any).mockResolvedValue(historico());
    renderPage();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('status')).toHaveTextContent(/Proyecto cerrado/);
    expect(screen.getByText('120 h')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /miembros/i }));
    expect(await screen.findByText('Completada')).toBeInTheDocument();
    expect(screen.getByText('28')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cerrados' })).toHaveAttribute('href', '/dashboard/admin/proyectos?grupo=cerrados');
    // En CERRADO no se ofrece la transferencia de liderazgo.
    expect(screen.queryByRole('button', { name: /cambiar liderazgo/i })).not.toBeInTheDocument();
  });

  it('EN_SOLICITUD_CIERRE ofrece el enlace a la revisión administrativa del cierre', async () => {
    (getAdminProjectDetail as any).mockResolvedValue(
      detalleVivo({ resumen: { ...detalleVivo().resumen, estadoProyecto: 'EN_SOLICITUD_CIERRE' } }),
    );
    renderPage();

    expect(await screen.findByRole('link', { name: /revisar solicitud de cierre/i })).toHaveAttribute('href', '/dashboard/admin/proyectos/37/cierre');
  });

  it('404 → «el proyecto ya no existe» con retorno a la bandeja', async () => {
    (getAdminProjectDetail as any).mockRejectedValue(Object.assign(new Error('Not found'), { statusCode: 404 }));
    renderPage();

    expect(await screen.findByText('El proyecto ya no existe.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /volver a la bandeja/i })).toHaveAttribute('href', '/dashboard/admin/proyectos?grupo=activos');
  });
});
