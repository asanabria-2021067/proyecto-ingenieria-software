import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminMeetingDetalle, ProyectoElegibleReunion } from '../lib/types/admin-meetings';

const mensajes = vi.hoisted(() => ({ confirmar: vi.fn(), aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() } }));
vi.mock('../lib/mensajes', () => mensajes);
const servicios = vi.hoisted(() => ({
  createAdminMeeting: vi.fn(),
  updateAdminMeeting: vi.fn(),
  getAdminMeeting: vi.fn(),
  cancelAdminMeeting: vi.fn(),
  getEligibleMeetingProjects: vi.fn(),
  getMeetingProjectTeam: vi.fn(),
}));
vi.mock('../lib/services/admin-meetings', () => servicios);
vi.mock('../lib/services/admin', () => ({ listAdminUsers: vi.fn().mockResolvedValue({ data: [] }) }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: { idUsuario: 8, nombre: 'Ana', apellido: 'Pérez' } }) }));
vi.mock('next/dynamic', async () => {
  const mod = await import('../components/calendar/event-location-picker');
  return { default: () => mod.default };
});
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="mapa-real">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  useMap: () => ({ setView: vi.fn(), getZoom: () => 12 }),
  useMapEvents: () => null,
}));
vi.mock('leaflet', () => ({ default: { icon: () => ({}) } }));
vi.mock('leaflet/dist/leaflet.css', () => ({}));

import { AdminMeetingFormDialog } from '../components/admin/meetings/admin-meeting-form-dialog';

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

const ELEGIBLES: ProyectoElegibleReunion[] = [
  { idProyecto: 1, tituloProyecto: 'Huerto Comunitario', estadoProyecto: 'EN_PROGRESO', lider: { idUsuario: 10, nombre: 'Valeria', apellido: 'Ortiz' }, integrantesConvocables: 4, cierreOficial: null, ventanaHasta: null },
  { idProyecto: 2, tituloProyecto: 'Plataforma de Tutorías', estadoProyecto: 'EN_PROGRESO', lider: { idUsuario: 20, nombre: 'Luis', apellido: 'Gómez' }, integrantesConvocables: 3, cierreOficial: null, ventanaHasta: null },
];

const onOpenChange = vi.fn();
function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminMeetingFormDialog open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
}

async function invitar(nombre: RegExp) {
  const agregarOtro = screen.queryByRole('button', { name: 'Agregar otro proyecto' });
  if (agregarOtro) fireEvent.click(agregarOtro);
  fireEvent.focus(screen.getByRole('combobox', { name: 'Buscar proyecto para invitar' }));
  fireEvent.click(await screen.findByRole('option', { name: nombre }));
}

function rellenar() {
  fireEvent.change(screen.getByLabelText('Título de la reunión'), { target: { value: 'Revisión de avances' } });
  fireEvent.change(screen.getByLabelText('Enlace de conexión virtual'), { target: { value: 'https://meet.google.com/abc-defg-hij' } });
}

const reunionCreada = (proyectos: number[]) => ({ idReunion: 12, proyectos: proyectos.map((idProyecto) => ({ idProyecto })) }) as unknown as AdminMeetingDetalle;

beforeEach(() => {
  servicios.getEligibleMeetingProjects.mockResolvedValue(ELEGIBLES);
});
afterEach(cleanup);

