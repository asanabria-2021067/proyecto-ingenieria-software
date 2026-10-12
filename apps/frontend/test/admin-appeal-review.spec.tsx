import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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
const paramsMock = vi.hoisted(() => vi.fn(() => ({ apelacionId: '7' })));
vi.mock('next/navigation', () => ({
  useParams: () => paramsMock(),
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
  getAdminAppeal: vi.fn(),
  getAdminAppealsSummary: vi.fn(),
  acceptAppeal: vi.fn(),
  denyAppeal: vi.fn(),
}));

import AppealReviewClient from '../app/dashboard/admin/apelaciones/[apelacionId]/appeal-review-client';
import { acceptAppeal, denyAppeal, getAdminAppeal, getLeadershipCandidates, transferLeadership } from '../lib/services/leadership';
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
    proyecto: { idProyecto: 37, tituloProyecto: 'Tutorías entre pares', estadoProyecto: 'EN_PROGRESO' },
    liderDesignado: null,
    ...overrides,
  };
}

function candidatos(overrides: { jose?: Record<string, unknown> } = {}): LeadershipCandidatesDto {
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
      { idUsuario: 8, nombre: 'José', apellido: 'Ramírez', fotoUrl: null, rolesActivos: [{ idRolProyecto: 2, nombreRol: 'Backend' }], horasReportadas: '96.00', horasLegacy: '0.00', tareasDistintas: 24, esElegible: true, motivos: [], seleccionable: true, ...overrides.jose },
      { idUsuario: 9, nombre: 'Lucía', apellido: 'Martínez', fotoUrl: null, rolesActivos: [{ idRolProyecto: 3, nombreRol: 'Frontend' }], horasReportadas: '88.00', horasLegacy: '0.00', tareasDistintas: 22, esElegible: true, motivos: [], seleccionable: true },
    ],
  } as LeadershipCandidatesDto;
}

function renderReview() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
  return { ...render(createElement(AppealReviewClient), { wrapper }), queryClient };
}

const seccion = (nombre: string) => within(screen.getByRole('region', { name: nombre }));

beforeEach(() => {
  paramsMock.mockReturnValue({ apelacionId: '7' });
  searchParamsMock.mockReturnValue(new URLSearchParams());
  (getAdminAppeal as any).mockResolvedValue(apelacion());
  (getLeadershipCandidates as any).mockResolvedValue(candidatos());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Revisión de apelación — carga directa y contexto', () => {
  it('carga la apelación por su id y muestra los cuatro bloques', async () => {
    renderReview();

    expect(await screen.findByRole('heading', { level: 1, name: 'Cambio de liderazgo por carga académica' })).toBeInTheDocument();
    expect(getAdminAppeal).toHaveBeenCalledWith(7);

    const info = seccion('Información general');
    expect(info.getByRole('link', { name: 'Tutorías entre pares' })).toHaveAttribute('href', '/dashboard/admin/proyectos/37');
    expect(info.getByText('En progreso')).toBeInTheDocument();
    expect(info.getByText('1 ago 2026')).toBeInTheDocument();
    expect(info.getByText('Valeria Ortiz')).toBeInTheDocument();

    const solicitud = seccion('Solicitud de transferencia');
    expect(solicitud.getByText('Mensaje completo de la apelación con el detalle.')).toBeInTheDocument();
    expect(await solicitud.findByText('Líder actual')).toBeInTheDocument();
    expect(solicitud.getByText(/Backend · 24 tareas · 96 h reportadas/)).toBeInTheDocument();

    expect(await seccion('Validación y selección').findByText('Elegible')).toBeInTheDocument();
    expect(seccion('Resolución administrativa').getByRole('button', { name: 'Aceptar y transferir' })).toBeEnabled();
  });

  it('el estado de la apelación y el del proyecto se distinguen', async () => {
    (getAdminAppeal as any).mockResolvedValue(
      apelacion({ estadoApelacion: 'DENEGADA', resueltaEn: '2026-08-05T12:00:00.000Z', proyecto: { idProyecto: 37, tituloProyecto: 'Tutorías entre pares', estadoProyecto: 'CERRADO' } }),
    );
    renderReview();

    await screen.findByRole('heading', { level: 1 });
    expect(seccion('Información general').getByText('Cerrado')).toBeInTheDocument();
    expect(screen.getAllByText('Denegada').length).toBeGreaterThan(0);
  });

  it('vuelve a la bandeja en la pestaña y la página de origen', async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('estado=ACEPTADA&page=3'));
    renderReview();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('link', { name: 'Volver a Apelaciones' })).toHaveAttribute('href', '/dashboard/admin/apelaciones?estado=ACEPTADA&page=3');
    expect(screen.getByRole('link', { name: 'Apelaciones' })).toHaveAttribute('href', '/dashboard/admin/apelaciones?estado=ACEPTADA&page=3');
  });

  it('una apelación inexistente (404) se explica y ofrece volver, sin acciones', async () => {
    (getAdminAppeal as any).mockRejectedValue(Object.assign(new Error('no existe'), { statusCode: 404 }));
    renderReview();

    expect(await screen.findByText('No encontramos esta apelación.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a Apelaciones' })).toHaveAttribute('href', '/dashboard/admin/apelaciones');
    expect(screen.queryByRole('button', { name: 'Aceptar y transferir' })).not.toBeInTheDocument();
  });
});

