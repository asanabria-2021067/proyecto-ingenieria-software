import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UsuarioBusquedaDto, SolicitudAmistadPendienteDto } from '@/lib/types/social';

const buscarUsuariosMock = vi.fn();
const getSolicitudesPendientesMock = vi.fn();
const crearSolicitudAmistadMock = vi.fn().mockResolvedValue({ idAmistad: 1, estado: 'PENDIENTE' });
const aceptarSolicitudAmistadMock = vi.fn().mockResolvedValue({ idAmistad: 1, estado: 'ACEPTADA' });
const rechazarSolicitudAmistadMock = vi.fn().mockResolvedValue({ idAmistad: 1, estado: 'RECHAZADA' });
const eliminarAmistadMock = vi.fn().mockResolvedValue({ eliminado: true });
const seguirUsuarioMock = vi.fn().mockResolvedValue({ idSeguimiento: 1 });
const dejarDeSeguirMock = vi.fn().mockResolvedValue({ eliminado: true });

vi.mock('@/lib/services/social', () => ({
  buscarUsuarios: (q: string) => buscarUsuariosMock(q),
  getSolicitudesPendientes: () => getSolicitudesPendientesMock(),
  getAmigos: () => Promise.resolve([]),
  getSiguiendo: () => Promise.resolve([]),
  getSeguidores: () => Promise.resolve([]),
  getFeedSocial: () => Promise.resolve({ proyectosDeAmigos: [], proyectosDeSeguidos: [] }),
  crearSolicitudAmistad: (id: number) => crearSolicitudAmistadMock(id),
  aceptarSolicitudAmistad: (id: number) => aceptarSolicitudAmistadMock(id),
  rechazarSolicitudAmistad: (id: number) => rechazarSolicitudAmistadMock(id),
  eliminarAmistad: (id: number) => eliminarAmistadMock(id),
  seguirUsuario: (id: number) => seguirUsuarioMock(id),
  dejarDeSeguir: (id: number) => dejarDeSeguirMock(id),
}));

function usuario(overrides: Partial<UsuarioBusquedaDto> = {}): UsuarioBusquedaDto {
  return {
    idUsuario: 1,
    nombre: 'Ana',
    apellido: 'Pérez',
    fotoUrl: null,
    esAmigo: false,
    solicitudPendiente: null,
    loSigo: false,
    ...overrides,
  };
}

function solicitud(overrides: Partial<SolicitudAmistadPendienteDto> = {}): SolicitudAmistadPendienteDto {
  return {
    idAmistad: 5,
    estado: 'PENDIENTE',
    fechaSolicitud: new Date().toISOString(),
    solicitante: { idUsuario: 2, nombre: 'Beto', apellido: 'Gómez', fotoUrl: null },
    ...overrides,
  };
}

async function renderPersonas() {
  const { default: PersonasPage } = await import('@/app/dashboard/personas/page');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PersonasPage />
    </QueryClientProvider>,
  );
}

describe('PersonasPage', () => {
  it('no busca con menos de 2 caracteres', async () => {
    getSolicitudesPendientesMock.mockResolvedValue([]);
    await renderPersonas();

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/i), { target: { value: 'a' } });

    await waitFor(() => expect(buscarUsuariosMock).not.toHaveBeenCalled());
  });

  it('muestra "Agregar amigo" para un usuario sin relación y crea la solicitud al hacer clic', async () => {
    getSolicitudesPendientesMock.mockResolvedValue([]);
    buscarUsuariosMock.mockResolvedValue([usuario({ idUsuario: 10, nombre: 'Carla' })]);
    await renderPersonas();

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/i), { target: { value: 'carla' } });

    const boton = await screen.findByRole('button', { name: /Agregar amigo/i });
    fireEvent.click(boton);

    await waitFor(() => expect(crearSolicitudAmistadMock).toHaveBeenCalledWith(10));
  });

  it('muestra "Solicitud enviada" deshabilitado cuando la solicitud pendiente fue enviada por mí', async () => {
    getSolicitudesPendientesMock.mockResolvedValue([]);
    buscarUsuariosMock.mockResolvedValue([
      usuario({ idUsuario: 11, solicitudPendiente: { direccion: 'enviada' } }),
    ]);
    await renderPersonas();

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/i), { target: { value: 'ana' } });

    const boton = await screen.findByRole('button', { name: /Solicitud enviada/i });
    expect(boton).toBeDisabled();
  });

  it('muestra "Amigos" con opción de eliminar cuando ya son amigos', async () => {
    getSolicitudesPendientesMock.mockResolvedValue([]);
    buscarUsuariosMock.mockResolvedValue([usuario({ idUsuario: 12, esAmigo: true })]);
    await renderPersonas();

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/i), { target: { value: 'ana' } });

    const boton = await screen.findByRole('button', { name: /Amigos/i });
    fireEvent.click(boton);

    await waitFor(() => expect(eliminarAmistadMock).toHaveBeenCalledWith(12));
  });

  it('lista solicitudes pendientes y permite aceptarlas', async () => {
    getSolicitudesPendientesMock.mockResolvedValue([solicitud()]);
    await renderPersonas();

    expect(await screen.findByText('Beto Gómez')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Aceptar/i }));

    await waitFor(() => expect(aceptarSolicitudAmistadMock).toHaveBeenCalledWith(5));
  });
});
