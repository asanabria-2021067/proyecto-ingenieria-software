import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { LiderProyectoDTO, MiembroProyectoResumenDTO } from '../lib/dto/member.dto';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42' }),
}));

vi.mock('../hooks/use-project-team', () => ({ useProjectTeam: vi.fn() }));
vi.mock('../hooks/use-project-pending-postulations', () => ({
  useProjectPendingPostulations: vi.fn(),
  useResolvePostulacion: vi.fn(),
}));
vi.mock('../hooks/use-exit-request', () => ({
  useProjectPendingExitRequests: vi.fn(),
  useApproveExitRequest: vi.fn(),
  useRejectExitRequest: vi.fn(),
}));
vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));

import MiembrosProyectoPage from '../app/dashboard/proyectos/[id]/miembros/page';
import { useProjectTeam } from '../hooks/use-project-team';
import {
  useProjectPendingPostulations,
  useResolvePostulacion,
} from '../hooks/use-project-pending-postulations';
import {
  useApproveExitRequest,
  useProjectPendingExitRequests,
  useRejectExitRequest,
} from '../hooks/use-exit-request';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useCurrentUser } from '../hooks/use-current-user';
import type { PendingLeaderReviewDto } from '../lib/types/exit-requests';

const LIDER: LiderProyectoDTO = {
  idUsuario: 1,
  nombre: 'Sofia',
  apellido: 'Castillo',
  correo: 'sofia@uvg.edu.gt',
  fotoUrl: null,
};

const TITULO_ACTIVOS = 'Miembros activos';
const TITULO_RETIRADOS_CON_CONTRIBUCION = 'Retirados con contribución';
const TITULO_RETIRADOS_SIN_CONTRIBUCION = 'Retirados sin contribución';

function miembro(overrides: Partial<MiembroProyectoResumenDTO> = {}): MiembroProyectoResumenDTO {
  return {
    idUsuario: 7,
    nombre: 'Carlos',
    apellido: 'Mendoza',
    correo: 'carlos@uvg.edu.gt',
    fotoUrl: null,
    roles: [{ idRolProyecto: 3, nombreRol: 'Backend' }],
    estadoParticipacion: 'ACTIVO',
    grupo: 'ACTIVOS',
    tareasActivas: 3,
    tareasCompletadas: 1,
    horasReconocidas: 12.5,
    ...overrides,
  };
}

function mockHook(overrides: Partial<ReturnType<typeof useProjectTeam>> = {}) {
  (useProjectTeam as any).mockReturnValue({
    lider: LIDER,
    miembros: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

/**
 * F13 vive en `PendingPostulationsCard`, montada dentro de esta página pero
 * con su propia query — se mockea aquí para que los tests de F12 (que no
 * conocen postulaciones) sigan aislados de esa pieza.
 */
function mockPendingPostulationsHook(overrides: Partial<ReturnType<typeof useProjectPendingPostulations>> = {}) {
  (useProjectPendingPostulations as any).mockReturnValue({
    postulaciones: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
  (useResolvePostulacion as any).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    variables: undefined,
  });
}

/**
 * F14 vive parcialmente en `ExitRequestActions`/`ExitRequestBadge`
 * (member-exit-request-actions.tsx), pero el reader (`useProjectPendingExitRequests`)
 * se consulta desde esta misma página — se mockea aquí para que los tests de
 * F12/F13 (que no conocen solicitudes de salida) sigan aislados.
 */
function mockPendingExitRequestsHook(overrides: Partial<ReturnType<typeof useProjectPendingExitRequests>> = {}) {
  (useProjectPendingExitRequests as any).mockReturnValue({
    requests: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
  (useApproveExitRequest as any).mockReturnValue({ mutate: vi.fn(), isPending: false });
  (useRejectExitRequest as any).mockReturnValue({ mutate: vi.fn(), isPending: false });
}

function pendingExitRequest(overrides: Partial<PendingLeaderReviewDto> = {}): PendingLeaderReviewDto {
  return {
    idSolicitud: 900,
    idProyecto: 42,
    idUsuario: 7,
    motivo: 'Cambio de disponibilidad',
    solicitadaEn: '2026-01-05T00:00:00.000Z',
    estadoSolicitud: 'PENDIENTE_LIDER',
    ...overrides,
  };
}

function renderPage() {
  return render(createElement(MiembrosProyectoPage));
}

function seccionPorTitulo(titulo: string): HTMLElement {
  const heading = screen.getByRole('heading', { level: 2, name: titulo });
  return heading.closest('section') as HTMLElement;
}

beforeEach(() => {
  mockPendingPostulationsHook();
  mockPendingExitRequestsHook();
  // GET /proyectos/:id/miembros/resumen es exclusivo del líder en backend
  // (TeamService.getTeamSummary → requireOwner) — F17.1 lo gatea también
  // client-side. Todos los tests de este archivo asumen el punto de vista
  // del líder salvo que digan lo contrario explícitamente (Sección
  // "autorización").
  (useProjectDetail as any).mockReturnValue({
    data: { idProyecto: 42, creador: { idUsuario: 1 } },
    isLoading: false,
  });
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 }, isLoading: false });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MiembrosProyectoPage — loading', () => {
  it('muestra el esqueleto de carga y no los tres grupos ni los estados vacío/error', () => {
    mockHook({ isLoading: true });
    const { container } = renderPage();

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { level: 2, name: TITULO_ACTIVOS })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: TITULO_RETIRADOS_CON_CONTRIBUCION })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: TITULO_RETIRADOS_SIN_CONTRIBUCION })).not.toBeInTheDocument();
    expect(screen.queryByText('No fue posible cargar los integrantes.')).not.toBeInTheDocument();
  });
});

