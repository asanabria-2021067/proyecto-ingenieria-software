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

describe('CalendarSidebar — identidad de propietario distinta del tipo de evento (G04-C11, UI-34)', () => {
  it('"Mis proyectos" ya no muestra un punto de color por proyecto: solo nombre y casilla', () => {
    renderSidebar({ proyectos: [{ idProyecto: 1, tituloProyecto: 'Alfa' }, { idProyecto: 2, tituloProyecto: 'Beta' }] });
    const lista = screen.getByRole('heading', { name: 'Mis proyectos' }).parentElement as HTMLElement;
    expect(lista.querySelector('[class*="bg-cal-"]')).toBeNull();
    expect(lista.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Alfa' })).toBeChecked();
  });

  it('el avatar de quien comparte lleva contorno discontinuo con su tono (patrón, no solo color) y ya no un anillo sólido', () => {
    renderSidebar();
    const avatar = document.querySelector('aside li [data-slot="avatar"]') as HTMLElement;
    expect(avatar).toHaveClass('border-2', 'border-dashed', 'border-cal-2-strong');
    expect(avatar.className).not.toMatch(/\bring-/);
  });

  it('una leyenda en texto explica cómo reconocer lo compartido, y cada persona se nombra en su casilla', () => {
    renderSidebar({ compartidos: [ANA, LUIS], compartidosActivos: new Set([ANA.idUsuario]) });
    expect(screen.getByText(/Sus actividades llevan borde discontinuo y el nombre de la persona\./)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Ver el calendario de Ana García' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Ver el calendario de Luis Hernández' })).not.toBeChecked();
  });
});

describe('CalendarSidebar — mini calendario con días vecinos legibles (G05-R03)', () => {
  it('el calendario del estudiante pide el tono secundario para los días de meses vecinos, que aquí se pueden pulsar', () => {
    renderSidebar();
    const vecinos = [...document.querySelectorAll<HTMLElement>('button[data-adjacent-month="true"]')];
    expect(vecinos.length).toBeGreaterThan(0);
    for (const b of vecinos) {
      expect(b).toBeEnabled();
      expect(b).toHaveClass('text-text-secondary');
      expect(b).not.toHaveClass('text-text-disabled');
    }
  });
});

/**
 * G05-C06 (UI-15, UI-12, UI-31): lo que faltaba de la columna: "Mis proyectos",
 * meta de horas, varias personas a la vez, nombres accesibles y que nada de un
 * usuario quede en pantalla cuando llegan los datos de otro.
 */
describe('CalendarSidebar — "Mis proyectos" (G05-C06, UI-15)', () => {
  const PROYECTOS = [
    { idProyecto: 1, tituloProyecto: 'Plataforma de Tutorías UVG' },
    { idProyecto: 2, tituloProyecto: 'Laboratorio de Robótica' },
  ];
  const casilla = (nombre: string) => screen.getByRole('checkbox', { name: nombre });

  it('cada proyecto tiene su casilla con nombre accesible por su etiqueta; marcada = visible, desmarcada = oculto', () => {
    renderSidebar({ proyectos: PROYECTOS, proyectosOcultos: new Set([2]) });
    expect(casilla('Plataforma de Tutorías UVG')).toBeChecked();
    expect(casilla('Laboratorio de Robótica')).not.toBeChecked();
    // La etiqueta visible es la que nombra a la casilla (label[for]), no un aria-label paralelo.
    for (const p of PROYECTOS) {
      const control = casilla(p.tituloProyecto);
      expect(control).not.toHaveAttribute('aria-label');
      expect(document.querySelector(`label[for="${control.id}"]`)).toHaveTextContent(p.tituloProyecto);
    }
  });

  it('alternar un proyecto avisa solo de ese id, tanto desde la casilla como desde su etiqueta, y no toca lo compartido', () => {
    const onToggleProyecto = vi.fn();
    const { onToggleCompartido, onQuitarCompartido } = renderSidebar({ proyectos: PROYECTOS, onToggleProyecto });
    fireEvent.click(casilla('Laboratorio de Robótica'));
    fireEvent.click(screen.getByText('Plataforma de Tutorías UVG'));
    expect(onToggleProyecto.mock.calls).toEqual([[2], [1]]);
    expect(onToggleCompartido).not.toHaveBeenCalled();
    expect(onQuitarCompartido).not.toHaveBeenCalled();
  });

  it('sin proyectos muestra su vacío propio, distinto del vacío de calendarios compartidos', () => {
    renderSidebar({ proyectos: [], compartidos: [], compartidosActivos: new Set() });
    expect(screen.getByText('Sin proyectos con actividad en este rango.')).toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Mis proyectos', 'Calendarios compartidos conmigo']);
  });

  it('un nombre de proyecto muy largo se trunca dentro de su fila sin empujar la casilla', () => {
    renderSidebar({ proyectos: [{ idProyecto: 3, tituloProyecto: 'P'.repeat(180) }] });
    const etiqueta = screen.getByText('P'.repeat(180));
    expect(etiqueta).toHaveClass('min-w-0', 'flex-1', 'truncate');
    expect(casilla('P'.repeat(180))).toBeInTheDocument();
  });
});

