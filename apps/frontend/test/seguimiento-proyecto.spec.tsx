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

vi.mock('../lib/services/seguimiento', () => ({
  getSeguimientoProyecto: vi.fn(),
  getResultadosProyecto: vi.fn(),
  getPortafolioOrganizacion: vi.fn(),
  getPortafolioAsociacion: vi.fn(),
  getReconocimientosSprint: vi.fn(),
  createReconocimiento: vi.fn(),
  getRetrospectivaSprint: vi.fn(),
  saveRetrospectivaSprint: vi.fn(),
  fetchSprintReportCsv: vi.fn(),
  fetchSprintReportPdf: vi.fn(),
}));
vi.mock('../hooks/use-project-detail', () => ({
  useProjectDetail: () => ({ data: { creador: { idUsuario: 1, nombre: 'Lidia', apellido: 'Lider' } } }),
}));
vi.mock('../hooks/use-project-members', () => ({
  useProjectMembers: () => ({ members: [{ idUsuario: 2, nombre: 'Ana', apellido: 'Paz' }, { idUsuario: 3, nombre: 'Beto', apellido: 'Gil' }] }),
}));
vi.mock('../lib/download-file', () => ({ downloadBlob: vi.fn() }));

import * as api from '../lib/services/seguimiento';
import { downloadBlob } from '../lib/download-file';
import { ProjectHealthCard } from '../components/projects/detail/project-health-card';
import { PortafolioProyectos } from '../components/projects/portafolio-proyectos';
import { ResultadosContenido } from '../components/projects/resultados-contenido';
import {
  SprintReconocimientosEquipo,
  SprintReportButtons,
  SprintRetrospectiva,
  candidatosAReconocer,
} from '../components/projects/sprint-extras';
import { hitoEstaAtrasado } from '../components/projects/hitos-section';
import { getNotificationLink } from '../lib/services/notifications';
import { NOTIFICATION_TYPE_PRESENTATION } from '../lib/notifications/preference-groups';
import type { ResultadosProyectoDTO, SeguimientoProyectoDTO } from '../lib/services/seguimiento';

const mocked = vi.mocked(api);

const AYUDA = { VERDE: 'Todo en orden.', AMARILLO: 'Hay avisos.', ROJO: 'Hay un hito atrasado.' } as const;
const seguimiento = (parcial: Partial<SeguimientoProyectoDTO> = {}): SeguimientoProyectoDTO => ({
  semaforo: { color: 'VERDE', motivos: [], ayuda: { ...AYUDA } },
  hitosAtrasados: [],
  ...parcial,
});

function renderConQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, ui));
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('ProjectHealthCard (MEJ-54/55)', () => {
  it('muestra el semáforo verde y el estado vacío con la acción hacia los hitos', async () => {
    mocked.getSeguimientoProyecto.mockResolvedValue(seguimiento());
    renderConQuery(createElement(ProjectHealthCard, { idProyecto: 7, esLider: true }));
    expect(await screen.findByTestId('semaforo-estado')).toHaveTextContent('En buen camino');
    expect(screen.getByText('Ningún hito está atrasado.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver hitos' })).toHaveAttribute('href', '/dashboard/projects/7/kanban?tab=hitos');
  });

  it('en rojo lista los hitos atrasados con los días y avisa al líder', async () => {
    mocked.getSeguimientoProyecto.mockResolvedValue(
      seguimiento({
        semaforo: { color: 'ROJO', motivos: ['2 hitos atrasados'], ayuda: { ...AYUDA } },
        hitosAtrasados: [
          { idHito: 1, tituloHito: 'Entrega parcial', fechaLimite: '2026-11-05', diasAtraso: 5 },
          { idHito: 2, tituloHito: 'Demo', fechaLimite: '2026-11-09', diasAtraso: 1 },
        ],
      }),
    );
    renderConQuery(createElement(ProjectHealthCard, { idProyecto: 7, esLider: true }));
    expect(await screen.findByTestId('semaforo-estado')).toHaveTextContent('En riesgo');
    const alerta = screen.getByRole('alert');
    expect(within(alerta).getByText('Tienes 2 hitos atrasados')).toBeInTheDocument();
    expect(within(alerta).getByText(/Entrega parcial/)).toBeInTheDocument();
    expect(within(alerta).getByText(/Venció el 05\/11\/2026 \(5 días de atraso\)/)).toBeInTheDocument();
    expect(within(alerta).getByText(/\(1 día de atraso\)/)).toBeInTheDocument();
  });

  it('el integrante que no lidera ve el mismo aviso sin hablarle como líder', async () => {
    mocked.getSeguimientoProyecto.mockResolvedValue(
      seguimiento({
        semaforo: { color: 'ROJO', motivos: ['1 hito atrasado'], ayuda: { ...AYUDA } },
        hitosAtrasados: [{ idHito: 1, tituloHito: 'Entrega', fechaLimite: '2026-11-05', diasAtraso: 5 }],
      }),
    );
    renderConQuery(createElement(ProjectHealthCard, { idProyecto: 7 }));
    expect(await screen.findByText('Hay un hito atrasado')).toBeInTheDocument();
  });

  it('explica cómo se calcula con el texto de ayuda de cada color', async () => {
    mocked.getSeguimientoProyecto.mockResolvedValue(seguimiento());
    renderConQuery(createElement(ProjectHealthCard, { idProyecto: 7 }));
    await screen.findByTestId('semaforo-estado');
    expect(screen.getByText('¿Cómo se calcula el semáforo?')).toBeInTheDocument();
    expect(screen.getByText('Todo en orden.')).toBeInTheDocument();
    expect(screen.getByText('Hay avisos.')).toBeInTheDocument();
    expect(screen.getByText('Hay un hito atrasado.')).toBeInTheDocument();
  });

  it('muestra un esqueleto mientras carga y no se pinta si el backend responde 403', async () => {
    mocked.getSeguimientoProyecto.mockRejectedValue(Object.assign(new Error('forbidden'), { statusCode: 403 }));
    const { container } = renderConQuery(createElement(ProjectHealthCard, { idProyecto: 7 }));
    expect(screen.getByRole('status', { name: 'Cargando la salud del proyecto' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Cargando la salud del proyecto' })).toBeNull());
    expect(container.querySelector('[data-slot="project-health-card"]')).toBeNull();
  });
});

describe('hitoEstaAtrasado (MEJ-54)', () => {
  const hoy = new Date('2026-11-10T12:00:00.000Z');
  it('solo marca hitos sin completar con la fecha ya pasada', () => {
    expect(hitoEstaAtrasado('2026-11-09', 'EN_PROGRESO', hoy)).toBe(true);
    expect(hitoEstaAtrasado('2026-11-10', 'PENDIENTE', hoy)).toBe(false);
    expect(hitoEstaAtrasado('2026-11-01', 'COMPLETADO', hoy)).toBe(false);
    expect(hitoEstaAtrasado(null, 'PENDIENTE', hoy)).toBe(false);
  });
});

describe('PortafolioProyectos (MEJ-56)', () => {
  it('lista los proyectos cerrados con sus cifras y enlaza a los resultados', async () => {
    mocked.getPortafolioOrganizacion.mockResolvedValue([
      { idProyecto: 10, tituloProyecto: 'Feria de Ciencias', tipoProyecto: 'ACADEMICO_HORAS_BECA', fechaInicio: '2026-02-01', fechaCierre: '2026-06-15', integrantes: 5, tareasHechas: 42, horasAcreditadas: 120.5 },
    ]);
    renderConQuery(createElement(PortafolioProyectos, { tipo: 'organizacion', id: 4 }));
    const tarjeta = await screen.findByTestId('portafolio-10');
    expect(within(tarjeta).getByText('Feria de Ciencias')).toBeInTheDocument();
    expect(within(tarjeta).getByText('42')).toBeInTheDocument();
    expect(within(tarjeta).getByText(/120,5 h|120\.5 h/)).toBeInTheDocument();
    expect(within(tarjeta).getByText('01/02/2026 - 15/06/2026')).toBeInTheDocument();
    expect(within(tarjeta).getByRole('link', { name: 'Ver resultados' })).toHaveAttribute('href', '/dashboard/proyectos/10/resultados');
    expect(mocked.getPortafolioAsociacion).not.toHaveBeenCalled();
  });

  it('sin proyectos cerrados explica y ofrece explorar proyectos', async () => {
    mocked.getPortafolioAsociacion.mockResolvedValue([]);
    renderConQuery(createElement(PortafolioProyectos, { tipo: 'asociacion', id: 3 }));
    expect(await screen.findByText('Todavía no hay proyectos cerrados')).toBeInTheDocument();
    expect(screen.getByText(/proyecto de la asociación se cierre/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explorar proyectos' })).toHaveAttribute('href', '/dashboard/proyectos');
  });

  it('ante un error ofrece reintentar', async () => {
    mocked.getPortafolioOrganizacion.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([]);
    renderConQuery(createElement(PortafolioProyectos, { tipo: 'organizacion', id: 4 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Todavía no hay proyectos cerrados')).toBeInTheDocument();
  });
});

describe('ResultadosContenido (MEJ-56)', () => {
  const resultados: ResultadosProyectoDTO = {
    proyecto: {
      idProyecto: 10,
      tituloProyecto: 'Feria de Ciencias',
      descripcionProyecto: 'Feria anual',
      tipoProyecto: 'ACADEMICO_HORAS_BECA',
      fechaInicio: '2026-02-01',
      fechaFinEstimada: '2026-06-01',
      fechaCierre: '2026-06-15',
      lider: { nombre: 'Lidia', apellido: 'Lider' },
      asociacion: { idAsociacion: 3, nombre: 'Asociación de Ingeniería' },
      organizaciones: [{ idOrganizacion: 4, nombreOrganizacion: 'Club de Robótica' }],
    },
    metricas: { integrantes: 5, tareasTotales: 50, tareasHechas: 42, hitosTotales: 4, hitosCompletados: 3, sprintsCerrados: 2, horasAcreditadas: 120.5, reconocimientos: 6 },
    hitos: [
      { idHito: 1, tituloHito: 'Diseño', fechaLimite: '2026-03-01', completado: true },
      { idHito: 2, tituloHito: 'Montaje', fechaLimite: null, completado: false },
    ],
    sprints: [{ numero: 1, tareasPlanificadasCierre: 20, tareasCompletadasCierre: 18, porcentajeCumplimientoCierre: 90 }],
    equipo: [{ idUsuario: 2, nombre: 'Ana', apellido: 'Paz', roles: ['Diseño', 'Logística'], horasAcreditadas: 30 }],
  };

  it('resume métricas, hitos, sprints y equipo', () => {
    render(createElement(ResultadosContenido, { resultados, idProyecto: 10 }));
    expect(screen.getByRole('heading', { level: 1, name: 'Feria de Ciencias' })).toBeInTheDocument();
    expect(screen.getByText('Club de Robótica')).toBeInTheDocument();
    expect(screen.getByText('Asociación de Ingeniería')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Tareas hechas' })).getByText('42 de 50')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Hitos completados' })).getByText('3 de 4')).toBeInTheDocument();
    expect(screen.getByLabelText('Completado')).toBeInTheDocument();
    expect(screen.getByLabelText('Sin completar')).toBeInTheDocument();
    expect(screen.getByText('Sin fecha límite')).toBeInTheDocument();
    expect(screen.getByText('18 de 20')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText('Diseño, Logística')).toBeInTheDocument();
  });

  it('para quien no ve al equipo y sin sprints o hitos muestra estados vacíos explicativos', () => {
    render(createElement(ResultadosContenido, { resultados: { ...resultados, equipo: [], hitos: [], sprints: [] }, idProyecto: 10 }));
    expect(screen.getByText('Este proyecto no definió hitos.')).toBeInTheDocument();
    expect(screen.getByText('No se cerró ningún sprint en este proyecto.')).toBeInTheDocument();
    expect(screen.getByText(/solo la ven quienes participaron/)).toBeInTheDocument();
  });
});

describe('SprintReconocimientos (MEJ-57)', () => {
  const vacio = { reconocimientos: [], yaReconoci: false };
  const SprintReconocimientos = SprintReconocimientosEquipo;

  it('los candidatos son el líder y el equipo, sin repetidos ni uno mismo', () => {
    const lider = { idUsuario: 1, nombre: 'Lidia', apellido: 'Lider', correo: 'l@x.test' };
    const equipo = [
      { idUsuario: 2, nombre: 'Ana', apellido: 'Paz' },
      { idUsuario: 1, nombre: 'Lidia', apellido: 'Lider' },
      { idUsuario: 3, nombre: 'Beto', apellido: 'Gil' },
    ];
    expect(candidatosAReconocer(lider, equipo, 2).map((c) => c.idUsuario)).toEqual([1, 3]);
    expect(candidatosAReconocer(undefined, equipo, null).map((c) => c.idUsuario)).toEqual([2, 1, 3]);
    expect(Object.keys(candidatosAReconocer(lider, [], null)[0])).toEqual(['idUsuario', 'nombre', 'apellido']);
  });

  it('permite elegir compañero (sin uno mismo), exige motivo y envía', async () => {
    mocked.getReconocimientosSprint.mockResolvedValue(vacio);
    mocked.createReconocimiento.mockResolvedValue({});
    renderConQuery(createElement(SprintReconocimientos, { idProyecto: 5, idSprint: 8, estado: 'ACTIVO', idUsuarioActual: 2 }));
    const enviar = await screen.findByRole('button', { name: 'Enviar reconocimiento' });
    expect(enviar).toBeDisabled();

    fireEvent.click(screen.getByRole('combobox', { name: 'Compañero a reconocer' }));
    expect(screen.queryByRole('option', { name: 'Ana Paz' })).toBeNull();
    fireEvent.click(await screen.findByRole('option', { name: 'Beto Gil' }));
    fireEvent.change(screen.getByLabelText('Motivo del reconocimiento'), { target: { value: 'Siempre ayuda' } });
    expect(enviar).toBeEnabled();
    fireEvent.click(enviar);
    await waitFor(() => expect(mocked.createReconocimiento).toHaveBeenCalledWith(5, 8, { idReceptor: 3, mensaje: 'Siempre ayuda' }));
  });

  it('quien ya reconoció solo ve la lista; sin reconocimientos el vacío explica', async () => {
    mocked.getReconocimientosSprint.mockResolvedValue({
      yaReconoci: true,
      reconocimientos: [
        {
          idReconocimiento: 1,
          mensaje: 'Gran apoyo',
          creadoEn: '2026-11-01T10:00:00.000Z',
          autor: { idUsuario: 2, nombre: 'Ana', apellido: 'Paz' },
          receptor: { idUsuario: 3, nombre: 'Beto', apellido: 'Gil' },
        },
      ],
    });
    renderConQuery(createElement(SprintReconocimientos, { idProyecto: 5, idSprint: 8, estado: 'ACTIVO', idUsuarioActual: 2 }));
    expect(await screen.findByText(/Gran apoyo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar reconocimiento' })).toBeNull();
  });

  it('un sprint cerrado sin reconocimientos no ofrece formulario y lo explica', async () => {
    mocked.getReconocimientosSprint.mockResolvedValue(vacio);
    renderConQuery(createElement(SprintReconocimientos, { idProyecto: 5, idSprint: 8, estado: 'CERRADO', idUsuarioActual: 2 }));
    expect(await screen.findByText('El sprint ya cerró, por lo que no se pueden agregar más.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar reconocimiento' })).toBeNull();
  });
});

describe('SprintRetrospectiva (MEJ-24)', () => {
  it('el líder escribe la primera retrospectiva cuando el sprint ya no está activo', async () => {
    mocked.getRetrospectivaSprint.mockResolvedValue(null);
    mocked.saveRetrospectivaSprint.mockResolvedValue({ quePaso: 'Se entregó', quePodriaMejorar: 'Estimar', acuerdos: 'Daily', actualizadaEn: '2026-11-02T10:00:00.000Z' });
    renderConQuery(createElement(SprintRetrospectiva, { idProyecto: 5, idSprint: 8, estado: 'EN_FINALIZACION', esLider: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Escribir retrospectiva' }));
    const guardar = screen.getByRole('button', { name: 'Guardar retrospectiva' });
    expect(guardar).toBeDisabled();
    fireEvent.change(screen.getByLabelText('¿Qué pasó en el sprint?'), { target: { value: 'Se entregó' } });
    fireEvent.change(screen.getByLabelText('¿Qué podría mejorar?'), { target: { value: 'Estimar' } });
    fireEvent.change(screen.getByLabelText('Acuerdos del equipo'), { target: { value: 'Daily' } });
    fireEvent.click(guardar);
    await waitFor(() => expect(mocked.saveRetrospectivaSprint).toHaveBeenCalledWith(5, 8, { quePaso: 'Se entregó', quePodriaMejorar: 'Estimar', acuerdos: 'Daily' }));
    expect(await screen.findByText('Se entregó')).toBeInTheDocument();
  });

  it('con el sprint activo no se escribe y el vacío lo explica', async () => {
    mocked.getRetrospectivaSprint.mockResolvedValue(null);
    renderConQuery(createElement(SprintRetrospectiva, { idProyecto: 5, idSprint: 8, estado: 'ACTIVO', esLider: true }));
    expect(await screen.findByText('Podrás escribirla cuando finalices el sprint.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Escribir retrospectiva' })).toBeNull();
  });

  it('el resto del equipo solo la lee', async () => {
    mocked.getRetrospectivaSprint.mockResolvedValue({ quePaso: 'Bien', quePodriaMejorar: 'Más pruebas', acuerdos: 'Revisar', actualizadaEn: '2026-11-02T10:00:00.000Z' });
    renderConQuery(createElement(SprintRetrospectiva, { idProyecto: 5, idSprint: 8, estado: 'CERRADO', esLider: false }));
    expect(await screen.findByText('Más pruebas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  });
});

describe('SprintReportButtons (MEJ-23)', () => {
  it('descarga el CSV y el PDF del sprint', async () => {
    mocked.fetchSprintReportCsv.mockResolvedValue(new Blob(['a']));
    mocked.fetchSprintReportPdf.mockResolvedValue(new Blob(['b']));
    renderConQuery(createElement(SprintReportButtons, { idProyecto: 5, idSprint: 8 }));
    fireEvent.click(screen.getByRole('button', { name: 'Reporte CSV' }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'reporte-sprint-8.csv'));
    fireEvent.click(screen.getByRole('button', { name: 'Reporte PDF' }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'reporte-sprint-8.pdf'));
    expect(mocked.fetchSprintReportCsv).toHaveBeenCalledWith(5, 8);
  });

  it('si falla muestra un mensaje en lugar de descargar', async () => {
    mocked.fetchSprintReportPdf.mockRejectedValue(new Error('Internal Server Error'));
    renderConQuery(createElement(SprintReportButtons, { idProyecto: 5, idSprint: 8 }));
    fireEvent.click(screen.getByRole('button', { name: 'Reporte PDF' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});

describe('avisos nuevos en el centro de notificaciones', () => {
  it('HITO_ATRASADO abre la pestaña de hitos y RECONOCIMIENTO_RECIBIDO el proyecto', () => {
    expect(getNotificationLink({ tipoNotificacion: 'HITO_ATRASADO', datosJson: { projectId: 7, hitoId: 2 } })).toBe('/dashboard/projects/7/kanban?tab=hitos');
    expect(getNotificationLink({ tipoNotificacion: 'RECONOCIMIENTO_RECIBIDO', datosJson: { projectId: 7 } })).toBe('/dashboard/proyectos/7');
    expect(getNotificationLink({ tipoNotificacion: 'HITO_ATRASADO', datosJson: { projectId: 'abc' } })).toBeNull();
  });

  it('ambos tipos tienen etiqueta y descripción propias en Configuración', () => {
    expect(NOTIFICATION_TYPE_PRESENTATION.HITO_ATRASADO).toMatchObject({ grupo: 'tareas', etiqueta: 'Hito atrasado' });
    expect(NOTIFICATION_TYPE_PRESENTATION.RECONOCIMIENTO_RECIBIDO).toMatchObject({ grupo: 'horas' });
  });
});