describe('MiembrosProyectoPage — error', () => {
  it('muestra un mensaje de error y un botón para reintentar, sin afirmar que los grupos están vacíos', () => {
    const refetch = vi.fn();
    mockHook({ isError: true, error: new Error('fallo de red'), refetch });
    renderPage();

    expect(screen.getByText('No fue posible cargar los integrantes.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: TITULO_ACTIVOS })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('MiembrosProyectoPage — los tres grupos siempre son visibles', () => {
  it('con los tres grupos vacíos, las tres secciones y su empty state se renderizan igual', () => {
    mockHook({ miembros: [] });
    renderPage();

    expect(screen.getByRole('heading', { level: 2, name: TITULO_ACTIVOS })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: TITULO_RETIRADOS_CON_CONTRIBUCION })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: TITULO_RETIRADOS_SIN_CONTRIBUCION })).toBeInTheDocument();

    expect(screen.getByText('Aún no hay integrantes activos en este proyecto.')).toBeInTheDocument();
    expect(
      screen.getByText('Aún no hay integrantes retirados con contribución en este proyecto.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Aún no hay integrantes retirados sin contribución en este proyecto.'),
    ).toBeInTheDocument();
  });

  it('con datos válidos renderiza exactamente las tres secciones', () => {
    mockHook({
      miembros: [
        miembro({ idUsuario: 1, grupo: 'ACTIVOS' }),
        miembro({ idUsuario: 2, grupo: 'RETIRADOS_CON_CONTRIBUCION' }),
        miembro({ idUsuario: 3, grupo: 'RETIRADOS_SIN_CONTRIBUCION' }),
      ],
    });
    renderPage();

    expect(screen.getByRole('heading', { level: 2, name: TITULO_ACTIVOS })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: TITULO_RETIRADOS_CON_CONTRIBUCION })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: TITULO_RETIRADOS_SIN_CONTRIBUCION })).toBeInTheDocument();
  });
});

