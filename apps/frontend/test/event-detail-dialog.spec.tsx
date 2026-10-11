import '@testing-library/jest-dom/vitest';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mensajesMock = vi.hoisted(() => ({
  confirmar: vi.fn(),
  aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() },
}));
vi.mock('../lib/mensajes', () => mensajesMock);

const eventsMock = vi.hoisted(() => ({ deleteEvent: vi.fn() }));
vi.mock('../lib/services/events', () => eventsMock);

const membersMock = vi.hoisted(() => ({ useProjectMembers: vi.fn() }));
vi.mock('../hooks/use-project-members', () => membersMock);

import { EventDetailDialog, enfocarDisparador, formatRangoEvento } from '../components/calendar/event-detail-dialog';
import type { MiEventoDTO } from '../lib/services/events';
import type { EventoCompartidoDTO } from '../lib/services/calendar-shares';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  membersMock.useProjectMembers.mockReturnValue({
    members: [{ idUsuario: 4, nombre: 'Ana', apellido: 'García', correo: 'a@uvg.edu.gt', fotoUrl: null, idRolProyecto: 1 }],
  });
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function evento(overrides: Partial<MiEventoDTO> = {}): MiEventoDTO {
  return {
    idEvento: 7,
    idProyecto: 3,
    tituloEvento: 'Taller de diseño',
    descripcionEvento: 'Traer laptop.',
    fechaInicio: new Date(2026, 9, 8, 9, 0).toISOString(),
    fechaFin: new Date(2026, 9, 8, 10, 30).toISOString(),
    antelacionMinutos: 1440,
    modalidad: 'MIXTA',
    ubicacionLat: 14.6,
    ubicacionLng: -90.5,
    ubicacionNombre: 'Edificio CIT, salón 210',
    linkSesion: 'https://meet.google.com/abc',
    rolesDestino: [],
    tipoEvento: 'TUTORIA',
    invitados: [],
    proyecto: { idProyecto: 3, tituloProyecto: 'App de tutorías' },
    ...overrides,
  };
}

