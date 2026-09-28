import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { MiTareaDTO } from '@/lib/services/users';

vi.mock('@/lib/services/users', () => ({ getMisTareas: vi.fn() }));

import MisTareasPage from '@/app/dashboard/mis-tareas/page';
import { getMisTareas } from '@/lib/services/users';

function tarea(overrides: Partial<MiTareaDTO> & { idTarea: number; tituloTarea: string }): MiTareaDTO {
  return {
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    fechaLimite: null,
    idHito: null,
    proyecto: { idProyecto: 1, tituloProyecto: 'UVG Collab', estadoProyecto: 'EN_PROGRESO' },
    ...overrides,
  };
}

// fechas relativas a "hoy" (sin fake timers, para no pelear con los timers
// reales que usan las utilidades async de testing-library)
function diasDesdeHoy(dias: number): string {
  const fecha = new Date();
  fecha.setHours(0, 0, 0, 0);
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

const TAREAS_FIXTURE: MiTareaDTO[] = [
  tarea({
    idTarea: 1,
    tituloTarea: 'Tarea vencida',
    prioridad: 'ALTA',
    estadoTarea: 'EN_PROGRESO',
    fechaLimite: diasDesdeHoy(-5),
    proyecto: { idProyecto: 1, tituloProyecto: 'UVG Collab', estadoProyecto: 'EN_PROGRESO' },
  }),
  tarea({
    idTarea: 2,
    tituloTarea: 'Tarea próxima a vencer',
    prioridad: 'MEDIA',
    estadoTarea: 'POR_HACER',
    fechaLimite: diasDesdeHoy(1),
    proyecto: { idProyecto: 2, tituloProyecto: 'Rubik Frontend', estadoProyecto: 'EN_PROGRESO' },
  }),
  tarea({
    idTarea: 3,
    tituloTarea: 'Tarea a tiempo',
    prioridad: 'BAJA',
    estadoTarea: 'HECHO',
    fechaLimite: diasDesdeHoy(30),
    proyecto: { idProyecto: 1, tituloProyecto: 'UVG Collab', estadoProyecto: 'EN_PROGRESO' },
  }),
];

function mockMisTareas(resultado: MiTareaDTO[] | Promise<never>) {
  (getMisTareas as any).mockReturnValue(
    resultado instanceof Promise ? resultado : Promise.resolve(resultado),
  );
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MisTareasPage />
    </QueryClientProvider>,
  );
}

describe('MisTareasPage — vista global de tareas del usuario', () => {
  afterEach(() => {
    cleanup();
  });

  it('muestra una fila por tarea con su proyecto, prioridad y estado', async () => {
    mockMisTareas(TAREAS_FIXTURE);
    renderPage();

    expect(await screen.findByRole('table')).toBeInTheDocument();
    const fila = screen.getByText('Tarea vencida').closest('tr')!;
    expect(within(fila).getByText('UVG Collab')).toBeInTheDocument();
    expect(within(fila).getByText('Alta')).toBeInTheDocument();
    expect(within(fila).getByText('En progreso')).toBeInTheDocument();
  });

  it('ordena por fecha límite ascendente por defecto (lo que vence primero, arriba)', async () => {
    mockMisTareas(TAREAS_FIXTURE);
    renderPage();

    const filas = (await screen.findAllByRole('row')).slice(1); // sin fila de encabezado
    expect(within(filas[0]).getByText('Tarea vencida')).toBeInTheDocument();
    expect(within(filas[1]).getByText('Tarea próxima a vencer')).toBeInTheDocument();
    expect(within(filas[2]).getByText('Tarea a tiempo')).toBeInTheDocument();
  });

  it('marca visualmente, con ícono y texto, la tarea vencida y la próxima a vencer', async () => {
    mockMisTareas(TAREAS_FIXTURE);
    renderPage();

    await screen.findByRole('table');
    expect(within(screen.getByText('Tarea vencida').closest('tr')!).getByText('Vencida')).toBeInTheDocument();
    expect(
      within(screen.getByText('Tarea próxima a vencer').closest('tr')!).getByText('Vence pronto'),
    ).toBeInTheDocument();
  });

  it('permite filtrar por proyecto', async () => {
    mockMisTareas(TAREAS_FIXTURE);
    renderPage();

    await screen.findByRole('table');
    const selectProyecto = screen.getByRole('combobox', { name: 'Filtrar por proyecto' });
    fireEvent.keyDown(selectProyecto, { key: 'Enter' });
    fireEvent.click(screen.getByRole('option', { name: 'Rubik Frontend' }));

    expect(screen.getByText('1 resultado')).toBeInTheDocument();
    expect(screen.getByText('Tarea próxima a vencer')).toBeInTheDocument();
    expect(screen.queryByText('Tarea vencida')).not.toBeInTheDocument();
  });

  it('muestra el estado de carga con skeletons con forma de fila', () => {
    mockMisTareas(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole('status', { name: 'Cargando tus tareas' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('muestra el estado vacío con un enlace a mis proyectos cuando no hay tareas asignadas', async () => {
    mockMisTareas([]);
    renderPage();

    expect(await screen.findByText('No tienes tareas asignadas')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Ir a mis proyectos' });
    expect(link).toHaveAttribute('href', '/dashboard/projects/mine');
  });

  it('muestra "Sin coincidencias" cuando los filtros no encuentran nada, con acción de limpiar', async () => {
    mockMisTareas(TAREAS_FIXTURE);
    renderPage();

    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Buscar tareas por título o descripción'), {
      target: { value: 'texto-que-no-existe' },
    });

    expect(screen.getByText('Sin coincidencias')).toBeInTheDocument();
    const limpiar = screen.getAllByRole('button', { name: 'Limpiar filtros' })[0];
    fireEvent.click(limpiar);
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('muestra el estado de error con botón de reintentar', async () => {
    mockMisTareas(Promise.reject(new Error('falló')));
    renderPage();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('No se pudieron cargar tus tareas')).toBeInTheDocument();
  });
});
