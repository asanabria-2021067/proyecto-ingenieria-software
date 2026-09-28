import '@testing-library/jest-dom/vitest';
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

const swalFire = vi.fn();
vi.mock('@/lib/swal', () => ({ default: { fire: (...args: unknown[]) => swalFire(...args) }, swalCustomClass: {} }));

function usuario(overrides: Partial<UsuarioBusquedaDto> = {}): UsuarioBusquedaDto {
  return {
    idUsuario: 1,
    nombre: 'Ana',
    apellido: 'Pérez',
    fotoUrl: null,
    esAmigo: false,
    solicitudPendiente: null,
    idAmistad: null,
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
  swalFire.mockClear();
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

  // T-195: el filtro de semestre vive dentro del popover de Filtros.
  it('T-195: el contador del botón Filtros suma también el filtro de semestre', async () => {
    await renderPersonas();
    await waitFor(() => expect(buscarUsuariosMock).toHaveBeenCalled());

    const botonFiltros = screen.getByRole('button', { name: /Filtros/i });
    fireEvent.click(botonFiltros);
    fireEvent.click(await screen.findByRole('button', { name: '1°-4°' }));

    expect(within(botonFiltros).getByText('1')).toBeInTheDocument();
  });

  it('T-195: filtrar por semestre desde el popover dispara la consulta con el rango elegido', async () => {
    await renderPersonas();
    await waitFor(() => expect(buscarUsuariosMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Filtros/i }));
    fireEvent.click(await screen.findByRole('button', { name: '8°+' }));

    await waitFor(() =>
      expect(buscarUsuariosMock).toHaveBeenCalledWith(
        expect.objectContaining({ semestreRango: '8+' }),
      ),
    );

    // Volver a "Todos" quita el filtro (undefined, no un string vacío).
    fireEvent.click(screen.getByRole('button', { name: 'Todos', pressed: false }));
    await waitFor(() =>
      expect(buscarUsuariosMock).toHaveBeenCalledWith(
        expect.objectContaining({ semestreRango: undefined }),
      ),
    );
  });

  it('la tarjeta muestra nombre, carrera y habilidades, y enlaza al perfil completo', async () => {
    buscarUsuariosMock.mockResolvedValue({
      items: [
        usuario({ idUsuario: 10, nombre: 'Carla', apellido: 'Ruiz', carrera: 'Ingeniería', habilidades: ['React'] }),
      ],
      hasMore: false,
    });
    await renderPersonas();

    const main = await screen.findByRole('main');
    expect(await within(main).findByText('Carla Ruiz')).toBeInTheDocument();
    expect(within(main).getByText('Ingeniería')).toBeInTheDocument();
    expect(within(main).getByText('React')).toBeInTheDocument();
    expect(within(main).getByRole('link', { name: /Ver perfil/i })).toHaveAttribute(
      'href',
      '/dashboard/personas/10',
    );
  });

  it('el toggle de vista cambia entre tarjetas y lista', async () => {
    buscarUsuariosMock.mockResolvedValue({
      items: [usuario({ idUsuario: 10, nombre: 'Carla', apellido: 'Ruiz' })],
      hasMore: false,
    });
    await renderPersonas();

    const main = await screen.findByRole('main');
    expect(await within(main).findByText('Carla Ruiz')).toBeInTheDocument();
    // en tarjetas, "Ver perfil" trae una flecha aparte del texto (article > a)
    expect(screen.getByRole('button', { name: 'Ver como tarjetas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ver como lista' }));

    expect(screen.getByRole('button', { name: 'Ver como lista' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Ver como tarjetas' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(main).getByText('Carla Ruiz')).toBeInTheDocument();
  });

  it('cada estado vacío renderiza su mensaje correspondiente', async () => {
    await renderPersonas();
    expect(await screen.findByText('No encontramos a nadie')).toBeInTheDocument();

    clickTab('Amigos de amigos');
    expect(await screen.findByText('Agregá a tu primer amigo')).toBeInTheDocument();

    clickTab('Mis amigos');
    expect(await screen.findByText('Todavía no tenés amigos')).toBeInTheDocument();
  });

  // T-195: chips de señal (motivo de recomendación) vs. chips de etiqueta
  // (habilidad) usan clases distintas — señal lleva el rol accent del
  // sistema de diseño, etiqueta se queda con la paleta tenue variada.
  it('T-195: el chip de motivo (señal) y el chip de habilidad (etiqueta) usan clases distintas', async () => {
    buscarUsuariosMock.mockResolvedValue({
      items: [usuario({ idUsuario: 10, nombre: 'Carla', mismaCarrera: true, habilidades: ['React'] })],
      hasMore: false,
    });
    await renderPersonas();

    const chipSenal = await screen.findByText('De tu carrera');
    const chipEtiqueta = screen.getByText('React');

    expect(chipSenal.className).toContain('pill-accent');
    expect(chipEtiqueta.className).not.toContain('pill-accent');
    expect(chipSenal.className).not.toBe(chipEtiqueta.className);
  });

  // La regla "sin colores literales" se retiró a propósito: el semestre y
  // las habilidades ahora usan la paleta variada del mockup de Stitch
  // (lib/social/badge-colors.ts, cubierta en badge-colors.spec.ts), en vez
  // de los tokens neutros del sistema de diseño.

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

  it('lista solicitudes pendientes y pide confirmación antes de aceptarlas', async () => {
    getSolicitudesPendientesMock.mockResolvedValue([solicitud()]);
    await renderPersonas();

    expect(await screen.findByText('Beto Gómez')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Aceptar/i }));
    expect(aceptarSolicitudAmistadMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Sí, aceptar solicitud' }));

    await waitFor(() => expect(aceptarSolicitudAmistadMock).toHaveBeenCalledWith(5));
    await waitFor(() =>
      expect(swalFire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'success', title: 'Solicitud aceptada' })),
    );
  });

  it('rechazar una solicitud pide confirmación y llama al servicio con el id de la amistad', async () => {
    getSolicitudesPendientesMock.mockResolvedValue([solicitud()]);
    await renderPersonas();

    fireEvent.click(await screen.findByRole('button', { name: /Rechazar/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, rechazar solicitud' }));

    await waitFor(() => expect(rechazarSolicitudAmistadMock).toHaveBeenCalledWith(5));
    await waitFor(() =>
      expect(swalFire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'success', title: 'Solicitud rechazada' })),
    );
  });

  it('cancelar la confirmación no llama a ningún servicio', async () => {
    getSolicitudesPendientesMock.mockResolvedValue([solicitud()]);
    await renderPersonas();

    fireEvent.click(await screen.findByRole('button', { name: /Aceptar/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(aceptarSolicitudAmistadMock).not.toHaveBeenCalled();
  });

  // T-210: la tarjeta llamaba a aceptarSolicitud/eliminarAmistad con
  // `idUsuario` en vez de `idAmistad`, que es lo que el backend espera.
  it('aceptar solicitud desde la tarjeta usa idAmistad, no idUsuario', async () => {
    buscarUsuariosMock.mockResolvedValue({
      items: [usuario({ idUsuario: 10, idAmistad: 55, solicitudPendiente: { direccion: 'recibida' } })],
      hasMore: false,
    });
    await renderPersonas();

    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar solicitud' }));

    await waitFor(() => expect(aceptarSolicitudAmistadMock).toHaveBeenCalledWith(55));
    expect(aceptarSolicitudAmistadMock).not.toHaveBeenCalledWith(10);
  });

  it('eliminar amistad desde la tarjeta pide confirmación, usa idAmistad y avisa el resultado', async () => {
    buscarUsuariosMock.mockResolvedValue({
      items: [usuario({ idUsuario: 10, idAmistad: 77, esAmigo: true })],
      hasMore: false,
    });
    await renderPersonas();

    fireEvent.click(await screen.findByRole('button', { name: 'Amigos' }));
    expect(eliminarAmistadMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar amistad' }));

    await waitFor(() => expect(eliminarAmistadMock).toHaveBeenCalledWith(77));
    await waitFor(() =>
      expect(swalFire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'success', title: 'Amistad eliminada' })),
    );
  });
});

// Regla de radios: los botones de acción usan el radio medio de «Ver
// proyecto» (rounded-md); las etiquetas informativas siguen como pill.
describe('PersonasPage — radio de los botones de acción', () => {
  beforeEach(() => {
    getSolicitudesPendientesMock.mockResolvedValue([]);
    getAmigosMock.mockResolvedValue([]);
  });

  it('«Agregar como amigo» y «Solicitud enviada» usan radio medio, no cápsula', async () => {
    buscarUsuariosMock.mockResolvedValue({
      items: [
        usuario({ idUsuario: 10, nombre: 'Carla', mismaCarrera: true, semestre: 6 }),
        usuario({ idUsuario: 11, nombre: 'Diego', solicitudPendiente: { direccion: 'enviada' } }),
      ],
      hasMore: false,
    });
    await renderPersonas();

    for (const nombre of ['Agregar como amigo', 'Solicitud enviada']) {
      const boton = await screen.findByRole('button', { name: nombre });
      expect(boton, nombre).toHaveClass('rounded-md');
      expect(boton, nombre).not.toHaveClass('rounded-pill');
    }
  });
});

// Pestañas con radio medio (no cápsula) y estados vacíos en tarjeta blanca,
// con el mismo criterio que Chats archivados.
describe('PersonasPage — pestañas y estados vacíos', () => {
  beforeEach(() => {
    getSolicitudesPendientesMock.mockResolvedValue([]);
    getAmigosMock.mockResolvedValue([]);
    buscarUsuariosMock.mockResolvedValue({ items: [], hasMore: false });
  });

  it('las cuatro pestañas usan radio medio y el activo conserva verde con texto blanco', async () => {
    await renderPersonas();

    const pestanas = screen.getAllByRole('tab');
    expect(pestanas.map((t) => t.textContent)).toEqual(['Todos', 'Amigos de amigos', 'Mi carrera', 'Mis amigos']);
    for (const t of pestanas) {
      expect(t).toHaveClass('rounded-md', 'data-[state=active]:bg-primary', 'data-[state=active]:text-on-primary');
      expect(t).not.toHaveClass('rounded-pill');
    }
  });

  it.each([
    ['Mis amigos', 'Todavía no tenés amigos', 'Buscá compañeros en la pestaña Todos y agregalos.'],
    ['Amigos de amigos', 'Agregá a tu primer amigo', 'Cuando tengas amigos vas a empezar a ver también a los suyos acá.'],
  ])('en «%s» el vacío es una tarjeta blanca con sus textos intactos y sin acción nueva', async (pestana, titulo, descripcion) => {
    await renderPersonas();
    clickTab(pestana);

    const tituloEl = await screen.findByText(titulo);
    const tarjeta = tituloEl.closest('[data-slot="empty"]') as HTMLElement;
    expect(tarjeta).toHaveClass('bg-surface-container-lowest', 'border-outline-variant/70', 'rounded-2xl', 'shadow-sm');
    expect(tarjeta).not.toHaveClass('border-dashed');
    expect(tarjeta).not.toHaveClass('bg-surface-container-low');
    expect(within(tarjeta).getByText(descripcion)).toBeInTheDocument();
    expect(within(tarjeta).queryByRole('button')).not.toBeInTheDocument();
    const icono = tarjeta.querySelector('[data-slot="empty-icon"]') as HTMLElement;
    expect(icono).toHaveClass('text-text-secondary', 'border-transparent');
  });
});

// «Sin recomendaciones por ahora» usa la misma tarjeta blanca que los demás vacíos.
describe('PersonasPage — vacío de recomendaciones', () => {
  beforeEach(() => {
    getSolicitudesPendientesMock.mockResolvedValue([]);
    getAmigosMock.mockResolvedValue([]);
    buscarUsuariosMock.mockResolvedValue({ items: [], hasMore: false });
  });

  it('se muestra en tarjeta blanca con su texto intacto y el icono neutro', async () => {
    await renderPersonas();

    const tarjeta = (await screen.findByText('Sin recomendaciones por ahora')).closest('[data-slot="empty"]') as HTMLElement;
    expect(tarjeta).toHaveClass('bg-surface-container-lowest', 'border-outline-variant/70', 'rounded-2xl', 'shadow-sm');
    expect(tarjeta).not.toHaveClass('border-dashed');
    expect(within(tarjeta).getByText('Agrega amigos o completa tu perfil para que te sugiramos personas.')).toBeInTheDocument();
    expect(tarjeta.querySelector('[data-slot="empty-icon"]')).toHaveClass('text-text-secondary', 'border-transparent');
  });
});
