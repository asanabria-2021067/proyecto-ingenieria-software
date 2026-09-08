import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const swalFire = vi.hoisted(() => vi.fn());
vi.mock('../lib/swal', () => ({ default: { fire: swalFire }, swalCustomClass: {} }));
vi.mock('../lib/services/projects', () => ({
  getAdminReviewInbox: vi.fn(),
  resolverRevision: vi.fn(),
}));
vi.mock('../components/admin/ProjectReviewSheet', () => ({
  ProjectReviewSheet: () => null,
}));
vi.mock('../components/admin/ProjectFeedbackSheet', () => ({
  ProjectFeedbackSheet: () => null,
}));

import AdminReviewsInboxPage from '../app/dashboard/projects/admin/reviews/page';
import { getAdminReviewInbox, resolverRevision } from '../lib/services/projects';

type Inbox = Awaited<ReturnType<typeof import('../lib/services/projects').getAdminReviewInbox>>;

function inbox(overrides: Partial<Inbox> = {}): Inbox {
  return {
    revisionesPendientes: [
      {
        idRevisionProyecto: 10,
        idProyecto: 41,
        numeroEnvio: 1,
        enviadaEn: '2026-08-01T12:00:00.000Z',
        idRevisor: null,
        proyecto: { tituloProyecto: 'App de Biblioteca', creadoPor: 3, creador: { nombre: 'Ana', apellido: 'López' } },
      },
    ],
    cierresPendientes: [
      { idProyecto: 123, tituloProyecto: 'Sistema de Tutorías Académicas UVG', creadoPor: 1, fechaActualizacion: '2026-08-12T12:00:00.000Z' },
    ],
    correccionesEnviadas: [],
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
  const utils = render(createElement(AdminReviewsInboxPage), { wrapper });
  return { ...utils, queryClient };
}

beforeEach(() => {
  (getAdminReviewInbox as any).mockResolvedValue(inbox());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VIEW-05 — bandeja de revisiones de publicación (F017)', () => {
  it('no ofrece aprobar ni rechazar CIERRES: los cierres pendientes son solo enlaces a VIEW-15 / VIEW-14', async () => {
    renderPage();
    expect(await screen.findByText('Sistema de Tutorías Académicas UVG')).toBeInTheDocument();

    const seccion = screen.getByRole('heading', { name: 'Solicitudes de cierre' }).closest('section')!;
    expect(within(seccion).queryByRole('button')).not.toBeInTheDocument();
    expect(within(seccion).queryByRole('button', { name: /Aprobar cierre|Rechazar cierre/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rechazar/ })).not.toBeInTheDocument();

    const enlaces = within(seccion).getAllByRole('link', { name: 'Ver en Solicitudes de cierre' });
    expect(enlaces.length).toBeGreaterThan(0);
    for (const enlace of enlaces) expect(enlace).toHaveAttribute('href', '/dashboard/admin/proyectos?grupo=cierres');
    expect(within(seccion).getByRole('link', { name: /Revisar cierre/ })).toHaveAttribute('href', '/dashboard/admin/proyectos/123/cierre');

    expect(screen.getByRole('link', { name: /Cierre pendiente/ })).toHaveAttribute('href', '/dashboard/admin/proyectos?grupo=cierres');
  });

  it('el único «Aprobar» es el de la revisión de PUBLICACIÓN y sigue funcionando invalidando adminReviewInbox', async () => {
    swalFire.mockResolvedValue({ isConfirmed: true });
    (resolverRevision as any).mockResolvedValue({ revision: {}, estadoProyecto: 'PUBLICADO' });
    const { queryClient } = renderPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    expect(await screen.findByText('App de Biblioteca')).toBeInTheDocument();
    const botonesAprobar = screen.getAllByRole('button', { name: 'Aprobar' });
    expect(botonesAprobar).toHaveLength(1);
    fireEvent.click(botonesAprobar[0]);

    await waitFor(() => expect(resolverRevision).toHaveBeenCalledWith(41, { resultado: 'APROBADA' }));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['adminReviewInbox'] }));
  });

  it('409 al resolver una publicación invalida y recarga sin reintentar', async () => {
    swalFire.mockResolvedValue({ isConfirmed: true });
    (resolverRevision as any).mockRejectedValue(Object.assign(new Error('ya resuelta'), { statusCode: 409 }));
    const { queryClient } = renderPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['adminReviewInbox'] }));
    await waitFor(() => expect(swalFire).toHaveBeenCalledWith(expect.objectContaining({ title: 'La revisión ya fue resuelta' })));
    expect(resolverRevision).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getAdminReviewInbox).toHaveBeenCalledTimes(2));
  });

  it('sin cierres pendientes, aclara que los veredictos de cierre no se emiten aquí', async () => {
    (getAdminReviewInbox as any).mockResolvedValue(inbox({ cierresPendientes: [] }));
    renderPage();
    expect(await screen.findByText('No hay cierres pendientes')).toBeInTheDocument();
    expect(screen.getByText('Los veredictos de cierre no se emiten desde esta bandeja.')).toBeInTheDocument();
  });
});
