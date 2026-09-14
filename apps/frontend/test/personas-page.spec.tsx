import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UsuarioBusquedaDto, SolicitudAmistadPendienteDto } from '@/lib/types/social';

const buscarUsuariosMock = vi.fn();
const getSolicitudesPendientesMock = vi.fn();
const getAmigosMock = vi.fn();
const crearSolicitudAmistadMock = vi.fn().mockResolvedValue({ idAmistad: 1, estado: 'PENDIENTE' });
const aceptarSolicitudAmistadMock = vi.fn().mockResolvedValue({ idAmistad: 1, estado: 'ACEPTADA' });
const rechazarSolicitudAmistadMock = vi.fn().mockResolvedValue({ idAmistad: 1, estado: 'RECHAZADA' });
const eliminarAmistadMock = vi.fn().mockResolvedValue({ eliminado: true });
const seguirUsuarioMock = vi.fn().mockResolvedValue({ idSeguimiento: 1 });
const dejarDeSeguirMock = vi.fn().mockResolvedValue({ eliminado: true });

vi.mock('@/lib/services/social', () => ({
  buscarUsuarios: (filtros: unknown) => buscarUsuariosMock(filtros),
  getSolicitudesPendientes: () => getSolicitudesPendientesMock(),
  getAmigos: () => getAmigosMock(),
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

vi.mock('@/lib/services/catalogs', () => ({
  getHabilidades: () => Promise.resolve([{ idHabilidad: 1, nombreHabilidad: 'React' }]),
  getIntereses: () => Promise.resolve([{ idInteres: 1, nombreInteres: 'IA' }]),
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
    carrera: null,
    semestre: null,
    mismaCarrera: false,
    amigosEnComun: 0,
    habilidades: [],
    intereses: [],
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

/** Radix Tabs selecciona en `onMouseDown`, no en `click` (ver
 * @radix-ui/react-tabs `TabsTrigger`); `fireEvent.click` no dispara el
 * mousedown sintético que Testing Library normalmente emite en un click
 * real de usuario. */
function clickTab(name: string) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });
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

beforeEach(() => {
  getSolicitudesPendientesMock.mockResolvedValue([]);
  getAmigosMock.mockResolvedValue([]);
  buscarUsuariosMock.mockResolvedValue({ items: [], hasMore: false });
});

describe('PersonasPage', () => {
  it('cambiar de pestaña dispara la consulta correspondiente', async () => {
    await renderPersonas();
    await waitFor(() =>
      expect(buscarUsuariosMock).toHaveBeenCalledWith(
        expect.objectContaining({ carrera: false, amigosDeAmigos: false, soloAmigos: false }),
      ),
    );

    clickTab('Mi carrera');
    await waitFor(() =>
      expect(buscarUsuariosMock).toHaveBeenCalledWith(
        expect.objectContaining({ carrera: true, amigosDeAmigos: false, soloAmigos: false }),
      ),
    );

    clickTab('Mis amigos');
    await waitFor(() =>
      expect(buscarUsuariosMock).toHaveBeenCalledWith(
        expect.objectContaining({ carrera: false, amigosDeAmigos: false, soloAmigos: true }),
      ),
    );
  });

  it('el contador del botón de filtros refleja los chips seleccionados', async () => {
    await renderPersonas();
    await waitFor(() => expect(buscarUsuariosMock).toHaveBeenCalled());

    const botonFiltros = screen.getByRole('button', { name: /Filtros/i });
    expect(within(botonFiltros).queryByText('1')).not.toBeInTheDocument();

    fireEvent.click(botonFiltros);
    fireEvent.click(await screen.findByRole('button', { name: 'React' }));

    expect(within(botonFiltros).getByText('1')).toBeInTheDocument();
  });

  it('la tarjeta muestra nombre, carrera y habilidades, y enlaza al perfil completo', async () => {
    buscarUsuariosMock.mockResolvedValue({
      items: [
        usuario({ idUsuario: 10, nombre: 'Carla', apellido: 'Ruiz', carrera: 'Ingeniería', habilidades: ['React'] }),
      ],
      hasMore: false,
    });
    await renderPersonas();

    expect(await screen.findByText('Carla Ruiz')).toBeInTheDocument();
    expect(screen.getByText('Ingeniería')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver perfil/i })).toHaveAttribute(
      'href',
      '/dashboard/personas/10',
    );
  });

  it('cada estado vacío renderiza su mensaje correspondiente', async () => {
    await renderPersonas();
    expect(await screen.findByText('No encontramos a nadie')).toBeInTheDocument();

    clickTab('Amigos de amigos');
    expect(await screen.findByText('Agregá a tu primer amigo')).toBeInTheDocument();

    clickTab('Mis amigos');
    expect(await screen.findByText('Todavía no tenés amigos')).toBeInTheDocument();
  });

  it('no usa clases de color literales de Tailwind (solo tokens del sistema de diseño)', () => {
    const fuente = readFileSync(join(process.cwd(), 'app/dashboard/personas/page.tsx'), 'utf8');
    const colorLiteral =
      /\b(?:bg|text|border)-(?:red|green|blue|yellow|gray|slate|zinc|neutral|stone|orange|amber|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?\b/;
    expect(fuente).not.toMatch(colorLiteral);
    expect(fuente).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('agrega como amigo desde la tarjeta y refleja el nuevo estado sin refrescar', async () => {
    // 1ra llamada (fetch inicial): sin relación. Desde la 2da en adelante
    // (refetch que dispara invalidateQueries tras la mutación): ya con
    // solicitud enviada. La tarjeta debe seguir el dato fresco de
    // `resultados`, no un snapshot tomado al montar.
    buscarUsuariosMock.mockResolvedValueOnce({ items: [usuario({ idUsuario: 10, nombre: 'Carla' })], hasMore: false });
    buscarUsuariosMock.mockResolvedValue({
      items: [usuario({ idUsuario: 10, nombre: 'Carla', solicitudPendiente: { direccion: 'enviada' } })],
      hasMore: false,
    });
    await renderPersonas();

    fireEvent.click(await screen.findByRole('button', { name: 'Agregar como amigo' }));

    await waitFor(() => expect(crearSolicitudAmistadMock).toHaveBeenCalledWith(10));
    expect(await screen.findByRole('button', { name: 'Solicitud enviada' })).toBeDisabled();
  });

  it('lista solicitudes pendientes y permite aceptarlas', async () => {
    getSolicitudesPendientesMock.mockResolvedValue([solicitud()]);
    await renderPersonas();

    expect(await screen.findByText('Beto Gómez')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Aceptar/i }));

    await waitFor(() => expect(aceptarSolicitudAmistadMock).toHaveBeenCalledWith(5));
  });
});
