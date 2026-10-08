import { UserDetailSheet } from '@/components/admin/UserDetailSheet';
import type { AdminUserDetail, AdminUserStatus } from '@/lib/services/admin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ''} />,
}));

const getAdminUserDetailMock = vi.fn();
const updateAdminUserStatusMock = vi.fn();
vi.mock('@/lib/services/admin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/admin')>('@/lib/services/admin');
  return {
    ...actual,
    getAdminUserDetail: (id: unknown) => getAdminUserDetailMock(id),
    updateAdminUserStatus: (id: unknown, estado: AdminUserStatus) => updateAdminUserStatusMock(id, estado),
  };
});

// La tarjeta «Proyectos activos» lee el perfil público (`GET /social/usuarios/:id`).
const getPerfilUsuarioMock = vi.fn();
vi.mock('@/lib/services/social', () => ({
  getPerfilUsuario: (id: unknown) => getPerfilUsuarioMock(id),
}));

const swalFireMock = vi.fn();
vi.mock('@/lib/swal', () => ({
  default: { fire: (opts: unknown) => swalFireMock(opts) },
}));

function baseUserDetail(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    idUsuario: 1,
    nombre: 'Samuel',
    apellido: 'Robledo',
    correo: 'sammy@uvg.edu.gt',
    fotoUrl: null,
    estado: 'ACTIVO',
    roles: ['estudiante'],
    fechaCreacion: '2026-01-15T00:00:00.000Z',
    fechaUltimaSesion: null,
    perfilEstudiante: null,
    actividadEstudiante: null,
    actividadMentor: null,
    actividadLider: null,
    actividadCoordinador: null,
    actividadAdmin: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getAdminUserDetailMock.mockResolvedValue(baseUserDetail());
  updateAdminUserStatusMock.mockResolvedValue({});
  getPerfilUsuarioMock.mockResolvedValue({ proyectosActivos: [] });
});

function renderSheet(opts: { userId?: number | null; open?: boolean; onStatusChanged?: () => void } = {}) {
  const userId = opts.userId === undefined ? 1 : opts.userId;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <UserDetailSheet
        userId={userId}
        open={opts.open ?? true}
        onOpenChange={onOpenChange}
        onStatusChanged={opts.onStatusChanged}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange, invalidateSpy };
}


