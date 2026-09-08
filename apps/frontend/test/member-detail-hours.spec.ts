import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';
import type { DetalleIntegranteProyectoDTO } from '../lib/dto/member-detail.dto';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42', idUsuario: '7' }),
}));
vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../hooks/use-project-member-detail', () => ({ useProjectMemberDetail: vi.fn() }));
vi.mock('../hooks/use-leadership', () => ({ useLeadershipCandidates: vi.fn() }));
vi.mock('../hooks/use-historical-project', () => ({ useHistoricalProject: vi.fn() }));

import DetalleIntegranteProyectoPage from '../app/dashboard/proyectos/[id]/equipo/[idUsuario]/page';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useCurrentUser } from '../hooks/use-current-user';
import { useProjectMemberDetail } from '../hooks/use-project-member-detail';
import { useLeadershipCandidates } from '../hooks/use-leadership';
import { useHistoricalProject } from '../hooks/use-historical-project';
import { MOTIVOS_INELEGIBILIDAD, type LeadershipCandidateDto } from '../lib/types/leadership';

function detalle(overrides: Partial<DetalleIntegranteProyectoDTO> = {}): DetalleIntegranteProyectoDTO {
  return {
    usuario: { idUsuario: 7, nombre: 'Ana', apellido: 'García', correo: 'ana.garcia@uvg.edu.gt', fotoUrl: null },
    participaciones: [
      {
        idParticipacion: 10,
        estadoParticipacion: 'ACTIVO',
        fechaIngreso: '2026-06-11',
        fechaSalida: null,
        rolProyecto: { idRolProyecto: 3, nombreRol: 'Biólogo experimentado' },
      },
    ],
    tareas: [],
    sprints: [
      {
        idSprint: 1,
        numero: 1,
        estado: 'CERRADO',
        fechaInicio: '2026-06-11T00:00:00.000Z',
        fechaFinalizacionIniciada: null,
        fechaCierre: '2026-07-01T00:00:00.000Z',
        horasCalculadas: 11,
        horasAprobadas: 10.5,
        tareas: [],
        registrosHoras: [],
      },
      {
        idSprint: 2,
        numero: 2,
        estado: 'CERRADO',
        fechaInicio: '2026-07-02T00:00:00.000Z',
        fechaFinalizacionIniciada: null,
        fechaCierre: '2026-07-20T00:00:00.000Z',
        horasCalculadas: 5,
        horasAprobadas: 4.5,
        tareas: [],
        registrosHoras: [],
      },
    ],
    ...overrides,
  };
}

function candidato(overrides: Partial<LeadershipCandidateDto> = {}): LeadershipCandidateDto {
  return {
    idUsuario: 7,
    nombre: 'Ana',
    apellido: 'García',
    fotoUrl: null,
    rolesActivos: [{ idRolProyecto: 3, nombreRol: 'Biólogo experimentado' }],
    horasReportadas: '18.00',
    horasLegacy: '2.50',
    tareasDistintas: 4,
    esElegible: true,
    motivos: [],
    seleccionable: true,
    ...overrides,
  };
}

