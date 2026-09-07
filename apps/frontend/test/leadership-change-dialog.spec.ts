import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const swalFire = vi.hoisted(() => vi.fn());
vi.mock('../lib/swal', () => ({ default: { fire: swalFire }, swalCustomClass: {} }));
vi.mock('../lib/services/leadership', () => ({
  getLeadershipContext: vi.fn(),
  getLeadershipHistory: vi.fn(),
  getLeadershipAppeals: vi.fn(),
  getLeadershipCandidates: vi.fn(),
  createLeadershipAppeal: vi.fn(),
  cancelLeadershipAppeal: vi.fn(),
  transferLeadership: vi.fn(),
}));
const searchParamsMock = vi.hoisted(() => vi.fn(() => new URLSearchParams()));
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('../lib/services/admin-projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/services/admin-projects')>();
  return { ...actual, getAdminProjects: vi.fn(), getAdminProjectDetail: vi.fn() };
});

import { LeadershipChangeDialog } from '../components/leadership/leadership-change-dialog';
import AdminProjectDetailClient from '../app/dashboard/admin/proyectos/[id]/admin-project-detail-client';
import { getLeadershipCandidates, getLeadershipHistory, transferLeadership } from '../lib/services/leadership';
import { getAdminProjectDetail } from '../lib/services/admin-projects';
import {
  leadershipCandidatesQueryKey,
  leadershipContextQueryKey,
  leadershipHistoryPrefix,
} from '../lib/query-keys/leadership';
import { adminAppealsPrefix, adminProjectDetailQueryKey } from '../lib/query-keys/admin-projects';
import type { LeadershipCandidateDto, LeadershipCandidatesDto } from '../lib/types/leadership';

function candidato(overrides: Partial<LeadershipCandidateDto> = {}): LeadershipCandidateDto {
  return {
    idUsuario: 8,
    nombre: 'José',
    apellido: 'Ramírez',
    fotoUrl: null,
    rolesActivos: [{ idRolProyecto: 2, nombreRol: 'Desarrollo backend' }],
    horasReportadas: '96.00',
    horasLegacy: '0.00',
    tareasDistintas: 24,
    esElegible: true,
    motivos: [],
    seleccionable: true,
    ...overrides,
  };
}

function candidatos(lista: LeadershipCandidateDto[], liderId = 1): LeadershipCandidatesDto {
  return {
    contexto: {
      projectId: 37,
      estadoProyecto: 'EN_PROGRESO',
      liderActual: { idUsuario: liderId, nombre: 'Valeria', apellido: 'Ortiz' },
      tieneParticipacionActiva: true,
      participacionesActivas: [],
      conservaMembresiaSiSeTransfiere: true,
      advertenciaApelacion: null,
      advertenciaAdmin: 'Al confirmar, se actualizará el líder del proyecto. El anterior conserva su membresía.',
    },
    candidatos: lista,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

function renderDialog(props: Record<string, unknown> = {}) {
  const { wrapper, queryClient } = createWrapper();
  const onOpenChange = vi.fn();
  const utils = render(createElement(LeadershipChangeDialog, { projectId: 37, open: true, onOpenChange, ...props }), { wrapper });
  return { ...utils, queryClient, onOpenChange };
}

async function elegirNuevoLider(nombre: RegExp) {
  const trigger = await screen.findByRole('combobox', { name: 'Nuevo líder' });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name: nombre }));
}