describe('Programar reunión administrativa — diálogo', () => {
  it('reutiliza el formulario del evento con encabezado propio, tipo fijo y sin tipos ni invitados del estudiante', () => {
    renderDialog();
    const dialogo = screen.getByRole('dialog', { name: 'Programar reunión administrativa' });
    expect(dialogo).toHaveAccessibleDescription('Organiza reuniones con uno o varios equipos de proyectos.');
    expect(screen.getByPlaceholderText('Ej. Revisión de avances de proyectos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar descripción' })).toBeInTheDocument();
    expect(within(dialogo).getByText('Reunión administrativa')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Tipo de actividad/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Participantes e invitados')).not.toBeInTheDocument();
    expect(screen.queryByText(/Horas beca/)).not.toBeInTheDocument();
    for (const modalidad of ['Presencial', 'Virtual', 'Híbrida']) expect(screen.getByRole('radio', { name: modalidad })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Enviar recordatorio' })).toBeChecked();
    expect(screen.getByRole('group', { name: 'Proyectos invitados' })).toBeInTheDocument();
  });

  it('Escape dentro del buscador de proyectos cierra sus resultados, no el diálogo', async () => {
    renderDialog();
    const buscador = screen.getByRole('combobox', { name: 'Buscar proyecto para invitar' });
    fireEvent.focus(buscador);
    expect(await screen.findAllByRole('option')).toHaveLength(2);
    fireEvent.keyDown(buscador, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Programar reunión administrativa' })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('sin proyectos invitados no envía nada y lo explica junto a la sección', async () => {
    renderDialog();
    rellenar();
    fireEvent.click(screen.getByRole('button', { name: 'Programar reunión' }));
    expect(await screen.findByText('Invita al menos un proyecto.')).toBeInTheDocument();
    expect(servicios.createAdminMeeting).not.toHaveBeenCalled();
  });

  it('crea UNA reunión para varios proyectos con los campos del contrato y cierra solo tras la confirmación', async () => {
    let resolver!: (r: AdminMeetingDetalle) => void;
    servicios.createAdminMeeting.mockReturnValue(new Promise((r) => (resolver = r)));
    renderDialog();
    rellenar();
    await invitar(/Huerto Comunitario/);
    await invitar(/Plataforma de Tutorías/);
    expect(screen.getByText('2 proyectos seleccionados')).toBeInTheDocument();

    const programar = screen.getByRole('button', { name: 'Programar reunión' });
    fireEvent.click(programar);
    await waitFor(() => expect(servicios.createAdminMeeting).toHaveBeenCalledTimes(1));
    // Mientras se procesa: botón deshabilitado (sin doble envío) y el diálogo sigue abierto.
    await waitFor(() => expect(programar).toBeDisabled());
    fireEvent.click(programar);
    expect(servicios.createAdminMeeting).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mensajes.aviso.exito).not.toHaveBeenCalled();

    const cuerpo = servicios.createAdminMeeting.mock.calls[0][0];
    expect(cuerpo).toMatchObject({
      tituloEvento: 'Revisión de avances',
      modalidad: 'VIRTUAL',
      linkSesion: 'https://meet.google.com/abc-defg-hij',
      antelacionMinutos: 60,
      proyectos: [1, 2],
      politicaEdicion: 'TODOS_ADMINISTRADORES',
    });
    for (const prohibido of ['tipoEvento', 'invitados', 'rolesDestino', 'idCreador', 'editores']) expect(cuerpo).not.toHaveProperty(prohibido);

    resolver(reunionCreada([1, 2]));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mensajes.aviso.exito).toHaveBeenCalledWith('Reunión programada', 'Se convocó a 2 proyectos.');
  });

  it('si el servidor rechaza un proyecto conserva lo escrito, marca la tarjeta y no cierra', async () => {
    servicios.createAdminMeeting.mockRejectedValue(
      Object.assign(new Error('Hay proyectos que no se pueden convocar a esta reunión'), {
        statusCode: 400,
        body: { proyectos: [{ idProyecto: 1, motivo: 'ESTADO_NO_ELEGIBLE' }] },
      }),
    );
    renderDialog();
    rellenar();
    await invitar(/Huerto Comunitario/);
    fireEvent.click(screen.getByRole('button', { name: 'Programar reunión' }));

    expect(await screen.findByText('Hay proyectos que no se pueden convocar en este horario. Revisa las tarjetas marcadas.')).toBeInTheDocument();
    expect(screen.getByText('El proyecto no está en progreso ni recién cerrado.')).toBeInTheDocument();
    expect(screen.getByLabelText('Título de la reunión')).toHaveValue('Revisión de avances');
    expect(screen.getByText('1 proyecto seleccionado')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Programar reunión' })).toBeEnabled();
  });

  it('un 403 se explica como falta de permiso', async () => {
    servicios.createAdminMeeting.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }));
    renderDialog();
    rellenar();
    await invitar(/Huerto Comunitario/);
    fireEvent.click(screen.getByRole('button', { name: 'Programar reunión' }));
    expect(await screen.findByText('No tienes permiso para programar reuniones de Administración.')).toBeInTheDocument();
  });
});

// ─── Editar reunión (G10) ────────────────────────────────────────────────────

/** Una reunión del 20 de noviembre de 2026 (futura respecto del reloj real de la prueba). */
function detalle(overrides: Partial<AdminMeetingDetalle> = {}): AdminMeetingDetalle {
  return {
    idReunion: 12,
    version: 2,
    estado: 'ACTIVA',
    integridad: 'OK',
    contenido: {
      tituloEvento: 'Seguimiento de cierre',
      descripcionEvento: 'Revisar entregables',
      fechaInicio: new Date(2026, 10, 20, 16, 0).toISOString(),
      fechaFin: new Date(2026, 10, 20, 17, 0).toISOString(),
      antelacionMinutos: 60,
      modalidad: 'VIRTUAL',
      ubicacionLat: null,
      ubicacionLng: null,
      ubicacionNombre: null,
      linkSesion: 'https://meet.google.com/abc-defg-hij',
    },
    proyectos: [{ idProyecto: 1, idEvento: 41, tituloProyecto: 'Huerto Comunitario', estadoProyecto: 'EN_PROGRESO' }],
    creador: { idUsuario: 8, nombre: 'Ana', apellido: 'Pérez' },
    politicaEdicion: 'TODOS_ADMINISTRADORES',
    editores: [],
    creadaEn: '2026-10-01T00:00:00.000Z',
    actualizadaEn: null,
    canceladaEn: null,
    canManage: true,
    motivoGestion: 'POLITICA',
    puedeCambiarPolitica: false,
    ...overrides,
  };
}

