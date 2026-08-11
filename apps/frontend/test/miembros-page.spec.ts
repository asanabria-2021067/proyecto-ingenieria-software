import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ParticipacionActivaDTO } from '../lib/dto/member.dto';
import type { AvanceProyectoDTO } from '../lib/dto/project.dto';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42' }),
}));

vi.mock('../hooks/use-project-team', () => ({ useProjectTeam: vi.fn() }));
vi.mock('../hooks/use-project-avance', () => ({ useProjectAvance: vi.fn() }));

import MiembrosProyectoPage from '../app/dashboard/proyectos/[id]/miembros/page';
import { useProjectTeam } from '../hooks/use-project-team';
import { useProjectAvance } from '../hooks/use-project-avance';

function miembro(overrides: Partial<ParticipacionActivaDTO> = {}): ParticipacionActivaDTO {
  return {
    idParticipacion: 10,
    estadoParticipacion: 'ACTIVO',
    fechaIngreso: '2026-01-05T00:00:00.000Z',
    tareasActivas: 3,
    horasRegistradas: 12.5,
    usuario: { idUsuario: 7, nombre: 'Carlos', apellido: 'Mendoza', correo: 'carlos@uvg.edu.gt', fotoUrl: null },
    rolProyecto: { idRolProyecto: 3, nombreRol: 'Backend', descripcionRolProyecto: null },
    ...overrides,
  };
}

function mockHook(overrides: Partial<ReturnType<typeof useProjectTeam>> = {}) {
  (useProjectTeam as any).mockReturnValue({
    equipo: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

function mockAvance(overrides: { data?: AvanceProyectoDTO; isLoading?: boolean; isError?: boolean } = {}) {
  (useProjectAvance as any).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  });
}

function renderPage() {
  return render(createElement(MiembrosProyectoPage));
}

beforeEach(() => {
  mockAvance();
});

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
    mockHook({ equipo: [] });
    renderPage();

    expect(screen.getByText('Aún no hay integrantes en este proyecto.')).toBeInTheDocument();
    expect(screen.queryByText('No fue posible cargar los integrantes.')).not.toBeInTheDocument();
  });
});

describe('MiembrosProyectoPage — tabla con datos', () => {
  it('renderiza nombre, rol, estado, tareas activas y horas registradas de cada integrante', () => {
    mockHook({
      equipo: [
        miembro({
          idParticipacion: 10,
          usuario: { idUsuario: 7, nombre: 'Carlos', apellido: 'Mendoza', correo: 'c@uvg.edu.gt', fotoUrl: null },
          rolProyecto: { idRolProyecto: 3, nombreRol: 'Backend', descripcionRolProyecto: null },
          tareasActivas: 2,
          horasRegistradas: 8,
        }),
        miembro({
          idParticipacion: 11,
          usuario: { idUsuario: 8, nombre: 'Ana', apellido: 'Lopez', correo: 'a@uvg.edu.gt', fotoUrl: null },
          rolProyecto: { idRolProyecto: 4, nombreRol: 'QA', descripcionRolProyecto: null },
          tareasActivas: 0,
          horasRegistradas: 0,
        }),
      ],
    });
    const { container } = renderPage();
    const filas = container.querySelectorAll('tbody tr');

    // Orden por defecto: nombre ascendente — Ana antes que Carlos.
    expect(within(filas[0] as HTMLElement).getByText('Ana Lopez')).toBeInTheDocument();
    expect(within(filas[0] as HTMLElement).getByText('QA')).toBeInTheDocument();
    expect(within(filas[0] as HTMLElement).getByText('0 h')).toBeInTheDocument();

    expect(within(filas[1] as HTMLElement).getByText('Carlos Mendoza')).toBeInTheDocument();
    expect(within(filas[1] as HTMLElement).getByText('Backend')).toBeInTheDocument();
    expect(within(filas[1] as HTMLElement).getByText('8 h')).toBeInTheDocument();

    // Badge de estado de participación (findTeam solo devuelve integrantes ACTIVO).
    expect(screen.getAllByText('Activo')).toHaveLength(2);
  });

  it('un integrante con 0 tareas y 0 horas se muestra tal cual en su fila, no null/undefined', () => {
    mockHook({ equipo: [miembro({ tareasActivas: 0, horasRegistradas: 0 })] });
    const { container } = renderPage();

    const fila = container.querySelector('tbody tr');
    expect(fila?.textContent).toContain('0');
    expect(fila?.textContent).toContain('0 h');
  });
});

