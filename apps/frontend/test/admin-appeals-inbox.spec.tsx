import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const push = vi.fn();
const searchParamsMock = vi.hoisted(() => vi.fn(() => new URLSearchParams()));
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock(),
  useRouter: () => ({ replace: vi.fn(), push }),
}));
vi.mock('../lib/services/leadership', () => ({
  getAdminAppeals: vi.fn(),
  getAdminAppealsSummary: vi.fn(),
  getAdminAppeal: vi.fn(),
  getLeadershipCandidates: vi.fn(),
  acceptAppeal: vi.fn(),
  denyAppeal: vi.fn(),
}));

import AppealsInboxClient from '../app/dashboard/admin/apelaciones/appeals-inbox-client';
import { acceptAppeal, denyAppeal, getAdminAppeals, getAdminAppealsSummary, getLeadershipCandidates } from '../lib/services/leadership';
import type { ApelacionItemDto } from '../lib/types/leadership';

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

function renderInbox() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
  return render(createElement(AppealsInboxClient), { wrapper });
}

const pestanas = () => screen.getByRole('navigation', { name: 'Filtrar por estado' });

beforeEach(() => {
  searchParamsMock.mockReturnValue(new URLSearchParams());
  (getAdminAppeals as any).mockResolvedValue({ items: [apelacion()], total: 1, page: 1, limit: 20 });
  (getAdminAppealsSummary as any).mockResolvedValue({ PENDIENTE: 1, ACEPTADA: 4, DENEGADA: 2, CANCELADA: 0, TODAS: 7 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VIEW-18 — bandeja de apelaciones: pestañas', () => {
  it('Pendientes es la pestaña predeterminada: pide ese estado y no mezcla las resueltas', async () => {
    renderInbox();

    await waitFor(() => expect(getAdminAppeals).toHaveBeenCalledWith({ estado: 'PENDIENTE', page: 1 }));
    expect(within(pestanas()).getByRole('link', { name: /Pendientes/ })).toHaveAttribute('aria-current', 'page');
    expect(within(pestanas()).getByRole('link', { name: /Todas/ })).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('las cinco pestañas muestran su cantidad y enlazan a su estado', async () => {
    renderInbox();

    const nav = pestanas();
    await waitFor(() => expect(within(nav).getByRole('link', { name: /Aceptadas/ })).toHaveTextContent('4'));
    const esperado: Array<[RegExp, string, string]> = [
      [/Pendientes/, '1', '/dashboard/admin/apelaciones'],
      [/Aceptadas/, '4', '/dashboard/admin/apelaciones?estado=ACEPTADA'],
      [/Denegadas/, '2', '/dashboard/admin/apelaciones?estado=DENEGADA'],
      [/Canceladas/, '0', '/dashboard/admin/apelaciones?estado=CANCELADA'],
      [/Todas/, '7', '/dashboard/admin/apelaciones?estado=TODAS'],
    ];
    expect(within(nav).getAllByRole('link')).toHaveLength(5);
    for (const [nombre, cantidad, href] of esperado) {
      const enlace = within(nav).getByRole('link', { name: nombre });
      expect(enlace).toHaveTextContent(cantidad);
      expect(enlace).toHaveAttribute('href', href);
    }
  });

  it('«Todas» no envía estado; una pestaña de historial pide su estado', async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('estado=TODAS'));
    const { unmount } = renderInbox();
    await waitFor(() => expect(getAdminAppeals).toHaveBeenCalledWith({ estado: undefined, page: 1 }));
    unmount();

    searchParamsMock.mockReturnValue(new URLSearchParams('estado=DENEGADA&page=2'));
    renderInbox();
    await waitFor(() => expect(getAdminAppeals).toHaveBeenCalledWith({ estado: 'DENEGADA', page: 2 }));
    expect(within(pestanas()).getByRole('link', { name: /Denegadas/ })).toHaveAttribute('aria-current', 'page');
  });

  it('un estado desconocido en la URL cae en Pendientes', async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('estado=LOQUESEA'));
    renderInbox();
    await waitFor(() => expect(getAdminAppeals).toHaveBeenCalledWith({ estado: 'PENDIENTE', page: 1 }));
  });
});

