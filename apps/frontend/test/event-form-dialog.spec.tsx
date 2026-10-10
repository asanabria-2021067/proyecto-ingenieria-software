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

// G02-C02: el diálogo monta el picker REAL (react-leaflet simulado abajo) para
// poder verificar label, aria-invalid, mensajes y foco de la ubicación.
vi.mock('next/dynamic', async () => {
  const mod = await import('../components/calendar/event-location-picker');
  return { default: () => mod.default };
});

// G02-C01: el picker se prueba directo con react-leaflet simulado (jsdom no tiene canvas ni window de Leaflet).
const leafletMock = vi.hoisted(() => ({ handlers: {} as Record<string, (e: unknown) => void> }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="mapa-real">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  useMap: () => ({ setView: vi.fn(), getZoom: () => 12 }),
  useMapEvents: (handlers: Record<string, (e: unknown) => void>) => {
    Object.assign(leafletMock.handlers, handlers);
    return null;
  },
}));
vi.mock('leaflet', () => ({ default: { icon: () => ({}) } }));
vi.mock('leaflet/dist/leaflet.css', () => ({}));

import { EventFormDialog } from '../components/calendar/event-form-dialog';
import { getApiErrorMessage } from '../components/projects/api-error';
import EventLocationPicker, {
  MAX_NOMBRE_LUGAR,
  normalizarCoordenadas,
  recortarNombreLugar,
} from '../components/calendar/event-location-picker';
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
    expect(screen.queryByTestId('mapa-real')).not.toBeInTheDocument();

    fireEvent.click(within(grupo).getByRole('radio', { name: 'Híbrida' }));
    expect(screen.getByLabelText('Enlace de conexión virtual')).toBeInTheDocument();
    expect(screen.getByTestId('mapa-real')).toBeInTheDocument();
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

describe('EventLocationPicker — nombres largos y coordenadas (G02-C01, UI-03/UI-25)', () => {
  const NOMBRE_LARGO = 'Edificio ' + 'x'.repeat(300);

  function renderPicker(overrides: Partial<Parameters<typeof EventLocationPicker>[0]> = {}) {
    const onNombreChange = vi.fn();
    const onPositionChange = vi.fn();
    render(
      <EventLocationPicker lat={null} lng={null} nombre="UVG" onNombreChange={onNombreChange} onPositionChange={onPositionChange} {...overrides} />,
    );
    return { onNombreChange, onPositionChange };
  }

  it('un resultado de Nominatim con 300 caracteres entra al formulario recortado a exactamente 255', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ place_id: 1, display_name: NOMBRE_LARGO, lat: '14.6', lon: '-90.5' }],
      }),
    );
    const { onNombreChange, onPositionChange } = renderPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Buscar ubicación' }));
    fireEvent.click(await screen.findByRole('button', { name: NOMBRE_LARGO }));

    expect(onNombreChange).toHaveBeenCalledWith(NOMBRE_LARGO.slice(0, 255));
    expect(onNombreChange.mock.calls[0][0]).toHaveLength(255);
    expect(onPositionChange).toHaveBeenCalledWith(14.6, -90.5);
    vi.unstubAllGlobals();
  });

  it('el input del lugar tiene maxLength 255 (mismo tope que el backend)', () => {
    renderPicker();
    expect(screen.getByPlaceholderText(/Busca un lugar/)).toHaveAttribute('maxlength', String(MAX_NOMBRE_LUGAR));
  });

  it('un clic fuera de ±180 de longitud (copia del mundo) llega normalizado y con la latitud acotada', () => {
    const { onPositionChange } = renderPicker();

    leafletMock.handlers.click({ latlng: { lat: 14.6, lng: 200 } });
    expect(onPositionChange).toHaveBeenLastCalledWith(14.6, -160);

    leafletMock.handlers.click({ latlng: { lat: 95, lng: -540.5 } });
    expect(onPositionChange).toHaveBeenLastCalledWith(90, 179.5);
  });

  it('normalizarCoordenadas y recortarNombreLugar son idempotentes para valores ya válidos', () => {
    expect(normalizarCoordenadas(14.5906, -90.551)).toEqual({ lat: 14.5906, lng: -90.551 });
    expect(normalizarCoordenadas(0, 180)).toEqual({ lat: 0, lng: 180 });
    expect(normalizarCoordenadas(0, -180)).toEqual({ lat: 0, lng: -180 });
    expect(recortarNombreLugar('x'.repeat(255))).toHaveLength(255);
    expect(recortarNombreLugar('Edificio T-1')).toBe('Edificio T-1');
  });
});