describe('Revisión de apelación — elegibilidad', () => {
  it('un candidato propuesto no elegible se señala con el motivo del servidor', async () => {
    (getLeadershipCandidates as any).mockResolvedValue(
      candidatos({ jose: { esElegible: false, seleccionable: false, motivos: ['SIN_PARTICIPACION_ACTIVA'] } }),
    );
    renderReview();

    await screen.findByRole('heading', { level: 1 });
    const validacion = seccion('Validación y selección');
    expect(await validacion.findByText('No elegible')).toBeInTheDocument();
    expect(validacion.getByText(/hay 1 más/)).toBeInTheDocument();
  });

  it('el diálogo de aceptación no deja confirmar a un candidato no seleccionable', async () => {
    (getLeadershipCandidates as any).mockResolvedValue(
      candidatos({ jose: { esElegible: false, seleccionable: false, motivos: ['SIN_PARTICIPACION_ACTIVA'] } }),
    );
    renderReview();

    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar y transferir' }));
    const dialog = await screen.findByRole('dialog', { name: /aceptar apelación/i });
    fireEvent.change(within(dialog).getByLabelText(/^Motivo/), { target: { value: 'Intento' } });
    const confirmar = within(dialog).getByRole('button', { name: 'Aceptar y transferir' });
    expect(confirmar).toBeDisabled();
    fireEvent.click(confirmar);
    expect(acceptAppeal).not.toHaveBeenCalled();
  });
});

