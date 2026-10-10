import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';
import type { ActividadDetalle, ActividadResumen, AsistenciaPublica } from '../lib/types/attendance';

// HU-177 (T-298): pantalla de asistencia. Los hooks de asistencia son los
// reales (TanStack Query); solo se simula el servicio HTTP, con un estado de
// "servidor" en memoria para comprobar que la UI refleja lo que el backend
// confirma y nada más.

vi.mock('next/navigation', () => ({ useParams: () => ({ id: '42' }) }));
vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../hooks/use-project-members', () => ({ useProjectMembers: vi.fn() }));
vi.mock('../lib/services/attendance', () => ({
  getProjectActividades: vi.fn(),
  getActividadDetalle: vi.fn(),
  marcarAsistencia: vi.fn(),
}));

const avisoMock = vi.hoisted(() => ({ exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() }));
vi.mock('@/lib/mensajes', () => ({ aviso: avisoMock }));

import AsistenciaPage from '../app/dashboard/proyectos/[id]/asistencia/page';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useCurrentUser } from '../hooks/use-current-user';
import { useProjectMembers } from '../hooks/use-project-members';
import { getActividadDetalle, getProjectActividades, marcarAsistencia } from '../lib/services/attendance';

const LIDER = 1;
const INTEGRANTE = 2;

function proyecto(estadoProyecto = 'EN_PROGRESO') {
  return {
    idProyecto: 42,
    estadoProyecto,
    creador: { idUsuario: LIDER, nombre: 'Ana', apellido: 'Lopez', correo: 'ana@uvg.edu.gt' },
  } as unknown as ProyectoDetalleDTO;
}

const reunion: ActividadResumen = {
  idActividad: 7,
  idProyecto: 42,
  tituloActividad: 'Reunión de planificación',
  tipoActividad: 'REUNION',
  fechaActividad: '2026-10-01',
  horasValor: 2,
  creadoPor: LIDER,
  creadoEn: '2026-10-01T12:00:00.000Z',
  totalIntegrantes: 3,
  totalAsistieron: 1,
};

const taller: ActividadResumen = {
  ...reunion,
  idActividad: 8,
  tituloActividad: 'Taller de pruebas',
  tipoActividad: 'TALLER',
  fechaActividad: '2026-10-05',
  horasValor: 1.5,
  totalAsistieron: 0,
};

let servidor: ActividadDetalle;

function detalleInicial(): ActividadDetalle {
  const { totalIntegrantes: _t, totalAsistieron: _a, ...base } = reunion;
  return {
    ...base,
    integrantes: [
      { idUsuario: LIDER, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null, asistio: true, confirmadoEn: '2026-10-01T15:00:00.000Z' },
      { idUsuario: INTEGRANTE, nombre: 'Bruno', apellido: 'Díaz', fotoUrl: null, asistio: false, confirmadoEn: null },
      { idUsuario: 3, nombre: 'Carla', apellido: 'Mejía', fotoUrl: null, asistio: false, confirmadoEn: '2026-10-01T15:00:00.000Z' },
    ],
  };
}

/** El PATCH simulado persiste en `servidor`, igual que el backend real. */
function marcarEnServidor(idUsuario: number, asistio: boolean): AsistenciaPublica {
  const confirmadoEn = '2026-10-09T10:00:00.000Z';
  servidor = {
    ...servidor,
    integrantes: servidor.integrantes.map((i) => (i.idUsuario === idUsuario ? { ...i, asistio, confirmadoEn } : i)),
  };
  return {
    idAsistencia: 99,
    idActividad: servidor.idActividad,
    idUsuario,
    asistio,
    confirmadoPor: LIDER,
    confirmadoEn,
    idRegistroHoras: asistio ? 500 : null,
  };
}

