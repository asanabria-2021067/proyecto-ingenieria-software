import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';
import type { TareaPublicaDTO } from '@/lib/types/tasks';

vi.mock('@/hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('@/hooks/use-project-tasks', () => ({ useProjectTasks: vi.fn() }));
// HU-202: la lista consulta el usuario actual (¿es líder?) y, solo para el
// líder, integrantes y etiquetas de la barra de acciones masivas.
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('@/hooks/use-project-members', () => ({ useProjectMembers: vi.fn(() => ({ members: [] })) }));
vi.mock('@/hooks/use-project-labels', () => ({ useProjectLabels: vi.fn(() => ({ labels: [] })) }));

import TareasExplorerClient from '@/app/dashboard/projects/[id]/tareas/tareas-explorer-client';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectTasks } from '@/hooks/use-project-tasks';
import { useCurrentUser } from '@/hooks/use-current-user';
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
    // Por defecto, un integrante que no es el líder: la lista de solo lectura de siempre.
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999 } });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('selección múltiple y acciones masivas (HU-202)', () => {
    function mockLider() {
      (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
    }

    it('un integrante que no es el líder no ve casillas ni ayuda y conserva el texto de solo lectura', () => {
      mockTareas({ tasks: TAREAS_FIXTURE });
      renderExplorer();

      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(document.querySelector('[data-slot="ayuda-seleccion"]')).toBeNull();
      expect(screen.getByText(/Vista de solo lectura/)).toBeInTheDocument();
    });

    it('el líder ve la ayuda con Shift y Esc, y una casilla por fila más la de «todas»', () => {
      mockLider();
      mockTareas({ tasks: TAREAS_FIXTURE, accionMasiva: { mutate: vi.fn(), isPending: false } } as any);
      renderExplorer();

      const ayuda = document.querySelector('[data-slot="ayuda-seleccion"]') as HTMLElement;
      expect(ayuda).toHaveTextContent(/mantén Shift para seleccionar un rango/);
      expect(ayuda).toHaveTextContent(/Esc limpia la selección/);
      expect(screen.queryByText(/Vista de solo lectura/)).not.toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Seleccionar todas las tareas de esta página' })).toBeInTheDocument();
      expect(screen.getAllByRole('checkbox', { name: /^Seleccionar "/ })).toHaveLength(TAREAS_FIXTURE.length);
    });

    it('clic en una fila la marca; Shift+clic marca el rango en el orden de la tabla y abre la barra', () => {
      mockLider();
      mockTareas({ tasks: TAREAS_FIXTURE, accionMasiva: { mutate: vi.fn(), isPending: false } } as any);
      renderExplorer();

      const filas = within(screen.getByRole('table')).getAllByRole('row').slice(1);
      fireEvent.click(filas[0]);
      fireEvent.click(filas[2], { shiftKey: true });

      expect(filas.slice(0, 3).every((fila) => fila.getAttribute('data-state') === 'selected')).toBe(true);
      expect(filas[3]).not.toHaveAttribute('data-state');
      expect(screen.getByRole('toolbar', { name: 'Acciones masivas' })).toHaveTextContent('3seleccionadas');
      expect(screen.getByRole('checkbox', { name: 'Seleccionar todas las tareas de esta página' })).toHaveAttribute(
        'data-state',
        'indeterminate',
      );
    });

    it('«todas» marca y desmarca la página completa', () => {
      mockLider();
      mockTareas({ tasks: TAREAS_FIXTURE, accionMasiva: { mutate: vi.fn(), isPending: false } } as any);
      renderExplorer();

      const todas = screen.getByRole('checkbox', { name: 'Seleccionar todas las tareas de esta página' });
      fireEvent.click(todas);
      expect(screen.getByRole('toolbar', { name: 'Acciones masivas' })).toHaveTextContent(
        `${TAREAS_FIXTURE.length}seleccionadas`,
      );
      fireEvent.click(todas);
      expect(screen.queryByRole('toolbar', { name: 'Acciones masivas' })).not.toBeInTheDocument();
    });
  });

  describe('render inicial', () => {
    it('muestra el título del proyecto, la tabla y el contador de resultados', () => {
      mockTareas({ tasks: TAREAS_FIXTURE });
      renderExplorer();

      // encabezado de página fuera de tarjetas; el proyecto es contexto
      expect(screen.getByRole('heading', { level: 1, name: 'Todas las tareas' })).toBeInTheDocument();
      expect(screen.getByText('UVG Collab')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Volver al Tablero (Kanban)' })).toHaveAttribute(
        'href',
        expect.stringMatching(/\/kanban$/),
      );
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(`Resultados: ${TAREAS_FIXTURE.length}`);
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

      expect(screen.getByRole('status')).toHaveTextContent(
        `Resultados: 1 de ${TAREAS_FIXTURE.length} tareas en total`,
      );
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

    it('la barra de búsqueda y filtros va fuera de la tarjeta y se apila en anchos angostos (como Mis Tareas)', () => {
      mockTareas({ tasks: TAREAS_FIXTURE });
      renderExplorer();

      const barra = screen.getByRole('region', { name: 'Filtros de tareas' });
      // una columna de base, una sola fila solo con ancho suficiente del área del proyecto
      expect(barra).toHaveClass('grid', 'grid-cols-1', '@5xl/project:flex');
      expect(barra.closest('.card-base')).toBeNull();
      expect(screen.getByRole('table').closest('.card-base')).not.toBeNull();
      expect(within(barra).getByRole('textbox', { name: 'Buscar tareas por título o descripción' })).toHaveClass(
        'h-11.5',
        'bg-surface-container-lowest',
      );
      for (const select of within(barra).getAllByRole('combobox')) {
        expect(select).toHaveClass('rounded-lg', 'bg-surface-container-lowest');
        expect(select).not.toHaveClass('bg-page');
      }
      // «Resultados» queda arriba de la barra, no dentro de la tarjeta
      const total = screen.getByRole('status');
      expect(total.compareDocumentPosition(barra) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(total.closest('.card-base')).toBeNull();
    });
  });

  describe('accesibilidad', () => {
    it('la tabla tiene encabezados de columna con scope="col"', () => {
      mockTareas({ tasks: TAREAS_FIXTURE });
      renderExplorer();

      const encabezados = screen.getAllByRole('columnheader');
      expect(encabezados.length).toBe(7);
      encabezados.forEach((th) => expect(th).toHaveAttribute('scope', 'col'));
    });

    it('la tabla usa el formato de Mis Tareas sin cambiar sus columnas', () => {
      mockTareas({ tasks: TAREAS_FIXTURE });
      renderExplorer();

      const tabla = screen.getByRole('table');
      const encabezados = screen.getAllByRole('columnheader');
      // mismo contenido: las 7 columnas de siempre, en el mismo orden
      expect(encabezados.map((th) => th.textContent)).toEqual([
        'Título',
        'Hito',
        'Estado',
        'Prioridad',
        'Fecha límite',
        'Asignado a',
        'Etiquetas',
      ]);
      // franja guía gris verdosa con etiquetas pequeñas en seminegrita
      const filaGuia = encabezados[0].closest('tr')!;
      expect(filaGuia).toHaveClass('bg-surface-container-low', 'border-outline-variant/50');
      for (const th of encabezados) expect(th).toHaveClass('text-xs', 'font-semibold', 'text-text-secondary');
      // filas con divisor tenue y hover suave; título en seminegrita charcoal
      const [, primeraFila] = within(tabla).getAllByRole('row');
      expect(primeraFila).toHaveClass('border-outline-variant/50', 'hover:bg-surface-container-low');
      expect(within(primeraFila).getAllByRole('cell')[0]).toHaveClass('font-semibold', 'text-text-primary');
      // la tabla llega al borde de su tarjeta y la paginación va en su propia tarjeta
      expect(tabla.closest('.card-base')).toHaveClass('p-0', 'overflow-hidden');
      const paginacion = screen.getByRole('navigation', { name: 'Paginación de tareas' });
      expect(paginacion).toHaveClass('card-base');
      expect(tabla.closest('.card-base')).not.toContainElement(paginacion);
    });

    it('el contador de resultados es una región aria-live para lectores de pantalla', () => {
      mockTareas({ tasks: TAREAS_FIXTURE });
      renderExplorer();

      const contador = screen.getByText(/^Resultados:/).closest('[aria-live="polite"]');
      expect(contador).toBeInTheDocument();
      expect(contador).not.toHaveClass('pill');
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