function mockAll({
  estadoProyecto = 'EN_PROGRESO',
  isLeader = true,
  cand = candidato(),
  historico = undefined as unknown,
}: { estadoProyecto?: string; isLeader?: boolean; cand?: LeadershipCandidateDto | null; historico?: unknown } = {}) {
  (useProjectDetail as any).mockReturnValue({
    data: { idProyecto: 42, estadoProyecto, creador: { idUsuario: 1 } } as unknown as ProyectoDetalleDTO,
    isLoading: false,
  });
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: isLeader ? 1 : 999 }, isLoading: false });
  (useProjectMemberDetail as any).mockReturnValue({ data: detalle(), isLoading: false, isError: false, error: null });
  (useLeadershipCandidates as any).mockReturnValue({
    data: cand ? { contexto: {}, candidatos: [cand] } : undefined,
    isPending: false,
    isError: false,
  });
  (useHistoricalProject as any).mockReturnValue({ data: historico, isPending: false, isError: false });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VIEW-07 — horas por nivel y elegibilidad (F010)', () => {
  it('muestra los cuatro niveles de horas a partir del string decimal del backend, sin recalcular', () => {
    mockAll();
    render(createElement(DetalleIntegranteProyectoPage));

    expect(within(screen.getByRole('group', { name: 'Horas registradas' })).getByText('18 h')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Horas legacy' })).getByText('2.5 h')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Horas propuestas' })).getByText('16 h')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Horas acreditadas' })).getByText('15 h')).toBeInTheDocument();
    expect(screen.getByText(/Tareas distintas:/)).toHaveTextContent('4');
    expect(screen.getByText('Total de horas reales')).toBeInTheDocument();
    // No llama a ninguna ruta de horas de proyecto: solo candidatos (elegibilidad) y detalle de equipo.
    expect(useLeadershipCandidates).toHaveBeenCalledWith(42, true);
    expect(useHistoricalProject).toHaveBeenCalledWith(42, false);
  });

  it('la card de elegibilidad solo aparece para el líder y usa los motivos del catálogo real', () => {
    mockAll({ cand: candidato({ esElegible: false, seleccionable: false, motivos: ['SALIDA_EN_CURSO', 'ROL_SIN_CUPO'] }) });
    render(createElement(DetalleIntegranteProyectoPage));

    expect(screen.getByRole('heading', { name: /Elegibilidad para liderazgo/ })).toBeInTheDocument();
    expect(screen.getByText('No elegible')).toBeInTheDocument();
    const motivos = within(screen.getByRole('list', { name: 'Motivos de inelegibilidad' })).getAllByRole('listitem');
    expect(motivos.map((m) => m.textContent)).toEqual([
      'Tiene una solicitud de salida en curso',
      'El rol no tiene cupo disponible',
    ]);
    expect(screen.queryByText(/horas mínimas/i)).not.toBeInTheDocument();
    expect(MOTIVOS_INELEGIBILIDAD).toHaveLength(9);
  });

  it('un integrante elegible muestra el estado positivo sin ranking ni puntuación', () => {
    mockAll();
    render(createElement(DetalleIntegranteProyectoPage));

    expect(screen.getByText('Elegible')).toBeInTheDocument();
    expect(screen.getByText(/no existe ranking/i)).toBeInTheDocument();
    expect(screen.queryByText(/puntuación|ranking:/i)).not.toBeInTheDocument();
  });

  it('un no líder no ve la elegibilidad ni el detalle (guard existente)', () => {
    mockAll({ isLeader: false });
    render(createElement(DetalleIntegranteProyectoPage));

    expect(screen.queryByRole('heading', { name: /Elegibilidad/ })).not.toBeInTheDocument();
    expect(useLeadershipCandidates).toHaveBeenCalledWith(42, false);
  });

  it('proyecto CERRADO → horas acreditadas del histórico, aviso de solo lectura y sin elegibilidad', () => {
    mockAll({
      estadoProyecto: 'CERRADO',
      cand: null,
      historico: {
        totales: {
          porUsuario: [
            { idUsuario: 7, nombre: 'Ana', apellido: 'García', reportadasGranulares: '18.00', legacy: '2.50', propuestasPendientes: '0.00', acreditadas: '15.00', tareasDistintas: 4 },
          ],
        },
      },
    });
    render(createElement(DetalleIntegranteProyectoPage));

    expect(useHistoricalProject).toHaveBeenCalledWith(42, true);
    expect(useLeadershipCandidates).toHaveBeenCalledWith(42, false);
    expect(within(screen.getByRole('group', { name: 'Horas acreditadas' })).getByText('15 h')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Horas propuestas' })).getByText('0 h')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Horas registradas' })).getByText('18 h')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Proyecto cerrado/);
    expect(screen.queryByRole('heading', { name: /Elegibilidad/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
