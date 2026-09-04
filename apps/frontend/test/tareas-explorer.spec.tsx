import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';
import type { TareaPublicaDTO } from '@/lib/types/tasks';

vi.mock('@/hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('@/hooks/use-project-tasks', () => ({ useProjectTasks: vi.fn() }));

import TareasExplorerClient from '@/app/dashboard/projects/[id]/tareas/tareas-explorer-client';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectTasks } from '@/hooks/use-project-tasks';
import { generarTareasFixture, TAREAS_FIXTURE } from '@/lib/tasks/task-fixtures';

const proyectoFixture: ProyectoDetalleDTO = {
  idProyecto: 1,
  tituloProyecto: 'UVG Collab',
  descripcionProyecto: null,
  objetivosProyecto: null,
  tipoProyecto: 'INVESTIGACION',
  estadoProyecto: 'EN_PROGRESO',
  modalidadProyecto: 'HIBRIDO',
  ubicacionProyecto: null,
  contextoAcademico: null,
  urlRecursoExterno: null,
  fechaPublicacion: null,
  fechaInicio: null,
  fechaFinEstimada: null,
  fechaCreacion: '2026-01-01T00:00:00.000Z',
  creador: { idUsuario: 1, nombre: 'Ana', apellido: 'Lopez', correo: 'ana@uvg.edu.gt' },
  organizaciones: [],
  intereses: [],
  roles: [],
  hitos: [],
  tareas: [],
} as unknown as ProyectoDetalleDTO;

function mockTareas(overrides: Partial<ReturnType<typeof useProjectTasks>> = {}) {
  (useProjectTasks as any).mockReturnValue({
    tasks: [] as TareaPublicaDTO[],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

function renderExplorer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TareasExplorerClient idProyecto={1} />
    </QueryClientProvider>,
  );
}

describe('TareasExplorerClient — T-182/T-184 (HU-146)', () => {
  beforeEach(() => {
    (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false, error: null });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('render inicial', () => {
    it('muestra el título del proyecto, la tabla y el contador de resultados', () => {
      mockTareas({ tasks: TAREAS_FIXTURE });
      renderExplorer();

      expect(screen.getByRole('heading', { name: 'UVG Collab' })).toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(
        screen.getByText(`${TAREAS_FIXTURE.length} resultados`),
      ).toBeInTheDocument();
    });

    it('renderiza una fila por tarea con su título, estado y prioridad', () => {
      mockTareas({ tasks: TAREAS_FIXTURE });
      renderExplorer();

      const tabla = screen.getByRole('table');
      const fila = within(tabla).getByText('Implementar HorasModule').closest('tr')!;
      expect(within(fila).getByText('Hecho')).toBeInTheDocument();
      expect(within(fila).getByText('Alta')).toBeInTheDocument();
    });
  });

  describe('estado de carga', () => {
    it('muestra el indicador de carga y no la tabla', () => {
      mockTareas({ isLoading: true, tasks: [] });
      renderExplorer();

      expect(screen.getByRole('status', { name: 'Cargando tareas' })).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('error', () => {
    it('muestra el estado de error con botón de reintentar', () => {
      const refetch = vi.fn();
      mockTareas({ isError: true, tasks: [], refetch });
      renderExplorer();

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('No se pudieron cargar las tareas')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('vacío', () => {
    it('muestra el estado vacío cuando el proyecto no tiene tareas', () => {
      mockTareas({ tasks: [] });
      renderExplorer();

      expect(screen.getByText('Este proyecto todavía no tiene tareas')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('muestra "Sin coincidencias" cuando los filtros no encuentran nada, con acción de limpiar', () => {
      mockTareas({ tasks: TAREAS_FIXTURE });
      renderExplorer();

      fireEvent.change(screen.getByLabelText('Buscar tareas por título o descripción'), {
        target: { value: 'texto-que-no-existe-en-ninguna-tarea' },
      });

      expect(screen.getByText('Sin coincidencias')).toBeInTheDocument();
      const limpiar = screen.getAllByRole('button', { name: 'Limpiar filtros' })[0];
      fireEvent.click(limpiar);

      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  describe('filtros visibles', () => {
    it('expone buscador, filtro de estado, filtro de prioridad y orden', () => {
      mockTareas({ tasks: TAREAS_FIXTURE });
      renderExplorer();

      expect(screen.getByLabelText('Buscar tareas por título o descripción')).toBeInTheDocument();
      expect(screen.getByLabelText('Filtrar por estado')).toBeInTheDocument();
      expect(screen.getByLabelText('Filtrar por prioridad')).toBeInTheDocument();
      expect(screen.getByLabelText('Ordenar tareas')).toBeInTheDocument();
    });

    it('el buscador filtra por texto y actualiza el contador de resultados', () => {
      mockTareas({ tasks: TAREAS_FIXTURE });
      renderExplorer();

      fireEvent.change(screen.getByLabelText('Buscar tareas por título o descripción'), {
        target: { value: 'HorasModule' },
      });

      expect(screen.getByText('1 resultado')).toBeInTheDocument();
      expect(screen.getByText('Implementar HorasModule')).toBeInTheDocument();
      expect(screen.queryByText('Diseñar esquema de base de datos')).not.toBeInTheDocument();
    });

    it('al cambiar cualquier filtro vuelve a la página 1', () => {
      mockTareas({ tasks: generarTareasFixture(20) });
      renderExplorer();

      fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
      expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();

      const selectEstado = screen.getByRole('combobox', { name: 'Filtrar por estado' });
      fireEvent.keyDown(selectEstado, { key: 'Enter' });
      fireEvent.click(screen.getByRole('option', { name: 'Hecho' }));

      expect(screen.getByText(/Página 1 de/)).toBeInTheDocument();
    });
  });

  describe('responsive básico', () => {
    it('envuelve la tabla en un contenedor con scroll horizontal para pantallas angostas', () => {
      mockTareas({ tasks: TAREAS_FIXTURE });
      renderExplorer();

      const tabla = screen.getByRole('table');
      expect(tabla.closest('[data-slot="table-container"]')).toHaveClass('overflow-x-auto');
    });

    it('la toolbar usa flex-wrap para apilarse en pantallas angostas', () => {
      mockTareas({ tasks: TAREAS_FIXTURE });
      const { container } = renderExplorer();

      const toolbar = container.querySelector('.flex-col.lg\\:flex-row');
      expect(toolbar).toBeInTheDocument();
    });
  });

  describe('accesibilidad', () => {
    it('la tabla tiene encabezados de columna con scope="col"', () => {
      mockTareas({ tasks: TAREAS_FIXTURE });
      renderExplorer();

      const encabezados = screen.getAllByRole('columnheader');
      expect(encabezados.length).toBe(6);
      encabezados.forEach((th) => expect(th).toHaveAttribute('scope', 'col'));
    });

    it('el contador de resultados es una región aria-live para lectores de pantalla', () => {
      mockTareas({ tasks: TAREAS_FIXTURE });
      renderExplorer();

      const contador = screen.getByText(`${TAREAS_FIXTURE.length} resultados`).closest('[aria-live="polite"]');
      expect(contador).toBeInTheDocument();
    });

    it('los botones de paginación tienen aria-label y se deshabilitan en los extremos', () => {
      mockTareas({ tasks: TAREAS_FIXTURE });
      renderExplorer();

      expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
    });

    it('el estado de error se anuncia con role="alert"', () => {
      mockTareas({ isError: true, tasks: [] });
      renderExplorer();

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