describe('UserDetailSheet (T-203)', () => {
  it('mientras carga, no muestra el contenido ni el error (estado de carga)', async () => {
    let resolver: ((v: AdminUserDetail) => void) | undefined;
    getAdminUserDetailMock.mockImplementation(
      () => new Promise<AdminUserDetail>((resolve) => { resolver = resolve; }),
    );
    renderSheet();

    expect(screen.queryByText(/Información institucional/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No se pudo cargar/i)).not.toBeInTheDocument();

    resolver?.(baseUserDetail());
    await screen.findByText(/Información institucional/i);
  });

  it('si la consulta falla, muestra el mensaje de error', async () => {
    getAdminUserDetailMock.mockRejectedValue(new Error('boom'));
    renderSheet();

    expect(await screen.findByText(/No se pudo cargar el detalle del usuario/i)).toBeInTheDocument();
  });

  it('no consulta si el Sheet esta cerrado o userId es null (estado deshabilitado)', async () => {
    renderSheet({ open: false });
    renderSheet({ userId: null });
    await new Promise((r) => setTimeout(r, 10));

    expect(getAdminUserDetailMock).not.toHaveBeenCalled();
  });

  it('muestra nombre, correo, rol principal y la info basica formateada', async () => {
    getAdminUserDetailMock.mockResolvedValue(
      baseUserDetail({
        roles: ['estudiante', 'mentor'],
        fechaUltimaSesion: new Date(Date.now() - 5000).toISOString(),
      }),
    );
    renderSheet();

    expect(await screen.findByText('Samuel Robledo')).toBeInTheDocument();
    expect(screen.getByText('sammy@uvg.edu.gt')).toBeInTheDocument();
    // getPrimaryRole prioriza mentor sobre estudiante en la lista de roles
    expect(screen.getAllByText('Mentor').length).toBeGreaterThan(0);
    expect(screen.getByText(/Hace un momento/i)).toBeInTheDocument();
  });

  it('sin nombre ni apellido, las iniciales del avatar caen a "U"', async () => {
    getAdminUserDetailMock.mockResolvedValue(baseUserDetail({ nombre: '', apellido: '' }));
    renderSheet();

    expect(await screen.findByText('U')).toBeInTheDocument();
  });

  it('un estudiante en riesgo (semestre >=7, bajo el requisito) muestra el banner; si no aplica, no aparece', async () => {
    getAdminUserDetailMock.mockResolvedValue(
      baseUserDetail({
        perfilEstudiante: {
          carrera: 'ISW',
          carne: '241282',
          semestre: 8,
          disponibilidadHorasSemana: 10,
          horasBecaRequeridas: null,
          horasExtensionRequeridas: 40,
        },
        actividadEstudiante: {
          participacionesActivas: 1,
          horasBecaAcumuladas: 0,
          horasExtensionAcumuladas: 10,
          postulaciones: { pendientes: 0, aceptadas: 1, rechazadas: 0 },
        },
      }),
    );
    renderSheet();

    expect(await screen.findByText(/Estudiante en riesgo/i)).toBeInTheDocument();
  });

  it('un estudiante que ya cumplio el requisito NO muestra el banner de riesgo', async () => {
    getAdminUserDetailMock.mockResolvedValue(
      baseUserDetail({
        perfilEstudiante: {
          carrera: 'ISW',
          carne: '241282',
          semestre: 8,
          disponibilidadHorasSemana: 10,
          horasBecaRequeridas: null,
          horasExtensionRequeridas: 40,
        },
        actividadEstudiante: {
          participacionesActivas: 1,
          horasBecaAcumuladas: 0,
          horasExtensionAcumuladas: 40,
          postulaciones: { pendientes: 0, aceptadas: 1, rechazadas: 0 },
        },
      }),
    );
    renderSheet();

    await screen.findByText(/Información institucional/i);
    expect(screen.queryByText(/Estudiante en riesgo/i)).not.toBeInTheDocument();
  });

  it('mentor sin proyectos asociados muestra el estado vacio; con proyectos los lista con su badge de estado', async () => {
    getAdminUserDetailMock.mockResolvedValue(
      baseUserDetail({ roles: ['mentor'], actividadMentor: {
        proyectosDondeParticipa: 0,
        estudiantesMentorizados: 0,
        proyectosActivos: 0,
        proyectosCerrados: 0,
        proyectosAsociados: [],
      } }),
    );
    renderSheet();
    expect(await screen.findByText('No hay proyectos asociados.')).toBeInTheDocument();

    getAdminUserDetailMock.mockResolvedValue(
      baseUserDetail({ idUsuario: 2, roles: ['mentor'], actividadMentor: {
        proyectosDondeParticipa: 1,
        estudiantesMentorizados: 1,
        proyectosActivos: 1,
        proyectosCerrados: 0,
        proyectosAsociados: [
          { idProyecto: 10, tituloProyecto: 'UVG Collab', estadoProyecto: 'EN_PROGRESO', rol: 'Mentor' },
        ],
      } }),
    );
    renderSheet({ userId: 2 });
    expect(await screen.findByText('UVG Collab')).toBeInTheDocument();
    expect(screen.getByText('En progreso')).toBeInTheDocument();
  });

  it('lider con postulaciones pendientes marca "Requiere atencion" y el contador por proyecto', async () => {
    getAdminUserDetailMock.mockResolvedValue(
      baseUserDetail({
        roles: ['lider_asociacion'],
        actividadLider: {
          proyectosCreados: 2,
          proyectosActivos: 1,
          proyectosCerrados: 1,
          postulacionesPendientes: 3,
          proyectosRecientes: [
            { idProyecto: 5, tituloProyecto: 'App Movil', estadoProyecto: 'PUBLICADO', postulacionesPendientes: 3 },
          ],
        },
      }),
    );
    renderSheet();

    expect(await screen.findByText('Requiere atención')).toBeInTheDocument();
    expect(screen.getByText('3 postulación(es) pendiente(s)')).toBeInTheDocument();
  });

  it('un usuario administrador no ofrece acciones sobre si mismo (Desactivar/Bloquear)', async () => {
    getAdminUserDetailMock.mockResolvedValue(
      baseUserDetail({ roles: ['administrador'], actividadAdmin: { puedeGestionarUsuarios: true, puedeRevisarProyectos: false } }),
    );
    renderSheet();

    await screen.findByText(/Información institucional/i);
    expect(screen.queryByRole('button', { name: /Desactivar usuario/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bloquear usuario/i })).not.toBeInTheDocument();
  });

  it('ACTIVO: Desactivar abre confirmacion, confirmar llama a la mutation, invalida cache y notifica onStatusChanged', async () => {
    const onStatusChanged = vi.fn();
    const { invalidateSpy } = renderSheet({ onStatusChanged });
    await screen.findByRole('button', { name: /Desactivar usuario/i });

    fireEvent.click(screen.getByRole('button', { name: /Desactivar usuario/i }));
    expect(await screen.findByText(/¿Deseas desactivar a Samuel Robledo\?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Desactivar$/i }));

    await waitFor(() => expect(updateAdminUserStatusMock).toHaveBeenCalledWith(1, 'INACTIVO'));
    await waitFor(() => expect(onStatusChanged).toHaveBeenCalledTimes(1));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['adminUsers'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['adminUserDetail', 1] });
    expect(swalFireMock).toHaveBeenCalledWith(expect.objectContaining({ icon: 'success' }));
  });

  it('un error al cambiar de estado se muestra via swal y no invalida el cache', async () => {
    updateAdminUserStatusMock.mockRejectedValueOnce(new Error('No autorizado'));
    const { invalidateSpy } = renderSheet();
    await screen.findByRole('button', { name: /Desactivar usuario/i });

    fireEvent.click(screen.getByRole('button', { name: /Desactivar usuario/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^Desactivar$/i }));

    await waitFor(() =>
      expect(swalFireMock).toHaveBeenCalledWith(
        expect.objectContaining({ icon: 'error', text: 'No autorizado' }),
      ),
    );
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('Cancelar en la confirmacion cierra el dialogo sin llamar a la mutation', async () => {
    renderSheet();
    fireEvent.click(await screen.findByRole('button', { name: /Desactivar usuario/i }));
    await screen.findByText(/¿Deseas desactivar/i);

    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));

    await waitFor(() => expect(screen.queryByText(/¿Deseas desactivar/i)).not.toBeInTheDocument());
    expect(updateAdminUserStatusMock).not.toHaveBeenCalled();
  });

  it('INACTIVO muestra unicamente el boton Activar; BLOQUEADO unicamente Desbloquear', async () => {
    getAdminUserDetailMock.mockResolvedValue(baseUserDetail({ estado: 'INACTIVO' }));
    renderSheet();
    expect(await screen.findByRole('button', { name: /Activar usuario/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Desbloquear usuario/i })).not.toBeInTheDocument();

    getAdminUserDetailMock.mockResolvedValue(baseUserDetail({ idUsuario: 3, estado: 'BLOQUEADO' }));
    renderSheet({ userId: 3 });
    expect(await screen.findByRole('button', { name: /Desbloquear usuario/i })).toBeInTheDocument();
  });
});

