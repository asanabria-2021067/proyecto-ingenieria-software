import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';

// La vista de detalle administrativa ya NO contiene el tablero (Sección 19):
// ofrece "Tablero" al líder/participante y redirige las URLs antiguas
// `?tab=` al workspace (Sección 20).

vi.mock('../components/dashboard/DashboardLayout', () => ({
  default: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-project-avance', () => ({
  useProjectAvance: () => ({ data: undefined, isSuccess: false }),
}));
vi.mock('../hooks/use-project-members', () => ({ useProjectMembers: vi.fn() }));
vi.mock('../hooks/use-project-sprints', () => ({ useProjectSprints: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../lib/swal', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
  swalCustomClass: {},
}));
vi.mock('../lib/services/projects', () => ({
  approveProjectClosure: vi.fn().mockResolvedValue(undefined),
  rejectProjectClosure: vi.fn().mockResolvedValue(undefined),
  requestProjectClosure: vi.fn().mockResolvedValue(undefined),
}));

const replaceMock = vi.fn();
const searchParamsMock = vi.fn(() => new URLSearchParams());
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock(),
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

import ProjectDetailClient from '../app/dashboard/projects/[id]/project-detail-client';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useProjectMembers } from '../hooks/use-project-members';
import { useProjectSprints } from '../hooks/use-project-sprints';
import { useCurrentUser } from '../hooks/use-current-user';
import uvgSwal from '../lib/swal';
import { approveProjectClosure, rejectProjectClosure, requestProjectClosure } from '../lib/services/projects';
import type { EstadoSprint, SprintDto } from '../lib/types/sprints';

const proyectoFixture: ProyectoDetalleDTO = {
  idProyecto: 42,
  tituloProyecto: 'Proyecto de prueba',
  descripcionProyecto: 'Una descripción de al menos veinte caracteres.',
  objetivosProyecto: null,
  tipoProyecto: 'INVESTIGACION',
  estadoProyecto: 'EN_PROGRESO',
  modalidadProyecto: 'HIBRIDO',
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

function mockMembers(members: Array<{ idUsuario: number; idRolProyecto: number }> = []) {
  (useProjectMembers as any).mockReturnValue({ members });
}

function sprintFixture(estado: EstadoSprint, numero = 1): SprintDto {
  return {
    idSprint: numero,
    idProyecto: 42,
    numero,
    estado,
    fechaInicio: '2026-01-01T00:00:00.000Z',
    fechaFinalizacionIniciada: null,
    fechaCierre: null,
  };
}

function mockSprints(sprints: SprintDto[] = []) {
  (useProjectSprints as any).mockReturnValue({
    sprints,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ProjectDetailClient, { id: 42 }),
    ),
  );
}

describe('ProjectDetailClient — vista administrativa (Sección 19/21)', () => {
  beforeEach(() => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    searchParamsMock.mockReturnValue(new URLSearchParams());
    mockMembers([]);
    mockSprints([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('no renderiza el tablero ni las pestañas Tablero/Hitos', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    renderPage();

    expect(screen.queryByRole('tab', { name: 'Tablero' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Por hacer' })).not.toBeInTheDocument();
  });

  it('el líder no ve controles de "necesitas un rol" (Tablero se navega desde la sidebar)', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    renderPage();

    expect(screen.queryByRole('link', { name: /tablero/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/necesitas un rol/i)).not.toBeInTheDocument();
  });

  it('un participante activo (no líder) no ve controles exclusivos de líder (Tablero se navega desde la sidebar)', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 7 } });
    mockMembers([{ idUsuario: 7, idRolProyecto: 3 }]);
    renderPage();

    expect(screen.queryByRole('link', { name: /tablero/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /revisiones previas/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /editar información/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar roles/i })).not.toBeInTheDocument();
  });

  it('un externo (ni líder ni participante) ve "Postularme", no "Tablero"', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999 } });
    mockMembers([]);
    renderPage();

    expect(screen.queryByRole('link', { name: /tablero/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /postularme/i })).toBeInTheDocument();
  });

  it('redirige la URL antigua ?tab=tablero al workspace conservando taskId', async () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    searchParamsMock.mockReturnValue(new URLSearchParams('tab=tablero&taskId=55'));
    renderPage();

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith('/dashboard/projects/42/kanban?taskId=55'),
    );
  });

  it('renderiza título, descripción y detalles reales del proyecto', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Proyecto de prueba' })).toBeInTheDocument();
    expect(screen.getByText('Una descripción de al menos veinte caracteres.')).toBeInTheDocument();
    expect(screen.getByText('Detalles del proyecto')).toBeInTheDocument();
  });

  it('muestra el aviso de solicitud de cierre pendiente', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    (useProjectDetail as any).mockReturnValue({
      data: { ...proyectoFixture, estadoProyecto: 'EN_SOLICITUD_CIERRE' },
      isLoading: false,
      error: null,
    });
    renderPage();

    expect(screen.getByText('Solicitud de cierre pendiente')).toBeInTheDocument();
  });

  it('un administrador (no líder) puede aprobar el cierre', async () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999, roles: ['administrador'] } });
    (useProjectDetail as any).mockReturnValue({
      data: { ...proyectoFixture, estadoProyecto: 'EN_SOLICITUD_CIERRE' },
      isLoading: false,
      error: null,
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /aprobar cierre/i }));

    expect(uvgSwal.fire).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Aprobar cierre?' }));
    await waitFor(() => expect(approveProjectClosure).toHaveBeenCalledWith(42));
    expect(rejectProjectClosure).not.toHaveBeenCalled();
  });

  it('un administrador (no líder) puede rechazar el cierre', async () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999, roles: ['administrador'] } });
    (useProjectDetail as any).mockReturnValue({
      data: { ...proyectoFixture, estadoProyecto: 'EN_SOLICITUD_CIERRE' },
      isLoading: false,
      error: null,
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /rechazar/i }));

    expect(uvgSwal.fire).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Rechazar cierre?' }));
    await waitFor(() => expect(rejectProjectClosure).toHaveBeenCalledWith(42));
    expect(approveProjectClosure).not.toHaveBeenCalled();
  });
});