describe('VIEW-18 — bandeja de apelaciones: tabla', () => {
  it('muestra asunto, proyecto, solicitante, candidato, fecha y estado, en el orden que entrega el backend', async () => {
    (getAdminAppeals as any).mockResolvedValue({
      items: [apelacion({ idApelacion: 9, asunto: 'La más reciente' }), apelacion({ idApelacion: 7, asunto: 'La anterior' })],
      total: 2,
      page: 1,
      limit: 20,
    });
    renderInbox();

    await screen.findByText('La más reciente');
    const filas = screen.getAllByRole('row').slice(1);
    expect(filas.map((f) => f.textContent)).toEqual([expect.stringContaining('La más reciente'), expect.stringContaining('La anterior')]);
    const primera = within(filas[0]);
    expect(primera.getByRole('link', { name: 'Tutorías entre pares' })).toHaveAttribute('href', '/dashboard/admin/proyectos/37');
    expect(primera.getByText('Valeria Ortiz')).toBeInTheDocument();
    expect(primera.getByText('José Ramírez')).toBeInTheDocument();
    expect(primera.getAllByText(/1 ago 2026/).length).toBeGreaterThan(0);
    expect(primera.getAllByText('Pendiente').length).toBeGreaterThan(0);
  });

  it('no hay detalle expandible ni acciones de resolución: «Revisar» navega al detalle', async () => {
    renderInbox();

    const enlace = await screen.findByRole('link', { name: /Revisar: apelación #7/ });
    expect(enlace).toHaveAttribute('href', '/dashboard/admin/apelaciones/7');
    expect(screen.queryByRole('button', { name: /Revisar apelación/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar y transferir' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Denegar' })).not.toBeInTheDocument();
    expect(screen.queryByText('Mensaje completo de la apelación con el detalle.')).not.toBeInTheDocument();
    expect(getLeadershipCandidates).not.toHaveBeenCalled();
    expect(acceptAppeal).not.toHaveBeenCalled();
    expect(denyAppeal).not.toHaveBeenCalled();
  });

  it('una resuelta ofrece «Ver resolución», se fecha por su resolución y el enlace conserva pestaña y página', async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('estado=DENEGADA&page=2'));
    (getAdminAppeals as any).mockResolvedValue({
      items: [apelacion({ estadoApelacion: 'DENEGADA', resueltaEn: '2026-08-05T12:00:00.000Z' })],
      total: 21,
      page: 2,
      limit: 20,
    });
    renderInbox();

    const enlace = await screen.findByRole('link', { name: /Ver resolución: apelación #7/ });
    expect(enlace).toHaveAttribute('href', '/dashboard/admin/apelaciones/7?estado=DENEGADA&page=2');
    expect(screen.getByRole('columnheader', { name: 'Resuelta' })).toBeInTheDocument();
    expect(screen.getAllByText(/5 ago 2026/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/1 ago 2026/)).not.toBeInTheDocument();
  });

  it('el buscador filtra la página cargada por proyecto, asunto, solicitante o candidato', async () => {
    renderInbox();
    await screen.findByText('Cambio de liderazgo por carga académica');
    const buscador = screen.getByRole('textbox', { name: /Buscar apelaciones/ });

    for (const texto of ['tutorías', 'carga académica', 'valeria', 'ramírez']) {
      fireEvent.change(buscador, { target: { value: texto } });
      expect(screen.getByText('Cambio de liderazgo por carga académica')).toBeInTheDocument();
    }

    fireEvent.change(buscador, { target: { value: 'no existe' } });
    expect(screen.queryByText('Cambio de liderazgo por carga académica')).not.toBeInTheDocument();
    expect(screen.getByText(/No encontramos apelaciones que coincidan/)).toBeInTheDocument();
  });

  it('la paginación es del backend: el paginador cambia `?page=` conservando la pestaña', async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('estado=ACEPTADA'));
    (getAdminAppeals as any).mockResolvedValue({ items: [apelacion({ estadoApelacion: 'ACEPTADA' })], total: 45, page: 1, limit: 20 });
    renderInbox();

    await screen.findByText('Cambio de liderazgo por carga académica');
    expect(screen.getByText(/página 1 de 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(push).toHaveBeenCalledWith('/dashboard/admin/apelaciones?estado=ACEPTADA&page=2');
  });
});

describe('VIEW-18 — bandeja de apelaciones: estados', () => {
  it('sin pendientes lo dice y remite al historial', async () => {
    (getAdminAppeals as any).mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    renderInbox();
    expect(await screen.findByText('No hay apelaciones pendientes.')).toBeInTheDocument();
    expect(screen.getByText(/Las ya resueltas están en las demás pestañas/)).toBeInTheDocument();
  });

  it('un error de carga se muestra como alerta con «Reintentar»', async () => {
    (getAdminAppeals as any).mockRejectedValue(new Error('fallo'));
    renderInbox();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('si los contadores fallan, las pestañas siguen funcionando sin cifra', async () => {
    (getAdminAppealsSummary as any).mockRejectedValue(new Error('fallo'));
    renderInbox();
    await screen.findByText('Cambio de liderazgo por carga académica');
    expect(within(pestanas()).getAllByRole('link')).toHaveLength(5);
  });
});
