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
  const disparador = screen.queryByRole('button', { name: /Buscar proyecto para invitar/ }) ?? screen.getByRole('button', { name: 'Agregar otro proyecto' });
  fireEvent.click(disparador);
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
