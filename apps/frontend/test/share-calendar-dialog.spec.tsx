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

describe('ShareCalendarDialog — estados del buscador (G03-C10, UI-40)', () => {
  function errorHttp(statusCode: number) {
    return Object.assign(new Error('x'), { statusCode });
  }

  it('con una sola letra no consulta y explica el mínimo de dos', async () => {
    sharesMock.getCalendariosCompartidos.mockResolvedValue({ compartidoPorMi: [], compartidosConmigo: [] });
    render(<ShareCalendarDialog open onOpenChange={vi.fn()} />, { wrapper });
    await screen.findByText('Todavía no compartes tu agenda con nadie.');

    expect(screen.getByText('Busca por nombre o apellido.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar persona'), { target: { value: 'A' } });
    expect(await screen.findByText('Escribe al menos 2 letras para buscar.')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 400));
    expect(socialMock.buscarUsuarios).not.toHaveBeenCalled();
    expect(screen.queryByRole('list', { name: 'Resultados' })).not.toBeInTheDocument();
  });

  it('con dos letras busca (tras el debounce), muestra "Buscando..." y luego un vacío legítimo', async () => {
    sharesMock.getCalendariosCompartidos.mockResolvedValue({ compartidoPorMi: [], compartidosConmigo: [] });
    let resolver: (r: { items: never[]; hasMore: boolean }) => void = () => {};
    socialMock.buscarUsuarios.mockImplementation(() => new Promise((resolve) => (resolver = resolve)));
    render(<ShareCalendarDialog open onOpenChange={vi.fn()} />, { wrapper });

    fireEvent.change(screen.getByLabelText('Buscar persona'), { target: { value: 'An' } });
    expect((await screen.findByText('Buscando...', {}, { timeout: 2000 })).closest('[role="status"]')).not.toBeNull();
    expect(socialMock.buscarUsuarios).toHaveBeenCalledWith({ q: 'An' });
    resolver({ items: [], hasMore: false });
    expect(await screen.findByText('No se encontraron personas.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([403, 500])('un HTTP %s no se presenta como "sin resultados": muestra el error y permite reintentar', async (status) => {
    sharesMock.getCalendariosCompartidos.mockResolvedValue({ compartidoPorMi: [], compartidosConmigo: [] });
    socialMock.buscarUsuarios.mockRejectedValueOnce(errorHttp(status)).mockResolvedValueOnce({ items: [ANA], hasMore: false });
    render(<ShareCalendarDialog open onOpenChange={vi.fn()} />, { wrapper });

    fireEvent.change(screen.getByLabelText('Buscar persona'), { target: { value: 'Ana' } });
    const alerta = await screen.findByRole('alert', {}, { timeout: 2000 });
    expect(alerta).toHaveTextContent('No se pudo buscar personas.');
    expect(screen.queryByText('No se encontraron personas.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar búsqueda' }));
    expect(await screen.findByRole('button', { name: 'Compartir con Ana García' })).toBeInTheDocument();
    expect(socialMock.buscarUsuarios).toHaveBeenCalledTimes(2);
  });

  it('la lista "Compartida con" distingue cargando y error de un vacío real', async () => {
    sharesMock.getCalendariosCompartidos.mockRejectedValueOnce(errorHttp(500)).mockResolvedValueOnce({ compartidoPorMi: [LUIS], compartidosConmigo: [] });
    render(<ShareCalendarDialog open onOpenChange={vi.fn()} />, { wrapper });

    expect(screen.getByRole('status')).toHaveTextContent('Cargando...');
    expect(screen.queryByText('Todavía no compartes tu agenda con nadie.')).not.toBeInTheDocument();
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('No se pudo cargar con quién compartes tu agenda.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Luis Hernández')).toBeInTheDocument();
    expect(screen.getByText('Compartida con (1)')).toBeInTheDocument();
  });

  it('mientras una compartición está en curso, los demás botones "Compartir" quedan deshabilitados (sin doble envío)', async () => {
    sharesMock.getCalendariosCompartidos.mockResolvedValue({ compartidoPorMi: [], compartidosConmigo: [] });
    const LUIS_RESULTADO = { idUsuario: 5, nombre: 'Luis', apellido: 'Hernández', fotoUrl: null };
    socialMock.buscarUsuarios.mockResolvedValue({ items: [ANA, LUIS_RESULTADO], hasMore: false });
    sharesMock.compartirCalendario.mockImplementation(() => new Promise(() => {}));
    render(<ShareCalendarDialog open onOpenChange={vi.fn()} />, { wrapper });

    fireEvent.change(screen.getByLabelText('Buscar persona'), { target: { value: 'Ana' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Compartir con Ana García' }, { timeout: 2000 }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Compartir con Luis Hernández' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Compartir con Ana García' })).toBeDisabled();
    expect(sharesMock.compartirCalendario).toHaveBeenCalledTimes(1);
    // Los resultados de búsqueda no traen correo (solo nombre y carrera).
    expect(screen.queryByText(/@uvg\.edu\.gt/)).not.toBeInTheDocument();
  });
});