describe('MiembrosProyectoPage — clasificación server-authoritative (grupo)', () => {
  it('un integrante con grupo ACTIVOS aparece solo en "Miembros activos"', () => {
    mockHook({
      miembros: [miembro({ idUsuario: 7, nombre: 'Carlos', apellido: 'Mendoza', grupo: 'ACTIVOS' })],
    });
    renderPage();

    expect(within(seccionPorTitulo(TITULO_ACTIVOS)).getByText('Carlos Mendoza')).toBeInTheDocument();
    expect(within(seccionPorTitulo(TITULO_RETIRADOS_CON_CONTRIBUCION)).queryByText('Carlos Mendoza')).not.toBeInTheDocument();
    expect(within(seccionPorTitulo(TITULO_RETIRADOS_SIN_CONTRIBUCION)).queryByText('Carlos Mendoza')).not.toBeInTheDocument();
  });

  it('un integrante con grupo RETIRADOS_CON_CONTRIBUCION aparece solo en esa sección', () => {
    mockHook({
      miembros: [
        miembro({ idUsuario: 8, nombre: 'Ana', apellido: 'Lopez', grupo: 'RETIRADOS_CON_CONTRIBUCION' }),
      ],
    });
    renderPage();

    expect(within(seccionPorTitulo(TITULO_RETIRADOS_CON_CONTRIBUCION)).getByText('Ana Lopez')).toBeInTheDocument();
    expect(within(seccionPorTitulo(TITULO_ACTIVOS)).queryByText('Ana Lopez')).not.toBeInTheDocument();
    expect(within(seccionPorTitulo(TITULO_RETIRADOS_SIN_CONTRIBUCION)).queryByText('Ana Lopez')).not.toBeInTheDocument();
  });

  it('un integrante con grupo RETIRADOS_SIN_CONTRIBUCION aparece solo en esa sección', () => {
    mockHook({
      miembros: [
        miembro({ idUsuario: 9, nombre: 'Bruno', apellido: 'Diaz', grupo: 'RETIRADOS_SIN_CONTRIBUCION' }),
      ],
    });
    renderPage();

    expect(within(seccionPorTitulo(TITULO_RETIRADOS_SIN_CONTRIBUCION)).getByText('Bruno Diaz')).toBeInTheDocument();
    expect(within(seccionPorTitulo(TITULO_ACTIVOS)).queryByText('Bruno Diaz')).not.toBeInTheDocument();
    expect(within(seccionPorTitulo(TITULO_RETIRADOS_CON_CONTRIBUCION)).queryByText('Bruno Diaz')).not.toBeInTheDocument();
  });

  it('respeta `grupo` del backend aunque otros campos sugieran una clasificación distinta (no reclasifica en cliente)', () => {
    // Retirado con `grupo: RETIRADOS_CON_CONTRIBUCION` pero sin tareas ni
    // horas visibles en este resumen: una heurística cliente ingenua
    // ("horasReconocidas > 0 ⇒ con contribución") lo mandaría al grupo
    // equivocado. La UI debe seguir tratando `grupo` como la única fuente de
    // verdad.
    mockHook({
      miembros: [
        miembro({
          idUsuario: 10,
          nombre: 'Elena',
          apellido: 'Ruiz',
          estadoParticipacion: 'RETIRADO',
          grupo: 'RETIRADOS_CON_CONTRIBUCION',
          tareasActivas: 0,
          tareasCompletadas: 0,
          horasReconocidas: 0,
        }),
      ],
    });
    renderPage();

    expect(within(seccionPorTitulo(TITULO_RETIRADOS_CON_CONTRIBUCION)).getByText('Elena Ruiz')).toBeInTheDocument();
    expect(within(seccionPorTitulo(TITULO_RETIRADOS_SIN_CONTRIBUCION)).queryByText('Elena Ruiz')).not.toBeInTheDocument();
  });
});

describe('MiembrosProyectoPage — multirol', () => {
  it('un integrante con múltiples roles produce UNA sola fila con ambos roles, dentro de su grupo', () => {
    mockHook({
      miembros: [
        miembro({
          idUsuario: 100,
          nombre: 'Elena',
          apellido: 'Ruiz',
          grupo: 'ACTIVOS',
          roles: [
            { idRolProyecto: 1, nombreRol: 'Backend' },
            { idRolProyecto: 2, nombreRol: 'QA' },
          ],
        }),
      ],
    });
    renderPage();

    const seccion = seccionPorTitulo(TITULO_ACTIVOS);
    const filas = seccion.querySelectorAll('tbody tr');
    expect(filas).toHaveLength(1);
    expect(within(filas[0] as HTMLElement).getAllByText('Elena Ruiz')).toHaveLength(1);
    expect(within(filas[0] as HTMLElement).getByText('Backend')).toBeInTheDocument();
    expect(within(filas[0] as HTMLElement).getByText('QA')).toBeInTheDocument();
  });
});

