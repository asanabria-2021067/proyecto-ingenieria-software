import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { HitoDTO } from '../lib/dto/project.dto';
import type { TareaPublicaDTO } from '../lib/types/tasks';

// TaskCommentsDialog no es el objeto principal de esta prueba (HitosSection
// lo es): se stubea para no arrastrar QueryClient/useCurrentUser/red.
vi.mock('../components/projects/task-comments-dialog', () => ({
  TaskCommentsDialog: () => null,
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
    expect(within(seccionSinHito).getByText('2 tareas')).toBeInTheDocument();
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

  it('cero hitos y cero tareas no renderiza nada', () => {
    const { container } = render(createElement(HitosSection, { hitos: [], tareas: [], idProyecto: 10 }));
    expect(container).toBeEmptyDOMElement();
  });

  it('cero hitos con tareas sueltas igual las muestra en "sin hito"', () => {
    const tareas = [tarea({ idTarea: 1, idHito: null, tituloTarea: 'Suelta' })];
    render(createElement(HitosSection, { hitos: [], tareas, idProyecto: 10 }));

    expect(screen.getByTestId('tareas-sin-hito')).toBeInTheDocument();
    expect(screen.getByText('Suelta')).toBeInTheDocument();
  });
});
