import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mensajesMock = vi.hoisted(() => ({
  confirmar: vi.fn(),
  aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() },
}));
vi.mock('../lib/mensajes', () => mensajesMock);

const eventsMock = vi.hoisted(() => ({ deleteEvent: vi.fn() }));
vi.mock('../lib/services/events', () => eventsMock);

import { EventDetailDialog, formatRangoEvento } from '../components/calendar/event-detail-dialog';
import type { MiEventoDTO } from '../lib/services/events';

afterEach(() => {
  cleanup();
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
    expect(screen.getByText('Mixta')).toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: /Cancelar evento/ })).not.toBeInTheDocument();
  });

  it('el líder puede pasar a editar', () => {
    const onEditar = vi.fn();
    render(<EventDetailDialog evento={evento()} open onOpenChange={vi.fn()} editable onEditar={onEditar} />, { wrapper });

    fireEvent.click(screen.getByRole('button', { name: /Editar evento/ }));
    expect(onEditar).toHaveBeenCalledWith(expect.objectContaining({ idEvento: 7 }));
  });

  it('el líder puede cancelar el evento tras confirmar', async () => {
    mensajesMock.confirmar.mockResolvedValueOnce(true);
    eventsMock.deleteEvent.mockResolvedValueOnce(undefined);
    const onOpenChange = vi.fn();
    render(<EventDetailDialog evento={evento()} open onOpenChange={onOpenChange} editable onEditar={vi.fn()} />, {
      wrapper,
    });

    fireEvent.click(screen.getByRole('button', { name: /Cancelar evento/ }));
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
});
