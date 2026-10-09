import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const searchParamsMock = vi.hoisted(() => vi.fn(() => new URLSearchParams('grupo=cierres')));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => searchParamsMock(),
}));
vi.mock('../lib/services/admin-projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/services/admin-projects')>();
  return { ...actual, getAdminProjects: vi.fn(), getAdminProjectDetail: vi.fn() };
});
vi.mock('../lib/services/admin-sprints', () => ({ getAdminSprintCalendar: vi.fn() }));

import AdminProjectsClient from '../app/dashboard/admin/proyectos/admin-projects-client';
import { getAdminProjects } from '../lib/services/admin-projects';
import type {
  AdminProjectClosure,
  AdminProjectListItem,
  AdminProjectsPage,
  ClosureRequestSituation,
} from '../lib/types/admin-projects';

const getProjectsMock = vi.mocked(getAdminProjects);

function solicitud(
  idProyecto: number,
  tituloProyecto: string,
  cierre: Partial<AdminProjectClosure> & { situacion: ClosureRequestSituation },
): AdminProjectListItem {
  return {
    idProyecto,
    tituloProyecto,
    tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
    estadoProyecto: 'EN_SOLICITUD_CIERRE',
    lider: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' },
    usuariosActivos: 8,
    sprintAmbiente: null,
    accion: 'REVISAR_CIERRE',
    cierre: {
      origen: null,
      revisionId: null,
      numeroRevision: null,
      enviadaEn: null,
      correccionSolicitadaEn: null,
      puedeResolver: false,
      ...cierre,
    },
  };
}

/** Una solicitud por etapa. Las fechas son mediodía de Guatemala: no cambian de día en ningún huso. */
const ITEMS = [
  solicitud(57, 'Portal de Voluntariado', {
    situacion: 'PENDIENTE_DE_EVALUACION',
    origen: 'PRIMERA_SOLICITUD',
    revisionId: 501,
    numeroRevision: 1,
    enviadaEn: '2026-10-01T18:00:00.000Z',
    puedeResolver: true,
  }),
  solicitud(63, 'Huerto Comunitario', {
    situacion: 'REENVIADA_PARA_REVISION',
    revisionId: 602,
    numeroRevision: 2,
    enviadaEn: '2026-10-05T18:00:00.000Z',
    correccionSolicitadaEn: '2026-10-03T18:00:00.000Z',
    puedeResolver: true,
  }),
  solicitud(70, 'Feria de Ciencias', {
    situacion: 'EN_ESPERA_DE_CORRECCIONES',
    revisionId: 702,
    numeroRevision: 2,
    correccionSolicitadaEn: '2026-10-04T18:00:00.000Z',
  }),
  solicitud(8, 'Biblioteca Digital', { situacion: 'SIN_ENTREGA_FORMAL' }),
];

function pagina(items: AdminProjectListItem[], resumen: Partial<Record<ClosureRequestSituation, number>> = {}): AdminProjectsPage {
  return {
    items,
    total: items.length,
    page: 1,
    limit: Math.max(items.length, 1),
    resumenCierre: {
      PENDIENTE_DE_EVALUACION: 0,
      REENVIADA_PARA_REVISION: 0,
      EN_ESPERA_DE_CORRECCIONES: 0,
      SIN_ENTREGA_FORMAL: 0,
      SIN_CLASIFICACION: 0,
      ...resumen,
    },
  };
}

const RESUMEN = { PENDIENTE_DE_EVALUACION: 1, REENVIADA_PARA_REVISION: 1, EN_ESPERA_DE_CORRECCIONES: 1, SIN_ENTREGA_FORMAL: 1 };

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
  return { ...render(createElement(AdminProjectsClient), { wrapper }), queryClient };
}

const seccion = (nombre: string) => within(screen.getByRole('heading', { level: 2, name: nombre }).closest('section')!);
const kpi = (nombre: string) => within(screen.getByRole('group', { name: nombre }));

