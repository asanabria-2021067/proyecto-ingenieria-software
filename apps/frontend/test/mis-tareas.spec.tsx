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

/** Espera a que la lista agrupada esté en pantalla (ya no hay tabla). */
function esperarLista() {
  return screen.findByRole('region', { name: 'Vencidas' });
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

    await esperarLista();
    const fila = screen.getByText('Tarea vencida').closest('li')!;
    expect(within(fila).getByText('UVG Collab')).toBeInTheDocument();
    expect(within(fila).getByText('Alta')).toBeInTheDocument();
    expect(within(fila).getByText('En progreso')).toBeInTheDocument();
  });

  it('ordena por fecha límite ascendente por defecto (lo que vence primero, arriba)', async () => {
    mockMisTareas(TAREAS_FIXTURE);
    renderPage();

    await esperarLista();
    const filas = screen.getAllByRole('listitem');
    expect(within(filas[0]).getByText('Tarea vencida')).toBeInTheDocument();
    expect(within(filas[1]).getByText('Tarea próxima a vencer')).toBeInTheDocument();
    expect(within(filas[2]).getByText('Tarea a tiempo')).toBeInTheDocument();
  });

  it('marca visualmente, con ícono y texto, la tarea vencida y la próxima a vencer', async () => {
    mockMisTareas(TAREAS_FIXTURE);
    renderPage();

    await esperarLista();
    expect(within(screen.getByText('Tarea vencida').closest('li')!).getByText('Vencida')).toBeInTheDocument();
    expect(
      within(screen.getByText('Tarea próxima a vencer').closest('li')!).getByText('Vence pronto'),
    ).toBeInTheDocument();
  });

  it('permite filtrar por proyecto', async () => {
    mockMisTareas(TAREAS_FIXTURE);
    renderPage();

    await esperarLista();
    const selectProyecto = screen.getByRole('combobox', { name: 'Filtrar por proyecto' });
    fireEvent.keyDown(selectProyecto, { key: 'Enter' });
    fireEvent.click(screen.getByRole('option', { name: 'Rubik Frontend' }));

    expect(screen.getByRole('status')).toHaveTextContent('Total de tareas: 3 · 1 coincide con los filtros');
    expect(screen.getByText('Tarea próxima a vencer')).toBeInTheDocument();
    expect(screen.queryByText('Tarea vencida')).not.toBeInTheDocument();
  });

  it('muestra el estado de carga con skeletons con forma de fila', () => {
    mockMisTareas(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole('status', { name: 'Cargando tus tareas' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Vencidas' })).not.toBeInTheDocument();
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

    await esperarLista();
    fireEvent.change(screen.getByLabelText('Buscar tareas por título o descripción'), {
      target: { value: 'texto-que-no-existe' },
    });

    expect(screen.getByText('Sin coincidencias')).toBeInTheDocument();
    const limpiar = screen.getAllByRole('button', { name: 'Limpiar filtros' })[0];
    fireEvent.click(limpiar);
    expect(await esperarLista()).toBeInTheDocument();
  });

  it('muestra el estado de error con botón de reintentar', async () => {
    mockMisTareas(Promise.reject(new Error('falló')));
    renderPage();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('No se pudieron cargar tus tareas')).toBeInTheDocument();
  });
});

