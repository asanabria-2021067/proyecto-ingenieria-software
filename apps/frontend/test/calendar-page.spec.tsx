import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mensajesMock = vi.hoisted(() => ({
  confirmar: vi.fn(),
  aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() },
}));
vi.mock('../lib/mensajes', () => mensajesMock);

const usersMock = vi.hoisted(() => ({ getMisTareas: vi.fn(), getDashboardStats: vi.fn(), getMe: vi.fn() }));
vi.mock('../lib/services/users', () => usersMock);

const projectsMock = vi.hoisted(() => ({ getMyProjects: vi.fn() }));
vi.mock('../lib/services/projects', () => projectsMock);

const eventsMock = vi.hoisted(() => ({ getMisEventos: vi.fn(), createEvent: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn() }));
vi.mock('../lib/services/events', () => eventsMock);

const sharesMock = vi.hoisted(() => ({
  getCalendariosCompartidos: vi.fn(),
  compartirCalendario: vi.fn(),
  dejarDeCompartirCalendario: vi.fn(),
  dejarDeRecibirCalendario: vi.fn(),
  getAgendaCompartida: vi.fn(),
}));
vi.mock('../lib/services/calendar-shares', () => sharesMock);

const navigationMock = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(''),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigationMock.replace, push: navigationMock.push }),
  usePathname: () => '/dashboard/calendario',
  useSearchParams: () => navigationMock.searchParams,
}));

vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 1, nombre: 'Carlos', apellido: 'Mendoza', fotoUrl: null, roles: [] } }),
}));
vi.mock('../hooks/use-project-members', () => ({ useProjectMembers: () => ({ members: [], isLoading: false }) }));
// El mapa (leaflet) no se necesita en la página: el diálogo monta un hueco.
vi.mock('next/dynamic', () => ({ default: () => () => null }));

import CalendarioPage from '../app/dashboard/calendario/page';
import type { MiEventoDTO } from '../lib/services/events';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

/** Viernes 9 de octubre de 2026, 10:20 (America/Guatemala en las pruebas). */
const HOY = new Date(2026, 9, 9, 10, 20);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(HOY);
  usersMock.getMisTareas.mockResolvedValue([]);
  usersMock.getDashboardStats.mockResolvedValue({ horasBeca: 0, horasBecaRequeridas: null, horasExtension: 0, horasExtensionRequeridas: null });
  projectsMock.getMyProjects.mockResolvedValue([]);
  eventsMock.getMisEventos.mockResolvedValue([]);
  sharesMock.getCalendariosCompartidos.mockResolvedValue({ compartidoPorMi: [], compartidosConmigo: [] });
  navigationMock.searchParams = new URLSearchParams('');
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function eventoDTO(overrides: Partial<MiEventoDTO> = {}): MiEventoDTO {
  return {
    idEvento: 7,
    idProyecto: 1,
    tituloEvento: 'Reunión semanal',
    descripcionEvento: null,
    fechaInicio: new Date(2026, 9, 9, 9, 0).toISOString(),
    fechaFin: new Date(2026, 9, 9, 10, 0).toISOString(),
    antelacionMinutos: 60,
    modalidad: 'VIRTUAL',
    ubicacionLat: null,
    ubicacionLng: null,
    ubicacionNombre: null,
    linkSesion: 'https://meet.google.com/abc',
    rolesDestino: [],
    tipoEvento: 'REUNION',
    invitados: [],
    proyecto: { idProyecto: 1, tituloProyecto: 'Proyecto Uno' },
    ...overrides,
  };
}

async function renderPage() {
  render(<CalendarioPage />, { wrapper });
  await waitFor(() => expect(screen.queryByText('Cargando tu calendario...')).not.toBeInTheDocument());
}

const vista = (nombre: string) => screen.getByRole('radio', { name: nombre });
const boton = (nombre: string) => screen.getByRole('button', { name: nombre });
/** Etiqueta del periodo de la barra (el mini calendario repite el nombre del mes). */
const etiquetaPeriodo = () => document.querySelector('[aria-live="polite"].type-subtitle') as HTMLElement;
const celdaMes = (dia: number, mes: string) => screen.getByRole('button', { name: new RegExp(`, ${dia} de ${mes},`) });

describe('CalendarioPage — selección obsoleta al navegar (G03-C05, UI-17)', () => {
  it('elegir el 9 de octubre en Mes y pasar a noviembre deja de filtrar por ese día (lista del mes completa, no "Nada programado ese día")', async () => {
    // La cuadrícula de noviembre empieza el lunes 26 de octubre: se responde según el rango completo.
    eventsMock.getMisEventos.mockImplementation(async (_desde: Date, hasta: Date) =>
      hasta.getTime() <= new Date(2026, 10, 12).getTime() ? [] : [eventoDTO({ idEvento: 11, tituloEvento: 'Entrega de noviembre', fechaInicio: new Date(2026, 10, 12, 9, 0).toISOString(), fechaFin: new Date(2026, 10, 12, 10, 0).toISOString() })],
    );
    await renderPage();
    fireEvent.click(vista('Mes'));
    fireEvent.click(celdaMes(9, 'octubre'));
    expect(await screen.findByText('Nada programado ese día')).toBeInTheDocument();
    expect(boton('Ver todas las fechas')).toBeInTheDocument();

    fireEvent.click(boton('Siguiente'));
    expect(etiquetaPeriodo()).toHaveTextContent('Noviembre 2026');
    expect(screen.queryByText('Nada programado ese día')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver todas las fechas' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Entrega de noviembre/ })).toBeInTheDocument();
    expect(celdaMes(12, 'noviembre')).toHaveAttribute('aria-pressed', 'false');
  });

  it('"Anterior" y "Hoy" también limpian un día que queda fuera del periodo; "Hoy" dentro del mismo mes lo conserva', async () => {
    await renderPage();
    fireEvent.click(vista('Mes'));
    fireEvent.click(celdaMes(20, 'octubre'));
    expect(celdaMes(20, 'octubre')).toHaveAttribute('aria-pressed', 'true');

    // Mismo periodo: la selección se mantiene.
    fireEvent.click(boton('Hoy'));
    expect(celdaMes(20, 'octubre')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(boton('Anterior'));
    expect(etiquetaPeriodo()).toHaveTextContent('Septiembre 2026');
    expect(await screen.findByText('Sin actividad en este rango')).toBeInTheDocument();

    fireEvent.click(boton('Hoy'));
    expect(etiquetaPeriodo()).toHaveTextContent('Octubre 2026');
    expect(celdaMes(20, 'octubre')).toHaveAttribute('aria-pressed', 'false');
    expect(await screen.findByText('Sin actividad en este rango')).toBeInTheDocument();
  });

  it('abrir y cerrar el diálogo de nuevo evento o usar el filtro no borra el día elegido', async () => {
    projectsMock.getMyProjects.mockResolvedValue([{ idProyecto: 1, tituloProyecto: 'Proyecto Uno', tipoProyecto: 'BECA', estadoProyecto: 'ACTIVO' }]);
    await renderPage();
    fireEvent.click(vista('Mes'));
    fireEvent.click(celdaMes(20, 'octubre'));

    fireEvent.click(await screen.findByRole('button', { name: 'Agendar actividad' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(celdaMes(20, 'octubre')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /Todos los eventos/ }));
    expect(celdaMes(20, 'octubre')).toHaveAttribute('aria-pressed', 'true');
  });
});