describe('MiembrosProyectoPage — empty states independientes', () => {
  it('1 activo y 0 en los otros dos grupos: cada sección se ve por separado, no un único "sin miembros"', () => {
    mockHook({
      miembros: [miembro({ idUsuario: 7, nombre: 'Carlos', apellido: 'Mendoza', grupo: 'ACTIVOS' })],
    });
    renderPage();

    expect(within(seccionPorTitulo(TITULO_ACTIVOS)).getByText('Carlos Mendoza')).toBeInTheDocument();
    expect(
      within(seccionPorTitulo(TITULO_RETIRADOS_CON_CONTRIBUCION)).getByText(
        'Aún no hay integrantes retirados con contribución en este proyecto.',
      ),
    ).toBeInTheDocument();
    expect(
      within(seccionPorTitulo(TITULO_RETIRADOS_SIN_CONTRIBUCION)).getByText(
        'Aún no hay integrantes retirados sin contribución en este proyecto.',
      ),
    ).toBeInTheDocument();
  });

  it('cada empty state tiene un mensaje propio, no reutiliza literalmente el de otro grupo', () => {
    mockHook({ miembros: [] });
    renderPage();

    expect(screen.getByText('Aún no hay integrantes activos en este proyecto.')).toBeInTheDocument();
    expect(
      screen.getByText('Aún no hay integrantes retirados con contribución en este proyecto.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Aún no hay integrantes retirados sin contribución en este proyecto.'),
    ).toBeInTheDocument();
  });
});

describe('MiembrosProyectoPage — F13 integrada, F12 intacta', () => {
  it('muestra la tarjeta "Postulaciones pendientes" junto con las tres secciones de F12', () => {
    mockHook({ miembros: [miembro({ idUsuario: 7 })] });
    mockPendingPostulationsHook({ postulaciones: [] });
    renderPage();

    expect(screen.getByText('Postulaciones pendientes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver postulaciones pendientes/i })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/42/miembros/postulaciones',
    );
    expect(screen.getByRole('heading', { level: 2, name: TITULO_ACTIVOS })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: TITULO_RETIRADOS_CON_CONTRIBUCION })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: TITULO_RETIRADOS_SIN_CONTRIBUCION })).toBeInTheDocument();
  });

  it('con postulaciones pendientes presentes, las tres secciones de F12 se siguen renderizando', () => {
    mockHook({
      miembros: [
        miembro({ idUsuario: 1, grupo: 'ACTIVOS' }),
        miembro({ idUsuario: 2, grupo: 'RETIRADOS_CON_CONTRIBUCION' }),
        miembro({ idUsuario: 3, grupo: 'RETIRADOS_SIN_CONTRIBUCION' }),
      ],
    });
    mockPendingPostulationsHook({
      postulaciones: [
        {
          idPostulacion: 1,
          justificacion: 'Quiero contribuir con backend.',
          estadoPostulacion: 'PENDIENTE',
          fechaPostulacion: '2026-01-05T00:00:00.000Z',
          postulante: { idUsuario: 50, nombre: 'Diego', apellido: 'Solís', correo: 'diego@uvg.edu.gt' },
          rolProyecto: { idRolProyecto: 9, nombreRol: 'Backend' },
        } as any,
      ],
    });
    renderPage();

    expect(screen.getByRole('heading', { level: 2, name: TITULO_ACTIVOS })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: TITULO_RETIRADOS_CON_CONTRIBUCION })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: TITULO_RETIRADOS_SIN_CONTRIBUCION })).toBeInTheDocument();
  });

  it('no muestra acciones de resolución de salida (F14)', () => {
    mockHook({
      miembros: [miembro({ idUsuario: 7, grupo: 'RETIRADOS_CON_CONTRIBUCION', estadoParticipacion: 'RETIRADO' })],
    });
    renderPage();

    expect(screen.queryByText(/Aprobar salida/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rechazar salida/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Resolver solicitud/i)).not.toBeInTheDocument();
  });
});

describe('MiembrosProyectoPage — fila de integrante', () => {
  it('cada fila enlaza al detalle del integrante (findTeamMemberDetail, fuera de alcance de F12)', () => {
    mockHook({ miembros: [miembro({ idUsuario: 7 })] });
    renderPage();

    const link = screen.getByRole('link', { name: /Ver detalle/i });
    expect(link).toHaveAttribute('href', '/dashboard/proyectos/42/equipo/7');
  });

  it('un integrante con 0 tareas y 0 horas se muestra tal cual en su fila, no null/undefined', () => {
    mockHook({ miembros: [miembro({ tareasActivas: 0, horasReconocidas: 0 })] });
    renderPage();

    const fila = seccionPorTitulo(TITULO_ACTIVOS).querySelector('tbody tr');
    expect(fila?.textContent).toContain('0');
    expect(fila?.textContent).toContain('0 h');
  });
});