describe('EventFormDialog — validación visible de la ubicación (G02-C02, UI-03/UI-09)', () => {
  function renderPresencial() {
    const resultado = renderCrear();
    fireEvent.change(screen.getByLabelText('Título del evento o actividad'), { target: { value: 'Visita' } });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Modalidad de la sesión' })).getByRole('radio', { name: 'Presencial' }));
    return resultado;
  }

  it('el input del lugar queda asociado a la etiqueta "Ubicación presencial"', () => {
    renderPresencial();
    const input = screen.getByLabelText('Ubicación presencial');
    expect(input).toHaveAttribute('placeholder', expect.stringContaining('Busca un lugar'));
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('presencial sin punto en el mapa: el error aparece junto al campo, el input queda inválido y recibe el foco', async () => {
    renderPresencial();
    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));

    const mensaje = await screen.findByText('Marca la ubicación de la sesión en el mapa.');
    const input = screen.getByLabelText('Ubicación presencial');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(mensaje.id);
    await waitFor(() => expect(input).toHaveFocus());
    expect(eventsMock.createEvent).not.toHaveBeenCalled();
  });

  it('un nombre de lugar de más de 255 caracteres muestra su mensaje junto al campo (no solo el aviso genérico)', async () => {
    renderPresencial();
    fireEvent.change(screen.getByLabelText('Ubicación presencial'), { target: { value: 'x'.repeat(300) } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));

    expect(await screen.findByText('El nombre del lugar no puede exceder 255 caracteres.')).toHaveAttribute('role', 'alert');
    expect(eventsMock.createEvent).not.toHaveBeenCalled();
  });

  it('al marcar el punto el error desaparece y el evento se agenda con sus coordenadas', async () => {
    eventsMock.createEvent.mockResolvedValueOnce(evento());
    renderPresencial();
    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));
    await screen.findByText('Marca la ubicación de la sesión en el mapa.');

    leafletMock.handlers.click({ latlng: { lat: 14.6, lng: -90.5 } });
    await waitFor(() => expect(screen.queryByText('Marca la ubicación de la sesión en el mapa.')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Ubicación presencial')).toHaveAttribute('aria-invalid', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));
    await waitFor(() => expect(eventsMock.createEvent).toHaveBeenCalled());
    expect(eventsMock.createEvent.mock.calls[0][1]).toMatchObject({ modalidad: 'PRESENCIAL', ubicacionLat: 14.6, ubicacionLng: -90.5 });
  });

  it('si además falta el título, el foco va al título (campo nativo) y no a la ubicación', async () => {
    renderPresencial();
    fireEvent.change(screen.getByLabelText('Título del evento o actividad'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));

    await screen.findByText('El título no puede estar vacío.');
    await waitFor(() => expect(screen.getByLabelText('Título del evento o actividad')).toHaveFocus());
  });
});

describe('EventFormDialog — límites de ubicación de extremo a extremo (G02-C03)', () => {
  it('un resultado de Nominatim de 300 caracteres se recorta y el evento presencial se agenda con 255', async () => {
    const nombreLargo = 'Edificio ' + 'x'.repeat(300);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => [{ place_id: 1, display_name: nombreLargo, lat: '14.6', lon: '-90.5' }] }),
    );
    eventsMock.createEvent.mockResolvedValueOnce(evento());
    renderCrear();
    fireEvent.change(screen.getByLabelText('Título del evento o actividad'), { target: { value: 'Visita' } });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Modalidad de la sesión' })).getByRole('radio', { name: 'Presencial' }));
    fireEvent.change(screen.getByLabelText('Ubicación presencial'), { target: { value: 'Edificio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar ubicación' }));
    fireEvent.click(await screen.findByRole('button', { name: nombreLargo }));

    expect((screen.getByLabelText('Ubicación presencial') as HTMLInputElement).value).toHaveLength(255);
    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));
    await waitFor(() => expect(eventsMock.createEvent).toHaveBeenCalled());
    expect(eventsMock.createEvent.mock.calls[0][1].ubicacionNombre).toHaveLength(255);
    expect(screen.queryByText('El nombre del lugar no puede exceder 255 caracteres.')).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('el mensaje de ubicación queda referenciado por aria-describedby y desaparece al corregir', async () => {
    renderCrear();
    fireEvent.change(screen.getByLabelText('Título del evento o actividad'), { target: { value: 'Visita' } });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Modalidad de la sesión' })).getByRole('radio', { name: 'Híbrida' }));
    fireEvent.change(screen.getByLabelText('Enlace de conexión virtual'), { target: { value: 'https://meet.google.com/x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));

    const mensaje = await screen.findByText('Marca la ubicación de la sesión en el mapa.');
    const input = screen.getByLabelText('Ubicación presencial');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(mensaje.id);

    leafletMock.handlers.click({ latlng: { lat: 14.6, lng: -90.5 } });
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'false'));
    expect(input.getAttribute('aria-describedby')?.split(' ')).not.toContain(mensaje.id);
  });
});

