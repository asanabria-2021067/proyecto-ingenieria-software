import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const sharesMock = vi.hoisted(() => ({
  getCalendariosCompartidos: vi.fn(),
  compartirCalendario: vi.fn(),
  dejarDeCompartirCalendario: vi.fn(),
  dejarDeRecibirCalendario: vi.fn(),
  getAgendaCompartida: vi.fn(),
}));
vi.mock('../lib/services/calendar-shares', () => sharesMock);

import { CalendarSidebar } from '../components/calendar/calendar-sidebar';
import { calendariosCompartidosQueryKey, useDejarDeRecibirCalendario } from '../hooks/use-calendar-shares';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ANA = { idUsuario: 9, nombre: 'Ana', apellido: 'García', fotoUrl: null, tono: 2 as const };
const LUIS = { idUsuario: 5, nombre: 'Luis', apellido: 'Hernández', fotoUrl: null, tono: 3 as const };

function renderSidebar(overrides: Partial<Parameters<typeof CalendarSidebar>[0]> = {}) {
  const onToggleCompartido = vi.fn();
  const onQuitarCompartido = vi.fn();
  render(
    <CalendarSidebar
      mini={{
        year: 2026,
        month: 9,
        todayKey: '2026-10-09',
        markedDates: new Set(),
        onPrevMonth: () => {},
        onNextMonth: () => {},
        onSelectDay: () => {},
      }}
      metaHoras={null}
      proyectos={[]}
      proyectosOcultos={new Set()}
      onToggleProyecto={() => {}}
      compartidos={[ANA]}
      compartidosActivos={new Set([ANA.idUsuario])}
      onToggleCompartido={onToggleCompartido}
      onQuitarCompartido={onQuitarCompartido}
      {...overrides}
    />,
  );
  return { onToggleCompartido, onQuitarCompartido };
}

describe('CalendarSidebar — quitar un calendario recibido (G01-C11, UI-31)', () => {
  it('ofrece "Quitar" por persona, distinto del check que solo oculta', () => {
    const { onToggleCompartido, onQuitarCompartido } = renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar el calendario de Ana García' }));
    expect(onQuitarCompartido).toHaveBeenCalledWith(ANA.idUsuario);
    expect(onToggleCompartido).not.toHaveBeenCalled();
  });

  it('el check de ver/ocultar no dispara "Quitar"', () => {
    const { onToggleCompartido, onQuitarCompartido } = renderSidebar();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Ver el calendario de Ana García' }));
    expect(onToggleCompartido).toHaveBeenCalledWith(ANA.idUsuario);
    expect(onQuitarCompartido).not.toHaveBeenCalled();
  });

  it('mientras la revocación está en curso, su botón queda deshabilitado', () => {
    renderSidebar({ quitandoCompartido: ANA.idUsuario });
    expect(screen.getByRole('button', { name: 'Quitar el calendario de Ana García' })).toBeDisabled();
  });
});

describe('useDejarDeRecibirCalendario (G01-C11, UI-31)', () => {
  function makeWrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return { client, wrapper };
  }

  it('llama al DELETE del destinatario, descarta la agenda cacheada de esa persona y refresca la lista', async () => {
    sharesMock.dejarDeRecibirCalendario.mockResolvedValue({ eliminado: true });
    const { client, wrapper } = makeWrapper();
    client.setQueryData(['agenda-compartida', ANA.idUsuario, 'a', 'b'], { eventos: [], tareas: [] });
    client.setQueryData(calendariosCompartidosQueryKey, { compartidoPorMi: [], compartidosConmigo: [ANA] });
    const invalidar = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDejarDeRecibirCalendario(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(ANA.idUsuario);
    });

    expect(sharesMock.dejarDeRecibirCalendario).toHaveBeenCalledWith(ANA.idUsuario);
    expect(client.getQueryData(['agenda-compartida', ANA.idUsuario, 'a', 'b'])).toBeUndefined();
    await waitFor(() => expect(invalidar).toHaveBeenCalledWith({ queryKey: calendariosCompartidosQueryKey }));
  });

  it('si la petición falla, no toca la caché: la persona sigue en la lista', async () => {
    sharesMock.dejarDeRecibirCalendario.mockRejectedValue(new Error('boom'));
    const { client, wrapper } = makeWrapper();
    client.setQueryData(['agenda-compartida', ANA.idUsuario, 'a', 'b'], { eventos: [], tareas: [] });
    const { result } = renderHook(() => useDejarDeRecibirCalendario(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(ANA.idUsuario).catch(() => undefined);
    });

    expect(client.getQueryData(['agenda-compartida', ANA.idUsuario, 'a', 'b'])).toEqual({ eventos: [], tareas: [] });
  });
});