describe('MiembrosProyectoPage — líder', () => {
  it('muestra al líder por separado, no como una fila más de ninguna tabla', () => {
    mockHook({ miembros: [miembro({ idUsuario: 7 })] });
    renderPage();

    expect(screen.getByText(/Sofia Castillo/)).toBeInTheDocument();
    expect(within(seccionPorTitulo(TITULO_ACTIVOS)).queryByText(/Sofia Castillo/)).not.toBeInTheDocument();
  });
});

describe('MiembrosProyectoPage — métricas de cabecera', () => {
  function metricasGrid(container: HTMLElement): HTMLElement {
    return container.querySelector('.grid.grid-cols-2') as HTMLElement;
  }

  function valorDeMetrica(container: HTMLElement, labelText: string): string | null {
    const label = within(metricasGrid(container)).getByText(labelText);
    return label.nextElementSibling?.textContent ?? null;
  }

  it('"Integrantes activos" cuenta solo el grupo ACTIVOS, no todo el roster (incluye retirados)', () => {
    mockHook({
      miembros: [
        miembro({ idUsuario: 100, grupo: 'ACTIVOS', tareasActivas: 2, tareasCompletadas: 3, horasReconocidas: 15 }),
        miembro({
          idUsuario: 200,
          grupo: 'RETIRADOS_CON_CONTRIBUCION',
          estadoParticipacion: 'RETIRADO',
          tareasActivas: 0,
          tareasCompletadas: 0,
          horasReconocidas: 5,
        }),
      ],
    });
    const { container } = renderPage();

    expect(valorDeMetrica(container, 'Integrantes activos')).toBe('1');
    expect(valorDeMetrica(container, 'Tareas activas')).toBe('2');
    expect(valorDeMetrica(container, 'Tareas completadas')).toBe('3');
    expect(valorDeMetrica(container, 'Horas reconocidas')).toBe('20 h');
  });

  it('un integrante con múltiples roles no infla "Integrantes activos": cuenta personas, no roles', () => {
    mockHook({
      miembros: [
        miembro({
          idUsuario: 100,
          grupo: 'ACTIVOS',
          roles: [
            { idRolProyecto: 1, nombreRol: 'Backend' },
            { idRolProyecto: 2, nombreRol: 'QA' },
          ],
          horasReconocidas: 15,
        }),
        miembro({ idUsuario: 200, grupo: 'ACTIVOS', horasReconocidas: 5 }),
      ],
    });
    const { container } = renderPage();

    expect(valorDeMetrica(container, 'Integrantes activos')).toBe('2');
    expect(valorDeMetrica(container, 'Horas reconocidas')).toBe('20 h');
  });

  it('un proyecto sin integrantes muestra 0 en todas las métricas, con los tres grupos vacíos', () => {
    mockHook({ miembros: [] });
    const { container } = renderPage();

    expect(valorDeMetrica(container, 'Integrantes activos')).toBe('0');
    expect(valorDeMetrica(container, 'Tareas activas')).toBe('0');
    expect(valorDeMetrica(container, 'Tareas completadas')).toBe('0');
    expect(valorDeMetrica(container, 'Horas reconocidas')).toBe('0 h');
    expect(screen.getByText('Aún no hay integrantes activos en este proyecto.')).toBeInTheDocument();
  });

  it('mientras useProjectTeam carga, las métricas muestran skeleton', () => {
    mockHook({ isLoading: true });
    const { container } = renderPage();

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });
});