describe('EventFormDialog — "Termina otro día" y fecha de fin (G02-C08, UI-06/T-323)', () => {
  function rellenarVirtual(titulo = 'Hackathon') {
    fireEvent.change(screen.getByLabelText('Título del evento o actividad'), { target: { value: titulo } });
    fireEvent.change(screen.getByLabelText('Enlace de conexión virtual'), { target: { value: 'https://meet.google.com/x' } });
  }

  it('por defecto está desmarcado y no muestra la fecha de fin; al marcarlo aparece el selector con su etiqueta', () => {
    renderCrear();
    const check = screen.getByRole('checkbox', { name: 'Termina otro día' });
    expect(check).not.toBeChecked();
    expect(screen.queryByLabelText('Fecha de fin')).not.toBeInTheDocument();

    fireEvent.click(check);
    expect(screen.getByLabelText('Fecha de fin')).toHaveTextContent('Selecciona la fecha de fin');

    fireEvent.click(check);
    expect(screen.queryByLabelText('Fecha de fin')).not.toBeInTheDocument();
  });

  it('marcar y desmarcar el control no borra el título ni los invitados ya escritos', async () => {
    renderCrear();
    rellenarVirtual('Demo que no se pierde');
    fireEvent.click(screen.getByRole('button', { name: /Añadir integrante/ }));
    fireEvent.click(await screen.findByText('Luis Hernández'));
    expect(await screen.findByText('1 invitado')).toBeInTheDocument();

    const check = screen.getByRole('checkbox', { name: 'Termina otro día' });
    fireEvent.click(check);
    fireEvent.click(check);
    expect(screen.getByLabelText('Título del evento o actividad')).toHaveValue('Demo que no se pierde');
    expect(screen.getByText('1 invitado')).toBeInTheDocument();
  });

  it('con el control marcado y sin fecha de fin, el envío se detiene con el error junto al campo', async () => {
    renderCrear();
    rellenarVirtual();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Termina otro día' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));

    expect(await screen.findByText('Selecciona la fecha de fin.')).toBeInTheDocument();
    expect(eventsMock.createEvent).not.toHaveBeenCalled();
  });

  it('crea un evento 22:00 → 01:00 del día siguiente eligiendo la fecha de fin en el calendario', async () => {
    eventsMock.createEvent.mockResolvedValueOnce(evento());
    renderCrear();
    rellenarVirtual();
    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '22:00' } });
    fireEvent.change(screen.getByLabelText('Hora de fin'), { target: { value: '01:00' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Termina otro día' }));

    // El popover abre el calendario del mes de la fecha de inicio (octubre 2026): se elige el 6.
    fireEvent.click(screen.getByLabelText('Fecha de fin'));
    fireEvent.click(await screen.findByRole('button', { name: /, 6 de octubre/ }));
    await waitFor(() => expect(screen.getByLabelText('Fecha de fin')).toHaveTextContent(/6 oct 2026/i));
    expect(screen.getByText('3h')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));
    await waitFor(() => expect(eventsMock.createEvent).toHaveBeenCalled());
    expect(eventsMock.createEvent.mock.calls[0][1]).toMatchObject({
      fechaInicio: new Date(2026, 9, 5, 22, 0).toISOString(),
      fechaFin: new Date(2026, 9, 6, 1, 0).toISOString(),
    });
  });
});

