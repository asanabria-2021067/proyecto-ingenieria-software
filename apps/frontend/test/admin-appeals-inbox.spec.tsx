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
const searchParamsMock = vi.hoisted(() => vi.fn(() => new URLSearchParams()));
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('../lib/services/leadership', () => ({
  getLeadershipContext: vi.fn(),
  getLeadershipHistory: vi.fn(),
  getLeadershipAppeals: vi.fn(),
  getLeadershipCandidates: vi.fn(),
  createLeadershipAppeal: vi.fn(),
  cancelLeadershipAppeal: vi.fn(),
  transferLeadership: vi.fn(),
  getAdminAppeals: vi.fn(),
  acceptAppeal: vi.fn(),
  denyAppeal: vi.fn(),
}));

import AppealsInboxClient from '../app/dashboard/admin/apelaciones/appeals-inbox-client';
import { acceptAppeal, denyAppeal, getAdminAppeals, getLeadershipCandidates, transferLeadership } from '../lib/services/leadership';
import { adminAppealsPrefix } from '../lib/query-keys/admin-projects';
import type { ApelacionItemDto, LeadershipCandidatesDto } from '../lib/types/leadership';

function apelacion(overrides: Partial<ApelacionItemDto> = {}): ApelacionItemDto {
  return {
    idApelacion: 7,
    idProyecto: 37,
    asunto: 'Cambio de liderazgo por carga académica',
    mensaje: 'Mensaje completo de la apelación con el detalle.',
    estadoApelacion: 'PENDIENTE',
    creadaEn: '2026-08-01T12:00:00.000Z',
    resueltaEn: null,
    mensajeResolucion: null,
    liderSolicitante: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' },
    candidatoPropuesto: { idUsuario: 8, nombre: 'José', apellido: 'Ramírez' },
    adminResolutor: null,
    ...overrides,
  };
}

