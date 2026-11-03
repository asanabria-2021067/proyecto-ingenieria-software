import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
Element.prototype.scrollIntoView = () => {};
Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = () => {};

vi.mock('../lib/services/horas-semestre', () => ({
  getHorasHistorial: vi.fn(),
  descargarConstancia: vi.fn(),
}));
vi.mock('../lib/download-file', () => ({ downloadBlob: vi.fn() }));
vi.mock('../lib/services/users', () => ({ getMisTareas: vi.fn() }));
vi.mock('../lib/services/tasks', () => ({ updateTaskEstado: vi.fn() }));
vi.mock('../lib/services/task-hours', () => ({ registrarHorasTarea: vi.fn() }));

import { AccionesRapidasTarea, parseHorasRapidas } from '../components/dashboard/acciones-rapidas-tarea';
import { VencenEstaSemana } from '../components/dashboard/vencen-esta-semana';
import { construirSerieHorasProyecto } from '../components/hours/horas-por-proyecto';
import { recortar } from '../components/hours/horas-por-proyecto-plot';
import { SemestreHorasHistorial } from '../components/hours/semestre-horas-historial';
import { AvailableProjectCard } from '../components/projects/available-project-card';
import { downloadBlob } from '../lib/download-file';
import { compararSemestres } from '../lib/hours/semestre';
import { descargarConstancia, getHorasHistorial, type HorasSemestreHistorial } from '../lib/services/horas-semestre';
import { registrarHorasTarea } from '../lib/services/task-hours';
import { updateTaskEstado } from '../lib/services/tasks';
import { getMisTareas, type MiTareaDTO, type MisHorasProyecto } from '../lib/services/users';
import { tareasQueVencenEstaSemana } from '../lib/tasks/vencen-esta-semana';
import type { MiProyectoListItemDTO } from '../lib/dto/project.dto';

vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: { idUsuario: 1 } }) }));
vi.mock('../hooks/use-pinned-projects', () => ({
  usePinnedProjects: () => ({ isPinned: () => false, togglePin: vi.fn(), maxAlcanzado: false }),
}));
vi.mock('../hooks/use-save-project', () => ({
  useSaveProject: () => ({ guardar: { isPending: false, mutate: vi.fn() }, desguardar: { isPending: false, mutate: vi.fn() } }),
}));