describe('MisTareasPage — resumen, grupos y filas compactas', () => {
  afterEach(() => {
    cleanup();
  });

  const CON_SIN_FECHA: MiTareaDTO[] = [
    ...TAREAS_FIXTURE,
    tarea({ idTarea: 4, tituloTarea: 'Tarea sin fecha', estadoTarea: 'EN_REVISION', prioridad: 'BAJA' }),
  ];

  it('ya no hay tabla ni encabezado de columnas', async () => {
    mockMisTareas(CON_SIN_FECHA);
    renderPage();

    await esperarLista();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('columnheader')).toHaveLength(0);
  });

  it('el encabezado va directo sobre la página, sin tarjeta', async () => {
    mockMisTareas(CON_SIN_FECHA);
    renderPage();

    const titulo = await screen.findByRole('heading', { level: 1, name: 'Mis Tareas' });
    expect(titulo.closest('.card-base')).toBeNull();
    expect(
      screen.getByText('Todas las tareas asignadas en tus proyectos, ordenadas por lo que requiere atención primero.'),
    ).toBeInTheDocument();
  });

  it('los 4 KPI salen de los datos reales cargados', async () => {
    mockMisTareas(CON_SIN_FECHA);
    renderPage();

    await esperarLista();
    const kpi = (nombre: string) => screen.getByRole('group', { name: nombre });
    // POR_HACER: #2 · vencidas: #1 · EN_PROGRESO: #1 · HECHO: #3 (EN_REVISION no entra en ninguno)
    expect(kpi('Pendientes')).toHaveTextContent('1');
    expect(kpi('Vencidas')).toHaveTextContent('1');
    expect(kpi('En progreso')).toHaveTextContent('1');
    expect(kpi('Completadas')).toHaveTextContent('1');
    for (const nombre of ['Pendientes', 'Vencidas', 'En progreso', 'Completadas']) {
      expect(kpi(nombre)).toHaveClass('card-base');
      expect(kpi(nombre).querySelector('svg')).toBeNull();
    }
  });

  it('los KPI cambian con los datos: sin vencidas el número no se pinta en rojo', async () => {
    mockMisTareas([tarea({ idTarea: 9, tituloTarea: 'Solo una', estadoTarea: 'POR_HACER' })]);
    renderPage();

    const vencidas = await screen.findByRole('group', { name: 'Vencidas' });
    expect(vencidas).toHaveTextContent('0');
    expect(vencidas.querySelector('.text-error')).toBeNull();
    expect(screen.getByRole('group', { name: 'Pendientes' })).toHaveTextContent('1');
  });

  it('agrupa en Vencidas, Próximas, Sin fecha y Completadas, cada grupo como tarjeta con su conteo', async () => {
    mockMisTareas(CON_SIN_FECHA);
    renderPage();

    await esperarLista();
    // los grupos se titulan con su h2 (aria-labelledby); filtros y resumen usan aria-label
    const grupos = screen.getAllByRole('region').filter((g) => g.hasAttribute('aria-labelledby'));
    expect(grupos.map((g) => within(g).getByRole('heading').textContent)).toEqual([
      'Vencidas',
      'Próximas',
      'Sin fecha',
      'Completadas',
    ]);
    for (const grupo of grupos) expect(grupo).toHaveClass('card-base');
    expect(within(screen.getByRole('region', { name: 'Vencidas' })).getByText('1 tarea')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Próximas' })).getByText('Tarea próxima a vencer')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Completadas' })).getByText('Tarea a tiempo')).toBeInTheDocument();
  });

  it('en el grupo «Sin fecha» la fila no repite «Sin fecha»', async () => {
    mockMisTareas(CON_SIN_FECHA);
    renderPage();

    await esperarLista();
    const fila = screen.getByText('Tarea sin fecha').closest('li')!;
    expect(within(fila).queryByText('Sin fecha')).not.toBeInTheDocument();
  });

  it('fila: título en semibold que abre la tarea sobre toda la fila, proyecto como dato secundario', async () => {
    mockMisTareas(CON_SIN_FECHA);
    renderPage();

    await esperarLista();
    const enlace = screen.getByRole('link', { name: 'Tarea vencida' });
    expect(enlace).toHaveAttribute('href', '/dashboard/projects/1/kanban/tasks/1');
    expect(enlace).toHaveClass('font-semibold', 'text-text-primary', 'after:absolute', 'after:inset-0');
    const fila = enlace.closest('li')!;
    expect(fila).toHaveClass('relative', 'hover:bg-surface-container-low');
    expect(within(fila).getByText('UVG Collab')).toHaveClass('type-meta');
    // divisores tenues, no el color del texto
    expect(fila.parentElement).toHaveClass('divide-outline-variant/50');
  });

  it('«Total de tareas: N» (dato real) va sobre la tarjeta de filtros, no dentro', async () => {
    mockMisTareas(CON_SIN_FECHA);
    renderPage();

    await esperarLista();
    const total = screen.getByRole('status');
    expect(total).toHaveTextContent(/^Total de tareas: 4$/);
    const filtros = screen.getByRole('region', { name: 'Filtros de tareas' });
    expect(filtros).not.toContainElement(total);
    expect(total.compareDocumentPosition(filtros) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(filtros).getAllByRole('combobox')).toHaveLength(4);
    expect(within(filtros).getByLabelText('Buscar tareas por título o descripción')).toBeInTheDocument();
  });

  it('la barra de búsqueda y filtros es la de Mis Proyectos: sin tarjeta, buscador ancho y selects blancos', async () => {
    mockMisTareas(CON_SIN_FECHA);
    renderPage();

    await esperarLista();
    const filtros = screen.getByRole('region', { name: 'Filtros de tareas' });
    expect(filtros).not.toHaveClass('card-base');
    const buscador = within(filtros).getByRole('textbox', { name: 'Buscar tareas por título o descripción' });
    expect(buscador).toHaveClass('h-11.5', 'rounded-lg', 'bg-surface-container-lowest');
    expect(buscador).toHaveAttribute('placeholder', 'Buscar tarea...');
    // ancho: fila propia hasta 80rem de contenido; desde ahí, se estira junto a los selects
    expect(buscador.parentElement).toHaveClass('@4xl/mis-tareas:col-span-4', '@7xl/mis-tareas:flex-1');
    for (const select of within(filtros).getAllByRole('combobox')) {
      expect(select).toHaveClass('rounded-lg', 'border-outline-variant', 'bg-surface-container-lowest', 'focus:ring-primary');
      expect(select).not.toHaveClass('bg-page');
    }
  });

  it('el buscador sigue filtrando por título mientras escribes', async () => {
    mockMisTareas(CON_SIN_FECHA);
    renderPage();

    await esperarLista();
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar tareas por título o descripción' }), {
      target: { value: 'sin fecha' },
    });
    expect(screen.getByText('Tarea sin fecha')).toBeInTheDocument();
    expect(screen.queryByText('Tarea vencida')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Total de tareas: 4 · 1 coincide con los filtros');
  });

  it('con muchas completadas en la página, su grupo empieza plegado y se puede desplegar', async () => {
    const hechas = Array.from({ length: 6 }, (_, i) =>
      tarea({ idTarea: 100 + i, tituloTarea: `Hecha ${i + 1}`, estadoTarea: 'HECHO' }),
    );
    mockMisTareas([...TAREAS_FIXTURE.slice(0, 1), ...hechas]);
    renderPage();

    await esperarLista();
    const grupo = screen.getByRole('region', { name: 'Completadas' });
    expect(within(grupo).getByText('6 tareas')).toBeInTheDocument();
    expect(within(grupo).queryByText('Hecha 1')).not.toBeInTheDocument();
    fireEvent.click(within(grupo).getByRole('button', { name: 'Mostrar' }));
    expect(within(grupo).getByText('Hecha 1')).toBeInTheDocument();
    expect(within(grupo).getByRole('button', { name: 'Ocultar' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('la paginación sigue funcionando de a 15 tareas', async () => {
    const muchas = Array.from({ length: 16 }, (_, i) =>
      tarea({ idTarea: 200 + i, tituloTarea: `Tarea ${String(i + 1).padStart(2, '0')}`, fechaLimite: diasDesdeHoy(-30 + i) }),
    );
    mockMisTareas(muchas);
    renderPage();

    await esperarLista();
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(15);
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('cada grupo tiene una guía Tarea · Proyecto · Fecha límite · Prioridad · Estado con las mismas columnas que sus filas', async () => {
    mockMisTareas(CON_SIN_FECHA);
    renderPage();

    await esperarLista();
    for (const nombre of ['Vencidas', 'Próximas', 'Sin fecha', 'Completadas']) {
      const grupo = screen.getByRole('region', { name: nombre });
      const guia = grupo.querySelector('[aria-hidden="true"].bg-surface-container-low') as HTMLElement;
      expect(Array.from(guia.children).map((c) => c.textContent)).toEqual([
        'Tarea',
        'Proyecto',
        'Fecha límite',
        'Prioridad',
        'Estado',
      ]);
      const columnas = guia.className.match(/@2xl\/grupo:grid-cols-\S+/)![0];
      for (const fila of within(grupo).getAllByRole('listitem')) {
        expect(fila.className).toContain(columnas);
        // cinco celdas siempre, aunque falte la fecha: la alineación no se rompe
        expect(fila.children).toHaveLength(5);
      }
    }
  });

  it('prioridad y estado viven cada uno en su propia celda, en el mismo orden en todas las filas', async () => {
    mockMisTareas(CON_SIN_FECHA);
    renderPage();

    await esperarLista();
    for (const fila of screen.getAllByRole('listitem')) {
      const [, proyecto, , prioridad, estado] = Array.from(fila.children);
      expect(proyecto).toHaveClass('type-meta');
      expect(prioridad.children).toHaveLength(1);
      expect(prioridad.firstElementChild).toHaveClass('pill');
      expect(estado.children).toHaveLength(1);
      expect(estado.firstElementChild).toHaveClass('pill');
    }
  });
});