// ─── F16 — bloqueo de "Solicitar cierre del proyecto" por Sprint operable ──

const SPRINT_BLOCK_MSG = 'Debes cerrar el Sprint actual antes de solicitar el cierre del proyecto';

describe('ProjectDetailClient — F16: cierre bloqueado por Sprint operable (A11)', () => {
  beforeEach(() => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } }); // idUsuario 1 = líder (creador.idUsuario)
    searchParamsMock.mockReturnValue(new URLSearchParams());
    mockMembers([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('Sprint ACTIVO: el botón está visible, disabled, explica el motivo y no dispara requestProjectClosure', () => {
    mockSprints([sprintFixture('ACTIVO')]);
    renderPage();

    const boton = screen.getByRole('button', { name: /solicitar cierre del proyecto/i });
    expect(boton).toBeInTheDocument();
    expect(boton).toBeDisabled();
    // Accesible sin mouse: aria-label del envoltorio enfocable (mismo patrón
    // que role-admin-card.tsx), no solo el tooltip visual al hover.
    expect(screen.getByLabelText(SPRINT_BLOCK_MSG)).toBeInTheDocument();

    fireEvent.click(boton);
    expect(requestProjectClosure).not.toHaveBeenCalled();
  });

  it('Sprint EN_FINALIZACION: bloquea exactamente igual que ACTIVO', () => {
    mockSprints([sprintFixture('EN_FINALIZACION')]);
    renderPage();

    const boton = screen.getByRole('button', { name: /solicitar cierre del proyecto/i });
    expect(boton).toBeDisabled();
    expect(screen.getByLabelText(SPRINT_BLOCK_MSG)).toBeInTheDocument();

    fireEvent.click(boton);
    expect(requestProjectClosure).not.toHaveBeenCalled();
  });

  it('Sprint CERRADO: no bloquea por esta razón — el botón queda habilitado y el flujo de solicitud sigue disponible', async () => {
    mockSprints([sprintFixture('CERRADO')]);
    renderPage();

    expect(screen.queryByLabelText(SPRINT_BLOCK_MSG)).not.toBeInTheDocument();
    const boton = screen.getByRole('button', { name: /solicitar cierre del proyecto/i });
    expect(boton).not.toBeDisabled();

    fireEvent.click(boton);
    expect(uvgSwal.fire).toHaveBeenCalledWith(
      expect.objectContaining({ title: '¿Solicitar cierre del proyecto?' }),
    );
    await waitFor(() => expect(requestProjectClosure).toHaveBeenCalledWith(42));
  });

  it('sin Sprint: no bloquea por esta razón — el botón queda habilitado', () => {
    mockSprints([]);
    renderPage();

    expect(screen.queryByLabelText(SPRINT_BLOCK_MSG)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /solicitar cierre del proyecto/i })).not.toBeDisabled();
  });

  it('un Sprint CERRADO conviviendo con otro Sprint (numeración distinta) no reintroduce el bloqueo', () => {
    // Aísla que la condición depende del `estado` real de cada Sprint, no de
    // "existe al menos un Sprint" ni de cuál es el más reciente.
    mockSprints([sprintFixture('CERRADO', 1), sprintFixture('CERRADO', 2)]);
    renderPage();

    expect(screen.queryByLabelText(SPRINT_BLOCK_MSG)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /solicitar cierre del proyecto/i })).not.toBeDisabled();
  });

  it('no-líder no ve el control (el control YA EXISTE solo para quien puede solicitarlo)', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999 } });
    mockMembers([{ idUsuario: 999, idRolProyecto: 3 }]);
    mockSprints([sprintFixture('ACTIVO')]);
    renderPage();

    expect(screen.queryByRole('button', { name: /solicitar cierre del proyecto/i })).not.toBeInTheDocument();
  });

  it('fuera de EN_PROGRESO (p.ej. PUBLICADO) el control no se muestra, preservando la precondición existente de A11', () => {
    (useProjectDetail as any).mockReturnValue({
      data: { ...proyectoFixture, estadoProyecto: 'PUBLICADO' },
      isLoading: false,
      error: null,
    });
    mockSprints([]);
    renderPage();

    expect(screen.queryByRole('button', { name: /solicitar cierre del proyecto/i })).not.toBeInTheDocument();
  });

  it('mientras la solicitud está en curso (pending), el botón permanece disabled sin volver a llamar requestProjectClosure', async () => {
    mockSprints([]);
    let resolveRequest!: () => void;
    (requestProjectClosure as any).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    renderPage();

    const boton = screen.getByRole('button', { name: /solicitar cierre del proyecto/i });
    fireEvent.click(boton);

    await waitFor(() => expect(requestProjectClosure).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(boton).toBeDisabled());

    // Un segundo click mientras está pending no debe disparar una segunda llamada.
    fireEvent.click(boton);
    expect(requestProjectClosure).toHaveBeenCalledTimes(1);

    resolveRequest();
    await waitFor(() => expect(boton).not.toBeDisabled());
  });
});