describe('EventFormDialog — edición de eventos de varios días (G02-C09, UI-06)', () => {
  const nocturno = () =>
    evento({
      fechaInicio: new Date(2026, 9, 8, 22, 0).toISOString(),
      fechaFin: new Date(2026, 9, 10, 1, 0).toISOString(),
      antelacionMinutos: 45,
    });

  function renderEditar(ev = nocturno()) {
    render(<EventFormDialog open onOpenChange={vi.fn()} ledProjects={LED} editingEvent={ev} />, { wrapper });
  }

  it('al editar, "Termina otro día" viene marcado con la fecha de fin original y el recordatorio no estándar se conserva', () => {
    renderEditar();
    expect(screen.getByRole('checkbox', { name: 'Termina otro día' })).toBeChecked();
    expect(screen.getByLabelText('Fecha de fin')).toHaveTextContent(/10 oct 2026/i);
    expect(screen.getByLabelText('Hora de inicio')).toHaveValue('22:00');
    expect(screen.getByLabelText('Hora de fin')).toHaveValue('01:00');
    expect(screen.getByRole('combobox', { name: 'Cuándo enviar el recordatorio' })).toHaveTextContent('45 minutos antes');
  });

  it('cambiar solo el título conserva exactamente el inicio y el fin originales', async () => {
    eventsMock.updateEvent.mockResolvedValueOnce(nocturno());
    renderEditar();
    fireEvent.change(screen.getByLabelText('Título del evento o actividad'), { target: { value: 'Reunión renombrada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(eventsMock.updateEvent).toHaveBeenCalled());
    const payload = eventsMock.updateEvent.mock.calls[0][2];
    expect(payload.fechaInicio).toBe(new Date(2026, 9, 8, 22, 0).toISOString());
    expect(payload.fechaFin).toBe(new Date(2026, 9, 10, 1, 0).toISOString());
    expect(payload.antelacionMinutos).toBe(45);
  });

  it('mover la fecha de inicio después de la de fin no colapsa el evento: muestra el error del campo y no guarda', async () => {
    renderEditar();
    fireEvent.click(screen.getByLabelText('Fecha'));
    fireEvent.click(await screen.findByRole('button', { name: /, 20 de octubre/ }));
    expect(await screen.findByText('La fecha de fin no puede ser anterior a la de inicio.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Termina otro día' })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mensajesMock.aviso.advertencia).toHaveBeenCalled());
    expect(eventsMock.updateEvent).not.toHaveBeenCalled();
  });

  it('desmarcar "Termina otro día" al editar convierte el evento en uno de un día de forma explícita (no silenciosa)', async () => {
    eventsMock.updateEvent.mockResolvedValueOnce(nocturno());
    renderEditar();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Termina otro día' }));
    expect(screen.queryByLabelText('Fecha de fin')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Hora de fin'), { target: { value: '23:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(eventsMock.updateEvent).toHaveBeenCalled());
    expect(eventsMock.updateEvent.mock.calls[0][2].fechaFin).toBe(new Date(2026, 9, 8, 23, 30).toISOString());
  });
});

describe('EventFormDialog — comportamiento del formulario con dos fechas (G02-C10)', () => {
  it('la fecha de fin elegida se conserva al desmarcar y volver a marcar "Termina otro día"', async () => {
    renderCrear();
    const check = screen.getByRole('checkbox', { name: 'Termina otro día' });
    fireEvent.click(check);
    fireEvent.click(screen.getByLabelText('Fecha de fin'));
    fireEvent.click(await screen.findByRole('button', { name: /, 7 de octubre/ }));
    await waitFor(() => expect(screen.getByLabelText('Fecha de fin')).toHaveTextContent(/7 oct 2026/i));

    fireEvent.click(check);
    expect(screen.queryByLabelText('Fecha de fin')).not.toBeInTheDocument();
    fireEvent.click(check);
    expect(screen.getByLabelText('Fecha de fin')).toHaveTextContent(/7 oct 2026/i);
  });

  it('fin igual al inicio el mismo día sigue siendo inválido aunque la opción esté marcada con la misma fecha', async () => {
    renderCrear();
    fireEvent.change(screen.getByLabelText('Título del evento o actividad'), { target: { value: 'Demo' } });
    fireEvent.change(screen.getByLabelText('Enlace de conexión virtual'), { target: { value: 'https://meet.google.com/x' } });
    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Hora de fin'), { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Termina otro día' }));
    fireEvent.click(screen.getByLabelText('Fecha de fin'));
    fireEvent.click(await screen.findByRole('button', { name: /, 5 de octubre/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));

    expect(await screen.findByText('El fin debe ser posterior al inicio.')).toBeInTheDocument();
    expect(screen.queryByText('La fecha de fin no puede ser anterior a la de inicio.')).not.toBeInTheDocument();
    expect(eventsMock.createEvent).not.toHaveBeenCalled();
  });

  it('con varios errores a la vez (título vacío y fecha de fin ausente) todos se muestran y el foco va al título', async () => {
    renderCrear();
    fireEvent.change(screen.getByLabelText('Enlace de conexión virtual'), { target: { value: 'https://meet.google.com/x' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Termina otro día' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));

    expect(await screen.findByText('El título no puede estar vacío.')).toBeInTheDocument();
    expect(screen.getByText('Selecciona la fecha de fin.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Título del evento o actividad')).toHaveFocus());
  });

  it('el chip de duración refleja el rango real de dos fechas', async () => {
    renderCrear();
    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Hora de fin'), { target: { value: '17:00' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Termina otro día' }));
    fireEvent.click(screen.getByLabelText('Fecha de fin'));
    fireEvent.click(await screen.findByRole('button', { name: /, 7 de octubre/ }));
    await waitFor(() => expect(screen.getByText('56h')).toBeInTheDocument());
  });
});

