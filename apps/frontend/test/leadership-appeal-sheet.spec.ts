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
}));

import { LeadershipAppealSheet, describirCandidato } from '../components/leadership/leadership-appeal-sheet';
import { createLeadershipAppeal, getLeadershipCandidates } from '../lib/services/leadership';
import { leadershipAppealsPrefix } from '../lib/query-keys/leadership';
import {
  MOTIVOS_INELEGIBILIDAD,
  MOTIVO_INELEGIBILIDAD_LABEL,
  type LeadershipCandidateDto,
  type LeadershipCandidatesDto,
} from '../lib/types/leadership';

function candidato(overrides: Partial<LeadershipCandidateDto> = {}): LeadershipCandidateDto {
  return {
    idUsuario: 8,
    nombre: 'Ana',
    apellido: 'García',
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

function candidatos(lista: LeadershipCandidateDto[]): LeadershipCandidatesDto {
  return {
    contexto: {
      projectId: 42,
      estadoProyecto: 'EN_PROGRESO',
      liderActual: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' },
      tieneParticipacionActiva: true,
      participacionesActivas: [],
      conservaMembresiaSiSeTransfiere: true,
      advertenciaApelacion: 'Tu solicitud será revisada por el equipo de gobernanza.',
      advertenciaAdmin: null,
    },
    candidatos: lista,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

function renderSheet(props: Record<string, unknown> = {}) {
  const { wrapper, queryClient } = createWrapper();
  const onOpenChange = vi.fn();
  const utils = render(
    createElement(LeadershipAppealSheet, { projectId: 42, open: true, onOpenChange, ...props }),
    { wrapper },
  );
  return { ...utils, queryClient, onOpenChange };
}

async function elegirCandidato(nombre: RegExp) {
  const trigger = await screen.findByRole('combobox', { name: 'Candidato propuesto' });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name: nombre }));
}

beforeEach(() => {
  (getLeadershipCandidates as any).mockResolvedValue(
    candidatos([
      candidato(),
      candidato({
        idUsuario: 9,
        nombre: 'Daniel',
        apellido: 'Pérez',
        esElegible: false,
        seleccionable: false,
        motivos: ['SALIDA_EN_CURSO'],
      }),
    ]),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LeadershipAppealSheet (VIEW-17 / F009)', () => {
  it('muestra la advertencia del servidor y los contadores 200 / 10000 (nunca 500)', async () => {
    renderSheet();

    expect(await screen.findByText('Tu solicitud será revisada por el equipo de gobernanza.')).toBeInTheDocument();
    expect(screen.getByText('0/200')).toBeInTheDocument();
    expect(screen.getByText('0/10000')).toBeInTheDocument();
    expect(screen.queryByText(/\/500/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Asunto/)).toHaveAttribute('maxlength', '200');
    expect(screen.getByLabelText(/^Mensaje/)).toHaveAttribute('maxlength', '10000');
  });

  it('sin candidato el envío está deshabilitado aunque asunto y mensaje sean válidos', async () => {
    renderSheet();
    await screen.findByRole('combobox', { name: 'Candidato propuesto' });

    fireEvent.change(screen.getByLabelText(/^Asunto/), { target: { value: 'Carga académica' } });
    fireEvent.change(screen.getByLabelText(/^Mensaje/), { target: { value: 'Necesito ceder el liderazgo.' } });

    expect(screen.getByRole('button', { name: 'Enviar apelación' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar apelación' }));
    expect(createLeadershipAppeal).not.toHaveBeenCalled();
  });

  it('envía asunto, mensaje e idCandidatoPropuesto con los nombres exactos del DTO', async () => {
    (createLeadershipAppeal as any).mockResolvedValue({ idApelacion: 1 });
    const { onOpenChange } = renderSheet();

    fireEvent.change(await screen.findByLabelText(/^Asunto/), { target: { value: '  Carga académica  ' } });
    fireEvent.change(screen.getByLabelText(/^Mensaje/), { target: { value: 'Necesito ceder el liderazgo.' } });
    await elegirCandidato(/Ana García/);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar apelación' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Enviar apelación' }));

    await waitFor(() =>
      expect(createLeadershipAppeal).toHaveBeenCalledWith(42, {
        asunto: 'Carga académica',
        mensaje: 'Necesito ceder el liderazgo.',
        idCandidatoPropuesto: 8,
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('un candidato seleccionable:false aparece deshabilitado con su motivo del catálogo real', async () => {
    renderSheet();
    const trigger = await screen.findByRole('combobox', { name: 'Candidato propuesto' });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    const opcion = await screen.findByRole('option', { name: /Daniel Pérez/ });
    expect(opcion).toHaveAttribute('aria-disabled', 'true');
    expect(opcion).toHaveAccessibleName(/Daniel Pérez.*Tiene una solicitud de salida en curso/);
    expect(screen.queryByText(/horas mínimas/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/lidera otro proyecto/i)).not.toBeInTheDocument();
  });

  it('solo se traducen los 9 motivos del catálogo; un código ajeno no recibe copy inventado', () => {
    expect(Object.keys(MOTIVO_INELEGIBILIDAD_LABEL)).toHaveLength(9);
    expect([...MOTIVOS_INELEGIBILIDAD]).toEqual(Object.keys(MOTIVO_INELEGIBILIDAD_LABEL));
    const desc = describirCandidato(candidato({ seleccionable: false, motivos: ['HORAS_MINIMAS' as never] }));
    expect(desc).toContain('HORAS_MINIMAS');
    expect(desc).not.toMatch(/mínimas/i);
  });

  it('409 (ya existe una apelación pendiente) cierra el sheet e invalida las apelaciones', async () => {
    (createLeadershipAppeal as any).mockRejectedValue(
      Object.assign(new Error('Ya existe una apelación pendiente'), { statusCode: 409 }),
    );
    const { onOpenChange, queryClient } = renderSheet();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.change(await screen.findByLabelText(/^Asunto/), { target: { value: 'Asunto' } });
    fireEvent.change(screen.getByLabelText(/^Mensaje/), { target: { value: 'Mensaje' } });
    await elegirCandidato(/Ana García/);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar apelación' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Enviar apelación' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: leadershipAppealsPrefix(42) });
    expect(swalFire).toHaveBeenCalledWith(expect.objectContaining({ text: 'Ya existe una apelación pendiente' }));
  });

  it('400 se muestra inline sin cerrar el sheet', async () => {
    (createLeadershipAppeal as any).mockRejectedValue(
      Object.assign(new Error('asunto debe tener como máximo 200 caracteres'), { statusCode: 400 }),
    );
    const { onOpenChange } = renderSheet();

    fireEvent.change(await screen.findByLabelText(/^Asunto/), { target: { value: 'Asunto' } });
    fireEvent.change(screen.getByLabelText(/^Mensaje/), { target: { value: 'Mensaje' } });
    await elegirCandidato(/Ana García/);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar apelación' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Enviar apelación' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('asunto debe tener como máximo 200 caracteres');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