describe('UserDetailSheet — rediseño con el lenguaje del perfil del estudiante', () => {
  const proyectosActivos = () => screen.getByText('Proyectos activos').closest('section') as HTMLElement;

  it('ordena las tarjetas: información institucional, proyectos activos y, al final, acciones administrativas', async () => {
    renderSheet();
    await screen.findByText(/Información institucional/i);
    await screen.findByText('Este usuario no participa actualmente en proyectos activos.');

    const titulos = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titulos[0]).toBe('Información institucional');
    expect(titulos[1]).toBe('Proyectos activos');
    expect(titulos[titulos.length - 1]).toBe('Acciones administrativas');
  });

  it('el estado se muestra una sola vez como badge; la tarjeta institucional lo da como texto junto al rol y las fechas', async () => {
    getAdminUserDetailMock.mockResolvedValue(
      baseUserDetail({
        perfilEstudiante: {
          carrera: 'Ingeniería en Ciencias de la Computación',
          carne: '21001',
          semestre: 6,
          disponibilidadHorasSemana: null,
          horasBecaRequeridas: null,
          horasExtensionRequeridas: 100,
        },
      }),
    );
    renderSheet();

    expect(await screen.findByRole('heading', { level: 2, name: 'Samuel Robledo' })).toBeInTheDocument();
    const info = screen.getByText('Información institucional').closest('section') as HTMLElement;
    expect(document.querySelectorAll('.pill-success')).toHaveLength(1);
    expect(within(info).getByText('Estado').nextElementSibling).toHaveTextContent('Activo');
    expect(within(info).getByText('Rol principal').nextElementSibling).toHaveTextContent('Estudiante');
    expect(within(info).getByText('Carrera').nextElementSibling).toHaveTextContent('Ingeniería en Ciencias de la Computación');
    expect(within(info).getByText('Semestre', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Semestre 6');
    expect(within(info).getByText('Fecha de registro')).toBeInTheDocument();
    expect(within(info).getByText('Último acceso').nextElementSibling).toHaveTextContent('Sin registro');
    // No se inventa lo que el backend no trae: sin disponibilidad, sin fila.
    expect(within(info).queryByText('Disponibilidad')).not.toBeInTheDocument();
    expect(screen.queryByText(/No hay datos disponibles/i)).not.toBeInTheDocument();
  });

  it('lista las participaciones en proyectos activos con rol, estado y enlace al detalle administrativo', async () => {
    getPerfilUsuarioMock.mockResolvedValue({
      proyectosActivos: [
        { idProyecto: 7, tituloProyecto: 'Plataforma de Tutorías UVG', estadoProyecto: 'PUBLICADO', rolNombre: 'Desarrollador Frontend' },
        { idProyecto: 9, tituloProyecto: 'Portal de Empleo UVG', estadoProyecto: 'EN_PROGRESO', rolNombre: 'Backend Developer' },
        // Participación viva en un proyecto que ya no está activo: no se cuenta ni se muestra.
        { idProyecto: 11, tituloProyecto: 'Feria 2025', estadoProyecto: 'CERRADO', rolNombre: 'Colaborador' },
      ],
    });
    renderSheet();

    await screen.findByText('Plataforma de Tutorías UVG');
    const tarjeta = within(proyectosActivos());
    expect(tarjeta.getByText('2 colaboraciones')).toBeInTheDocument();
    const enlaces = tarjeta.getAllByRole('link');
    expect(enlaces.map((a) => a.getAttribute('href'))).toEqual(['/dashboard/admin/proyectos/7', '/dashboard/admin/proyectos/9']);
    expect(within(enlaces[0]).getByText('Desarrollador Frontend')).toBeInTheDocument();
    expect(within(enlaces[0]).getByText('Publicado')).toBeInTheDocument();
    expect(within(enlaces[1]).getByText('En progreso')).toBeInTheDocument();
    expect(tarjeta.queryByText('Feria 2025')).not.toBeInTheDocument();
    expect(getPerfilUsuarioMock).toHaveBeenCalledWith(1);
  });

  it('sin proyectos lo dice; si la lista falla, el resto del drawer y las acciones siguen disponibles', async () => {
    renderSheet();
    expect(await screen.findByText('Este usuario no participa actualmente en proyectos activos.')).toBeInTheDocument();
    expect(within(proyectosActivos()).getByText('0 colaboraciones')).toBeInTheDocument();
  });

  it('un fallo al cargar los proyectos no tumba el drawer y permite reintentar', async () => {
    getPerfilUsuarioMock.mockRejectedValue(new Error('500'));
    renderSheet();

    expect(await screen.findByText('No se pudieron cargar los proyectos de este usuario.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Desactivar usuario/i })).toBeInTheDocument();
    fireEvent.click(within(proyectosActivos()).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(getPerfilUsuarioMock).toHaveBeenCalledTimes(2));
  });

  it('cada sección lleva su título encima de la tarjeta, no dentro, y el contador de proyectos queda dentro', async () => {
    getPerfilUsuarioMock.mockResolvedValue({
      proyectosActivos: [{ idProyecto: 7, tituloProyecto: 'Plataforma de Tutorías UVG', estadoProyecto: 'EN_PROGRESO', rolNombre: 'Colaborador' }],
    });
    renderSheet();
    await screen.findByText('Plataforma de Tutorías UVG');

    for (const titulo of ['Información institucional', 'Proyectos activos', 'Acciones administrativas']) {
      const encabezado = screen.getByRole('heading', { level: 3, name: titulo });
      const seccion = encabezado.closest('section') as HTMLElement;
      const tarjeta = seccion.querySelector('.card-base') as HTMLElement;
      expect(tarjeta).not.toBeNull();
      expect(tarjeta).not.toContainElement(encabezado);
      // El título precede a su tarjeta y va flanqueado por dos líneas decorativas.
      expect(encabezado.compareDocumentPosition(tarjeta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(encabezado.parentElement?.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(2);
    }
    const proyectos = proyectosActivos();
    const contador = within(proyectos).getByText('1 colaboración');
    expect(proyectos.querySelector('.card-base')).toContainElement(contador);
    expect(screen.getByRole('heading', { level: 3, name: 'Proyectos activos' })).toHaveTextContent(/^Proyectos activos$/);
  });

  it('no trae nada social del perfil del estudiante', async () => {
    renderSheet();
    await screen.findByText(/Información institucional/i);
    expect(screen.queryByText(/Amigos en común|Seguir|Compartir perfil|Agregar amigo|Habilidades|Intereses/i)).not.toBeInTheDocument();
  });
});
