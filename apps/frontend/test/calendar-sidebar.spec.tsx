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

const ANA = { idUsuario: 9, nombre: 'Ana', apellido: 'García', correo: 'ana@uvg.edu.gt', fotoUrl: null, tono: 2 as const };

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
