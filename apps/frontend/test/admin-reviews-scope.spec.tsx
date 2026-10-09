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
        proyecto: { tituloProyecto: 'App de Biblioteca', tipoProyecto: 'ACADEMICO_HORAS_BECA', creadoPor: 3, creador: { nombre: 'Ana', apellido: 'López' } },
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

describe('VIEW-05 — bandeja de solicitudes de publicación (F017)', () => {
  it('se llama «Solicitudes de publicación» y describe su propósito', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Solicitudes de publicación' })).toBeInTheDocument();
    expect(
      screen.getByText('Evalúa los proyectos enviados por estudiantes, aprueba su publicación o solicita correcciones.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent('Solicitudes de publicación');
  });

  it('no muestra nada de CIERRES aunque el endpoint los devuelva: ni KPI, ni sección, ni enlaces', async () => {
    renderPage();
    expect(await screen.findByText('App de Biblioteca')).toBeInTheDocument();

    expect(screen.queryByText('Sistema de Tutorías Académicas UVG')).not.toBeInTheDocument();
    expect(screen.queryByText(/cierre/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /cierre/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rechazar/ })).not.toBeInTheDocument();
  });

  it('separa primer envío, reenviadas y en espera de correcciones, con sus contadores', async () => {
    (getAdminReviewInbox as any).mockResolvedValue(
      inbox({
        revisionesPendientes: [
          ...inbox().revisionesPendientes,
          {
            idRevisionProyecto: 11,
            idProyecto: 42,
            numeroEnvio: 2,
            enviadaEn: '2026-08-02T12:00:00.000Z',
            idRevisor: null,
            proyecto: { tituloProyecto: 'Huerto Comunitario', tipoProyecto: 'EXTRACURRICULAR_EXTENSION', creadoPor: 4, creador: { nombre: 'Luis', apellido: 'Paz' } },
          },
        ],
        correccionesEnviadas: [
          {
            idProyecto: 43,
            tituloProyecto: 'Feria de Ciencias',
            tipoProyecto: 'ACADEMICO_EXPERIENCIA',
            creador: { nombre: 'Eva', apellido: 'Ruiz' },
            revisiones: [{ idRevisionProyecto: 12, numeroEnvio: 1, revisadaEn: '2026-08-03T12:00:00.000Z' }],
          },
        ] as Inbox['correccionesEnviadas'],
      }),
    );
    renderPage();
    await screen.findByText('App de Biblioteca');

    const seccion = (nombre: string) => screen.getByRole('heading', { level: 2, name: nombre }).closest('section')!;
    expect(within(seccion('Pendientes de revisión')).getByText('App de Biblioteca')).toBeInTheDocument();
    // Cada tarjeta lleva el icono del tipo de proyecto, como en «Mis Horas».
    for (const nombre of ['Pendientes de revisión', 'Reenviadas para revisión', 'En espera de correcciones']) {
      expect(seccion(nombre).querySelectorAll('[data-slot="icono-tipo"]')).toHaveLength(1);
    }
    expect(within(seccion('Pendientes de revisión')).queryByText('Huerto Comunitario')).not.toBeInTheDocument();

    // Reenviada: ya corregida, vuelve a ser accionable por el administrador.
    const reenviadas = within(seccion('Reenviadas para revisión'));
    expect(reenviadas.getByText('Huerto Comunitario')).toBeInTheDocument();
    expect(reenviadas.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument();
    expect(reenviadas.getByRole('button', { name: 'Revisar' })).toBeInTheDocument();

    // En espera: le toca al estudiante; el administrador solo consulta.
    const espera = within(seccion('En espera de correcciones'));
    expect(espera.getByText('Feria de Ciencias')).toBeInTheDocument();
    expect(espera.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
    expect(espera.getByRole('button', { name: 'Ver retroalimentación' })).toBeInTheDocument();
    // Ya no hay chip de estado: la sección dice que se espera la corrección.
    expect(screen.queryByText('Esperando corrección')).not.toBeInTheDocument();
    // Los botones van sin icono, con el botón compacto del panel.
    for (const boton of screen.getAllByRole('button', { name: /^(Aprobar|Revisar|Ver retroalimentación)$/ })) {
      expect(boton.querySelector('svg')).toBeNull();
      expect(boton).toHaveAttribute('data-slot', 'button');
    }

    for (const [etiqueta, valor] of [
      ['Pendientes de revisión', '1'],
      ['Reenviadas para revisión', '1'],
      ['En espera de correcciones', '1'],
    ]) {
      const kpi = screen.getAllByText(etiqueta).find((el) => el.tagName === 'P')!.parentElement!;
      expect(within(kpi).getByText(valor)).toBeInTheDocument();
    }
    expect(screen.queryByText('Correcciones enviadas')).not.toBeInTheDocument();
  });

  it('cada tarjeta muestra la categoría real del proyecto, el líder y el envío; sin etiquetas de estado redundantes', async () => {
    (getAdminReviewInbox as any).mockResolvedValue(
      inbox({
        correccionesEnviadas: [
          {
            idProyecto: 43,
            tituloProyecto: 'Feria de Ciencias',
            tipoProyecto: 'ACADEMICO_EXPERIENCIA',
            creador: { nombre: 'Eva', apellido: 'Ruiz' },
            // Mediodía de Guatemala: el día no cambia en ningún huso.
            revisiones: [{ idRevisionProyecto: 12, numeroEnvio: 1, revisadaEn: '2026-08-03T18:00:00.000Z' }],
          },
        ] as Inbox['correccionesEnviadas'],
      }),
    );
    renderPage();
    await screen.findByText('App de Biblioteca');
    const seccion = (nombre: string) => within(screen.getByRole('heading', { level: 2, name: nombre }).closest('section')!);

    // Misma etiqueta de categoría que las vistas de estudiante (clase y texto).
    const beca = seccion('Pendientes de revisión').getByText('Horas Beca');
    expect(beca).toHaveClass('rounded-[7px]');
    expect(beca.className).toContain('bg-[#E4EFE4]');
    expect(seccion('Pendientes de revisión').getByText(/Líder: Ana López · Envío #1 · Recibida el 1 ago 2026/)).toBeInTheDocument();

    const espera = seccion('En espera de correcciones');
    expect(espera.getByText('Experiencia').className).toContain('bg-[#DFEBFF]');
    expect(espera.getByText(/Líder: Eva Ruiz · Envío #1 · Revisado el 3 ago 2026/)).toBeInTheDocument();
    expect(espera.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();

    for (const redundante of ['Publicado', 'En revisión', 'Pendiente', 'Líder']) {
      expect(screen.queryByText(redundante)).not.toBeInTheDocument();
    }
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

  it('sin nada pendiente de publicación muestra «Todo al día», aunque haya cierres en el endpoint', async () => {
    (getAdminReviewInbox as any).mockResolvedValue(inbox({ revisionesPendientes: [] }));
    renderPage();
    expect(await screen.findByText('Todo al día')).toBeInTheDocument();
  });
});