describe('CalendarSidebar — carga, error y reintento de calendarios compartidos (G03-C09, UI-12/UI-39)', () => {
  it('un fallo al cargar la lista no se ve como "nadie te ha compartido": muestra el error y Reintentar', () => {
    const onReintentarCompartidos = vi.fn();
    renderSidebar({ compartidos: [], compartidosActivos: new Set(), compartidosEstado: 'error', onReintentarCompartidos });

    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('No se pudieron cargar los calendarios compartidos.');
    expect(screen.queryByText('Nadie te ha compartido su calendario todavía.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onReintentarCompartidos).toHaveBeenCalledTimes(1);
  });

  it('mientras la lista carga se anuncia el estado y no se muestra el vacío', () => {
    renderSidebar({ compartidos: [], compartidosActivos: new Set(), compartidosEstado: 'cargando' });
    expect(screen.getByRole('status')).toHaveTextContent('Cargando calendarios compartidos...');
    expect(screen.queryByText('Nadie te ha compartido su calendario todavía.')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('con la lista vacía de verdad sigue el mensaje de siempre', () => {
    renderSidebar({ compartidos: [], compartidosActivos: new Set(), compartidosEstado: 'listo' });
    expect(screen.getByText('Nadie te ha compartido su calendario todavía.')).toBeInTheDocument();
  });

  it('una persona cuya agenda falla muestra su error con reintento propio y la otra sigue visible sin alertas', () => {
    const refetch = vi.fn();
    renderSidebar({
      compartidos: [ANA, LUIS],
      compartidosActivos: new Set([ANA.idUsuario, LUIS.idUsuario]),
      estadoAgendas: new Map<number, { isLoading: boolean; isError: boolean; revocada: boolean; refetch: () => void }>([
        [ANA.idUsuario, { isLoading: false, isError: true, revocada: false, refetch }],
        [LUIS.idUsuario, { isLoading: false, isError: false, revocada: false, refetch: vi.fn() }],
      ]),
    });

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar este calendario.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar el calendario de Ana García' }));
    expect(refetch).toHaveBeenCalledTimes(1);
    // Luis: su check sigue operable y sin mensajes.
    expect(screen.getByRole('checkbox', { name: 'Ver el calendario de Luis Hernández' })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Reintentar el calendario de Luis Hernández' })).not.toBeInTheDocument();
  });

  it('mientras la agenda de una persona activada carga, se indica junto a su check; desactivada no muestra nada', () => {
    const estadoAgendas = new Map([[ANA.idUsuario, { isLoading: true, isError: false, revocada: false, refetch: vi.fn() }]]);
    const { rerender } = render(
      <CalendarSidebar
        mini={{ year: 2026, month: 9, todayKey: '2026-10-09', markedDates: new Set(), onPrevMonth: () => {}, onNextMonth: () => {}, onSelectDay: () => {} }}
        metaHoras={null}
        proyectos={[]}
        proyectosOcultos={new Set()}
        onToggleProyecto={() => {}}
        compartidos={[ANA]}
        compartidosActivos={new Set([ANA.idUsuario])}
        onToggleCompartido={() => {}}
        onQuitarCompartido={() => {}}
        estadoAgendas={estadoAgendas}
      />,
    );
    expect(screen.getByRole('status', { name: 'Cargando el calendario de Ana García' })).toBeInTheDocument();

    rerender(
      <CalendarSidebar
        mini={{ year: 2026, month: 9, todayKey: '2026-10-09', markedDates: new Set(), onPrevMonth: () => {}, onNextMonth: () => {}, onSelectDay: () => {} }}
        metaHoras={null}
        proyectos={[]}
        proyectosOcultos={new Set()}
        onToggleProyecto={() => {}}
        compartidos={[ANA]}
        compartidosActivos={new Set()}
        onToggleCompartido={() => {}}
        onQuitarCompartido={() => {}}
        estadoAgendas={estadoAgendas}
      />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('una revocación (403) se explica sin ofrecer reintento, porque ya no hay permiso', () => {
    renderSidebar({
      estadoAgendas: new Map([[ANA.idUsuario, { isLoading: false, isError: true, revocada: true, refetch: vi.fn() }]]),
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Ana ya no comparte su calendario contigo.');
    expect(screen.queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument();
  });
});

describe('CalendarSidebar — columna plegable en móvil y mini calendario (G04-C09, UI-41/UI-42)', () => {
  const disparador = () => screen.getByRole('button', { name: 'Filtros y calendarios' });
  const contenido = () => document.querySelector('[data-slot="collapsible-content"]') as HTMLElement;

  it('empieza abierta: el control solo existe bajo lg y el contenido completo está disponible', () => {
    renderSidebar();
    expect(disparador()).toHaveAttribute('aria-expanded', 'true');
    expect(disparador()).toHaveClass('lg:hidden');
    expect(contenido()).toHaveAttribute('data-state', 'open');
    expect(screen.getByRole('checkbox', { name: 'Ver el calendario de Ana García' })).toBeInTheDocument();
  });

  it('al plegar y volver a abrir, las casillas siguen ahí y operables; plegada, el contenido solo se oculta bajo lg', () => {
    const { onToggleCompartido } = renderSidebar();
    fireEvent.click(disparador());
    expect(disparador()).toHaveAttribute('aria-expanded', 'false');
    expect(contenido()).toHaveAttribute('data-state', 'closed');
    // Oculta en móvil por clase; desde lg vuelve a mostrarse aunque el estado sea "cerrado".
    expect(contenido()).toHaveClass('data-[state=closed]:hidden', 'lg:data-[state=closed]:block');
    expect(contenido()).not.toHaveAttribute('hidden');

    fireEvent.click(disparador());
    expect(disparador()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ver el calendario de Ana García' }));
    expect(onToggleCompartido).toHaveBeenCalledWith(ANA.idUsuario);
  });

  it('el control anuncia qué despliega (aria-controls apunta al contenido)', () => {
    renderSidebar();
    expect(disparador().getAttribute('aria-controls')).toBe(contenido().id);
  });

  it('en la vista Mes el mini calendario se oculta bajo lg (la rejilla grande ya es el mes) y fuera de Mes se muestra siempre', () => {
    renderSidebar({ miniRedundanteEnMovil: true });
    const tarjetaMini = screen.getByRole('button', { name: 'Mes anterior' }).closest('.card-base') as HTMLElement;
    expect(tarjetaMini).toHaveClass('hidden', 'lg:block');
    cleanup();
    renderSidebar();
    expect(screen.getByRole('button', { name: 'Mes anterior' }).closest('.card-base')).not.toHaveClass('hidden');
  });

  it('en el calendario del estudiante "hoy" del mini usa el primario, como las vistas', () => {
    renderSidebar();
    expect(document.querySelector('aside [aria-current="date"]')).toHaveClass('bg-primary', 'text-on-primary');
  });
});
