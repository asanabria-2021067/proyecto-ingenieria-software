import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { HitoDTO } from '../lib/dto/project.dto';
import type { TareaPublicaDTO } from '../lib/types/tasks';

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(),
}));

import { HitosSection } from '../components/projects/hitos-section';

function hito(overrides: Partial<HitoDTO> = {}): HitoDTO {
  return {
    idHito: 1,
    tituloHito: 'Entrega 1',
    descripcionHito: null,
    fechaLimite: null,
    estadoHito: 'PENDIENTE',
    orden: 0,
    ...overrides,
  };
}

function tarea(overrides: Partial<TareaPublicaDTO> = {}): TareaPublicaDTO {
  return {
    idTarea: 1,
    idProyecto: 10,
    idHito: null,
    idRolProyecto: null,
    tituloTarea: 'Tarea',
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    creadaPor: 5,
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    fechaLimite: null,
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
    horasReales: null,
    asignacionActiva: null,
    rolProyecto: null,
    hito: null,
    etiquetas: [],
    cantidadComentarios: 0,
    ...overrides,
  };
}

describe('HitosSection', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('agrupa una tarea con idHito válido bajo su hito', () => {
    const hitos = [hito({ idHito: 1, tituloHito: 'Entrega 1' })];
    const tareas = [tarea({ idTarea: 100, idHito: 1, tituloTarea: 'Tarea del hito' })];
    render(createElement(HitosSection, { hitos, tareas, idProyecto: 10 }));

    const seccionHito = screen.getByTestId('hito-1');
    expect(within(seccionHito).getByText('Tarea del hito')).toBeInTheDocument();
  });

  it('muestra las tareas con idHito null en "Tareas sin hito" con contador', () => {
    const hitos = [hito({ idHito: 1 })];
    const tareas = [
      tarea({ idTarea: 1, idHito: null, tituloTarea: 'Suelta 1' }),
      tarea({ idTarea: 2, idHito: null, tituloTarea: 'Suelta 2' }),
    ];
    render(createElement(HitosSection, { hitos, tareas, idProyecto: 10 }));

    const seccionSinHito = screen.getByTestId('tareas-sin-hito');
    expect(within(seccionSinHito).getByText('Tareas sin hito')).toBeInTheDocument();
    expect(within(seccionSinHito).getByText('2')).toBeInTheDocument();
    expect(within(seccionSinHito).getByText('Suelta 1')).toBeInTheDocument();
    expect(within(seccionSinHito).getByText('Suelta 2')).toBeInTheDocument();
  });

  it('trata un idHito huérfano (sin hito cargado) como "sin hito", sin descartar la tarea', () => {
    const hitos = [hito({ idHito: 1 })];
    const tareas = [tarea({ idTarea: 1, idHito: 999, tituloTarea: 'Huérfana' })];
    render(createElement(HitosSection, { hitos, tareas, idProyecto: 10 }));

    const seccionSinHito = screen.getByTestId('tareas-sin-hito');
    expect(within(seccionSinHito).getByText('Huérfana')).toBeInTheDocument();
    expect(screen.queryByText('Huérfana', { selector: '[data-testid="hito-1"] *' })).not.toBeInTheDocument();
  });

  it('cada tarea aparece exactamente una vez', () => {
    const hitos = [hito({ idHito: 1 }), hito({ idHito: 2, tituloHito: 'Entrega 2', orden: 1 })];
    const tareas = [
      tarea({ idTarea: 1, idHito: 1, tituloTarea: 'A' }),
      tarea({ idTarea: 2, idHito: 2, tituloTarea: 'B' }),
      tarea({ idTarea: 3, idHito: null, tituloTarea: 'C' }),
    ];
    render(createElement(HitosSection, { hitos, tareas, idProyecto: 10 }));

    expect(screen.getAllByText('A')).toHaveLength(1);
    expect(screen.getAllByText('B')).toHaveLength(1);
    expect(screen.getAllByText('C')).toHaveLength(1);
  });

  it('un hito sin tareas sigue visible', () => {
    const hitos = [hito({ idHito: 1, tituloHito: 'Vacío' })];
    render(createElement(HitosSection, { hitos, tareas: [], idProyecto: 10 }));

    expect(screen.getByText('Vacío')).toBeInTheDocument();
    expect(screen.queryByTestId('tareas-sin-hito')).not.toBeInTheDocument();
  });

  it('cero hitos y cero tareas muestra el estado vacío general', () => {
    render(createElement(HitosSection, { hitos: [], tareas: [], idProyecto: 10 }));
    expect(screen.getByText('Aún no hay hitos registrados')).toBeInTheDocument();
    expect(
      screen.getByText('Los hitos permiten organizar las tareas del proyecto por etapas y objetivos.'),
    ).toBeInTheDocument();
  });

  it('cero hitos con tareas sueltas igual las muestra en "sin hito"', () => {
    const tareas = [tarea({ idTarea: 1, idHito: null, tituloTarea: 'Suelta' })];
    render(createElement(HitosSection, { hitos: [], tareas, idProyecto: 10 }));

    expect(screen.getByTestId('tareas-sin-hito')).toBeInTheDocument();
    expect(screen.getByText('Suelta')).toBeInTheDocument();
  });

  it('renderiza hitos en un grid de tarjetas sin timeline vertical', () => {
    const hitos = [1, 2, 3, 4].map((id) => hito({ idHito: id, tituloHito: `Hito ${id}`, orden: id }));
    render(createElement(HitosSection, { hitos, tareas: [], idProyecto: 10 }));

    expect(screen.getByTestId('hito-1').parentElement).toHaveClass('grid');
    expect(screen.queryByText('Hitos y Tareas')).not.toBeInTheDocument();
  });

  it('calcula progreso real del hito y limita a cinco tareas visibles', () => {
    const tareas = [1, 2, 3, 4, 5, 6].map((id) =>
      tarea({
        idTarea: id,
        idHito: 1,
        tituloTarea: `Tarea ${id}`,
        estadoTarea: id <= 3 ? 'HECHO' : 'POR_HACER',
      }),
    );
    render(createElement(HitosSection, { hitos: [hito({ idHito: 1 })], tareas, idProyecto: 10 }));

    const card = screen.getByTestId('hito-1');
    expect(within(card).getByText('50%')).toBeInTheDocument();
    expect(within(card).getByText('3 de 6 tareas completadas')).toBeInTheDocument();
    expect(within(card).getByText('Tarea 5')).toBeInTheDocument();
    expect(within(card).queryByText('Tarea 6')).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /ver todas las tareas del hito/i })).toHaveTextContent(
      'Ver todas las tareas (6)',
    );
  });

  it('"Ver todas las tareas" solicita cambiar al tablero con el hito activo', () => {
    const onVerTodasLasTareas = vi.fn();
    render(
      createElement(HitosSection, {
        hitos: [hito({ idHito: 9, tituloHito: 'Etapa final' })],
        tareas: [tarea({ idHito: 9 })],
        idProyecto: 10,
        onVerTodasLasTareas,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /ver todas las tareas del hito etapa final/i }));
    expect(onVerTodasLasTareas).toHaveBeenCalledWith(9);
  });

  it('el filtro "Sin hito" oculta el grid y muestra solo la sección sin hito', () => {
    render(
      createElement(HitosSection, {
        hitos: [hito({ idHito: 1 })],
        tareas: [tarea({ idTarea: 1, idHito: 1, tituloTarea: 'Con hito' }), tarea({ idTarea: 2, tituloTarea: 'Suelta' })],
        idProyecto: 10,
        filtroHito: 'sin-hito',
      }),
    );

    expect(screen.queryByTestId('hito-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('tareas-sin-hito')).toBeInTheDocument();
    expect(screen.getByText('Suelta')).toBeInTheDocument();
    expect(screen.queryByText('Con hito')).not.toBeInTheDocument();
  });

  it('contrae y expande la sección de tareas sin hito', () => {
    render(createElement(HitosSection, { hitos: [], tareas: [tarea({ tituloTarea: 'Suelta' })], idProyecto: 10 }));

    fireEvent.click(screen.getByRole('button', { name: 'Contraer tareas sin hito' }));
    expect(screen.queryByText('Suelta')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expandir tareas sin hito' }));
    expect(screen.getByText('Suelta')).toBeInTheDocument();
  });
});
