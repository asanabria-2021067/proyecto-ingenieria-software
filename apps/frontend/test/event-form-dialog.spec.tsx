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

const eventsMock = vi.hoisted(() => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));
vi.mock('../lib/services/events', () => eventsMock);

vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 1, nombre: 'Carlos', apellido: 'Mendoza', fotoUrl: null } }),
}));

const MIEMBROS = [
  { idUsuario: 4, nombre: 'Ana', apellido: 'García', correo: 'ana@uvg.edu.gt', fotoUrl: null, idRolProyecto: 1 },
  { idUsuario: 5, nombre: 'Luis', apellido: 'Hernández', correo: 'luis@uvg.edu.gt', fotoUrl: null, idRolProyecto: 2 },
  // Misma persona con un segundo rol: no debe duplicarse.
  { idUsuario: 5, nombre: 'Luis', apellido: 'Hernández', correo: 'luis@uvg.edu.gt', fotoUrl: null, idRolProyecto: 3 },
];
vi.mock('../hooks/use-project-members', () => ({
  useProjectMembers: () => ({ members: MIEMBROS, isLoading: false }),
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

const LED = [{ idProyecto: 1, tituloProyecto: 'Proyecto Uno', tipoProyecto: 'ACADEMICO_HORAS_BECA' }];

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
    tipoEvento: 'TUTORIA',
    invitados: [4],
    ...overrides,
  };
}

function renderCrear(onOpenChange = vi.fn()) {
  render(<EventFormDialog open onOpenChange={onOpenChange} ledProjects={LED} defaultProjectId={1} />, { wrapper });
  return { onOpenChange };
}

describe('EventFormDialog (HU-184 T-323, rediseño)', () => {
  it('sigue el orden de la maqueta: título, tipo y proyecto, fecha y horas, modalidad, enlace, invitados, recordatorio', () => {
    renderCrear();
    const etiquetas = [
      'Título del evento o actividad',
      'Tipo de actividad',
      'Proyecto',
      'Fecha',
      'Hora de inicio',
      'Hora de fin',
      'Modalidad de la sesión',
      'Enlace de conexión virtual',
      'Participantes e invitados',
      'Enviar recordatorio',
    ];
    const nodos = etiquetas.map((texto) => screen.getAllByText(texto)[0]);
    for (let i = 1; i < nodos.length; i++) {
      expect(nodos[i - 1].compareDocumentPosition(nodos[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('muestra la duración, la marca de horas beca y el chip del líder', () => {
    renderCrear();
    expect(screen.getByText('1h')).toBeInTheDocument();
    expect(screen.getByText('+ Horas beca')).toBeInTheDocument();
    expect(screen.getByText(/\(Tú · Líder\)/)).toBeInTheDocument();
    expect(screen.getByText('Todo el proyecto')).toBeInTheDocument();
  });

  it('la modalidad es un selector de tres opciones; híbrida pide enlace y ubicación', () => {
    renderCrear();
    const grupo = screen.getByRole('radiogroup', { name: 'Modalidad de la sesión' });
    expect(within(grupo).getByRole('radio', { name: 'Virtual' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByTestId('mapa')).not.toBeInTheDocument();

    fireEvent.click(within(grupo).getByRole('radio', { name: 'Híbrida' }));
    expect(screen.getByLabelText('Enlace de conexión virtual')).toBeInTheDocument();
    expect(screen.getByTestId('mapa')).toBeInTheDocument();
    expect(screen.getByText('Híbrida: requiere enlace virtual y lugar físico')).toBeInTheDocument();
  });

  it('con el título vacío no envía y marca el campo', async () => {
    renderCrear();
    fireEvent.change(screen.getByLabelText('Enlace de conexión virtual'), { target: { value: 'https://meet.google.com/x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));

    expect(await screen.findByText('El título no puede estar vacío.')).toBeInTheDocument();
    expect(eventsMock.createEvent).not.toHaveBeenCalled();
    expect(mensajesMock.aviso.advertencia).toHaveBeenCalled();
  });

  it('con la hora de fin antes de la de inicio no envía y explica el error', async () => {
    renderCrear();
    fireEvent.change(screen.getByLabelText('Título del evento o actividad'), { target: { value: 'Demo' } });
    fireEvent.change(screen.getByLabelText('Enlace de conexión virtual'), { target: { value: 'https://meet.google.com/x' } });
    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '15:00' } });
    fireEvent.change(screen.getByLabelText('Hora de fin'), { target: { value: '14:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));

    expect(await screen.findByText('El fin debe ser posterior al inicio.')).toBeInTheDocument();
    expect(eventsMock.createEvent).not.toHaveBeenCalled();
  });

  it('con datos válidos agenda el evento con tipo e invitados, avisa y cierra', async () => {
    eventsMock.createEvent.mockResolvedValueOnce(evento());
    const { onOpenChange } = renderCrear();
    fireEvent.change(screen.getByLabelText('Título del evento o actividad'), { target: { value: '  Demo final  ' } });
    fireEvent.change(screen.getByLabelText('Enlace de conexión virtual'), { target: { value: 'https://meet.google.com/x' } });

    // Invitar a Luis desde el buscador de integrantes (aparece una sola vez).
    fireEvent.click(screen.getByRole('button', { name: /Añadir integrante/ }));
    expect(await screen.findAllByText('Luis Hernández')).toHaveLength(1);
    fireEvent.click(screen.getByText('Luis Hernández'));
    expect(await screen.findByText('1 invitado')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));

    await waitFor(() => expect(eventsMock.createEvent).toHaveBeenCalled());
    const [projectId, payload] = eventsMock.createEvent.mock.calls[0];
    expect(projectId).toBe(1);
    expect(payload).toMatchObject({
      tituloEvento: 'Demo final',
      tipoEvento: 'REUNION',
      modalidad: 'VIRTUAL',
      linkSesion: 'https://meet.google.com/x',
      antelacionMinutos: 60,
      invitados: [5],
      fechaInicio: new Date(2026, 9, 5, 11, 0).toISOString(),
      fechaFin: new Date(2026, 9, 5, 12, 0).toISOString(),
    });
    await waitFor(() => expect(mensajesMock.aviso.exito).toHaveBeenCalledWith('Evento agendado'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('desmarcar "Enviar recordatorio" envía 0 minutos', async () => {
    eventsMock.createEvent.mockResolvedValueOnce(evento());
    renderCrear();
    fireEvent.change(screen.getByLabelText('Título del evento o actividad'), { target: { value: 'Demo' } });
    fireEvent.change(screen.getByLabelText('Enlace de conexión virtual'), { target: { value: 'https://meet.google.com/x' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enviar recordatorio' }));
    expect(screen.queryByRole('combobox', { name: 'Cuándo enviar el recordatorio' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));

    await waitFor(() => expect(eventsMock.createEvent).toHaveBeenCalled());
    expect(eventsMock.createEvent.mock.calls[0][1].antelacionMinutos).toBe(0);
  });

  it('si el backend rechaza, avisa el error con el componente común y no cierra', async () => {
    eventsMock.createEvent.mockRejectedValueOnce(new Error('boom'));
    const { onOpenChange } = renderCrear();
    fireEvent.change(screen.getByLabelText('Título del evento o actividad'), { target: { value: 'Demo' } });
    fireEvent.change(screen.getByLabelText('Enlace de conexión virtual'), { target: { value: 'https://meet.google.com/x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));

    await waitFor(() => expect(mensajesMock.aviso.error).toHaveBeenCalled());
    expect(mensajesMock.aviso.error.mock.calls[0][0]).toBe('No se pudo agendar el evento');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('en edición carga el evento (tipo e invitados incluidos) y guarda los cambios', async () => {
    eventsMock.updateEvent.mockResolvedValueOnce(evento());
    render(<EventFormDialog open onOpenChange={vi.fn()} ledProjects={LED} editingEvent={evento()} />, { wrapper });

    expect(screen.getByRole('heading', { name: 'Editar evento' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título del evento o actividad')).toHaveValue('Reunión semanal');
    expect(screen.getByText('1 invitado')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Título del evento o actividad'), { target: { value: 'Reunión movida' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(eventsMock.updateEvent).toHaveBeenCalled());
    const [projectId, eventId, payload] = eventsMock.updateEvent.mock.calls[0];
    expect([projectId, eventId]).toEqual([1, 7]);
    expect(payload).toMatchObject({ tituloEvento: 'Reunión movida', tipoEvento: 'TUTORIA', invitados: [4] });
    await waitFor(() => expect(mensajesMock.aviso.exito).toHaveBeenCalledWith('Evento actualizado'));
  });

  it('eliminar evento pide confirmación destructiva y borra solo si se confirma', async () => {
    eventsMock.deleteEvent.mockResolvedValueOnce(undefined);
    mensajesMock.confirmar.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const onOpenChange = vi.fn();
    render(<EventFormDialog open onOpenChange={onOpenChange} ledProjects={LED} editingEvent={evento()} />, { wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar evento' }));
    await waitFor(() => expect(mensajesMock.confirmar).toHaveBeenCalledTimes(1));
    expect(mensajesMock.confirmar.mock.calls[0][0]).toMatchObject({ destructiva: true, textoAccion: 'Eliminar evento' });
    expect(eventsMock.deleteEvent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar evento' }));
    await waitFor(() => expect(eventsMock.deleteEvent).toHaveBeenCalledWith(1, 7));
    await waitFor(() => expect(mensajesMock.aviso.exito).toHaveBeenCalledWith('Evento eliminado'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