describe('MiembrosProyectoPage — métricas de cabecera', () => {
  function valorDeMetrica(labelText: string): string | null {
    const label = screen.getByText(labelText);
    return label.nextElementSibling?.textContent ?? null;
  }

  it('integrantes activos cuenta usuarios únicos, no filas (un usuario con 2 roles no se duplica)', () => {
    mockHook({
      equipo: [
        miembro({
          idParticipacion: 20,
          usuario: { idUsuario: 100, nombre: 'Elena', apellido: 'Ruiz', correo: 'e@uvg.edu.gt', fotoUrl: null },
          rolProyecto: { idRolProyecto: 1, nombreRol: 'Backend', descripcionRolProyecto: null },
          horasRegistradas: 15,
        }),
        miembro({
          idParticipacion: 21,
          usuario: { idUsuario: 100, nombre: 'Elena', apellido: 'Ruiz', correo: 'e@uvg.edu.gt', fotoUrl: null },
          rolProyecto: { idRolProyecto: 2, nombreRol: 'QA', descripcionRolProyecto: null },
          horasRegistradas: 15,
        }),
        miembro({
          idParticipacion: 22,
          usuario: { idUsuario: 200, nombre: 'Marco', apellido: 'Diaz', correo: 'm@uvg.edu.gt', fotoUrl: null },
          horasRegistradas: 5,
        }),
      ],
    });
    renderPage();

    expect(valorDeMetrica('Integrantes activos')).toBe('2');
    expect(valorDeMetrica('Horas acumuladas')).toBe('20 h');
  });

  it('tareas abiertas y completadas vienen de useProjectAvance, no de la tabla de equipo', () => {
    mockHook({ equipo: [] });
    mockAvance({
      data: {
        tareas: { total: 10, hecho: 4, porHacer: 3, enProgreso: 3, porcentaje: 40 },
        hitos: { total: 0, pendiente: 0, enProgreso: 0, completado: 0, porcentaje: 0 },
      },
    });
    renderPage();

    expect(valorDeMetrica('Tareas abiertas')).toBe('6');
    expect(valorDeMetrica('Tareas completadas')).toBe('4');
  });

  it('sin datos de avance (403 o carga) las métricas de tareas muestran 0, no un error visible', () => {
    mockHook({ equipo: [] });
    mockAvance({ data: undefined, isError: true });
    renderPage();

    expect(valorDeMetrica('Tareas abiertas')).toBe('0');
    expect(valorDeMetrica('Tareas completadas')).toBe('0');
    expect(screen.queryByText('No fue posible cargar los integrantes.')).not.toBeInTheDocument();
  });

  it('un proyecto sin integrantes muestra 0 integrantes activos y 0 horas acumuladas, sin errores', () => {
    mockHook({ equipo: [] });
    renderPage();

    expect(valorDeMetrica('Integrantes activos')).toBe('0');
    expect(valorDeMetrica('Horas acumuladas')).toBe('0 h');
    expect(screen.getByText('Aún no hay integrantes en este proyecto.')).toBeInTheDocument();
  });

  it('mientras useProjectTeam carga, las métricas que dependen del equipo muestran skeleton', () => {
    mockHook({ isLoading: true });
    const { container } = renderPage();

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });
});

describe('MiembrosProyectoPage — ordenamiento', () => {
  function equipoFixture(): ParticipacionActivaDTO[] {
    return [
      miembro({
        idParticipacion: 10,
        usuario: { idUsuario: 7, nombre: 'Carlos', apellido: 'Mendoza', correo: 'c@uvg.edu.gt', fotoUrl: null },
        tareasActivas: 1,
        horasRegistradas: 5,
      }),
      miembro({
        idParticipacion: 11,
        usuario: { idUsuario: 8, nombre: 'Ana', apellido: 'Lopez', correo: 'a@uvg.edu.gt', fotoUrl: null },
        tareasActivas: 9,
        horasRegistradas: 1,
      }),
    ];
  }

  function textoDeFilas(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('tbody tr')).map((fila) => fila.textContent ?? '');
  }

  it('por defecto ordena por nombre ascendente', () => {
    mockHook({ equipo: equipoFixture() });
    const { container } = renderPage();

    const filas = textoDeFilas(container);
    expect(filas[0]).toContain('Ana Lopez');
    expect(filas[1]).toContain('Carlos Mendoza');
  });

  it('un clic en un encabezado ordenable reordena por esa columna', () => {
    mockHook({ equipo: equipoFixture() });
    const { container } = renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Tareas activas/i }));

    // Carlos tiene 1 tarea activa, Ana 9 — ascendente pone a Carlos primero.
    const filas = textoDeFilas(container);
    expect(filas[0]).toContain('Carlos Mendoza');
    expect(filas[1]).toContain('Ana Lopez');
  });

  it('un segundo clic en el mismo encabezado invierte el orden', () => {
    mockHook({ equipo: equipoFixture() });
    const { container } = renderPage();

    const boton = screen.getByRole('button', { name: /Tareas activas/i });
    fireEvent.click(boton);
    fireEvent.click(boton);

    const filas = textoDeFilas(container);
    expect(filas[0]).toContain('Ana Lopez');
    expect(filas[1]).toContain('Carlos Mendoza');
  });

  it('el <th> activo expone aria-sort para accesibilidad, el resto queda en "none"', () => {
    mockHook({ equipo: equipoFixture() });
    renderPage();

    const encabezadoHoras = screen.getByRole('columnheader', { name: /Horas registradas/i });
    expect(encabezadoHoras).toHaveAttribute('aria-sort', 'none');

    fireEvent.click(screen.getByRole('button', { name: /Horas registradas/i }));
    expect(encabezadoHoras).toHaveAttribute('aria-sort', 'ascending');

    const encabezadoNombre = screen.getByRole('columnheader', { name: /Integrante/i });
    expect(encabezadoNombre).toHaveAttribute('aria-sort', 'none');
  });
});

describe('MiembrosProyectoPage — navegación', () => {
  it('el link de volver apunta al detalle del proyecto correcto', () => {
    mockHook({ equipo: [] });
    renderPage();

    const link = screen.getByRole('link', { name: /Volver al proyecto/i });
    expect(link).toHaveAttribute('href', '/dashboard/proyectos/42');
  });
});
