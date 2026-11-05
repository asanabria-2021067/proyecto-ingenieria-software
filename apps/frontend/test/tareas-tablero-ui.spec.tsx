import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';

vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: { idUsuario: 9 } }) }));
vi.mock('../lib/services/comments', () => ({ getMencionables: vi.fn().mockResolvedValue([]) }));
vi.mock('../lib/swal', () => ({ default: { fire: vi.fn() }, swalCustomClass: {} }));
vi.mock('../hooks/use-task-extras', () => ({ useTaskLinks: vi.fn() }));
vi.mock('../hooks/use-project-tasks', () => ({ useProjectTasks: vi.fn() }));
vi.mock('../lib/mensajes', () => ({
  aviso: { exito: vi.fn(), error: vi.fn() },
  confirmar: vi.fn(),
}));

import { CommentThread } from '../components/comments/comment-thread';
import { TaskCard } from '../components/projects/task-card';
import { TaskEnlaces } from '../components/projects/task-enlaces';
import { TaskListView } from '../components/projects/task-list-view';
import { TaskSubtareas } from '../components/projects/task-subtareas';
import { TaskTableView } from '../components/projects/task-table-view';
import { TaskResponsablesField } from '../components/projects/task-responsables-field';
import { useProjectTasks } from '../hooks/use-project-tasks';
import { useTaskLinks } from '../hooks/use-task-extras';
import { confirmar } from '../lib/mensajes';
import type { ComentarioListado } from '../lib/services/comments';
import type { TareaPublicaDTO } from '../lib/types/tasks';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

const angel = { idUsuario: 1, nombre: 'Angel', apellido: 'Sanabria', fotoUrl: null };
const maria = { idUsuario: 2, nombre: 'Maria', apellido: 'Lopez', fotoUrl: null };
const carlos = { idUsuario: 3, nombre: 'Carlos', apellido: 'Mendoza', fotoUrl: null };
const diana = { idUsuario: 4, nombre: 'Diana', apellido: 'Rivas', fotoUrl: null };
const eva = { idUsuario: 5, nombre: 'Eva', apellido: 'Paz', fotoUrl: null };

function tarea(overrides: Partial<TareaPublicaDTO> & { idTarea: number }): TareaPublicaDTO {
  return {
    idProyecto: 7,
    idHito: 5,
    idRolProyecto: null,
    tituloTarea: `Tarea ${overrides.idTarea}`,
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    creadaPor: 1,
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    fechaLimite: null,
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
    puntosHistoria: null,
    asignacionActiva: null,
    rolProyecto: null,
    hito: null,
    etiquetas: [],
    cantidadComentarios: 0,
    idTareaBloqueante: null,
    bloqueadaPor: null,
    repeticion: null,
    repeticionProxima: null,
    checklist: [],
    ...overrides,
  };
}

const asignacion = (usuario: typeof angel) => ({
  idAsignacion: usuario.idUsuario * 10,
  idUsuario: usuario.idUsuario,
  fechaAsignacion: '2026-01-02T00:00:00.000Z',
  usuario,
});

function renderCard(t: TareaPublicaDTO) {
  return render(
    <TaskCard
      tarea={t}
      puedeCambiarEstado={false}
      estadoPending={false}
      onAbrirDetalles={vi.fn()}
      onAbrirComentarios={vi.fn()}
    />,
  );
}

describe('TaskCard: subtareas y varios responsables', () => {
  afterEach(cleanup);

  it('muestra «2/4 subtareas» y no lo mezcla con el checklist', () => {
    const { container } = renderCard(tarea({ idTarea: 1, subtareas: { hechas: 2, total: 4 } }));
    expect(screen.getByText(/2\/4\s+subtareas/)).toBeInTheDocument();
    expect(container.querySelector('[data-slot="checklist-avance"]')).toBeNull();
  });

  it('sin subtareas no muestra el contador', () => {
    renderCard(tarea({ idTarea: 1, subtareas: { hechas: 0, total: 0 } }));
    expect(screen.queryByText(/subtarea/)).not.toBeInTheDocument();
  });

  it('un responsable muestra su nombre; varios, el total y los avatares con +N', () => {
    const { unmount } = renderCard(tarea({ idTarea: 1, asignacionActiva: asignacion(angel), responsables: [angel] }));
    expect(screen.getByText('Angel Sanabria')).toBeInTheDocument();
    unmount();

    renderCard(
      tarea({ idTarea: 1, asignacionActiva: asignacion(angel), responsables: [angel, maria, carlos, diana, eva] }),
    );
    expect(screen.getByText('5 responsables')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('AS')).toBeInTheDocument();
    expect(screen.queryByText('EP')).not.toBeInTheDocument();
  });

  it('sin responsables dice «Sin asignar»', () => {
    renderCard(tarea({ idTarea: 1 }));
    expect(screen.getByText('Sin asignar')).toBeInTheDocument();
  });
});

