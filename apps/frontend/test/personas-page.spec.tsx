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

const searchParamsMock = vi.hoisted(() => vi.fn(() => new URLSearchParams()));
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock(),
  usePathname: () => '/dashboard/personas',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const usuarioActualMock = vi.hoisted(() => vi.fn(() => ({ data: undefined as unknown, isPending: false })));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => usuarioActualMock() }));

if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

vi.mock('@/lib/services/catalogs', () => ({
  getHabilidades: () =>
    Promise.resolve([
      { idHabilidad: 1, nombreHabilidad: 'React' },
      { idHabilidad: 2, nombreHabilidad: 'Node' },
    ]),
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

/** La sección vive en `?seccion=` (Descubrir sin parámetro). */
async function renderPersonas(seccion?: 'amigos' | 'amigos-de-amigos') {
  searchParamsMock.mockReturnValue(new URLSearchParams(seccion ? `seccion=${seccion}` : ''));
  const { default: PersonasPage } = await import('@/app/dashboard/personas/page');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PersonasPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getSolicitudesPendientesMock.mockResolvedValue([]);
  getAmigosMock.mockResolvedValue([]);
  buscarUsuariosMock.mockResolvedValue({ items: [], hasMore: false });
  usuarioActualMock.mockReturnValue({ data: undefined, isPending: false });
  swalFire.mockClear();
});

/** Escape sobre el menú abierto, que es quien lo escucha. */
async function cerrarMenu() {
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
}

function elegirSemestre(opcion: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filtrar por semestre' }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: opcion }));
}

const directorio = () => screen.findByRole('region', { name: 'Directorio de personas' });

describe('PersonasPage', () => {
  it.each([
    [undefined, { amigosDeAmigos: false, soloAmigos: false }],
    ['amigos', { amigosDeAmigos: false, soloAmigos: true }],
    ['amigos-de-amigos', { amigosDeAmigos: true, soloAmigos: false }],
  ] as const)('la sección ?seccion=%s pide su consulta al backend', async (seccion, flags) => {
    await renderPersonas(seccion);
    await waitFor(() => expect(buscarUsuariosMock).toHaveBeenCalledWith(expect.objectContaining(flags)));
  });

  it('sin botón «Filtros» ni panel: buscador, semestre, habilidades, intereses y vista en una fila', async () => {
    await renderPersonas();
    await waitFor(() => expect(buscarUsuariosMock).toHaveBeenCalled());

    expect(screen.queryByRole('button', { name: /^Filtros/ })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filtrar por semestre' })).toHaveTextContent('Todos los semestres');
    expect(screen.getByRole('button', { name: 'Filtrar por habilidades' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtrar por intereses' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver como tarjetas' })).toBeInTheDocument();
  });

  it('semestre: selección única que pide el rango al backend y vuelve a «Todos» sin parámetro', async () => {
    await renderPersonas();
    await waitFor(() => expect(buscarUsuariosMock).toHaveBeenCalled());

    elegirSemestre('8.º en adelante');
    await waitFor(() => expect(buscarUsuariosMock).toHaveBeenCalledWith(expect.objectContaining({ semestreRango: '8+' })));
    expect(screen.getByRole('button', { name: 'Quitar filtro Semestre 8.º en adelante' })).toBeInTheDocument();

    elegirSemestre('Todos los semestres');
    await waitFor(() => expect(buscarUsuariosMock).toHaveBeenLastCalledWith(expect.objectContaining({ semestreRango: undefined })));
  });

  it('habilidades e intereses: varias a la vez, el menú no se cierra, el disparador cuenta y cada chip se quita', async () => {
    await renderPersonas();
    await waitFor(() => expect(buscarUsuariosMock).toHaveBeenCalled());

    const habilidades = screen.getByRole('button', { name: 'Filtrar por habilidades' });
    fireEvent.keyDown(habilidades, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'React' }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Node' }));
    // Sigue abierto tras cada elección.
    expect(screen.getByRole('menuitemcheckbox', { name: 'React' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemcheckbox', { name: 'Node' })).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(buscarUsuariosMock).toHaveBeenLastCalledWith(expect.objectContaining({ habilidades: [1, 2] })));
    expect(screen.getByRole('button', { name: 'Filtrar por habilidades, 2 seleccionadas' })).toHaveTextContent('2');
    await cerrarMenu();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Filtrar por intereses' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'IA' }));
    await waitFor(() =>
      expect(buscarUsuariosMock).toHaveBeenLastCalledWith(expect.objectContaining({ habilidades: [1, 2], intereses: [1] })),
    );
    await cerrarMenu();

    const aplicados = screen.getByRole('group', { name: 'Filtros aplicados' });
    fireEvent.click(within(aplicados).getByRole('button', { name: 'Quitar filtro React' }));
    await waitFor(() => expect(buscarUsuariosMock).toHaveBeenLastCalledWith(expect.objectContaining({ habilidades: [2], intereses: [1] })));

    fireEvent.click(within(aplicados).getByRole('button', { name: 'Limpiar todo' }));
    await waitFor(() => expect(buscarUsuariosMock).toHaveBeenLastCalledWith(expect.objectContaining({ habilidades: [], intereses: [] })));
    expect(screen.queryByRole('group', { name: 'Filtros aplicados' })).not.toBeInTheDocument();
  });

  it('«Solo personas de mi carrera» filtra por la carrera real y se combina con la sección y los demás filtros', async () => {
    usuarioActualMock.mockReturnValue({ data: { perfil: { carrera: { idCarrera: 3, nombreCarrera: 'Ingeniería en Sistemas' } } }, isPending: false });
    await renderPersonas('amigos-de-amigos');
    await waitFor(() => expect(buscarUsuariosMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('checkbox', { name: 'Solo personas de mi carrera' }));
    elegirSemestre('1.º–4.º');
    await waitFor(() =>
      expect(buscarUsuariosMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ carrera: true, amigosDeAmigos: true, semestreRango: '1-4' }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Quitar filtro Mi carrera: Ingeniería en Sistemas' })).toBeInTheDocument();
  });

  it('sin carrera en el perfil, el filtro de carrera queda desactivado y lo explica, sin inventar una', async () => {
    usuarioActualMock.mockReturnValue({ data: { perfil: { carrera: null } }, isPending: false });
    await renderPersonas();
    const casilla = screen.getByRole('checkbox', { name: 'Solo personas de mi carrera' });
    expect(casilla).toBeDisabled();
    expect(casilla).toHaveAccessibleDescription('Agrega tu carrera en tu perfil para usar este filtro.');
    await waitFor(() => expect(buscarUsuariosMock).toHaveBeenCalledWith(expect.objectContaining({ carrera: false })));
  });

  it('cambiar a lista no reinicia los filtros', async () => {
    await renderPersonas();
    await waitFor(() => expect(buscarUsuariosMock).toHaveBeenCalled());
    elegirSemestre('5.º–7.º');
    fireEvent.click(screen.getByRole('button', { name: 'Ver como lista' }));
    expect(screen.getByRole('combobox', { name: 'Filtrar por semestre' })).toHaveTextContent('5.º–7.º');
    expect(screen.getByRole('button', { name: 'Quitar filtro Semestre 5.º–7.º' })).toBeInTheDocument();
  });

  it('la tarjeta muestra nombre, carrera y habilidades, y enlaza al perfil completo', async () => {
    buscarUsuariosMock.mockResolvedValue({
      items: [
        usuario({ idUsuario: 10, nombre: 'Carla', apellido: 'Ruiz', carrera: 'Ingeniería', habilidades: ['React'] }),
      ],
      hasMore: false,
    });
    await renderPersonas();

    const main = await directorio();
    expect(await within(main).findByText('Carla Ruiz')).toBeInTheDocument();
    expect(within(main).getByText('Ingeniería')).toBeInTheDocument();
    expect(within(main).getByText('React')).toBeInTheDocument();
    expect(within(main).getByRole('link', { name: /Ver perfil/i })).toHaveAttribute(
      'href',
      '/dashboard/personas/10',
    );
  });

  it('la rejilla reparte columnas por el ancho del contenido, no de la ventana', async () => {
    buscarUsuariosMock.mockResolvedValue({ items: [usuario({ idUsuario: 10, nombre: 'Carla', apellido: 'Ruiz' })], hasMore: false });
    await renderPersonas();
    const rejilla = (await within(await directorio()).findByText('Carla Ruiz')).closest('ul') as HTMLElement;
    expect(rejilla).toHaveClass('@xl/personas:grid-cols-2', '@5xl/personas:grid-cols-3');
    expect(rejilla).not.toHaveClass('xl:grid-cols-3');
  });

  it('el toggle de vista cambia entre tarjetas y lista', async () => {
    buscarUsuariosMock.mockResolvedValue({
      items: [usuario({ idUsuario: 10, nombre: 'Carla', apellido: 'Ruiz' })],
      hasMore: false,
    });
    await renderPersonas();

    const main = await directorio();
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

  it('cada sección renderiza su estado vacío', async () => {
    const vista = await renderPersonas();
    expect(await screen.findByText('No encontramos a nadie')).toBeInTheDocument();
    vista.unmount();

    const amigosDeAmigos = await renderPersonas('amigos-de-amigos');
    expect(await screen.findByText('Agrega a tu primer amigo')).toBeInTheDocument();
    amigosDeAmigos.unmount();

    await renderPersonas('amigos');
    expect(await screen.findByText('Aún no tienes amigos')).toBeInTheDocument();
  });

  it('amigos de amigos sin coincidencias, teniendo amigos, lo dice sin inventar conexiones', async () => {
    getAmigosMock.mockResolvedValue([usuario({ idUsuario: 3, esAmigo: true })]);
    await renderPersonas('amigos-de-amigos');
    expect(await screen.findByText('Aún no hay conexiones en común')).toBeInTheDocument();
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
describe('PersonasPage — navegación secundaria y estados vacíos', () => {
  beforeEach(() => {
    getSolicitudesPendientesMock.mockResolvedValue([]);
    getAmigosMock.mockResolvedValue([]);
    buscarUsuariosMock.mockResolvedValue({ items: [], hasMore: false });
  });

  it('sin pestañas: la sidebar agrupa Explorar y Conexiones, con el activo verde y enlaces a ?seccion=', async () => {
    await renderPersonas();

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Navegación de Personas' })[0];
    expect(within(nav).getByRole('group', { name: 'Explorar' })).toBeInTheDocument();
    expect(within(nav).getByRole('group', { name: 'Conexiones' })).toBeInTheDocument();
    const enlaces = within(nav).getAllByRole('link');
    expect(enlaces.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Descubrir personas', '/dashboard/personas'],
      ['Mis amigos', '/dashboard/personas?seccion=amigos'],
      ['Amigos de amigos', '/dashboard/personas?seccion=amigos-de-amigos'],
    ]);
    expect(enlaces[0]).toHaveAttribute('aria-current', 'page');
    expect(enlaces[0]).toHaveClass('bg-sage-nav-active');
    expect(enlaces[1]).not.toHaveAttribute('aria-current');
  });

  it.each([
    [undefined, 'Descubrir personas', 'Busca compañeros, sigue su actividad y hazte amigo.'],
    ['amigos', 'Mis amigos', 'Mantén el contacto con las personas de tu comunidad.'],
    ['amigos-de-amigos', 'Amigos de amigos', 'Descubre estudiantes con conexiones en común.'],
  ] as const)('?seccion=%s cambia el encabezado y marca su destino', async (seccion, titulo, descripcion) => {
    await renderPersonas(seccion);
    expect(screen.getByRole('heading', { level: 1, name: titulo })).toBeInTheDocument();
    expect(screen.getByText(descripcion)).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Navegación de Personas' })[0];
    expect(within(nav).getByRole('link', { name: titulo })).toHaveAttribute('aria-current', 'page');
  });

  it('las recomendaciones solo aparecen en Descubrir', async () => {
    const vista = await renderPersonas();
    expect(await screen.findByText('Personas que quizás conozcas')).toBeInTheDocument();
    vista.unmount();
    await renderPersonas('amigos');
    await screen.findByText('Aún no tienes amigos');
    expect(screen.queryByText('Personas que quizás conozcas')).not.toBeInTheDocument();
  });

  it.each([
    ['amigos', 'Aún no tienes amigos', 'Busca compañeros en Descubrir personas y agrégalos.'],
    ['amigos-de-amigos', 'Agrega a tu primer amigo', 'Cuando tengas amigos, aquí verás a las personas conectadas con ellos.'],
  ] as const)('en «%s» el vacío es una tarjeta blanca con su mensaje contextual y sin acción nueva', async (seccion, titulo, descripcion) => {
    await renderPersonas(seccion);

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

// El vacío de recomendaciones usa la misma tarjeta blanca que los demás vacíos, en su tamaño compacto.
describe('PersonasPage — vacío de recomendaciones', () => {
  beforeEach(() => {
    getSolicitudesPendientesMock.mockResolvedValue([]);
    getAmigosMock.mockResolvedValue([]);
    buscarUsuariosMock.mockResolvedValue({ items: [], hasMore: false });
  });

  it('es una banda horizontal compacta en tarjeta blanca, con el icono neutro y el enlace a completar el perfil', async () => {
    await renderPersonas();

    const tarjeta = (await screen.findByText('Aún no hay recomendaciones')).closest('[data-slot="empty"]') as HTMLElement;
    expect(tarjeta).toHaveClass('bg-surface-container-lowest', 'border-outline-variant/70', 'rounded-2xl', 'shadow-sm');
    expect(tarjeta).toHaveClass('grid', 'md:items-center', 'py-4');
    expect(tarjeta).not.toHaveClass('border-dashed', 'flex-col');
    expect(within(tarjeta).getByText('Completa tu perfil para descubrir personas con intereses similares.')).toBeInTheDocument();
    expect(tarjeta.querySelector('[data-slot="empty-icon"]')).toHaveClass('text-text-secondary', 'border-transparent');
    const enlace = within(tarjeta).getByRole('link', { name: 'Completar perfil' });
    expect(enlace).toHaveAttribute('href', '/dashboard/perfil/editar');
    expect(enlace).toHaveAttribute('data-slot', 'button');
    // Variante secundaria existente del sistema de botones, con su animación.
    expect(enlace).toHaveClass('bg-secondary', 'text-secondary-foreground', 'motion-action');
  });
});