beforeEach(() => {
  (getLeadershipCandidates as any).mockResolvedValue(
    candidatos([
      candidato(),
      candidato({ idUsuario: 9, nombre: 'Daniel', apellido: 'Pérez', esElegible: false, seleccionable: false, motivos: ['SALIDA_EN_CURSO'] }),
    ]),
  );
  (getLeadershipHistory as any).mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LeadershipChangeDialog (VIEW-19 / F014)', () => {
  it('envía idLiderNuevo, expectedLeaderId (del contexto) y motivo con los nombres exactos; el contador es 5000', async () => {
    (transferLeadership as any).mockResolvedValue({});
    const { onOpenChange } = renderDialog();

    expect(await screen.findByText(/El anterior conserva su membresía/)).toBeInTheDocument();
    expect(screen.getByText('0/5000')).toBeInTheDocument();
    expect(screen.queryByText(/\/500$/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Motivo/)).toHaveAttribute('maxlength', '5000');

    await elegirNuevoLider(/José Ramírez/);
    fireEvent.change(screen.getByLabelText(/^Motivo/), { target: { value: '  Reasignación por carga  ' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar cambio' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));

    await waitFor(() =>
      expect(transferLeadership).toHaveBeenCalledWith(37, {
        idLiderNuevo: 8,
        expectedLeaderId: 1,
        motivo: 'Reasignación por carga',
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('expectedLeaderId proviene del contexto, no de un valor codificado', async () => {
    (getLeadershipCandidates as any).mockResolvedValue(candidatos([candidato()], 77));
    (transferLeadership as any).mockResolvedValue({});
    renderDialog();

    await elegirNuevoLider(/José Ramírez/);
    fireEvent.change(await screen.findByLabelText(/^Motivo/), { target: { value: 'Motivo' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar cambio' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));

    await waitFor(() => expect(transferLeadership).toHaveBeenCalledWith(37, expect.objectContaining({ expectedLeaderId: 77 })));
  });

  it('409 (CAS) muestra «Actualizar» y NO reintenta solo', async () => {
    (transferLeadership as any).mockRejectedValue(Object.assign(new Error('El líder cambió'), { statusCode: 409 }));
    const { onOpenChange, queryClient } = renderDialog();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await elegirNuevoLider(/José Ramírez/);
    fireEvent.change(await screen.findByLabelText(/^Motivo/), { target: { value: 'Motivo' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar cambio' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(/cambió mientras trabajabas/);
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 30));
    expect(transferLeadership).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: leadershipContextQueryKey(37) });
    expect(transferLeadership).toHaveBeenCalledTimes(1);
  });

  it('candidatos no seleccionables aparecen deshabilitados con su motivo del catálogo; sin ranking', async () => {
    renderDialog();
    const trigger = await screen.findByRole('combobox', { name: 'Nuevo líder' });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    const opcion = await screen.findByRole('option', { name: /Daniel Pérez/ });
    expect(opcion).toHaveAttribute('aria-disabled', 'true');
    expect(opcion).toHaveAccessibleName(/Tiene una solicitud de salida en curso/);
    expect(screen.queryByText(/recomendado|ranking|puntuación|horas mínimas/i)).not.toBeInTheDocument();
  });

  it('la transferencia invalida las cinco keys previstas', async () => {
    (transferLeadership as any).mockResolvedValue({});
    const { queryClient } = renderDialog();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await elegirNuevoLider(/José Ramírez/);
    fireEvent.change(await screen.findByLabelText(/^Motivo/), { target: { value: 'Motivo' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar cambio' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: leadershipContextQueryKey(37) }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: leadershipCandidatesQueryKey(37) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: leadershipHistoryPrefix(37) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminProjectDetailQueryKey(37) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminAppealsPrefix });
  });

  it('el candidato precargado (VIEW-18) queda seleccionado pero sigue siendo editable', async () => {
    (transferLeadership as any).mockResolvedValue({});
    renderDialog({ presetCandidateId: 8 });

    const trigger = await screen.findByRole('combobox', { name: 'Nuevo líder' });
    await waitFor(() => expect(trigger).toHaveTextContent('José Ramírez'));
    fireEvent.change(screen.getByLabelText(/^Motivo/), { target: { value: 'Acepto la apelación' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar cambio' })).not.toBeDisabled());
  });
});

describe('VIEW-16 host — un único botón general «Cambiar liderazgo»', () => {
  it('no existe un botón de cambio por fila de integrante y el botón abre el diálogo', async () => {
    (getAdminProjectDetail as any).mockResolvedValue({
      projectId: 37,
      resumen: { idProyecto: 37, tituloProyecto: 'Plataforma', descripcionProyecto: null, tipoProyecto: 'EXPERIENCIA', estadoProyecto: 'EN_PROGRESO', creador: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' } },
      liderazgo: { liderActual: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' }, historial: [] },
      miembros: [
        { idParticipacion: 1, estadoParticipacion: 'ACTIVO', usuario: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' }, rolProyecto: { idRolProyecto: 1, nombreRol: 'Líder' } },
        { idParticipacion: 2, estadoParticipacion: 'ACTIVO', usuario: { idUsuario: 8, nombre: 'José', apellido: 'Ramírez' }, rolProyecto: { idRolProyecto: 2, nombreRol: 'Backend' } },
      ],
      sprints: [],
      permisos: { puedeEditar: false, puedeOperar: false },
      lector: { perfil: 'ADMIN', sprintEstados: ['CERRADO'] },
    });
    const { wrapper } = createWrapper();
    render(createElement(AdminProjectDetailClient, { id: 37 }), { wrapper });

    const botones = await screen.findAllByRole('button', { name: /cambiar liderazgo/i });
    expect(botones).toHaveLength(1);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /miembros/i }));
    await screen.findByText('José Ramírez');
    expect(screen.getAllByRole('button', { name: /cambiar liderazgo/i })).toHaveLength(1);

    fireEvent.click(botones[0]);
    expect(await screen.findByRole('dialog', { name: /cambiar liderazgo/i })).toBeInTheDocument();
    expect(getLeadershipCandidates).toHaveBeenCalledWith(37);
  });
});
