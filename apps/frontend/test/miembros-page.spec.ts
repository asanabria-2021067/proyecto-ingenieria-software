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

function miembro(overrides: Partial<MiembroProyectoResumenDTO> = {}): MiembroProyectoResumenDTO {
  return {
    idUsuario: 7,
    nombre: 'Carlos',
    apellido: 'Mendoza',
    correo: 'carlos@uvg.edu.gt',
    fotoUrl: null,
    roles: [{ idRolProyecto: 3, nombreRol: 'Backend' }],
    estadoParticipacion: 'ACTIVO',
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MiembrosProyectoPage — loading', () => {
  it('muestra el esqueleto de carga y no la tabla ni los estados vacío/error', () => {
    mockHook({ isLoading: true });
    const { container } = renderPage();

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('Aún no hay integrantes en este proyecto.')).not.toBeInTheDocument();
    expect(screen.queryByText('No fue posible cargar los integrantes.')).not.toBeInTheDocument();
  });
});

describe('MiembrosProyectoPage — error', () => {
  it('muestra un mensaje de error y un botón para reintentar', () => {
    const refetch = vi.fn();
    mockHook({ isError: true, error: new Error('fallo de red'), refetch });
    renderPage();

    expect(screen.getByText('No fue posible cargar los integrantes.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('MiembrosProyectoPage — vacío', () => {
  it('sin integrantes muestra el estado vacío, sin errores', () => {
    mockHook({ miembros: [] });
    renderPage();

    expect(screen.getByText('Aún no hay integrantes en este proyecto.')).toBeInTheDocument();
    expect(screen.queryByText('No fue posible cargar los integrantes.')).not.toBeInTheDocument();
  });
});

describe('MiembrosProyectoPage — tabla con datos', () => {
  it('renderiza nombre, roles, estado, tareas activas y horas reconocidas de cada integrante', () => {
    mockHook({
      miembros: [
        miembro({
          idUsuario: 7,
          nombre: 'Carlos',
          apellido: 'Mendoza',
          roles: [{ idRolProyecto: 3, nombreRol: 'Backend' }],
          tareasActivas: 2,
          horasReconocidas: 8,
        }),
        miembro({
          idUsuario: 8,
          nombre: 'Ana',
          apellido: 'Lopez',
          roles: [{ idRolProyecto: 4, nombreRol: 'QA' }],
          tareasActivas: 0,
          horasReconocidas: 0,
        }),
      ],
    });
    const { container } = renderPage();
    const filas = container.querySelectorAll('tbody tr');

    expect(filas).toHaveLength(2);

    // Orden por defecto: nombre ascendente — Ana antes que Carlos.
    expect(within(filas[0] as HTMLElement).getByText('Ana Lopez')).toBeInTheDocument();
    expect(within(filas[0] as HTMLElement).getByText('QA')).toBeInTheDocument();
    expect(within(filas[0] as HTMLElement).getByText('0 h')).toBeInTheDocument();

    expect(within(filas[1] as HTMLElement).getByText('Carlos Mendoza')).toBeInTheDocument();
    expect(within(filas[1] as HTMLElement).getByText('Backend')).toBeInTheDocument();
    expect(within(filas[1] as HTMLElement).getByText('8 h')).toBeInTheDocument();

    // Badge de estado de participación (T-106 solo devuelve integrantes ACTIVO).
    expect(screen.getAllByText('Activo')).toHaveLength(2);
  });

  it('cada fila enlaza al detalle del integrante (findTeamMemberDetail, fuera de alcance de T-106)', () => {
    mockHook({ miembros: [miembro({ idUsuario: 7 })] });
    renderPage();

    const link = screen.getByRole('link', { name: /Ver detalle/i });
    expect(link).toHaveAttribute('href', '/dashboard/proyectos/42/equipo/7');
  });

  it('un integrante con 0 tareas y 0 horas se muestra tal cual en su fila, no null/undefined', () => {
    mockHook({ miembros: [miembro({ tareasActivas: 0, horasReconocidas: 0 })] });
    const { container } = renderPage();

    const fila = container.querySelector('tbody tr');
    expect(fila?.textContent).toContain('0');
    expect(fila?.textContent).toContain('0 h');
  });

  it('un integrante con múltiples roles produce UNA sola fila con ambos roles visibles', () => {
    // Fixture contractual (item 13 del review): idUsuario=100 con roles
    // Backend + QA debe producir una única fila, nunca dos.
    mockHook({
      miembros: [
        miembro({
          idUsuario: 100,
          nombre: 'Elena',
          apellido: 'Ruiz',
          roles: [
            { idRolProyecto: 1, nombreRol: 'Backend' },
            { idRolProyecto: 2, nombreRol: 'QA' },
          ],
        }),
      ],
    });
    const { container } = renderPage();
    const filas = container.querySelectorAll('tbody tr');

    expect(filas).toHaveLength(1);
    expect(within(filas[0] as HTMLElement).getAllByText('Elena Ruiz')).toHaveLength(1);
    expect(within(filas[0] as HTMLElement).getByText('Backend')).toBeInTheDocument();
    expect(within(filas[0] as HTMLElement).getByText('QA')).toBeInTheDocument();
  });

  it('varios usuarios, cada uno con su propio conteo de roles, producen una fila por usuario', () => {
    mockHook({
      miembros: [
        miembro({ idUsuario: 1, nombre: 'Uno', roles: [{ idRolProyecto: 1, nombreRol: 'Backend' }] }),
        miembro({
          idUsuario: 2,
          nombre: 'Dos',
          roles: [
            { idRolProyecto: 2, nombreRol: 'QA' },
            { idRolProyecto: 3, nombreRol: 'Frontend' },
            { idRolProyecto: 4, nombreRol: 'DevOps' },
          ],
        }),
      ],
    });
    const { container } = renderPage();

    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  });
});

describe('MiembrosProyectoPage — líder', () => {
  it('muestra al líder por separado, no como una fila más de la tabla', () => {
    mockHook({ miembros: [miembro({ idUsuario: 7 })] });
    renderPage();

    expect(screen.getByText(/Sofia Castillo/)).toBeInTheDocument();
    const filas = document.querySelectorAll('tbody tr');
    expect(filas).toHaveLength(1);
    expect(within(filas[0] as HTMLElement).queryByText(/Sofia Castillo/)).not.toBeInTheDocument();
  });
});

describe('MiembrosProyectoPage — métricas de cabecera', () => {
  // "Tareas activas" y "Horas reconocidas" también aparecen como encabezado
  // de columna ordenable; el grid de métricas se busca aparte para no
  // colisionar con esos <button> del <thead>.
  function metricasGrid(container: HTMLElement): HTMLElement {
    return container.querySelector('.grid.grid-cols-2') as HTMLElement;
  }

  function valorDeMetrica(container: HTMLElement, labelText: string): string | null {
    const label = within(metricasGrid(container)).getByText(labelText);
    return label.nextElementSibling?.textContent ?? null;
  }

  it('todas las métricas se agregan exclusivamente desde el payload de T-106 (miembros[])', () => {
    mockHook({
      miembros: [
        miembro({ idUsuario: 100, tareasActivas: 2, tareasCompletadas: 3, horasReconocidas: 15 }),
        miembro({ idUsuario: 200, tareasActivas: 1, tareasCompletadas: 0, horasReconocidas: 5 }),
      ],
    });
    const { container } = renderPage();

    expect(valorDeMetrica(container, 'Integrantes activos')).toBe('2');
    expect(valorDeMetrica(container, 'Tareas activas')).toBe('3');
    expect(valorDeMetrica(container, 'Tareas completadas')).toBe('3');
    expect(valorDeMetrica(container, 'Horas reconocidas')).toBe('20 h');
  });

  it('un integrante con múltiples roles no infla "Integrantes activos": cuenta personas, no roles', () => {
    mockHook({
      miembros: [
        miembro({
          idUsuario: 100,
          roles: [
            { idRolProyecto: 1, nombreRol: 'Backend' },
            { idRolProyecto: 2, nombreRol: 'QA' },
          ],
          horasReconocidas: 15,
        }),
        miembro({ idUsuario: 200, horasReconocidas: 5 }),
      ],
    });
    const { container } = renderPage();

    expect(valorDeMetrica(container, 'Integrantes activos')).toBe('2');
    expect(valorDeMetrica(container, 'Horas reconocidas')).toBe('20 h');
  });

  it('un proyecto sin integrantes muestra 0 en todas las métricas, sin errores', () => {
    mockHook({ miembros: [] });
    const { container } = renderPage();

    expect(valorDeMetrica(container, 'Integrantes activos')).toBe('0');
    expect(valorDeMetrica(container, 'Tareas activas')).toBe('0');
    expect(valorDeMetrica(container, 'Tareas completadas')).toBe('0');
    expect(valorDeMetrica(container, 'Horas reconocidas')).toBe('0 h');
    expect(screen.getByText('Aún no hay integrantes en este proyecto.')).toBeInTheDocument();
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
      miembro({ idUsuario: 7, nombre: 'Carlos', apellido: 'Mendoza', tareasActivas: 1, horasReconocidas: 5 }),
      miembro({ idUsuario: 8, nombre: 'Ana', apellido: 'Lopez', tareasActivas: 9, horasReconocidas: 1 }),
    ];
  }

  function textoDeFilas(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('tbody tr')).map((fila) => fila.textContent ?? '');
  }

  it('por defecto ordena por nombre ascendente', () => {
    mockHook({ miembros: miembrosFixture() });
    const { container } = renderPage();

    const filas = textoDeFilas(container);
    expect(filas[0]).toContain('Ana Lopez');
    expect(filas[1]).toContain('Carlos Mendoza');
  });

  it('un clic en un encabezado ordenable reordena por esa columna', () => {
    mockHook({ miembros: miembrosFixture() });
    const { container } = renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Tareas activas/i }));

    // Carlos tiene 1 tarea activa, Ana 9 — ascendente pone a Carlos primero.
    const filas = textoDeFilas(container);
    expect(filas[0]).toContain('Carlos Mendoza');
    expect(filas[1]).toContain('Ana Lopez');
  });

  it('un segundo clic en el mismo encabezado invierte el orden', () => {
    mockHook({ miembros: miembrosFixture() });
    const { container } = renderPage();

    const boton = screen.getByRole('button', { name: /Tareas activas/i });
    fireEvent.click(boton);
    fireEvent.click(boton);

    const filas = textoDeFilas(container);
    expect(filas[0]).toContain('Ana Lopez');
    expect(filas[1]).toContain('Carlos Mendoza');
  });

  it('el <th> activo expone aria-sort para accesibilidad, el resto queda en "none"', () => {
    mockHook({ miembros: miembrosFixture() });
    renderPage();

    const encabezadoHoras = screen.getByRole('columnheader', { name: /Horas reconocidas/i });
    expect(encabezadoHoras).toHaveAttribute('aria-sort', 'none');

    fireEvent.click(screen.getByRole('button', { name: /Horas reconocidas/i }));
    expect(encabezadoHoras).toHaveAttribute('aria-sort', 'ascending');

    const encabezadoNombre = screen.getByRole('columnheader', { name: /Integrante/i });
    expect(encabezadoNombre).toHaveAttribute('aria-sort', 'none');
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