function montar(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const S2 = { anio: 2026, periodo: 2 as const, inicio: '2026-07-01', fin: '2026-12-31' };
const S1 = { anio: 2026, periodo: 1 as const, inicio: '2026-01-01', fin: '2026-06-30' };

const historial = (): HorasSemestreHistorial[] => [
  { semestre: S2, metaBeca: 100, becaDeclarada: 10, becaAcreditada: 20, metaExtension: null, extensionDeclarada: 0, extensionAcreditada: 4 },
  { semestre: S1, metaBeca: 100, becaDeclarada: 30, becaAcreditada: 5, metaExtension: 40, extensionDeclarada: 8, extensionAcreditada: 0 },
];

describe('MEJ-61 comparar semestres', () => {
  it('calcula la diferencia de declaradas, acreditadas y avance', () => {
    const [a, b] = historial();
    const filas = compararSemestres(b, a);
    expect(filas.find((f) => f.etiqueta === 'Beca: declaradas')).toMatchObject({ a: 30, b: 10, diferencia: -20 });
    expect(filas.find((f) => f.etiqueta === 'Beca: avance')).toMatchObject({ a: 35, b: 30, diferencia: -5 });
    expect(filas.find((f) => f.etiqueta === 'Extensión: acreditadas')).toMatchObject({ a: 0, b: 4, diferencia: 4 });
    expect(a.becaDeclarada).toBe(10);
  });

  it('el historial muestra el comparativo con los dos semestres mas recientes', async () => {
    vi.mocked(getHorasHistorial).mockResolvedValue(historial());
    montar(<SemestreHorasHistorial />);
    const seccion = await screen.findByRole('region', { name: 'Comparar semestres' });
    const tabla = within(seccion).getByRole('table');
    const fila = within(tabla).getByText('Beca: declaradas').closest('tr')!;
    expect(within(fila).getByText('30 h')).toBeInTheDocument();
    expect(within(fila).getByText('10 h')).toBeInTheDocument();
    expect(within(fila).getByText('-20 h')).toBeInTheDocument();
  });

  it('con un solo semestre explica cuando podra comparar', async () => {
    vi.mocked(getHorasHistorial).mockResolvedValue([historial()[0]]);
    montar(<SemestreHorasHistorial />);
    expect(await screen.findByText(/podrás compararlos aquí/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Comparar semestres' })).toBeNull();
  });
});

describe('MEJ-11 constancia PDF', () => {
  it('descarga la constancia del semestre de la fila', async () => {
    vi.mocked(getHorasHistorial).mockResolvedValue(historial());
    const blob = new Blob(['pdf']);
    vi.mocked(descargarConstancia).mockResolvedValue(blob);
    montar(<SemestreHorasHistorial />);

    fireEvent.click(await screen.findByRole('button', { name: 'Descargar constancia de 1.er semestre 2026' }));
    await waitFor(() => expect(descargarConstancia).toHaveBeenCalledWith(S1));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(blob, 'constancia-horas-2026-1.pdf'));
  });

  it('si falla avisa sin descargar nada', async () => {
    vi.mocked(getHorasHistorial).mockResolvedValue(historial());
    vi.mocked(descargarConstancia).mockRejectedValue(new Error('x'));
    montar(<SemestreHorasHistorial />);
    fireEvent.click(await screen.findByRole('button', { name: 'Descargar constancia de 2.º semestre 2026' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos generar la constancia');
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});

describe('MEJ-14 horas por proyecto', () => {
  const proyecto = (id: number, registradas: string, acreditadas: string): MisHorasProyecto =>
    ({ idProyecto: id, tituloProyecto: `P${id}`, registradas, acreditadas }) as MisHorasProyecto;

  it('descarta proyectos sin horas y toma cada cifra tal cual la manda el backend', () => {
    expect(construirSerieHorasProyecto([proyecto(1, '4.50', '0.00'), proyecto(2, '0.00', '0.00'), proyecto(3, '0.00', '8.00')])).toEqual([
      { nombre: 'P1', registradas: 4.5, acreditadas: 0 },
      { nombre: 'P3', registradas: 0, acreditadas: 8 },
    ]);
  });

  it('recorta con elipsis las etiquetas largas del eje', () => {
    expect(recortar('Demo - Semana de la Computacion (cerrado)')).toHaveLength(18);
    expect(recortar('Demo - Semana de la Computacion (cerrado)').endsWith('…')).toBe(true);
    expect(recortar('Feria')).toBe('Feria');
  });

  it('limita a 8 proyectos', () => {
    const lista = Array.from({ length: 12 }, (_, i) => proyecto(i + 1, '1.00', '0.00'));
    expect(construirSerieHorasProyecto(lista)).toHaveLength(8);
  });
});

const tarea = (id: number, fechaLimite: string | null, estadoTarea: MiTareaDTO['estadoTarea'] = 'POR_HACER'): MiTareaDTO => ({
  idTarea: id,
  tituloTarea: `Tarea ${id}`,
  descripcionTarea: null,
  estadoTarea,
  prioridad: 'MEDIA',
  fechaLimite,
  idHito: null,
  proyecto: { idProyecto: 3, tituloProyecto: 'Feria', estadoProyecto: 'EN_PROGRESO' },
});

describe('MEJ-9 vencen esta semana', () => {
  // miercoles 4 nov 2026: la semana termina el domingo 8
  const hoy = new Date(2026, 10, 4, 15, 0);

  it('incluye de hoy al domingo, sin hechas, sin vencidas ni de la semana siguiente, en orden', () => {
    const lista = [
      tarea(1, '2026-11-08'),
      tarea(2, '2026-11-04'),
      tarea(3, '2026-11-03'),
      tarea(4, '2026-11-09'),
      tarea(5, '2026-11-05', 'HECHO'),
      tarea(6, null),
      tarea(7, '2026-11-06T00:00:00.000Z'),
    ];
    expect(tareasQueVencenEstaSemana(lista, hoy).map((t) => t.idTarea)).toEqual([2, 7, 1]);
  });

  it('en domingo solo cuenta el mismo dia', () => {
    const domingo = new Date(2026, 10, 8, 9, 0);
    expect(tareasQueVencenEstaSemana([tarea(1, '2026-11-08'), tarea(2, '2026-11-09')], domingo).map((t) => t.idTarea)).toEqual([1]);
  });

  it('la tarjeta lista las tareas y enlaza a cada una', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(hoy);
    vi.mocked(getMisTareas).mockResolvedValue([tarea(1, '2026-11-06')]);
    montar(<VencenEstaSemana />);
    const enlace = await screen.findByRole('link', { name: /Tarea 1/ });
    expect(enlace).toHaveAttribute('href', '/dashboard/projects/3/kanban/tasks/1');
    vi.useRealTimers();
  });

  it('sin vencimientos muestra el estado vacio con accion', async () => {
    vi.mocked(getMisTareas).mockResolvedValue([]);
    montar(<VencenEstaSemana />);
    expect(await screen.findByText(/No tienes tareas por vencer/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver mis tareas' })).toHaveAttribute('href', '/dashboard/mis-tareas');
  });
});

describe('MEJ-8 acciones rapidas de Mis tareas', () => {
  it('valida las horas: entre 0.01 y 24, coma o punto', () => {
    expect(parseHorasRapidas('1,5')).toBe(1.5);
    expect(parseHorasRapidas('0')).toBeNull();
    expect(parseHorasRapidas('25')).toBeNull();
    expect(parseHorasRapidas('abc')).toBeNull();
    expect(parseHorasRapidas('')).toBeNull();
  });

  it('cambia el estado de la tarea desde la lista', async () => {
    vi.mocked(updateTaskEstado).mockResolvedValue({} as never);
    montar(<AccionesRapidasTarea tarea={tarea(9, null)} />);
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Cambiar estado de Tarea 9' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'En progreso' }));
    await waitFor(() => expect(updateTaskEstado).toHaveBeenCalledWith(3, 9, { estadoTarea: 'EN_PROGRESO' }));
  });

  it('registra horas de hoy en la tarea', async () => {
    vi.mocked(registrarHorasTarea).mockResolvedValue({} as never);
    montar(<AccionesRapidasTarea tarea={tarea(9, null)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar horas en Tarea 9' }));
    const registrar = await screen.findByRole('button', { name: 'Registrar' });
    expect(registrar).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Horas trabajadas'), { target: { value: '1.5' } });
    fireEvent.click(registrar);
    await waitFor(() =>
      expect(registrarHorasTarea).toHaveBeenCalledWith(3, 9, { horas: 1.5, fecha: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    );
  });

  it('muestra el error del servidor al registrar', async () => {
    vi.mocked(registrarHorasTarea).mockRejectedValue(Object.assign(new Error('x'), { statusCode: 403 }));
    montar(<AccionesRapidasTarea tarea={tarea(9, null)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar horas en Tarea 9' }));
    fireEvent.change(await screen.findByLabelText('Horas trabajadas'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('MEJ-25 avance en tarjetas de Mis proyectos', () => {
  const mio = (extra: Partial<MiProyectoListItemDTO> = {}): MiProyectoListItemDTO =>
    ({
      idProyecto: 7,
      tituloProyecto: 'Feria de Ciencias',
      tipoProyecto: 'ACADEMICO_HORAS_BECA',
      estadoProyecto: 'EN_PROGRESO',
      modalidadProyecto: 'VIRTUAL',
      descripcionProyecto: 'x',
      fechaCreacion: '2026-01-01T00:00:00.000Z',
      fechaActualizacion: null,
      revisiones: [],
      ...extra,
    }) as MiProyectoListItemDTO;
  const avance = (hecho: number, total: number) =>
    ({ tareas: { total, hecho, porcentaje: Math.round((hecho / total) * 100), porHacer: 0, enProgreso: 0 }, hitos: {} }) as never;

  it('muestra tareas 2/3 y el sprint actual', () => {
    render(
      <AvailableProjectCard
        context="mine"
        proyecto={mio({ avanceProyecto: avance(2, 3), sprintActual: { numero: 4, porcentaje: 50, total: 2, hecho: 1 } })}
      />,
    );
    const tarjeta = screen.getByTestId('project-card-7');
    expect(within(tarjeta).getByText('Tareas: 2/3')).toBeInTheDocument();
    expect(within(tarjeta).getByText('67 %')).toBeInTheDocument();
    expect(within(tarjeta).getByText('Sprint 4: 1/2')).toBeInTheDocument();
    expect(within(tarjeta).getByRole('progressbar', { name: 'Avance de tareas de Feria de Ciencias' })).toBeInTheDocument();
  });

  it('sin tareas o sin avance no muestra la barra', () => {
    render(<AvailableProjectCard context="mine" proyecto={mio({ avanceProyecto: avance(0, 0) })} />);
    expect(screen.queryByText(/Tareas:/)).toBeNull();
    cleanup();
    render(<AvailableProjectCard context="mine" proyecto={mio()} />);
    expect(screen.queryByText(/Tareas:/)).toBeNull();
  });
});
