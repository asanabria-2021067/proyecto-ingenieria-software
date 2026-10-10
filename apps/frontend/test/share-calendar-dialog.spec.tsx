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

const socialMock = vi.hoisted(() => ({ buscarUsuarios: vi.fn() }));
vi.mock('../lib/services/social', () => socialMock);

const sharesMock = vi.hoisted(() => ({
  getCalendariosCompartidos: vi.fn(),
  compartirCalendario: vi.fn(),
  dejarDeCompartirCalendario: vi.fn(),
  getAgendaCompartida: vi.fn(),
}));
vi.mock('../lib/services/calendar-shares', () => sharesMock);

import { ShareCalendarDialog } from '../components/calendar/share-calendar-dialog';

afterEach(() => {
  cleanup();
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const LUIS = { idUsuario: 5, nombre: 'Luis', apellido: 'Hernández', correo: 'luis@uvg.edu.gt', fotoUrl: null };
const ANA = { idUsuario: 4, nombre: 'Ana', apellido: 'García', fotoUrl: null, carrera: 'Sistemas' };

describe('ShareCalendarDialog (HU-184)', () => {
  it('lista con quién está compartida la agenda y permite quitar a alguien', async () => {
    sharesMock.getCalendariosCompartidos.mockResolvedValue({ compartidoPorMi: [LUIS], compartidosConmigo: [] });
    sharesMock.dejarDeCompartirCalendario.mockResolvedValue({ eliminado: true });
    render(<ShareCalendarDialog open onOpenChange={vi.fn()} />, { wrapper });

    expect(await screen.findByText('Luis Hernández')).toBeInTheDocument();
    expect(screen.getByText('Compartida con (1)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dejar de compartir con Luis Hernández' }));
    await waitFor(() => expect(sharesMock.dejarDeCompartirCalendario).toHaveBeenCalledWith(5));
    await waitFor(() => expect(mensajesMock.aviso.exito).toHaveBeenCalledWith('Dejaste de compartir tu agenda', expect.any(String)));
    // Reversible: no pide confirmación.
    expect(mensajesMock.confirmar).not.toHaveBeenCalled();
  });

  it('busca personas y comparte la agenda con la elegida', async () => {
    sharesMock.getCalendariosCompartidos.mockResolvedValue({ compartidoPorMi: [], compartidosConmigo: [] });
    socialMock.buscarUsuarios.mockResolvedValue({ items: [ANA], hasMore: false });
    sharesMock.compartirCalendario.mockResolvedValue(ANA);
    render(<ShareCalendarDialog open onOpenChange={vi.fn()} />, { wrapper });

    expect(await screen.findByText('Todavía no compartes tu agenda con nadie.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar persona'), { target: { value: 'Ana' } });

    const boton = await screen.findByRole('button', { name: 'Compartir con Ana García' }, { timeout: 2000 });
    expect(socialMock.buscarUsuarios).toHaveBeenCalledWith({ q: 'Ana' });
    fireEvent.click(boton);

    await waitFor(() => expect(sharesMock.compartirCalendario).toHaveBeenCalledWith(4));
    await waitFor(() => expect(mensajesMock.aviso.exito).toHaveBeenCalledWith('Agenda compartida', expect.stringContaining('Ana')));
  });

  it('una persona con la que ya se compartió aparece como "Compartida" y no se puede volver a compartir', async () => {
    sharesMock.getCalendariosCompartidos.mockResolvedValue({ compartidoPorMi: [{ ...ANA, correo: 'ana@uvg.edu.gt' }], compartidosConmigo: [] });
    socialMock.buscarUsuarios.mockResolvedValue({ items: [ANA], hasMore: false });
    render(<ShareCalendarDialog open onOpenChange={vi.fn()} />, { wrapper });

    await screen.findByText('Compartida con (1)');
    fireEvent.change(screen.getByLabelText('Buscar persona'), { target: { value: 'Ana' } });

    const boton = await screen.findByRole('button', { name: 'Ya compartida con Ana' }, { timeout: 2000 });
    expect(boton).toBeDisabled();
  });

  it('si compartir falla, avisa el error', async () => {
    sharesMock.getCalendariosCompartidos.mockResolvedValue({ compartidoPorMi: [], compartidosConmigo: [] });
    socialMock.buscarUsuarios.mockResolvedValue({ items: [ANA], hasMore: false });
    sharesMock.compartirCalendario.mockRejectedValue(new Error('boom'));
    render(<ShareCalendarDialog open onOpenChange={vi.fn()} />, { wrapper });

    fireEvent.change(screen.getByLabelText('Buscar persona'), { target: { value: 'Ana' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Compartir con Ana García' }, { timeout: 2000 }));

    await waitFor(() => expect(mensajesMock.aviso.error).toHaveBeenCalled());
    expect(mensajesMock.aviso.error.mock.calls[0][0]).toBe('No se pudo compartir tu agenda');
  });
});