beforeEach(() => {
  searchParamsMock.mockReturnValue(new URLSearchParams('grupo=cierres'));
  getProjectsMock.mockResolvedValue(pagina(ITEMS, RESUMEN));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Solicitudes de cierre — bandeja por etapas', () => {
  it('se presenta como bandeja de evaluación, sin la tabla genérica ni sus columnas', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Solicitudes de cierre' })).toBeInTheDocument();
    expect(
      screen.getByText('Evalúa las solicitudes de cierre de proyectos, verifica sus requisitos y gestiona su resolución.'),
    ).toBeInTheDocument();
    await screen.findByText('Portal de Voluntariado');

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    for (const columna of ['Usuarios activos', 'Sprint ambiente', 'Acción sugerida']) {
      expect(screen.queryByText(columna)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/Total de solicitudes de cierre/)).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).not.toBeInTheDocument();
  });

  it('pide el grupo completo: page y limit de la URL no recortan la bandeja', async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('grupo=cierres&page=4&limit=5'));
    renderPage();
    await screen.findByText('Portal de Voluntariado');

    expect(getProjectsMock).toHaveBeenCalledTimes(1);
    expect(getProjectsMock).toHaveBeenCalledWith({ grupo: 'cierres', page: 1, limit: 20 });
  });

  it('los cuatro indicadores muestran los conteos globales del backend, no lo que hay pintado', async () => {
    getProjectsMock.mockResolvedValue(
      pagina(ITEMS, { PENDIENTE_DE_EVALUACION: 10, REENVIADA_PARA_REVISION: 8, EN_ESPERA_DE_CORRECCIONES: 7, SIN_ENTREGA_FORMAL: 5 }),
    );
    renderPage();
    await screen.findByText('Portal de Voluntariado');

    expect(kpi('Pendientes de evaluación').getByText('10')).toBeInTheDocument();
    expect(kpi('Reenviadas para revisión').getByText('8')).toBeInTheDocument();
    expect(kpi('En espera de correcciones').getByText('7')).toBeInTheDocument();
    expect(kpi('Sin entrega formal').getByText('5')).toBeInTheDocument();
  });

  it('cada solicitud aparece una sola vez y en la sección de su etapa', async () => {
    renderPage();
    await screen.findByText('Portal de Voluntariado');

    expect(seccion('Pendientes de evaluación').getByText('Portal de Voluntariado')).toBeInTheDocument();
    expect(seccion('Reenviadas para revisión').getByText('Huerto Comunitario')).toBeInTheDocument();
    expect(seccion('En espera de correcciones').getByText('Feria de Ciencias')).toBeInTheDocument();
    expect(seccion('Sin entrega formal').getByText('Biblioteca Digital')).toBeInTheDocument();
    for (const titulo of ['Portal de Voluntariado', 'Huerto Comunitario', 'Feria de Ciencias', 'Biblioteca Digital']) {
      expect(screen.getAllByText(titulo)).toHaveLength(1);
    }
    // Cada tarjeta lleva el icono del tipo de proyecto, como en «Mis Horas».
    expect(document.querySelectorAll('[data-slot="icono-tipo"]')).toHaveLength(4);
    // …y la categoría real con la etiqueta de las vistas de estudiante.
    const categorias = screen.getAllByText('Extensión');
    expect(categorias).toHaveLength(4);
    for (const etiqueta of categorias) expect(etiqueta).toHaveClass('pill');
    // Las acciones son el botón compacto del panel, sin icono.
    for (const accion of screen.getAllByRole('link', { name: /^(Revisar cierre|Ver solicitud|Ver proyecto): / })) {
      expect(accion).toHaveAttribute('data-slot', 'button');
      expect(accion.querySelector('svg')).toBeNull();
    }
  });

  it('muestra responsable, número de envío y fechas reales; un legacy no recibe envío ni fecha inventados', async () => {
    renderPage();
    await screen.findByText('Portal de Voluntariado');

    expect(seccion('Pendientes de evaluación').getByText(/Líder: Valeria Ortiz · Envío #1 · Recibida el 1 oct 2026/)).toBeInTheDocument();
    const reenviada = seccion('Reenviadas para revisión');
    expect(reenviada.getByText(/Envío #2 · Recibida el 5 oct 2026 · Corrección solicitada el 3 oct 2026/)).toBeInTheDocument();
    expect(seccion('En espera de correcciones').getByText(/Líder: Valeria Ortiz · Corrección solicitada el 4 oct 2026/)).toBeInTheDocument();

    const legacy = seccion('Sin entrega formal');
    expect(legacy.getByText('Líder: Valeria Ortiz · Sin entrega formal registrada')).toBeInTheDocument();
    expect(legacy.queryByText(/Envío #/)).not.toBeInTheDocument();
    expect(legacy.queryByText(/2026/)).not.toBeInTheDocument();
  });

  it('una solicitud nueva tras una devolución se anuncia como tal dentro de Pendientes', async () => {
    getProjectsMock.mockResolvedValue(
      pagina(
        [solicitud(90, 'Laboratorio Móvil', { situacion: 'PENDIENTE_DE_EVALUACION', origen: 'NUEVA_SOLICITUD_TRAS_DEVOLUCION', revisionId: 9, numeroRevision: 2, enviadaEn: '2026-10-06T18:00:00.000Z', puedeResolver: true })],
        { PENDIENTE_DE_EVALUACION: 1 },
      ),
    );
    renderPage();
    await screen.findByText('Laboratorio Móvil');

    const pendientes = seccion('Pendientes de evaluación');
    expect(pendientes.getByText(/Envío #2/)).toBeInTheDocument();
    expect(pendientes.getByText(/Nueva solicitud tras una devolución a ejecución/)).toBeInTheDocument();
    expect(screen.getByText('No hay solicitudes reenviadas para revisión.')).toBeInTheDocument();
  });

  it('la acción depende de la etapa y siempre abre un detalle: nunca resuelve desde la bandeja', async () => {
    renderPage();
    await screen.findByText('Portal de Voluntariado');

    expect(screen.getByRole('link', { name: 'Revisar cierre: Portal de Voluntariado' })).toHaveAttribute('href', '/dashboard/admin/proyectos/57/cierre');
    expect(screen.getByRole('link', { name: 'Revisar cierre: Huerto Comunitario' })).toHaveAttribute('href', '/dashboard/admin/proyectos/63/cierre');
    expect(screen.getByRole('link', { name: 'Ver solicitud: Feria de Ciencias' })).toHaveAttribute('href', '/dashboard/admin/proyectos/70/cierre');
    expect(screen.getByRole('link', { name: 'Ver proyecto: Biblioteca Digital' })).toHaveAttribute('href', '/dashboard/admin/proyectos/8');
    // «Ver proyecto» es el botón oscuro por defecto del panel, no el verde de decisión ni el de consulta.
    const verProyecto = screen.getByRole('link', { name: 'Ver proyecto: Biblioteca Digital' });
    expect(verProyecto).toHaveClass('bg-action', 'text-on-action');
    expect(verProyecto).not.toHaveClass('bg-primary');
    expect(verProyecto).not.toHaveClass('bg-consult');
    expect(screen.getByRole('link', { name: 'Ver solicitud: Feria de Ciencias' })).toHaveClass('bg-consult');
    expect(screen.getByRole('link', { name: 'Revisar cierre: Portal de Voluntariado' })).toHaveClass('bg-primary');

    expect(seccion('En espera de correcciones').queryByRole('link', { name: /Revisar cierre/ })).not.toBeInTheDocument();
    expect(seccion('Sin entrega formal').queryByRole('link', { name: /Revisar cierre|Ver solicitud/ })).not.toBeInTheDocument();
    // La página no tiene ningún botón: ni aprobar, ni corregir, ni devolver
    // («Actualizar» vive en la barra superior del panel).
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(screen.queryByText(/Aprobar|Devolver a ejecución|Solicitar corrección/)).not.toBeInTheDocument();
  });

  it('cada etapa sin solicitudes lo dice con un vacío compacto', async () => {
    getProjectsMock.mockResolvedValue(pagina([ITEMS[0]], { PENDIENTE_DE_EVALUACION: 1 }));
    renderPage();
    await screen.findByText('Portal de Voluntariado');

    expect(screen.getByText('No hay solicitudes reenviadas para revisión.')).toBeInTheDocument();
    expect(screen.getByText('No hay solicitudes esperando correcciones.')).toBeInTheDocument();
    expect(screen.getByText('No hay proyectos sin entrega formal.')).toBeInTheDocument();
    expect(screen.queryByText('No hay solicitudes pendientes de evaluación.')).not.toBeInTheDocument();
  });

  it('un historial inconsistente se avisa y se muestra aparte, solo para consulta', async () => {
    getProjectsMock.mockResolvedValue(
      pagina([ITEMS[0], solicitud(64, 'Proyecto Anómalo', { situacion: 'SIN_CLASIFICACION' })], { PENDIENTE_DE_EVALUACION: 1, SIN_CLASIFICACION: 1 }),
    );
    renderPage();
    await screen.findByText('Portal de Voluntariado');

    expect(screen.getByRole('alert')).toHaveTextContent('1 solicitud tiene un historial de cierre inconsistente');
    const aparte = seccion('Sin clasificar');
    expect(aparte.getByText('Proyecto Anómalo')).toBeInTheDocument();
    expect(aparte.getByRole('link', { name: 'Ver proyecto: Proyecto Anómalo' })).toHaveAttribute('href', '/dashboard/admin/proyectos/64');
    expect(seccion('Pendientes de evaluación').queryByText('Proyecto Anómalo')).not.toBeInTheDocument();
  });

  it('sin datos inconsistentes no hay aviso ni sección «Sin clasificar»', async () => {
    renderPage();
    await screen.findByText('Portal de Voluntariado');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sin clasificar' })).not.toBeInTheDocument();
  });

  it('el «Actualizar» de la barra superior (invalidar consultas) vuelve a pedir la bandeja', async () => {
    const { queryClient } = renderPage();
    await screen.findByText('Portal de Voluntariado');
    expect(getProjectsMock).toHaveBeenCalledTimes(1);

    await queryClient.invalidateQueries();
    await waitFor(() => expect(getProjectsMock).toHaveBeenCalledTimes(2));
  });

  it('mientras carga muestra el esqueleto y no pinta secciones vacías', () => {
    getProjectsMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByLabelText('Cargando proyectos')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });

  it('sin ninguna solicitud muestra un único vacío, no cuatro secciones vacías', async () => {
    getProjectsMock.mockResolvedValue(pagina([]));
    renderPage();

    expect(await screen.findByText('No hay solicitudes de cierre pendientes.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('si la carga falla avisa y permite reintentar', async () => {
    getProjectsMock.mockRejectedValueOnce(new Error('fallo'));
    renderPage();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    getProjectsMock.mockResolvedValue(pagina(ITEMS, RESUMEN));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Portal de Voluntariado')).toBeInTheDocument();
  });
});