function candidatos(): LeadershipCandidatesDto {
  return {
    contexto: {
      projectId: 37,
      estadoProyecto: 'EN_PROGRESO',
      liderActual: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' },
      tieneParticipacionActiva: true,
      participacionesActivas: [],
      conservaMembresiaSiSeTransfiere: true,
      advertenciaApelacion: null,
      advertenciaAdmin: 'Aviso del servidor.',
    },
    candidatos: [
      { idUsuario: 8, nombre: 'José', apellido: 'Ramírez', fotoUrl: null, rolesActivos: [{ idRolProyecto: 2, nombreRol: 'Backend' }], horasReportadas: '96.00', horasLegacy: '0.00', tareasDistintas: 24, esElegible: true, motivos: [], seleccionable: true },
      { idUsuario: 9, nombre: 'Lucía', apellido: 'Martínez', fotoUrl: null, rolesActivos: [{ idRolProyecto: 3, nombreRol: 'Frontend' }], horasReportadas: '88.00', horasLegacy: '0.00', tareasDistintas: 22, esElegible: true, motivos: [], seleccionable: true },
    ],
  };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

function renderInbox() {
  const { wrapper, queryClient } = createWrapper();
  const utils = render(createElement(AppealsInboxClient), { wrapper });
  return { ...utils, queryClient };
}

beforeEach(() => {
  searchParamsMock.mockReturnValue(new URLSearchParams());
  (getAdminAppeals as any).mockResolvedValue({ items: [apelacion()], total: 1, page: 1, limit: 20 });
  (getLeadershipCandidates as any).mockResolvedValue(candidatos());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VIEW-18 — bandeja de apelaciones (F015)', () => {
  it('el filtro por defecto pide las pendientes', async () => {
    renderInbox();
    await waitFor(() => expect(getAdminAppeals).toHaveBeenCalledWith({ estado: 'PENDIENTE', page: 1 }));
    expect(screen.getByRole('link', { name: 'Pendientes' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText('Cambio de liderazgo por carga académica')).toBeInTheDocument();
  });

  it('Aceptar abre LeadershipChangeDialog precargado con el candidato propuesto y envía expectedLeaderId por el endpoint de aceptación', async () => {
    (acceptAppeal as any).mockResolvedValue({});
    renderInbox();

    fireEvent.click(await screen.findByRole('button', { name: 'Revisar apelación #7' }));
    expect(await screen.findByText('Mensaje completo de la apelación con el detalle.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar y transferir' }));

    const dialog = await screen.findByRole('dialog', { name: /aceptar apelación/i });
    expect(dialog).toBeInTheDocument();
    const trigger = await screen.findByRole('combobox', { name: 'Nuevo líder' });
    await waitFor(() => expect(trigger).toHaveTextContent('José Ramírez'));
    fireEvent.change(screen.getByLabelText(/^Motivo/), { target: { value: 'Acepto la apelación' } });
    const confirmar = await screen.findAllByRole('button', { name: 'Aceptar y transferir' });
    const boton = confirmar[confirmar.length - 1];
    await waitFor(() => expect(boton).not.toBeDisabled());
    fireEvent.click(boton);

    await waitFor(() =>
      expect(acceptAppeal).toHaveBeenCalledWith(37, 7, { idLiderNuevo: 8, expectedLeaderId: 1, motivo: 'Acepto la apelación' }),
    );
    expect(transferLeadership).not.toHaveBeenCalled();
  });

  it('Denegar envía mensajeResolucion (no motivo) y lo exige', async () => {
    (denyAppeal as any).mockResolvedValue({});
    const { queryClient } = renderInbox();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.click(await screen.findByRole('button', { name: 'Revisar apelación #7' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Denegar' }));

    const boton = await screen.findByRole('button', { name: 'Denegar apelación' });
    expect(boton).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Mensaje de resolución/), { target: { value: 'El candidato no cumple.' } });
    expect(screen.getByLabelText(/Mensaje de resolución/)).toHaveAttribute('maxlength', '5000');
    await waitFor(() => expect(boton).not.toBeDisabled());
    fireEvent.click(boton);

    await waitFor(() => expect(denyAppeal).toHaveBeenCalledWith(37, 7, { mensajeResolucion: 'El candidato no cumple.' }));
    const enviado = (denyAppeal as any).mock.calls[0][2];
    expect(enviado).not.toHaveProperty('motivo');
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminAppealsPrefix }));
  });

  it('409 «ya resuelta» al denegar invalida y cierra sin error destructivo', async () => {
    (denyAppeal as any).mockRejectedValue(Object.assign(new Error('La apelación ya fue resuelta'), { statusCode: 409 }));
    renderInbox();

    fireEvent.click(await screen.findByRole('button', { name: 'Revisar apelación #7' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Denegar' }));
    fireEvent.change(await screen.findByLabelText(/Mensaje de resolución/), { target: { value: 'Motivo' } });
    const boton = screen.getByRole('button', { name: 'Denegar apelación' });
    await waitFor(() => expect(boton).not.toBeDisabled());
    fireEvent.click(boton);

    await waitFor(() => expect(swalFire).toHaveBeenCalledWith(expect.objectContaining({ title: 'La apelación ya fue resuelta' })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /denegar apelación/i })).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('una apelación resuelta no ofrece acciones y muestra resolutor, fecha y mensaje', async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('estado=DENEGADA'));
    (getAdminAppeals as any).mockResolvedValue({
      items: [
        apelacion({
          estadoApelacion: 'DENEGADA',
          resueltaEn: '2026-08-05T12:00:00.000Z',
          mensajeResolucion: 'No procede en este Sprint.',
          adminResolutor: { idUsuario: 99, nombre: 'Admin', apellido: 'UVG' },
        }),
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
    renderInbox();

    await waitFor(() => expect(getAdminAppeals).toHaveBeenCalledWith({ estado: 'DENEGADA', page: 1 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar apelación #7' }));
    expect(await screen.findByText('No procede en este Sprint.')).toBeInTheDocument();
    expect(screen.getByText(/Admin UVG/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar y transferir' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Denegar' })).not.toBeInTheDocument();
    expect(getLeadershipCandidates).not.toHaveBeenCalled();
  });

  it('el filtro «Todas» no envía estado', async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('estado=TODAS'));
    renderInbox();
    await waitFor(() => expect(getAdminAppeals).toHaveBeenCalledWith({ estado: undefined, page: 1 }));
  });
});