describe('MiembrosProyectoPage — ordenamiento', () => {
  function miembrosFixture(): MiembroProyectoResumenDTO[] {
    return [
      miembro({ idUsuario: 7, nombre: 'Carlos', apellido: 'Mendoza', grupo: 'ACTIVOS', tareasActivas: 1, horasReconocidas: 5 }),
      miembro({ idUsuario: 8, nombre: 'Ana', apellido: 'Lopez', grupo: 'ACTIVOS', tareasActivas: 9, horasReconocidas: 1 }),
    ];
  }

  function textoDeFilas(seccion: HTMLElement): string[] {
    return Array.from(seccion.querySelectorAll('tbody tr')).map((fila) => fila.textContent ?? '');
  }

  it('por defecto ordena por nombre ascendente', () => {
    mockHook({ miembros: miembrosFixture() });
    renderPage();

    const filas = textoDeFilas(seccionPorTitulo(TITULO_ACTIVOS));
    expect(filas[0]).toContain('Ana Lopez');
    expect(filas[1]).toContain('Carlos Mendoza');
  });

  it('un clic en un encabezado ordenable reordena por esa columna', () => {
    mockHook({ miembros: miembrosFixture() });
    renderPage();

    fireEvent.click(screen.getAllByRole('button', { name: /Tareas activas/i })[0]);

    const filas = textoDeFilas(seccionPorTitulo(TITULO_ACTIVOS));
    expect(filas[0]).toContain('Carlos Mendoza');
    expect(filas[1]).toContain('Ana Lopez');
  });
});

describe('MiembrosProyectoPage — navegación', () => {
  it('el link de volver apunta al detalle del proyecto correcto', () => {
    mockHook({ miembros: [] });
    renderPage();

    const link = screen.getByRole('link', { name: /Volver al proyecto/i });
    // Debe apuntar al hub real del líder (F17), no a la vista pública/de
    // postulación de /dashboard/proyectos/[id] — regresión del bug donde el
    // líder terminaba viéndose a sí mismo como si no lo fuera.
    expect(link).toHaveAttribute('href', '/dashboard/projects/42');
  });
});

describe('MiembrosProyectoPage — autorización', () => {
  it('un no-líder ve el aviso "¡No eres líder!" en vez de los tres grupos', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999 }, isLoading: false });
    mockHook({ miembros: [miembro()] });
    renderPage();

    expect(screen.getByText('¡No eres líder!')).toBeInTheDocument();
    expect(screen.getByText('No puedes acceder a los miembros de este proyecto.')).toBeInTheDocument();
    expect(screen.queryByText(TITULO_ACTIVOS)).not.toBeInTheDocument();
  });

  it('un no-líder ve "Volver al proyecto" apuntando a /dashboard/proyectos (vista pública), no a /dashboard/projects (hub del líder)', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999 }, isLoading: false });
    mockHook({ miembros: [] });
    renderPage();

    expect(screen.getByRole('link', { name: /Volver al proyecto/i })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/42',
    );
  });
});

