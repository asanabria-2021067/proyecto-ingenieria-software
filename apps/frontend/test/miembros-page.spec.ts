import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { LiderProyectoDTO, MiembroProyectoResumenDTO } from '../lib/dto/member.dto';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42' }),
}));

vi.mock('../hooks/use-project-team', () => ({ useProjectTeam: vi.fn() }));

import MiembrosProyectoPage from '../app/dashboard/proyectos/[id]/miembros/page';
import { useProjectTeam } from '../hooks/use-project-team';

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

function renderPage() {
  return render(createElement(MiembrosProyectoPage));
}

function seccionPorTitulo(titulo: string): HTMLElement {
  const heading = screen.getByRole('heading', { level: 2, name: titulo });
  return heading.closest('section') as HTMLElement;
}

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

describe('MiembrosProyectoPage — fuera de alcance (F13/F14)', () => {
  it('no muestra la tarjeta de Postulaciones pendientes (F13)', () => {
    mockHook({ miembros: [miembro({ idUsuario: 7 })] });
    renderPage();

    expect(screen.queryByText(/POSTULACIONES PENDIENTES/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Aceptar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rechazar postulación/i)).not.toBeInTheDocument();
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
    expect(link).toHaveAttribute('href', '/dashboard/proyectos/42');
  });
});