describe('TaskListView', () => {
  afterEach(cleanup);

  it('muestra título, estado, prioridad, responsables y fecha, y abre el detalle', () => {
    const t = tarea({
      idTarea: 1,
      tituloTarea: 'Armar informe',
      estadoTarea: 'EN_PROGRESO',
      prioridad: 'ALTA',
      fechaLimite: '2099-03-15',
      asignacionActiva: asignacion(angel),
      responsables: [angel, maria],
    });
    const onAbrir = vi.fn();
    render(<TaskListView tasks={[t]} onAbrir={onAbrir} />);

    const fila = screen.getByRole('listitem');
    expect(within(fila).getByText('En progreso')).toBeInTheDocument();
    expect(within(fila).getByText('Alta')).toBeInTheDocument();
    expect(within(fila).getByText('2 responsables')).toBeInTheDocument();
    expect(within(fila).getByText(/2099/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir detalles de "Armar informe"' }));
    expect(onAbrir).toHaveBeenCalledWith(t);
  });
});

describe('TaskTableView: columnas ordenables', () => {
  afterEach(cleanup);

  const tareas = [
    tarea({ idTarea: 1, tituloTarea: 'Beta', prioridad: 'BAJA', fechaLimite: '2099-12-02' }),
    tarea({ idTarea: 2, tituloTarea: 'Alfa', prioridad: 'ALTA', fechaLimite: '2099-12-03' }),
    tarea({ idTarea: 3, tituloTarea: 'Gamma', prioridad: 'MEDIA', fechaLimite: '2099-12-01' }),
  ];
  const titulos = () =>
    screen
      .getAllByRole('button', { name: /^Abrir detalles de/ })
      .map((b) => b.textContent);
  const encabezado = (nombre: string) => screen.getByRole('columnheader', { name: nombre });

  it('arranca por fecha límite y marca la columna activa con aria-sort', () => {
    render(<TaskTableView tasks={tareas} onAbrir={vi.fn()} />);
    expect(titulos()).toEqual(['Gamma', 'Beta', 'Alfa']);
    expect(encabezado('Fecha límite')).toHaveAttribute('aria-sort', 'ascending');
    expect(encabezado('Título')).toHaveAttribute('aria-sort', 'none');
  });

  it('al pulsar una columna ordena ascendente y al volver a pulsarla, descendente', () => {
    render(<TaskTableView tasks={tareas} onAbrir={vi.fn()} />);
    fireEvent.click(within(encabezado('Prioridad')).getByRole('button'));
    expect(titulos()).toEqual(['Alfa', 'Gamma', 'Beta']);
    expect(encabezado('Prioridad')).toHaveAttribute('aria-sort', 'ascending');
    expect(encabezado('Fecha límite')).toHaveAttribute('aria-sort', 'none');

    fireEvent.click(within(encabezado('Prioridad')).getByRole('button'));
    expect(titulos()).toEqual(['Beta', 'Gamma', 'Alfa']);
    expect(encabezado('Prioridad')).toHaveAttribute('aria-sort', 'descending');

    fireEvent.click(within(encabezado('Título')).getByRole('button'));
    expect(titulos()).toEqual(['Alfa', 'Beta', 'Gamma']);
  });

  it('tiene las cinco columnas ordenables y abre el mismo detalle', () => {
    const onAbrir = vi.fn();
    render(<TaskTableView tasks={tareas} onAbrir={onAbrir} />);
    for (const nombre of ['Título', 'Estado', 'Prioridad', 'Fecha límite', 'Responsable']) {
      expect(encabezado(nombre)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Abrir detalles de "Alfa"' }));
    expect(onAbrir).toHaveBeenCalledWith(tareas[1]);
  });
});

describe('TaskEnlaces (MEJ-107)', () => {
  const agregar = { mutate: vi.fn(), isPending: false };
  const quitar = { mutate: vi.fn(), isPending: false };

  function mockEnlaces(enlaces: unknown[] = []) {
    vi.mocked(useTaskLinks).mockReturnValue({
      enlaces,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      agregar,
      quitar,
    } as never);
  }

  beforeEach(() => {
    agregar.mutate.mockReset();
    quitar.mutate.mockReset();
  });
  afterEach(cleanup);

  it('rechaza un enlace que no es https sin llamar al servidor', () => {
    mockEnlaces();
    render(<TaskEnlaces idProyecto={7} idTarea={1} puedeEditar />);
    fireEvent.change(screen.getByLabelText('Enlace de la tarea'), { target: { value: 'http://ejemplo.com/a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar enlace' }));
    expect(screen.getByRole('alert')).toHaveTextContent('https://');
    expect(agregar.mutate).not.toHaveBeenCalled();
  });

  it('agrega un enlace https válido', () => {
    mockEnlaces();
    render(<TaskEnlaces idProyecto={7} idTarea={1} puedeEditar />);
    fireEvent.change(screen.getByLabelText('Enlace de la tarea'), { target: { value: ' https://www.figma.com/file/abc ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar enlace' }));
    expect(agregar.mutate).toHaveBeenCalledWith('https://www.figma.com/file/abc', expect.any(Object));
  });

  it('muestra la vista previa con sitio y título y abre en pestaña nueva', () => {
    mockEnlaces([
      { idEnlace: 4, url: 'https://github.com/uvg/repo', titulo: 'uvg/repo', sitio: 'github.com', tipo: 'GITHUB', creadoPor: 1, creadoEn: '2026-10-01T00:00:00Z' },
    ]);
    render(<TaskEnlaces idProyecto={7} idTarea={1} puedeEditar={false} />);
    const enlace = screen.getByRole('link', { name: /uvg\/repo/ });
    expect(enlace).toHaveAttribute('href', 'https://github.com/uvg/repo');
    expect(enlace).toHaveAttribute('target', '_blank');
    expect(within(enlace).getByText('github.com')).toBeInTheDocument();
    expect(screen.queryByLabelText('Enlace de la tarea')).not.toBeInTheDocument();
  });

  it('quitar pide confirmación y solo borra si se acepta', async () => {
    mockEnlaces([
      { idEnlace: 4, url: 'https://drive.google.com/x', titulo: 'Plan', sitio: 'drive.google.com', tipo: 'DRIVE', creadoPor: 1, creadoEn: '2026-10-01T00:00:00Z' },
    ]);
    vi.mocked(confirmar).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<TaskEnlaces idProyecto={7} idTarea={1} puedeEditar />);

    fireEvent.click(screen.getByRole('button', { name: 'Quitar el enlace Plan' }));
    await waitFor(() => expect(confirmar).toHaveBeenCalledTimes(1));
    expect(quitar.mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar el enlace Plan' }));
    await waitFor(() => expect(quitar.mutate).toHaveBeenCalledWith(4, expect.any(Object)));
  });
});

describe('TaskSubtareas (MEJ-106)', () => {
  const crearTarea = { mutateAsync: vi.fn(), isPending: false };
  const cambiarEstadoTarea = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
  const padre = tarea({ idTarea: 10, tituloTarea: 'Padre', prioridad: 'ALTA', fechaLimite: '2099-12-30', idRolProyecto: null });
  const miembros = [
    { ...angel, correo: 'a@uvg', idRolProyecto: 1 },
    { ...maria, correo: 'm@uvg', idRolProyecto: 1 },
  ];

  beforeEach(() => {
    crearTarea.mutateAsync.mockReset().mockResolvedValue({ idTarea: 55 });
    cambiarEstadoTarea.mutate.mockReset();
    cambiarEstadoTarea.mutateAsync.mockReset().mockResolvedValue({});
    vi.mocked(useProjectTasks).mockReturnValue({ crearTarea, cambiarEstadoTarea } as never);
  });
  afterEach(cleanup);

  const renderSubtareas = (subtareas: TareaPublicaDTO[], extra: Partial<Parameters<typeof TaskSubtareas>[0]> = {}) =>
    render(
      <TaskSubtareas
        idProyecto={7}
        tarea={padre}
        subtareas={subtareas}
        members={miembros}
        isLeader
        idUsuarioActual={1}
        puedeAgregar
        {...extra}
      />,
    );

  it('lista las subtareas con avance, enlace a su propio detalle y estado', () => {
    renderSubtareas([
      tarea({ idTarea: 21, tituloTarea: 'Hija A', estadoTarea: 'HECHO', idTareaPadre: 10 }),
      tarea({ idTarea: 22, tituloTarea: 'Hija B', estadoTarea: 'EN_PROGRESO', idTareaPadre: 10 }),
    ]);
    expect(screen.getByLabelText('1 de 2 subtareas hechas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hija B' })).toHaveAttribute('href', '/dashboard/projects/7/kanban/tasks/22');
    expect(within(screen.getByRole('list')).getByText('En progreso')).toBeInTheDocument();
  });

  it('marcar una subtarea como hecha cambia su estado', () => {
    renderSubtareas([tarea({ idTarea: 22, tituloTarea: 'Hija B', idTareaPadre: 10 })]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Marcar «Hija B» como hecha' }));
    expect(cambiarEstadoTarea.mutate).toHaveBeenCalledWith(
      { taskId: 22, input: { estadoTarea: 'HECHO' } },
      expect.any(Object),
    );
  });

  it('agrega una subtarea heredando hito y prioridad del padre', async () => {
    renderSubtareas([]);
    fireEvent.change(screen.getByLabelText('Título de la nueva subtarea de Padre'), { target: { value: 'Nueva hija' } });
    fireEvent.click(screen.getByRole('button', { name: /Agregar/ }));
    await waitFor(() => expect(crearTarea.mutateAsync).toHaveBeenCalledTimes(1));
    expect(crearTarea.mutateAsync.mock.calls[0][0]).toMatchObject({
      tituloTarea: 'Nueva hija',
      idTareaPadre: 10,
      idHito: 5,
      prioridad: 'ALTA',
      fechaLimite: '2099-12-30',
    });
    expect(cambiarEstadoTarea.mutateAsync).not.toHaveBeenCalled();
  });

  it('una subtarea no admite hijas: sin formulario', () => {
    renderSubtareas([], { tarea: tarea({ idTarea: 22, idTareaPadre: 10 }) });
    expect(screen.queryByLabelText(/Título de la nueva subtarea/)).not.toBeInTheDocument();
  });

  it('sin permiso para agregar y sin subtareas no muestra la sección', () => {
    const { container } = renderSubtareas([], { puedeAgregar: false });
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CommentThread: respuestas y reacciones (MEJ-110)', () => {
  const autor = (idUsuario: number, nombre: string, apellido: string) => ({ idUsuario, nombre, apellido, fotoUrl: null });
  const COMENTARIOS: ComentarioListado[] = [
    {
      idComentario: 2,
      idAutor: 2,
      contenido: 'Respuesta de María',
      creadoEn: '2026-10-02T10:00:00.000Z',
      editadoEn: null,
      autor: autor(2, 'María', 'López'),
      idComentarioPadre: 1,
      reacciones: [],
    },
    {
      idComentario: 1,
      idAutor: 3,
      contenido: 'Comentario raíz',
      creadoEn: '2026-10-01T10:00:00.000Z',
      editadoEn: null,
      autor: autor(3, 'Carlos', 'Mendoza'),
      idComentarioPadre: null,
      reacciones: [{ emoji: '👍', count: 2, idsUsuarios: [9, 2] }],
    },
  ];

  function renderThread(extra: Record<string, unknown> = {}) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const handlers = {
      listar: vi.fn().mockResolvedValue(COMENTARIOS),
      crear: vi.fn().mockResolvedValue({}),
      editar: vi.fn().mockResolvedValue({}),
      eliminar: vi.fn().mockResolvedValue({}),
      responder: vi.fn().mockResolvedValue({}),
      reaccionar: vi.fn().mockResolvedValue([]),
    };
    render(
      <CommentThread
        idProyecto={7}
        queryKey={['hilo-tarea']}
        enabled
        descripcionEliminar="Se eliminará."
        scroll={false}
        {...handlers}
        {...extra}
      />,
      { wrapper },
    );
    return handlers;
  }

  afterEach(cleanup);

  it('muestra la respuesta indentada bajo su comentario y solo la raíz tiene «Responder»', async () => {
    renderThread();
    const raiz = (await screen.findByText('Comentario raíz')).closest('li') as HTMLElement;
    const respuesta = screen.getByText('Respuesta de María').closest('li') as HTMLElement;
    expect(raiz.compareDocumentPosition(respuesta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(respuesta).toHaveClass('ml-8');
    expect(raiz).not.toHaveClass('ml-8');
    expect(within(raiz).getByRole('button', { name: 'Responder a Carlos Mendoza' })).toBeInTheDocument();
    expect(within(respuesta).queryByRole('button', { name: /^Responder a/ })).not.toBeInTheDocument();
  });

  it('responder envía el contenido al comentario elegido', async () => {
    const { responder } = renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Responder a Carlos Mendoza' }));
    fireEvent.change(screen.getByLabelText('Escribe una respuesta'), { target: { value: 'De acuerdo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
    await waitFor(() => expect(responder).toHaveBeenCalledWith(1, 'De acuerdo'));
  });

  it('muestra las reacciones con las propias marcadas y alterna al pulsarlas', async () => {
    const { reaccionar } = renderThread();
    const boton = await screen.findByRole('button', { name: /👍 2 reacciones, incluyes la tuya/ });
    expect(boton).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(boton);
    await waitFor(() => expect(reaccionar).toHaveBeenCalledWith(1, '👍'));
  });

  it('sin responder ni reaccionar (comentarios de proyecto) no hay botón Responder ni reacciones', async () => {
    renderThread({ responder: undefined, reaccionar: undefined });
    await screen.findByText('Comentario raíz');
    expect(screen.queryByRole('button', { name: /^Responder a/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reaccionar al mensaje' })).not.toBeInTheDocument();
  });
});

describe('TaskResponsablesField (MEJ-109)', () => {
  const miembros = [
    { ...angel, correo: 'a@uvg', idRolProyecto: 1 },
    { ...maria, correo: 'm@uvg', idRolProyecto: 1 },
    { ...carlos, correo: 'c@uvg', idRolProyecto: 1 },
    { ...diana, correo: 'd@uvg', idRolProyecto: 2 },
  ];

  function Harness({ value, onChange, rol = '1', principal = '1' }: { value: number[]; onChange: (ids: number[]) => void; rol?: string; principal?: string }) {
    const form = useForm({ defaultValues: { idRolProyecto: rol, idUsuarioAsignado: principal } });
    return (
      <FormProvider {...form}>
        <TaskResponsablesField members={miembros} value={value} onChange={onChange} />
      </FormProvider>
    );
  }

  afterEach(cleanup);

  it('ofrece a quienes cumplen el rol, sin el responsable principal', () => {
    render(<Harness value={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar responsables adicionales' }));
    const opciones = screen.getAllByRole('option').map((o) => o.textContent);
    expect(opciones).toEqual(['CMCarlos Mendoza', 'MLMaria Lopez']);
  });

  it('elegir una opción la agrega y quitar un chip la retira', () => {
    const onChange = vi.fn();
    const { unmount } = render(<Harness value={[2]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar responsables adicionales' }));
    fireEvent.click(screen.getByRole('option', { name: /Carlos Mendoza/ }));
    expect(onChange).toHaveBeenLastCalledWith([2, 3]);
    unmount();

    render(<Harness value={[2, 3]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar a Maria Lopez de los responsables' }));
    expect(onChange).toHaveBeenLastCalledWith([3]);
  });

  it('descarta de la vista a quien ya no cumple el rol elegido', () => {
    render(<Harness value={[2, 4]} onChange={vi.fn()} rol="2" principal="sin-asignar" />);
    expect(screen.queryByRole('button', { name: /Quitar a Maria Lopez/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar a Diana Rivas de los responsables' })).toBeInTheDocument();
  });
});