function mockActor({ idUsuario = LIDER, estado = 'EN_PROGRESO', miembros = [LIDER, INTEGRANTE, 3] } = {}) {
  (useProjectDetail as any).mockReturnValue({ data: proyecto(estado), isLoading: false });
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario }, isLoading: false });
  (useProjectMembers as any).mockReturnValue({
    members: miembros.map((id) => ({ idUsuario: id, nombre: `N${id}`, apellido: `A${id}` })),
    isLoading: false,
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(createElement(AsistenciaPage), { wrapper });
}

async function abrirReunion() {
  fireEvent.click(await screen.findByRole('button', { name: /Reunión de planificación/ }));
  return screen.findByRole('list', { name: 'Asistencia por integrante' });
}

function fila(lista: HTMLElement, nombre: string): HTMLElement {
  return within(lista).getByText(nombre).closest('li') as HTMLElement;
}

beforeEach(() => {
  servidor = detalleInicial();
  (getProjectActividades as any).mockResolvedValue([taller, reunion]);
  (getActividadDetalle as any).mockImplementation(async () => servidor);
  (marcarAsistencia as any).mockImplementation(async (_p: number, _a: number, idUsuario: number, asistio: boolean) =>
    marcarEnServidor(idUsuario, asistio),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AsistenciaPage — consulta', () => {
  it('muestra el encabezado «Asistencia» y las actividades del proyecto con sus datos reales', async () => {
    mockActor();
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Asistencia' })).toBeInTheDocument();
    const reunionItem = await screen.findByRole('button', { name: /Reunión de planificación/ });
    expect(reunionItem).toHaveTextContent('Reunión');
    expect(reunionItem).toHaveTextContent('2 h');
    expect(reunionItem).toHaveTextContent('1 de 3 asistieron');
    expect(screen.getByRole('button', { name: /Taller de pruebas/ })).toHaveTextContent('1.5 h');
    expect(getProjectActividades).toHaveBeenCalledWith(42);
  });

  it('sin actividades muestra el estado vacío', async () => {
    mockActor();
    (getProjectActividades as any).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('Todavía no hay actividades registradas.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Asistencia por integrante' })).not.toBeInTheDocument();
  });

  it('mientras carga muestra el esqueleto y no la lista vacía', () => {
    mockActor();
    (getProjectActividades as any).mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByText('Todavía no hay actividades registradas.')).not.toBeInTheDocument();
  });

  it('si la consulta falla muestra el error y permite reintentar', async () => {
    mockActor();
    (getProjectActividades as any).mockRejectedValueOnce(Object.assign(new Error('boom'), { statusCode: 500 }));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible cargar las actividades del proyecto.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: /Reunión de planificación/ })).toBeInTheDocument();
  });

  it('pide elegir una actividad y, al hacerlo, muestra a los integrantes con sus tres estados', async () => {
    mockActor();
    renderPage();

    expect(await screen.findByText('Selecciona una actividad')).toBeInTheDocument();
    const lista = await abrirReunion();

    expect(getActividadDetalle).toHaveBeenCalledWith(42, 7);
    expect(screen.getByRole('button', { name: /Reunión de planificación/ })).toHaveAttribute('aria-pressed', 'true');
    expect(fila(lista, 'Ana Lopez')).toHaveTextContent('Asistió');
    expect(fila(lista, 'Bruno Díaz')).toHaveTextContent('Sin registrar');
    expect(fila(lista, 'Carla Mejía')).toHaveTextContent('No asistió');
  });

  it('si falla el detalle de la actividad muestra el error dentro del panel', async () => {
    mockActor();
    (getActividadDetalle as any).mockRejectedValueOnce(Object.assign(new Error('boom'), { statusCode: 500 }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Reunión de planificación/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible cargar la asistencia de esta actividad.');
  });
});