describe('CalendarSidebar — meta de horas (G05-C06)', () => {
  it('sin meta no se dibuja la tarjeta; con meta muestra etiqueta, horas y porcentaje acotado a 0–100', () => {
    renderSidebar({ metaHoras: null });
    expect(screen.queryByRole('heading', { name: 'Meta de horas' })).not.toBeInTheDocument();
    cleanup();

    renderSidebar({ metaHoras: { etiqueta: 'Horas beca', actual: 30, requeridas: 40 } });
    expect(screen.getByRole('heading', { name: 'Meta de horas' })).toBeInTheDocument();
    expect(screen.getByText('Horas beca')).toBeInTheDocument();
    expect(screen.getByText('30 de 40 hrs')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    cleanup();

    renderSidebar({ metaHoras: { etiqueta: 'Horas beca', actual: 90, requeridas: 40 } });
    expect(screen.getByText('100%')).toBeInTheDocument();
    cleanup();

    // La página solo pasa una meta cuando las horas requeridas son mayores que cero.
    renderSidebar({ metaHoras: { etiqueta: 'Horas beca', actual: 0, requeridas: 40 } });
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('0 de 40 hrs')).toBeInTheDocument();
  });
});

describe('CalendarSidebar — varias personas y destinatario (G05-C06, UI-12/UI-31)', () => {
  const dos = { compartidos: [ANA, LUIS], compartidosActivos: new Set([ANA.idUsuario]) };
  const ver = (nombre: string) => screen.getByRole('checkbox', { name: `Ver el calendario de ${nombre}` });
  const quitar = (nombre: string) => screen.getByRole('button', { name: `Quitar el calendario de ${nombre}` });

  it('cada persona refleja su propio estado activo y alternarla avisa solo de su id', () => {
    const { onToggleCompartido, onQuitarCompartido } = renderSidebar(dos);
    expect(ver('Ana García')).toBeChecked();
    expect(ver('Luis Hernández')).not.toBeChecked();
    fireEvent.click(ver('Luis Hernández'));
    fireEvent.click(ver('Ana García'));
    expect(onToggleCompartido.mock.calls).toEqual([[LUIS.idUsuario], [ANA.idUsuario]]);
    // Ocultar o mostrar nunca borra la relación.
    expect(onQuitarCompartido).not.toHaveBeenCalled();
  });

  it('pulsar el nombre de la persona equivale a su casilla (la etiqueta está asociada) y no dispara "Quitar"', () => {
    const { onToggleCompartido, onQuitarCompartido } = renderSidebar(dos);
    fireEvent.click(screen.getByText('Luis Hernández'));
    expect(onToggleCompartido.mock.calls).toEqual([[LUIS.idUsuario]]);
    expect(onQuitarCompartido).not.toHaveBeenCalled();
  });

  it('"Quitar" avisa del id correcto y, mientras está en curso, solo se deshabilita el botón de esa persona', () => {
    const { onQuitarCompartido } = renderSidebar({ ...dos, quitandoCompartido: LUIS.idUsuario });
    expect(quitar('Luis Hernández')).toBeDisabled();
    expect(quitar('Ana García')).toBeEnabled();
    // Su casilla sigue operable: quitar y ocultar son acciones independientes.
    expect(ver('Luis Hernández')).toBeEnabled();
    fireEvent.click(quitar('Luis Hernández'));
    fireEvent.click(quitar('Ana García'));
    expect(onQuitarCompartido.mock.calls).toEqual([[ANA.idUsuario]]);
  });

  it('todo control de la sección tiene nombre accesible y las iniciales del avatar no lo duplican', () => {
    renderSidebar(dos);
    const seccion = screen.getByRole('heading', { name: 'Calendarios compartidos conmigo' }).closest('.card-base') as HTMLElement;
    for (const control of seccion.querySelectorAll<HTMLElement>('button, [role="checkbox"]')) {
      expect((control.getAttribute('aria-label') ?? '').length, control.outerHTML.slice(0, 80)).toBeGreaterThan(10);
    }
    const nombres = [...seccion.querySelectorAll<HTMLElement>('button[aria-label], [role="checkbox"][aria-label]')].map((c) => c.getAttribute('aria-label'));
    expect(new Set(nombres).size).toBe(nombres.length);
    for (const icono of seccion.querySelectorAll('svg')) expect(icono.getAttribute('aria-hidden') === 'true' || icono.hasAttribute('aria-label')).toBe(true);
  });

  it('el reintento de una agenda llama a SU refetch sin argumentos y no al de la otra persona ni al de la lista', () => {
    const refetchAna = vi.fn();
    const refetchLuis = vi.fn();
    const onReintentarCompartidos = vi.fn();
    renderSidebar({
      ...dos,
      compartidosActivos: new Set([ANA.idUsuario, LUIS.idUsuario]),
      onReintentarCompartidos,
      estadoAgendas: new Map([
        [ANA.idUsuario, { isLoading: false, isError: true, revocada: false, refetch: refetchAna }],
        [LUIS.idUsuario, { isLoading: false, isError: true, revocada: false, refetch: refetchLuis }],
      ]),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar el calendario de Luis Hernández' }));
    expect(refetchLuis).toHaveBeenCalledTimes(1);
    expect(refetchAna).not.toHaveBeenCalled();
    expect(onReintentarCompartidos).not.toHaveBeenCalled();
  });

  it('un 403 y un 500 simultáneos se distinguen por persona: la revocada no ofrece reintento y la otra sí', () => {
    renderSidebar({
      ...dos,
      compartidosActivos: new Set([ANA.idUsuario, LUIS.idUsuario]),
      estadoAgendas: new Map([
        [ANA.idUsuario, { isLoading: false, isError: true, revocada: true, refetch: vi.fn() }],
        [LUIS.idUsuario, { isLoading: false, isError: true, revocada: false, refetch: vi.fn() }],
      ]),
    });
    const alertas = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(alertas).toEqual(['Ana ya no comparte su calendario contigo.', 'No se pudo cargar este calendario.Reintentar']);
    expect(screen.queryByRole('button', { name: 'Reintentar el calendario de Ana García' })).not.toBeInTheDocument();
    // Aun revocada, la persona puede quitarse el calendario de la lista.
    expect(quitar('Ana García')).toBeEnabled();
  });
});

describe('CalendarSidebar — sin restos de otro usuario (G05-C06, UI-13)', () => {
  it('al llegar los datos de otra cuenta, no queda en pantalla ninguna persona, proyecto ni estado de la anterior', () => {
    const propsA = {
      proyectos: [{ idProyecto: 1, tituloProyecto: 'Proyecto de A' }],
      proyectosOcultos: new Set([1]),
      compartidos: [ANA, LUIS],
      compartidosActivos: new Set([ANA.idUsuario, LUIS.idUsuario]),
      quitandoCompartido: ANA.idUsuario,
      estadoAgendas: new Map([[LUIS.idUsuario, { isLoading: false, isError: true, revocada: true, refetch: vi.fn() }]]),
    };
    renderSidebar(propsA);
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    cleanup();

    // Usuario B: otro proyecto, una sola persona (la misma Ana) que B no tiene activada.
    renderSidebar({ proyectos: [{ idProyecto: 8, tituloProyecto: 'Proyecto de B' }], compartidos: [ANA], compartidosActivos: new Set() });
    expect(screen.queryByText('Proyecto de A')).not.toBeInTheDocument();
    expect(screen.queryByText('Luis Hernández')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Proyecto de B' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Ver el calendario de Ana García' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Quitar el calendario de Ana García' })).toBeEnabled();
  });

  it('la columna no guarda estado propio de comparticiones: con las mismas props siempre dibuja lo mismo', () => {
    const props = { compartidos: [ANA, LUIS], compartidosActivos: new Set([LUIS.idUsuario]) };
    renderSidebar(props);
    const primera = screen.getAllByRole('checkbox').map((c) => `${c.getAttribute('aria-label')}:${c.getAttribute('aria-checked')}`);
    cleanup();
    renderSidebar(props);
    expect(screen.getAllByRole('checkbox').map((c) => `${c.getAttribute('aria-label')}:${c.getAttribute('aria-checked')}`)).toEqual(primera);
    expect(primera).toEqual(['Ver el calendario de Ana García:false', 'Ver el calendario de Luis Hernández:true']);
  });
});
