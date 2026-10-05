import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mensajesMock = vi.hoisted(() => ({
  confirmar: vi.fn(),
  aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() },
}));
vi.mock('../lib/mensajes', () => mensajesMock);

const eventsMock = vi.hoisted(() => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));
vi.mock('../lib/services/events', () => eventsMock);

vi.mock('../hooks/use-project-roles', () => ({
  useProjectRoles: () => ({ roles: [] }),
}));

// El mapa (leaflet) no corre en jsdom y no es parte de lo que se prueba aquí.
vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="mapa" />,
}));

import { EventFormDialog } from '../components/calendar/event-form-dialog';
import type { EventoProyectoDTO } from '../lib/services/events';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

beforeEach(() => {
  // Solo se finge Date: los timers reales siguen para waitFor/React.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 5, 10, 0));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const LED = [{ idProyecto: 1, tituloProyecto: 'Proyecto Uno' }];

function evento(overrides: Partial<EventoProyectoDTO> = {}): EventoProyectoDTO {
  return {
    idEvento: 7,
    idProyecto: 1,
    tituloEvento: 'Reunión semanal',
    descripcionEvento: null,
    fechaInicio: new Date(2026, 9, 8, 9, 0).toISOString(),
    fechaFin: new Date(2026, 9, 8, 10, 0).toISOString(),
    antelacionMinutos: 60,
    modalidad: 'VIRTUAL',
    ubicacionLat: null,
    ubicacionLng: null,
    ubicacionNombre: null,
    linkSesion: 'https://meet.google.com/abc',
    rolesDestino: [],
    ...overrides,
  };
}

function renderCrear(onOpenChange = vi.fn()) {
  render(<EventFormDialog open onOpenChange={onOpenChange} ledProjects={LED} defaultProjectId={1} />, { wrapper });
  return { onOpenChange };
}

describe('EventFormDialog (HU-184 T-323)', () => {
  it('muestra los campos en orden: título, inicio, fin, modalidad, link, recordatorio', () => {
    renderCrear();
    const etiquetas = ['Título', 'Fecha de inicio', 'Fecha de fin', 'Modalidad de la sesión', 'Link de la sesión', 'Recordatorio'];
    const nodos = etiquetas.map((texto) => screen.getByText(texto));
    for (let i = 1; i < nodos.length; i++) {
      expect(nodos[i - 1].compareDocumentPosition(nodos[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('con el título vacío no envía y marca el campo', async () => {
    renderCrear();
    fireEvent.change(screen.getByLabelText('Link de la sesión'), { target: { value: 'https://meet.google.com/x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

    expect(await screen.findByText('El título no puede estar vacío.')).toBeInTheDocument();
    expect(eventsMock.createEvent).not.toHaveBeenCalled();
    expect(mensajesMock.aviso.advertencia).toHaveBeenCalled();
  });

  it('con el fin antes del inicio no envía y explica el error', async () => {
    renderCrear();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Demo' } });
    fireEvent.change(screen.getByLabelText('Link de la sesión'), { target: { value: 'https://meet.google.com/x' } });
    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '15:00' } });
    fireEvent.change(screen.getByLabelText('Hora de fin'), { target: { value: '14:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

    expect(await screen.findByText('El fin debe ser posterior al inicio.')).toBeInTheDocument();
    expect(eventsMock.createEvent).not.toHaveBeenCalled();
  });

  it('con un link sin http(s) no envía', async () => {
    renderCrear();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Demo' } });
    fireEvent.change(screen.getByLabelText('Link de la sesión'), { target: { value: 'meet.google.com/x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

    expect(await screen.findByText('El link debe empezar con http:// o https://.')).toBeInTheDocument();
    expect(eventsMock.createEvent).not.toHaveBeenCalled();
  });

  it('con datos válidos crea el evento, avisa y cierra', async () => {
    eventsMock.createEvent.mockResolvedValueOnce(evento());
    const { onOpenChange } = renderCrear();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: '  Demo final  ' } });
    fireEvent.change(screen.getByLabelText('Link de la sesión'), { target: { value: 'https://meet.google.com/x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

    await waitFor(() => expect(eventsMock.createEvent).toHaveBeenCalled());
    const [projectId, payload] = eventsMock.createEvent.mock.calls[0];
    expect(projectId).toBe(1);
    expect(payload).toMatchObject({
      tituloEvento: 'Demo final',
      modalidad: 'VIRTUAL',
      linkSesion: 'https://meet.google.com/x',
      antelacionMinutos: 60,
      fechaInicio: new Date(2026, 9, 5, 11, 0).toISOString(),
      fechaFin: new Date(2026, 9, 5, 12, 0).toISOString(),
    });
    await waitFor(() => expect(mensajesMock.aviso.exito).toHaveBeenCalledWith('Evento creado'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('si el backend rechaza, avisa el error con el componente común y no cierra', async () => {
    eventsMock.createEvent.mockRejectedValueOnce(new Error('boom'));
    const { onOpenChange } = renderCrear();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Demo' } });
    fireEvent.change(screen.getByLabelText('Link de la sesión'), { target: { value: 'https://meet.google.com/x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

    await waitFor(() => expect(mensajesMock.aviso.error).toHaveBeenCalled());
    expect(mensajesMock.aviso.error.mock.calls[0][0]).toBe('No se pudo crear el evento');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('en edición carga el evento y guarda los cambios', async () => {
    eventsMock.updateEvent.mockResolvedValueOnce(evento());
    render(<EventFormDialog open onOpenChange={vi.fn()} ledProjects={LED} editingEvent={evento()} />, { wrapper });

    expect(screen.getByLabelText('Título')).toHaveValue('Reunión semanal');
    expect(screen.queryByText('Proyecto')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Reunión movida' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(eventsMock.updateEvent).toHaveBeenCalled());
    const [projectId, eventId, payload] = eventsMock.updateEvent.mock.calls[0];
    expect([projectId, eventId]).toEqual([1, 7]);
    expect(payload.tituloEvento).toBe('Reunión movida');
    await waitFor(() => expect(mensajesMock.aviso.exito).toHaveBeenCalledWith('Evento actualizado'));
  });

  it('cancelar evento pide confirmación destructiva y borra solo si se confirma', async () => {
    eventsMock.deleteEvent.mockResolvedValueOnce(undefined);
    mensajesMock.confirmar.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const onOpenChange = vi.fn();
    render(<EventFormDialog open onOpenChange={onOpenChange} ledProjects={LED} editingEvent={evento()} />, { wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar evento' }));
    await waitFor(() => expect(mensajesMock.confirmar).toHaveBeenCalledTimes(1));
    expect(mensajesMock.confirmar.mock.calls[0][0]).toMatchObject({ destructiva: true, textoAccion: 'Cancelar evento' });
    expect(eventsMock.deleteEvent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar evento' }));
    await waitFor(() => expect(eventsMock.deleteEvent).toHaveBeenCalledWith(1, 7));
    await waitFor(() => expect(mensajesMock.aviso.exito).toHaveBeenCalledWith('Evento cancelado'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