describe('EventDetailDialog (HU-184 T-324)', () => {
  it('muestra cuándo, dónde, link, recordatorio, modalidad y proyecto', () => {
    render(<EventDetailDialog evento={evento()} open onOpenChange={vi.fn()} editable={false} onEditar={vi.fn()} />, {
      wrapper,
    });

    expect(screen.getByRole('heading', { name: 'Taller de diseño' })).toBeInTheDocument();
    expect(screen.getByText('App de tutorías')).toBeInTheDocument();
    expect(screen.getByText('Híbrida')).toBeInTheDocument();
    expect(screen.getByText(/09:00–10:30/)).toBeInTheDocument();
    expect(screen.getByText('Edificio CIT, salón 210')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir en el mapa/ })).toHaveAttribute(
      'href',
      expect.stringContaining('mlat=14.6&mlon=-90.5'),
    );
    expect(screen.getByRole('link', { name: 'https://meet.google.com/abc' })).toHaveAttribute('target', '_blank');
    expect(screen.getByText('1 día antes')).toBeInTheDocument();
    expect(screen.getByText('Traer laptop.')).toBeInTheDocument();
  });

  it('un evento virtual no muestra la sección de ubicación', () => {
    render(
      <EventDetailDialog
        evento={evento({ modalidad: 'VIRTUAL', ubicacionLat: null, ubicacionLng: null, ubicacionNombre: null })}
        open
        onOpenChange={vi.fn()}
        editable={false}
        onEditar={vi.fn()}
      />,
      { wrapper },
    );

    expect(screen.queryByText('Dónde')).not.toBeInTheDocument();
    expect(screen.getByText('Link de la sesión')).toBeInTheDocument();
  });

  it('un link guardado que no es http(s) se muestra como texto, sin href', () => {
    render(
      <EventDetailDialog
        evento={evento({ modalidad: 'VIRTUAL', linkSesion: 'javascript:alert(1)' })}
        open
        onOpenChange={vi.fn()}
        editable={false}
        onEditar={vi.fn()}
      />,
      { wrapper },
    );

    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).not.toBeInTheDocument();
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
  });

  it('quien no lidera el proyecto solo ve "Ver proyecto"', () => {
    render(<EventDetailDialog evento={evento()} open onOpenChange={vi.fn()} editable={false} onEditar={vi.fn()} />, {
      wrapper,
    });

    expect(screen.getByRole('link', { name: 'Ver proyecto' })).toHaveAttribute('href', '/dashboard/projects/3');
    expect(screen.queryByRole('button', { name: /Editar evento/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar evento/ })).not.toBeInTheDocument();
  });

  it('el líder puede pasar a editar', () => {
    const onEditar = vi.fn();
    render(<EventDetailDialog evento={evento()} open onOpenChange={vi.fn()} editable onEditar={onEditar} />, { wrapper });

    fireEvent.click(screen.getByRole('button', { name: /Editar evento/ }));
    expect(onEditar).toHaveBeenCalledWith(expect.objectContaining({ idEvento: 7 }));
  });

  it('el líder puede eliminar el evento tras confirmar', async () => {
    mensajesMock.confirmar.mockResolvedValueOnce(true);
    eventsMock.deleteEvent.mockResolvedValueOnce(undefined);
    const onOpenChange = vi.fn();
    render(<EventDetailDialog evento={evento()} open onOpenChange={onOpenChange} editable onEditar={vi.fn()} />, {
      wrapper,
    });

    fireEvent.click(screen.getByRole('button', { name: /Eliminar evento/ }));
    await waitFor(() => expect(eventsMock.deleteEvent).toHaveBeenCalledWith(3, 7));
    expect(mensajesMock.confirmar.mock.calls[0][0]).toMatchObject({ destructiva: true });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('formatRangoEvento muestra inicio y fin completos si el evento cambia de día', () => {
    const texto = formatRangoEvento(new Date(2026, 9, 8, 22, 0), new Date(2026, 9, 9, 1, 0));
    expect(texto).toContain('22:00');
    expect(texto).toContain('01:00');
    expect(texto).toContain(' – ');
  });

  it('muestra el tipo con su color y para quién es (todo el proyecto o los invitados por nombre)', () => {
    const { rerender } = render(
      <EventDetailDialog evento={evento()} open onOpenChange={vi.fn()} editable={false} onEditar={vi.fn()} />,
      { wrapper },
    );
    expect(screen.getByText('Tutoría')).toHaveClass('bg-cal-1');
    expect(screen.getByText('Todo el proyecto')).toBeInTheDocument();

    rerender(<EventDetailDialog evento={evento({ invitados: [4] })} open onOpenChange={vi.fn()} editable={false} onEditar={vi.fn()} />);
    expect(screen.getByText('Ana García')).toBeInTheDocument();
  });

  it('un recordatorio en 0 se muestra como "Sin recordatorio"', () => {
    render(<EventDetailDialog evento={evento({ antelacionMinutos: 0 })} open onOpenChange={vi.fn()} editable onEditar={vi.fn()} />, {
      wrapper,
    });
    expect(screen.getByText('Sin recordatorio')).toBeInTheDocument();
  });

  // G01-C08 (UI-01): antes este caso recibía el DTO completo (con invitados, link, descripción)
  // y verificaba que se mostrara "1 invitado". Esa expectativa codificaba la fuga F262-01: un
  // evento compartido llega ahora como EventoCompartidoDTO y el diálogo no puede pintar nada privado.
  it('un evento de un calendario compartido con DETALLE es de solo lectura: tipo, título, proyecto y cuándo, nada más', () => {
    const compartido: EventoCompartidoDTO = {
      idEvento: 7,
      fechaInicio: new Date(2026, 9, 8, 9, 0).toISOString(),
      fechaFin: new Date(2026, 9, 8, 10, 30).toISOString(),
      visibilidad: 'DETALLE',
      tituloEvento: 'Taller de diseño',
      tipoEvento: 'TUTORIA',
      modalidad: 'MIXTA',
      proyecto: { idProyecto: 3, tituloProyecto: 'App de tutorías' },
    };
    render(
      <EventDetailDialog evento={compartido} open onOpenChange={vi.fn()} editable onEditar={vi.fn()} compartidoPor={{ nombre: 'Luis Hernández' }} />,
      { wrapper },
    );

    expect(screen.getByRole('heading', { name: 'Taller de diseño' })).toBeInTheDocument();
    expect(screen.getByText('App de tutorías')).toBeInTheDocument();
    expect(screen.getByText('Tutoría')).toHaveClass('bg-cal-1');
    expect(screen.getByText('Híbrida')).toBeInTheDocument();
    expect(screen.getByText(/09:00–10:30/)).toBeInTheDocument();
    expect(screen.getByText('Calendario de Luis Hernández · solo lectura')).toBeInTheDocument();
    for (const privado of ['Link de la sesión', 'Descripción', 'Abrir en el mapa', 'Recordatorio', 'Para quién', 'Dónde']) {
      expect(screen.queryByText(privado)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /Editar evento/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar evento/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver proyecto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    // Sin acceso al equipo del proyecto: nunca se consulta.
    expect(membersMock.useProjectMembers).toHaveBeenLastCalledWith(0);
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
  });

  it('un evento compartido OCUPADO solo muestra el horario: sin título, tipo, modalidad ni proyecto', () => {
    const compartido: EventoCompartidoDTO = {
      idEvento: 9,
      fechaInicio: new Date(2026, 9, 8, 9, 0).toISOString(),
      fechaFin: new Date(2026, 9, 8, 10, 30).toISOString(),
      visibilidad: 'OCUPADO',
    };
    const { container } = render(
      <EventDetailDialog evento={compartido} open onOpenChange={vi.fn()} editable={false} onEditar={vi.fn()} compartidoPor={{ nombre: 'Luis Hernández' }} />,
      { wrapper },
    );

    expect(screen.getByRole('heading', { name: 'Ocupado' })).toBeInTheDocument();
    expect(screen.getByText(/09:00–10:30/)).toBeInTheDocument();
    expect(screen.getByText('Calendario de Luis Hernández · solo lectura')).toBeInTheDocument();
    expect(screen.queryByText('Taller de diseño')).not.toBeInTheDocument();
    expect(screen.queryByText('App de tutorías')).not.toBeInTheDocument();
    expect(screen.queryByText('Tutoría')).not.toBeInTheDocument();
    expect(screen.queryByText('Híbrida')).not.toBeInTheDocument();
    expect(container.querySelector('.pill')).toBeNull();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar|Eliminar/ })).not.toBeInTheDocument();
  });
});