describe('AsistenciaPage — líder', () => {
  it('marca la asistencia y la UI refleja el resultado confirmado por el servidor', async () => {
    mockActor();
    renderPage();
    const lista = await abrirReunion();

    const checkbox = within(lista).getByRole('checkbox', { name: 'Asistencia de Bruno Díaz' });
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(checkbox);

    await waitFor(() => expect(checkbox).toHaveAttribute('aria-checked', 'true'));
    expect(marcarAsistencia).toHaveBeenCalledWith(42, 7, INTEGRANTE, true);
    expect(fila(lista, 'Bruno Díaz')).toHaveTextContent('Asistió');
    expect(avisoMock.exito).toHaveBeenCalledWith('Asistencia registrada', expect.stringContaining('Bruno Díaz'));
  });

  it('puede quitar una asistencia confirmada', async () => {
    mockActor();
    renderPage();
    const lista = await abrirReunion();

    const checkbox = within(lista).getByRole('checkbox', { name: 'Asistencia de Ana Lopez' });
    fireEvent.click(checkbox);

    await waitFor(() => expect(checkbox).toHaveAttribute('aria-checked', 'false'));
    expect(marcarAsistencia).toHaveBeenCalledWith(42, 7, LIDER, false);
    expect(fila(lista, 'Ana Lopez')).toHaveTextContent('No asistió');
    expect(avisoMock.exito).toHaveBeenCalledWith('Asistencia retirada', expect.any(String));
  });

  it('mientras guarda bloquea el control: un doble clic no envía dos PATCH ni cambia el valor antes de confirmar', async () => {
    mockActor();
    let resolver!: (valor: AsistenciaPublica) => void;
    (marcarAsistencia as any).mockImplementationOnce(
      (_p: number, _a: number, idUsuario: number, asistio: boolean) =>
        new Promise<AsistenciaPublica>((resolve) => {
          resolver = () => resolve(marcarEnServidor(idUsuario, asistio));
        }),
    );
    renderPage();
    const lista = await abrirReunion();

    const checkbox = within(lista).getByRole('checkbox', { name: 'Asistencia de Bruno Díaz' });
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);

    expect(checkbox).toBeDisabled();
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    expect(within(fila(lista, 'Bruno Díaz')).getByLabelText('Guardando asistencia')).toBeInTheDocument();
    await waitFor(() => expect(marcarAsistencia).toHaveBeenCalledTimes(1));

    await act(async () => resolver({} as AsistenciaPublica));
    await waitFor(() => expect(checkbox).toHaveAttribute('aria-checked', 'true'));
    expect(checkbox).not.toBeDisabled();
    expect(marcarAsistencia).toHaveBeenCalledTimes(1);
  });

  it('si el backend rechaza el guardado avisa con el mensaje común y conserva el último valor confirmado', async () => {
    mockActor();
    (marcarAsistencia as any).mockRejectedValueOnce(
      Object.assign(new Error('El integrante no tiene una participación activa en el proyecto de esta actividad'), {
        statusCode: 400,
      }),
    );
    renderPage();
    const lista = await abrirReunion();

    const checkbox = within(lista).getByRole('checkbox', { name: 'Asistencia de Bruno Díaz' });
    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(avisoMock.error).toHaveBeenCalledWith(
        'No se pudo guardar la asistencia',
        'El integrante no tiene una participación activa en el proyecto de esta actividad',
      ),
    );
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    expect(checkbox).not.toBeDisabled();
    expect(fila(lista, 'Bruno Díaz')).toHaveTextContent('Sin registrar');
    expect(avisoMock.exito).not.toHaveBeenCalled();
  });

  it('un 403 muestra el mensaje común de permisos', async () => {
    mockActor();
    (marcarAsistencia as any).mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { statusCode: 403 }));
    renderPage();
    const lista = await abrirReunion();

    fireEvent.click(within(lista).getByRole('checkbox', { name: 'Asistencia de Bruno Díaz' }));

    await waitFor(() =>
      expect(avisoMock.error).toHaveBeenCalledWith(
        'No se pudo guardar la asistencia',
        expect.stringContaining('No tienes permisos para realizar esta acción'),
      ),
    );
  });

  it.each(['CERRADO', 'EN_SOLICITUD_CIERRE'])('con el proyecto %s el líder solo consulta', async (estado) => {
    mockActor({ estado });
    renderPage();
    const lista = await abrirReunion();

    expect(within(lista).queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByText('En el estado actual del proyecto la asistencia ya no puede modificarse.')).toBeInTheDocument();
  });
});

describe('AsistenciaPage — integrante y ajenos', () => {
  it('el integrante consulta la asistencia sin ningún control para modificarla', async () => {
    mockActor({ idUsuario: INTEGRANTE });
    renderPage();
    const lista = await abrirReunion();

    expect(within(lista).queryAllByRole('checkbox')).toHaveLength(0);
    expect(fila(lista, 'Bruno Díaz')).toHaveTextContent('(Tú)');
    expect(fila(lista, 'Bruno Díaz')).toHaveTextContent('Sin registrar');
    expect(fila(lista, 'Ana Lopez')).toHaveTextContent('Asistió');
    expect(screen.getByText(/modo solo lectura/)).toBeInTheDocument();
    expect(marcarAsistencia).not.toHaveBeenCalled();
  });

  it('mientras el usuario o el proyecto cargan no ofrece controles editables', async () => {
    (useProjectDetail as any).mockReturnValue({ data: undefined, isLoading: true });
    (useCurrentUser as any).mockReturnValue({ data: undefined, isLoading: true });
    (useProjectMembers as any).mockReturnValue({ members: [], isLoading: true });
    renderPage();

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByText('No tienes acceso')).not.toBeInTheDocument();
    expect(getProjectActividades).not.toHaveBeenCalled();
  });

  it('un usuario ajeno al proyecto ve el aviso de acceso y no se consultan las actividades', () => {
    mockActor({ idUsuario: 999 });
    renderPage();

    expect(screen.getByText('No tienes acceso')).toBeInTheDocument();
    expect(getProjectActividades).not.toHaveBeenCalled();
  });
});