describe('EventFormDialog — errores del servidor dentro del diálogo (G03-C01, UI-07)', () => {
  function errorHttp(statusCode: number, message?: string) {
    return Object.assign(new Error(message ?? 'detalle interno'), { statusCode });
  }

  function alertaDelDialogo() {
    return within(screen.getByRole('dialog')).queryAllByRole('alert').find((n) => n.getAttribute('aria-live') === 'assertive');
  }

  async function enviarEventoValido() {
    fireEvent.change(screen.getByLabelText('Título del evento o actividad'), { target: { value: 'Demo' } });
    fireEvent.change(screen.getByLabelText('Enlace de conexión virtual'), { target: { value: 'https://meet.google.com/x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));
  }

  it.each([
    [400, 'El inicio debe ser anterior al fin.'],
    [403, undefined],
    [404, undefined],
    [409, 'Ya existe un evento en ese horario.'],
    [500, 'Error interno'],
  ])('al crear, un HTTP %s se muestra como alerta dentro del diálogo (además del toast) y el diálogo sigue abierto', async (status, message) => {
    const err = errorHttp(status, message);
    eventsMock.createEvent.mockRejectedValueOnce(err);
    const { onOpenChange } = renderCrear();
    await enviarEventoValido();

    const esperado = getApiErrorMessage(err, 'calendar');
    await waitFor(() => expect(alertaDelDialogo()).toHaveTextContent(esperado));
    expect(mensajesMock.aviso.error).toHaveBeenCalledWith('No se pudo agendar el evento', esperado);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // Nunca se muestra texto técnico ni el código HTTP.
    expect(alertaDelDialogo()).not.toHaveTextContent(/detalle interno|Error interno|\b50\d\b/);
  });

  it('al editar, un HTTP 409 deja la alerta dentro del diálogo con su mensaje y conserva lo escrito', async () => {
    const err = errorHttp(409, 'El evento cambió mientras lo editabas.');
    eventsMock.updateEvent.mockRejectedValueOnce(err);
    const onOpenChange = vi.fn();
    render(<EventFormDialog open onOpenChange={onOpenChange} ledProjects={LED} editingEvent={evento()} />, { wrapper });
    fireEvent.change(screen.getByLabelText('Título del evento o actividad'), { target: { value: 'Reunión editada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(alertaDelDialogo()).toHaveTextContent('El evento cambió mientras lo editabas.'));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByLabelText('Título del evento o actividad')).toHaveValue('Reunión editada');
  });

  it('corregir un campo retira la alerta del servidor sin borrar los errores por campo', async () => {
    eventsMock.createEvent.mockRejectedValueOnce(errorHttp(409, 'Conflicto de horario.'));
    renderCrear();
    await enviarEventoValido();
    await waitFor(() => expect(alertaDelDialogo()).toHaveTextContent('Conflicto de horario.'));

    // Un error de campo posterior convive con la alerta hasta que el usuario edita algo.
    fireEvent.change(screen.getByLabelText('Título del evento o actividad'), { target: { value: 'Demo 2' } });
    await waitFor(() => expect(alertaDelDialogo()).toBeUndefined());

    fireEvent.change(screen.getByLabelText('Título del evento o actividad'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));
    expect(await screen.findByText('El título no puede estar vacío.')).toBeInTheDocument();
    expect(alertaDelDialogo()).toBeUndefined();
  });

  it('un segundo envío que sí funciona cierra el diálogo aunque antes hubiera fallado', async () => {
    eventsMock.createEvent.mockRejectedValueOnce(errorHttp(500)).mockResolvedValueOnce(evento());
    const { onOpenChange } = renderCrear();
    await enviarEventoValido();
    await waitFor(() => expect(alertaDelDialogo()).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mensajesMock.aviso.exito).toHaveBeenCalledWith('Evento agendado');
  });
});

describe('EventFormDialog — modalidad accesible por teclado (G03-C12, UI-08)', () => {
  const grupo = () => screen.getByRole('radiogroup', { name: 'Modalidad de la sesión' });
  const radio = (nombre: string) => within(grupo()).getByRole('radio', { name: nombre });

  it('el grupo tiene nombre accesible por aria-labelledby y un único tab stop: al entrar con Tab el foco cae en la opción activa', async () => {
    renderCrear();
    expect(grupo()).toHaveAttribute('aria-labelledby');
    expect(document.getElementById(grupo().getAttribute('aria-labelledby')!)).toHaveTextContent('Modalidad de la sesión');
    // Antes (3 <button role=radio> sueltos) había tres paradas de tabulación [0,0,0].
    // Con roving focus, al principio solo el contenedor es tabulable y delega en la opción activa.
    const opcionesTabulables = () => within(grupo()).getAllByRole('radio').filter((el) => el.getAttribute('tabindex') === '0');
    expect(opcionesTabulables()).toHaveLength(0);
    expect(grupo()).toHaveAttribute('tabindex', '0');

    grupo().focus();
    await waitFor(() => expect(radio('Virtual')).toHaveFocus());
    expect(radio('Virtual')).toHaveAttribute('aria-checked', 'true');
    expect(opcionesTabulables()).toEqual([radio('Virtual')]);
  });

  it('con las flechas se cambia la opción (→ desde Virtual selecciona Híbrida; ← vuelve) y el formulario lo refleja', async () => {
    renderCrear();
    radio('Virtual').focus();
    fireEvent.keyDown(radio('Virtual'), { key: 'ArrowRight' });
    await waitFor(() => expect(radio('Híbrida')).toHaveAttribute('aria-checked', 'true'));
    expect(radio('Híbrida')).toHaveFocus();
    expect(screen.getByText('Híbrida: requiere enlace virtual y lugar físico')).toBeInTheDocument();
    expect(screen.getByTestId('mapa-real')).toBeInTheDocument();

    fireEvent.keyDown(radio('Híbrida'), { key: 'ArrowLeft' });
    await waitFor(() => expect(radio('Virtual')).toHaveAttribute('aria-checked', 'true'));
    expect(screen.queryByTestId('mapa-real')).not.toBeInTheDocument();
  });

  it('cambiar de modalidad no borra los invitados ni la ubicación ya marcada, y el payload lleva la modalidad elegida', async () => {
    eventsMock.createEvent.mockResolvedValueOnce(evento());
    renderCrear();
    fireEvent.change(screen.getByLabelText('Título del evento o actividad'), { target: { value: 'Visita' } });
    fireEvent.click(radio('Presencial'));
    leafletMock.handlers.click({ latlng: { lat: 14.6, lng: -90.5 } });
    expect(await screen.findByText('Punto marcado')).toBeInTheDocument();

    fireEvent.click(radio('Híbrida'));
    expect(screen.getByText('Punto marcado')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Enlace de conexión virtual'), { target: { value: 'https://meet.google.com/x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));

    await waitFor(() => expect(eventsMock.createEvent).toHaveBeenCalled());
    expect(eventsMock.createEvent.mock.calls[0][1]).toMatchObject({ modalidad: 'MIXTA', ubicacionLat: 14.6, ubicacionLng: -90.5, linkSesion: 'https://meet.google.com/x' });
  });

  it('mientras se guarda, las opciones quedan deshabilitadas', async () => {
    eventsMock.createEvent.mockImplementationOnce(() => new Promise(() => {}));
    renderCrear();
    fireEvent.change(screen.getByLabelText('Título del evento o actividad'), { target: { value: 'Demo' } });
    fireEvent.change(screen.getByLabelText('Enlace de conexión virtual'), { target: { value: 'https://meet.google.com/x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar evento' }));
    await waitFor(() => expect(radio('Presencial')).toBeDisabled());
  });
});