function renderEditar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminMeetingFormDialog open onOpenChange={onOpenChange} idReunion={12} />
    </QueryClientProvider>,
  );
}

describe('Editar reunión administrativa', () => {
  it('lee la reunión y precarga título, descripción, horario, modalidad, enlace y proyectos', async () => {
    servicios.getAdminMeeting.mockResolvedValue(detalle());
    renderEditar();
    expect(screen.getByRole('dialog', { name: 'Editar reunión administrativa' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Título de la reunión')).toHaveValue('Seguimiento de cierre');
    expect(servicios.getAdminMeeting).toHaveBeenCalledWith(12);
    expect(screen.getByLabelText('Descripción (opcional)')).toHaveValue('Revisar entregables');
    expect(screen.getByLabelText('Hora de inicio')).toHaveValue('16:00');
    expect(screen.getByLabelText('Hora de fin')).toHaveValue('17:00');
    expect(screen.getByRole('radio', { name: 'Virtual' })).toBeChecked();
    expect(screen.getByLabelText('Enlace de conexión virtual')).toHaveValue('https://meet.google.com/abc-defg-hij');
    expect(within(screen.getByRole('list', { name: 'Proyectos seleccionados' })).getByText('Huerto Comunitario')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
  });

  it('guarda con PATCH y la versión leída: reprograma, cambia la modalidad y agrega y quita proyectos', async () => {
    servicios.getAdminMeeting.mockResolvedValue(detalle());
    servicios.updateAdminMeeting.mockResolvedValue(detalle({ version: 3 }));
    renderEditar();
    await screen.findByLabelText('Título de la reunión');
    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '15:00' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Híbrida' }));
    await invitar(/Plataforma de Tutorías/);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Huerto Comunitario de la reunión' }));
    // Híbrida exige el lugar: sin él no se envía.
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Marca la ubicación de la sesión en el mapa.')).toBeInTheDocument();
    expect(servicios.updateAdminMeeting).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: 'Virtual' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(servicios.updateAdminMeeting).toHaveBeenCalledTimes(1));
    const [id, cuerpo] = servicios.updateAdminMeeting.mock.calls[0];
    expect(id).toBe(12);
    expect(cuerpo).toMatchObject({
      version: 2,
      proyectos: [2],
      modalidad: 'VIRTUAL',
      fechaInicio: new Date(2026, 10, 20, 15, 0).toISOString(),
      ubicacionLat: null,
    });
    // Quien no puede cambiar la política no la envía (el backend respondería 403).
    expect(cuerpo).not.toHaveProperty('politicaEdicion');
    expect(cuerpo).not.toHaveProperty('editores');
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mensajes.aviso.exito).toHaveBeenCalledWith('Reunión actualizada', expect.any(String));
  });

  it('un 409 no pisa lo escrito: avisa, relee y deja cargar la versión actual antes de volver a guardar', async () => {
    servicios.getAdminMeeting.mockResolvedValueOnce(detalle()).mockResolvedValue(detalle({ version: 3, contenido: { ...detalle().contenido!, tituloEvento: 'Título de otro admin' } }));
    servicios.updateAdminMeeting.mockRejectedValueOnce(Object.assign(new Error('Conflict'), { statusCode: 409, body: { versionActual: 3 } }));
    renderEditar();
    fireEvent.change(await screen.findByLabelText('Título de la reunión'), { target: { value: 'Mi título' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText(/Otro administrador modificó esta reunión mientras la editabas/)).toBeInTheDocument();
    expect(screen.getByLabelText('Título de la reunión')).toHaveValue('Mi título');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: 'Cargar la versión actual' }));
    expect(screen.getByLabelText('Título de la reunión')).toHaveValue('Título de otro admin');
    servicios.updateAdminMeeting.mockResolvedValue(detalle({ version: 4 }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(servicios.updateAdminMeeting).toHaveBeenLastCalledWith(12, expect.objectContaining({ version: 3 })));
  });

  it('si el 409 es porque la cancelaron, lo dice y no deja guardar', async () => {
    servicios.getAdminMeeting.mockResolvedValueOnce(detalle()).mockResolvedValue(detalle({ version: 3, estado: 'CANCELADA', canceladaEn: '2026-10-25T00:00:00.000Z' }));
    servicios.updateAdminMeeting.mockRejectedValueOnce(Object.assign(new Error('Conflict'), { statusCode: 409 }));
    renderEditar();
    await screen.findByLabelText('Título de la reunión');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Esta reunión fue cancelada: ya no se puede editar.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar la versión actual' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });

  it('sin permiso de gestión lo explica y no deja guardar', async () => {
    servicios.getAdminMeeting.mockResolvedValue(detalle({ canManage: false, motivoGestion: null }));
    renderEditar();
    expect(await screen.findByText('No tienes permiso para editar esta reunión.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });
});
