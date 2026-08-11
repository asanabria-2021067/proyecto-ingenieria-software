import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ParticipacionActivaDTO } from '../lib/dto/member.dto';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42' }),
}));

vi.mock('../hooks/use-project-team', () => ({ useProjectTeam: vi.fn() }));

import MiembrosProyectoPage from '../app/dashboard/proyectos/[id]/miembros/page';
import { useProjectTeam } from '../hooks/use-project-team';

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
    renderPage();

    expect(screen.getByText('Carlos Mendoza')).toBeInTheDocument();
    expect(screen.getByText('Backend')).toBeInTheDocument();
    expect(screen.getByText('8 h')).toBeInTheDocument();

    expect(screen.getByText('Ana Lopez')).toBeInTheDocument();
    expect(screen.getByText('QA')).toBeInTheDocument();
    expect(screen.getByText('0 h')).toBeInTheDocument();

    // Badge de estado de participación (findTeam solo devuelve integrantes ACTIVO).
    expect(screen.getAllByText('Activo')).toHaveLength(2);
  });

  it('un proyecto sin integrantes de todas formas no rompe: 0 tareas y 0 horas se muestran, no null/undefined', () => {
    mockHook({ equipo: [miembro({ tareasActivas: 0, horasRegistradas: 0 })] });
    renderPage();

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('0 h')).toBeInTheDocument();
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