describe('Revisión de apelación — aceptar y transferir', () => {
  it('reutiliza el diálogo de «Cambiar liderazgo», precarga al candidato y envía por el endpoint de aceptación', async () => {
    (acceptAppeal as any).mockResolvedValue({});
    const { queryClient } = renderReview();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar y transferir' }));
    const dialog = await screen.findByRole('dialog', { name: /aceptar apelación/i });
    const trigger = await within(dialog).findByRole('combobox', { name: 'Nuevo líder' });
    await waitFor(() => expect(trigger).toHaveTextContent('José Ramírez'));
    fireEvent.change(within(dialog).getByLabelText(/^Motivo/), { target: { value: 'Acepto la apelación' } });
    const confirmar = within(dialog).getByRole('button', { name: 'Aceptar y transferir' });
    await waitFor(() => expect(confirmar).not.toBeDisabled());
    fireEvent.click(confirmar);

    await waitFor(() =>
      expect(acceptAppeal).toHaveBeenCalledWith(37, 7, { idLiderNuevo: 8, expectedLeaderId: 1, motivo: 'Acepto la apelación' }),
    );
    expect(acceptAppeal).toHaveBeenCalledTimes(1);
    expect(transferLeadership).not.toHaveBeenCalled();
    // La bandeja, sus contadores y este detalle cuelgan del mismo prefijo.
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminAppealsPrefix }));
  });

  it('tras resolver, el detalle se vuelve a pedir y muestra la resolución real con el líder designado', async () => {
    (acceptAppeal as any).mockResolvedValue({});
    (getAdminAppeal as any)
      .mockResolvedValueOnce(apelacion())
      .mockResolvedValue(
        apelacion({
          estadoApelacion: 'ACEPTADA',
          resueltaEn: '2026-08-06T12:00:00.000Z',
          adminResolutor: { idUsuario: 99, nombre: 'Admin', apellido: 'UVG' },
          liderDesignado: { idUsuario: 9, nombre: 'Lucía', apellido: 'Martínez' },
        }),
      );
    renderReview();

    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar y transferir' }));
    const dialog = await screen.findByRole('dialog', { name: /aceptar apelación/i });
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: 'Nuevo líder' })).toHaveTextContent('José Ramírez'));
    fireEvent.change(within(dialog).getByLabelText(/^Motivo/), { target: { value: 'Acepto' } });
    const confirmar = within(dialog).getByRole('button', { name: 'Aceptar y transferir' });
    await waitFor(() => expect(confirmar).not.toBeDisabled());
    fireEvent.click(confirmar);

    await waitFor(() => expect(getAdminAppeal).toHaveBeenCalledTimes(2));
    const resolucion = seccion('Resolución administrativa');
    expect(await resolucion.findByText('Lucía Martínez')).toBeInTheDocument();
    expect(resolucion.getByText('Distinto del candidato propuesto.')).toBeInTheDocument();
    expect(resolucion.getByText('Admin UVG')).toBeInTheDocument();
    expect(resolucion.getByText('6 ago 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar y transferir' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Denegar' })).not.toBeInTheDocument();
  });

  it('si la transferencia falla, la apelación sigue pendiente y el error queda visible en el diálogo', async () => {
    (acceptAppeal as any).mockRejectedValue(Object.assign(new Error('El candidato no es elegible'), { statusCode: 422 }));
    renderReview();

    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar y transferir' }));
    const dialog = await screen.findByRole('dialog', { name: /aceptar apelación/i });
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: 'Nuevo líder' })).toHaveTextContent('José Ramírez'));
    fireEvent.change(within(dialog).getByLabelText(/^Motivo/), { target: { value: 'Acepto' } });
    const confirmar = within(dialog).getByRole('button', { name: 'Aceptar y transferir' });
    await waitFor(() => expect(confirmar).not.toBeDisabled());
    fireEvent.click(confirmar);

    await waitFor(() => expect(acceptAppeal).toHaveBeenCalledTimes(1));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(swalFire).not.toHaveBeenCalledWith(expect.objectContaining({ icon: 'success' }));
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0);
  });

  it('un 409 (el liderazgo cambió o ya se resolvió) no reintenta solo: pide actualizar', async () => {
    (acceptAppeal as any).mockRejectedValue(Object.assign(new Error('Conflicto'), { statusCode: 409 }));
    renderReview();

    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar y transferir' }));
    const dialog = await screen.findByRole('dialog', { name: /aceptar apelación/i });
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: 'Nuevo líder' })).toHaveTextContent('José Ramírez'));
    fireEvent.change(within(dialog).getByLabelText(/^Motivo/), { target: { value: 'Acepto' } });
    const confirmar = within(dialog).getByRole('button', { name: 'Aceptar y transferir' });
    await waitFor(() => expect(confirmar).not.toBeDisabled());
    fireEvent.click(confirmar);

    expect(await within(dialog).findByText(/El liderazgo cambió mientras trabajabas/)).toBeInTheDocument();
    expect(acceptAppeal).toHaveBeenCalledTimes(1);
  });
});