describe('MiembrosProyectoPage — F14: asociación por idUsuario', () => {
  it('un miembro sin solicitud de salida conserva únicamente "Ver detalle"', () => {
    mockHook({ miembros: [miembro({ idUsuario: 7, nombre: 'Carlos', apellido: 'Mendoza', grupo: 'ACTIVOS' })] });
    mockPendingExitRequestsHook({ requests: [] });
    renderPage();

    const seccion = seccionPorTitulo(TITULO_ACTIVOS);
    expect(within(seccion).getByRole('link', { name: /Ver detalle/i })).toBeInTheDocument();
    expect(within(seccion).queryByText('Salida pendiente')).not.toBeInTheDocument();
    expect(within(seccion).queryByRole('button', { name: /Aprobar solicitud de salida/i })).not.toBeInTheDocument();
  });

  it('un miembro con solicitud PENDIENTE_LIDER muestra el badge y las acciones, no "Ver detalle"', () => {
    mockHook({ miembros: [miembro({ idUsuario: 7, nombre: 'Ana', apellido: 'García', grupo: 'ACTIVOS' })] });
    mockPendingExitRequestsHook({ requests: [pendingExitRequest({ idUsuario: 7 })] });
    renderPage();

    const seccion = seccionPorTitulo(TITULO_ACTIVOS);
    expect(within(seccion).getByText('Salida pendiente')).toBeInTheDocument();
    expect(within(seccion).getByRole('button', { name: 'Aprobar solicitud de salida de Ana García' })).toBeInTheDocument();
    expect(within(seccion).getByRole('button', { name: 'Rechazar solicitud de salida de Ana García' })).toBeInTheDocument();
    expect(within(seccion).queryByRole('link', { name: /Ver detalle/i })).not.toBeInTheDocument();
  });

  it('el miembro con solicitud pendiente sigue mostrando "Activo" (F14 no cambia el estado de participación)', () => {
    mockHook({
      miembros: [miembro({ idUsuario: 7, nombre: 'Ana', apellido: 'García', grupo: 'ACTIVOS', estadoParticipacion: 'ACTIVO' })],
    });
    mockPendingExitRequestsHook({ requests: [pendingExitRequest({ idUsuario: 7 })] });
    renderPage();

    expect(within(seccionPorTitulo(TITULO_ACTIVOS)).getByText('Activo')).toBeInTheDocument();
  });

  it('la solicitud de un usuario B no afecta la fila del usuario A (asociación exclusivamente por idUsuario)', () => {
    mockHook({
      miembros: [
        miembro({ idUsuario: 7, nombre: 'Carlos', apellido: 'Mendoza', grupo: 'ACTIVOS' }),
        miembro({ idUsuario: 8, nombre: 'Ana', apellido: 'García', grupo: 'ACTIVOS' }),
      ],
    });
    mockPendingExitRequestsHook({ requests: [pendingExitRequest({ idUsuario: 8 })] });
    renderPage();

    const seccion = seccionPorTitulo(TITULO_ACTIVOS);
    const filaCarlos = within(seccion).getByText('Carlos Mendoza').closest('tr') as HTMLElement;
    const filaAna = within(seccion).getByText('Ana García').closest('tr') as HTMLElement;

    expect(within(filaCarlos).queryByText('Salida pendiente')).not.toBeInTheDocument();
    expect(within(filaCarlos).getByRole('link', { name: /Ver detalle/i })).toBeInTheDocument();
    expect(within(filaAna).getByText('Salida pendiente')).toBeInTheDocument();
    expect(within(filaAna).getByRole('button', { name: /Aprobar solicitud de salida/i })).toBeInTheDocument();
  });

  it('multirol: un integrante con varios roles y una solicitud pendiente produce UN solo par Aprobar/Rechazar', () => {
    mockHook({
      miembros: [
        miembro({
          idUsuario: 7,
          nombre: 'Ana',
          apellido: 'García',
          grupo: 'ACTIVOS',
          roles: [
            { idRolProyecto: 1, nombreRol: 'Backend' },
            { idRolProyecto: 2, nombreRol: 'QA' },
          ],
        }),
      ],
    });
    mockPendingExitRequestsHook({ requests: [pendingExitRequest({ idUsuario: 7 })] });
    renderPage();

    const seccion = seccionPorTitulo(TITULO_ACTIVOS);
    expect(within(seccion).getAllByRole('button', { name: /Aprobar solicitud de salida/i })).toHaveLength(1);
    expect(within(seccion).getAllByRole('button', { name: /Rechazar solicitud de salida/i })).toHaveLength(1);
    expect(within(seccion).getAllByText('Ana García')).toHaveLength(1);
  });
});

describe('MiembrosProyectoPage — F14: loading/error local no afecta F12/F13', () => {
  it('mientras carga el reader de solicitudes de salida, los tres grupos de F12 se renderizan igual (sin acciones falsas)', () => {
    mockHook({ miembros: [miembro({ idUsuario: 7, grupo: 'ACTIVOS' })] });
    mockPendingExitRequestsHook({ requests: [], isLoading: true });
    renderPage();

    expect(screen.getByRole('heading', { level: 2, name: TITULO_ACTIVOS })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: TITULO_RETIRADOS_CON_CONTRIBUCION })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: TITULO_RETIRADOS_SIN_CONTRIBUCION })).toBeInTheDocument();
    expect(screen.queryByText('Salida pendiente')).not.toBeInTheDocument();
  });

  it('un error del reader de solicitudes de salida no destruye F12 ni F13, y avisa con opción de reintentar', () => {
    const refetchExitRequests = vi.fn();
    mockHook({ miembros: [miembro({ idUsuario: 7, grupo: 'ACTIVOS' })] });
    mockPendingExitRequestsHook({ isError: true, refetch: refetchExitRequests });
    renderPage();

    expect(screen.getByRole('heading', { level: 2, name: TITULO_ACTIVOS })).toBeInTheDocument();
    expect(screen.getByText('Postulaciones pendientes')).toBeInTheDocument();
    expect(
      screen.getByText('No fue posible verificar solicitudes de salida pendientes de los integrantes.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetchExitRequests).toHaveBeenCalled();
    // Ningún miembro muestra acciones potencialmente incorrectas mientras el reader falla.
    expect(screen.queryByRole('button', { name: /Aprobar solicitud de salida/i })).not.toBeInTheDocument();
  });
});