describe('EventDetailDialog — el foco vuelve a quien abrió el detalle (G03-C15, UI-10/D-17)', () => {
  const CLAVE = 'evento-7-2026-10-08-yo';

  function Escenario({ compartido = false }: { compartido?: boolean }) {
    const [open, setOpen] = useState(false);
    const [clave, setClave] = useState<string | null>(null);
    const dto: MiEventoDTO | EventoCompartidoDTO = compartido
      ? { idEvento: 7, fechaInicio: evento().fechaInicio, fechaFin: evento().fechaFin, visibilidad: 'OCUPADO' }
      : evento();
    return (
      <>
        <button
          type="button"
          data-evento-key={CLAVE}
          onClick={() => {
            setClave(CLAVE);
            setOpen(true);
          }}
        >
          Bloque del evento
        </button>
        <EventDetailDialog
          evento={dto}
          open={open}
          onOpenChange={setOpen}
          editable={false}
          onEditar={vi.fn()}
          compartidoPor={compartido ? { nombre: 'Luis Hernández' } : null}
          restaurarFocoA={clave}
        />
      </>
    );
  }

  it.each([
    ['Escape', (dialogo: HTMLElement) => fireEvent.keyDown(dialogo, { key: 'Escape' })],
    ['la X', (dialogo: HTMLElement) => fireEvent.click(within(dialogo).getByRole('button', { name: 'Close' }))],
  ])('al cerrar con %s el foco regresa al bloque que lo abrió (no a <body>)', async (_nombre, cerrar) => {
    render(<Escenario />, { wrapper });
    const bloque = screen.getByRole('button', { name: 'Bloque del evento' });
    bloque.focus();
    fireEvent.click(bloque);
    const dialogo = await screen.findByRole('dialog');
    await waitFor(() => expect(dialogo.contains(document.activeElement)).toBe(true));

    cerrar(dialogo);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(bloque).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('un detalle compartido (OCUPADO) también devuelve el foco al bloque', async () => {
    render(<Escenario compartido />, { wrapper });
    const bloque = screen.getByRole('button', { name: 'Bloque del evento' });
    fireEvent.click(bloque);
    const dialogo = await screen.findByRole('dialog', { name: 'Ocupado' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(bloque).toHaveFocus();
  });

  it('enfocarDisparador busca por clave estable, nunca por título, y rechaza claves con caracteres de selector', () => {
    const { unmount } = render(<button type="button" data-evento-key="evento-9-2026-10-09-yo">Taller</button>);
    expect(enfocarDisparador('evento-9-2026-10-09-yo')).toBe(true);
    expect(document.activeElement).toHaveTextContent('Taller');
    expect(enfocarDisparador('evento-99-2026-10-09-yo')).toBe(false);
    expect(enfocarDisparador('"] [data-x="')).toBe(false);
    expect(enfocarDisparador(null)).toBe(false);
    unmount();
  });
});

/**
 * G05-C09 (UI-15, T-325): eliminación desde el detalle (cancelar la
 * confirmación, fallo del servidor, en curso), cierre por teclado y que un
 * evento compartido nunca ofrezca acciones aunque llegue `editable`.
 */
describe('EventDetailDialog — eliminar, cerrar y solo lectura (G05-C09)', () => {
  const renderLider = (onOpenChange = vi.fn()) => {
    render(<EventDetailDialog evento={evento()} open onOpenChange={onOpenChange} editable onEditar={vi.fn()} />, { wrapper });
    return onOpenChange;
  };

  beforeEach(() => {
    mensajesMock.confirmar.mockReset();
    mensajesMock.aviso.exito.mockReset();
    mensajesMock.aviso.error.mockReset();
    eventsMock.deleteEvent.mockReset();
  });

  it('cancelar la confirmación no elimina, no avisa y deja el detalle abierto', async () => {
    mensajesMock.confirmar.mockResolvedValueOnce(false);
    const onOpenChange = renderLider();
    fireEvent.click(screen.getByRole('button', { name: /Eliminar evento/ }));
    await waitFor(() => expect(mensajesMock.confirmar).toHaveBeenCalledTimes(1));
    expect(mensajesMock.confirmar.mock.calls[0][0]).toMatchObject({ titulo: '¿Eliminar el evento «Taller de diseño»?', textoAccion: 'Eliminar evento', destructiva: true });
    expect(eventsMock.deleteEvent).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mensajesMock.aviso.exito).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Taller de diseño' })).toBeInTheDocument();
  });

  it.each([403, 404, 500])('si el servidor responde %i al eliminar, se avisa el error y el detalle sigue abierto y operable', async (statusCode) => {
    mensajesMock.confirmar.mockResolvedValueOnce(true);
    eventsMock.deleteEvent.mockRejectedValueOnce(Object.assign(new Error('detalle interno'), { statusCode }));
    const onOpenChange = renderLider();
    fireEvent.click(screen.getByRole('button', { name: /Eliminar evento/ }));
    await waitFor(() => expect(mensajesMock.aviso.error).toHaveBeenCalledTimes(1));
    const [titulo, detalle] = mensajesMock.aviso.error.mock.calls[0] as [string, string];
    expect(titulo).toBe('No se pudo eliminar el evento');
    expect(detalle).not.toMatch(/detalle interno|\b[45]\d\d\b/);
    expect(mensajesMock.aviso.exito).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    await waitFor(() => expect(screen.getByRole('button', { name: /Eliminar evento/ })).toBeEnabled());
    expect(screen.getByRole('button', { name: /Editar evento/ })).toBeEnabled();
  });

  it('mientras se elimina, Editar y Eliminar quedan bloqueados y Escape o la X no cierran', async () => {
    mensajesMock.confirmar.mockResolvedValueOnce(true);
    let resolver: () => void = () => {};
    eventsMock.deleteEvent.mockReturnValueOnce(new Promise<void>((resolve) => (resolver = resolve)));
    const onOpenChange = renderLider();
    fireEvent.click(screen.getByRole('button', { name: /Eliminar evento/ }));
    await waitFor(() => expect(eventsMock.deleteEvent).toHaveBeenCalledTimes(1));
    const dialogo = screen.getByRole('dialog');
    await waitFor(() => expect(within(dialogo).getByRole('button', { name: /Editar evento/ })).toBeDisabled());
    fireEvent.keyDown(dialogo, { key: 'Escape' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Close' }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mensajesMock.confirmar).toHaveBeenCalledTimes(1);

    resolver();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mensajesMock.aviso.exito).toHaveBeenCalledWith('Evento eliminado');
    expect(eventsMock.deleteEvent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Escape', (dialogo: HTMLElement) => fireEvent.keyDown(dialogo, { key: 'Escape' })],
    ['la X', (dialogo: HTMLElement) => fireEvent.click(within(dialogo).getByRole('button', { name: 'Close' }))],
  ])('sin nada en curso, %s cierra el detalle sin pedir confirmación ni eliminar', (_nombre, cerrar) => {
    const onOpenChange = renderLider();
    cerrar(screen.getByRole('dialog'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mensajesMock.confirmar).not.toHaveBeenCalled();
    expect(eventsMock.deleteEvent).not.toHaveBeenCalled();
  });

  it.each(['DETALLE', 'OCUPADO'] as const)('un evento compartido (%s) no ofrece editar, eliminar ni enlaces aunque el componente reciba editable', (visibilidad) => {
    const base = { idEvento: 7, fechaInicio: evento().fechaInicio, fechaFin: evento().fechaFin };
    const compartido: EventoCompartidoDTO =
      visibilidad === 'OCUPADO'
        ? { ...base, visibilidad }
        : { ...base, visibilidad, tituloEvento: 'Taller de diseño', tipoEvento: 'TUTORIA', modalidad: 'VIRTUAL', proyecto: { idProyecto: 3, tituloProyecto: 'App de tutorías' } };
    const onEditar = vi.fn();
    render(<EventDetailDialog evento={compartido} open onOpenChange={vi.fn()} editable onEditar={onEditar} compartidoPor={{ nombre: 'Luis Hernández' }} />, { wrapper });
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).queryByRole('button', { name: /Editar|Eliminar/ })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole('link')).not.toBeInTheDocument();
    expect(dialogo.querySelector('a[href]')).toBeNull();
    for (const privado of ['Traer laptop.', 'meet.google.com', 'Edificio CIT', 'Recordatorio', 'Ana García']) expect(dialogo).not.toHaveTextContent(privado);
    expect(onEditar).not.toHaveBeenCalled();
    expect(mensajesMock.confirmar).not.toHaveBeenCalled();
  });

  it('quien no lidera no puede eliminar ni con teclado: no existe ningún control que llame a la eliminación', () => {
    render(<EventDetailDialog evento={evento()} open onOpenChange={vi.fn()} editable={false} onEditar={vi.fn()} />, { wrapper });
    const dialogo = screen.getByRole('dialog');
    const controles = within(dialogo).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim());
    expect(controles.some((nombre) => /Eliminar|Editar/.test(nombre ?? ''))).toBe(false);
    expect(within(dialogo).getByRole('link', { name: 'Ver proyecto' })).toHaveAttribute('href', '/dashboard/projects/3');
  });
});