describe('Revisión de apelación — denegar', () => {
  it('exige mensajeResolucion, lo envía (no motivo) e invalida el prefijo de apelaciones', async () => {
    (denyAppeal as any).mockResolvedValue({});
    const { queryClient } = renderReview();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.click(await screen.findByRole('button', { name: 'Denegar' }));
    const boton = await screen.findByRole('button', { name: 'Denegar apelación' });
    expect(boton).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Mensaje de resolución/), { target: { value: 'El candidato no cumple.' } });
    expect(screen.getByLabelText(/Mensaje de resolución/)).toHaveAttribute('maxlength', '5000');
    await waitFor(() => expect(boton).not.toBeDisabled());
    fireEvent.click(boton);

    await waitFor(() => expect(denyAppeal).toHaveBeenCalledWith(37, 7, { mensajeResolucion: 'El candidato no cumple.' }));
    expect((denyAppeal as any).mock.calls[0][2]).not.toHaveProperty('motivo');
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminAppealsPrefix }));
  });

  it('409 «ya resuelta» al denegar cierra el diálogo con un aviso, sin error destructivo', async () => {
    (denyAppeal as any).mockRejectedValue(Object.assign(new Error('La apelación ya fue resuelta'), { statusCode: 409 }));
    renderReview();

    fireEvent.click(await screen.findByRole('button', { name: 'Denegar' }));
    fireEvent.change(await screen.findByLabelText(/Mensaje de resolución/), { target: { value: 'Motivo' } });
    const boton = screen.getByRole('button', { name: 'Denegar apelación' });
    await waitFor(() => expect(boton).not.toBeDisabled());
    fireEvent.click(boton);

    await waitFor(() => expect(swalFire).toHaveBeenCalledWith(expect.objectContaining({ title: 'La apelación ya fue resuelta' })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /denegar apelación/i })).not.toBeInTheDocument());
    expect(denyAppeal).toHaveBeenCalledTimes(1);
  });
});

describe('Revisión de apelación — historial y proyectos cerrados', () => {
  it('una resuelta es de solo lectura: resolutor, fecha y mensaje, sin acciones ni consulta de candidatos', async () => {
    (getAdminAppeal as any).mockResolvedValue(
      apelacion({
        estadoApelacion: 'DENEGADA',
        resueltaEn: '2026-08-05T12:00:00.000Z',
        mensajeResolucion: 'No procede en este Sprint.',
        adminResolutor: { idUsuario: 99, nombre: 'Admin', apellido: 'UVG' },
        proyecto: { idProyecto: 37, tituloProyecto: 'Tutorías entre pares', estadoProyecto: 'CERRADO' },
      }),
    );
    renderReview();

    await screen.findByRole('heading', { level: 1 });
    const resolucion = seccion('Resolución administrativa');
    expect(await resolucion.findByText('No procede en este Sprint.')).toBeInTheDocument();
    expect(resolucion.getByText('Admin UVG')).toBeInTheDocument();
    expect(resolucion.getByText('5 ago 2026')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Validación y selección' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar y transferir' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Denegar' })).not.toBeInTheDocument();
    expect(getLeadershipCandidates).not.toHaveBeenCalled();
  });

  it('una cancelada sin administrador lo dice, sin inventar un resolutor', async () => {
    (getAdminAppeal as any).mockResolvedValue(apelacion({ estadoApelacion: 'CANCELADA', resueltaEn: '2026-08-03T12:00:00.000Z' }));
    renderReview();
    await screen.findByRole('heading', { level: 1 });
    expect(await seccion('Resolución administrativa').findByText('Sin administrador registrado')).toBeInTheDocument();
  });

  it('pendiente en un proyecto cerrado: sigue pendiente, pero las acciones se bloquean con su explicación', async () => {
    (getAdminAppeal as any).mockResolvedValue(
      apelacion({ proyecto: { idProyecto: 37, tituloProyecto: 'Tutorías entre pares', estadoProyecto: 'CERRADO' } }),
    );
    renderReview();

    await screen.findByRole('heading', { level: 1 });
    const resolucion = seccion('Resolución administrativa');
    expect(await resolucion.findByRole('button', { name: 'Aceptar y transferir' })).toBeDisabled();
    expect(resolucion.getByRole('button', { name: 'Denegar' })).toBeDisabled();
    expect(resolucion.getByText(/no puede resolverse mientras el proyecto no esté publicado o en progreso/)).toBeInTheDocument();
    expect(seccion('Validación y selección').getByText(/solo se resuelven con el proyecto\s+publicado o en progreso/)).toBeInTheDocument();
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0);
    expect(getLeadershipCandidates).not.toHaveBeenCalled();
    expect(acceptAppeal).not.toHaveBeenCalled();
    expect(denyAppeal).not.toHaveBeenCalled();
  });
});
