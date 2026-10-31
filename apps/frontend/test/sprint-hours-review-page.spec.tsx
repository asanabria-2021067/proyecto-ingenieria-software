import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SprintClosingSummaryDto } from '../lib/types/sprints';

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const replace = vi.fn();
const push = vi.fn();
const searchParamsMock = vi.hoisted(() => vi.fn(() => new URLSearchParams()));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42', sprintId: '1' }),
  useRouter: () => ({ replace, push }),
  useSearchParams: () => searchParamsMock(),
}));
vi.mock('../hooks/use-project-sprints', () => ({
  useSprintClosingSummary: vi.fn(),
  useProjectSprints: vi.fn(),
  useCloseSprint: vi.fn(),
  useSprintDetail: vi.fn(),
}));
vi.mock('../hooks/use-hour-adjustments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/use-hour-adjustments')>();
  return { ...actual, useHourAdjustments: vi.fn() };
});
vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));

import SprintHoursReviewPage from '../app/dashboard/proyectos/[id]/sprints/[sprintId]/finalizar/revision/page';
import { useCloseSprint, useProjectSprints, useSprintClosingSummary } from '../hooks/use-project-sprints';
import { useHourAdjustments } from '../hooks/use-hour-adjustments';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useCurrentUser } from '../hooks/use-current-user';

function mutationStub(overrides: Record<string, unknown> = {}) {
  return { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue([]), isPending: false, isError: false, error: null, reset: vi.fn(), ...overrides };
}

function tramo(overrides: Partial<any> = {}) {
  return {
    idAsignacion: 300,
    idTarea: 12,
    tituloTarea: 'Integración',
    tareaEliminada: false,
    idParticipacion: 51,
    abierto: false,
    origen: 'GRANULAR',
    reportadas: '11.00',
    estimacionTarea: null,
    exceso: '0.00',
    justificacionExceso: null,
    ajuste: null,
    justificacionAjuste: null,
    propuestas: '11.00',
    reconocidoEn: null,
    ...overrides,
  };
}

function participante(overrides: Partial<any> = {}) {
  return {
    idUsuario: 1,
    nombre: 'Andrea',
    apellido: 'Pérez',
    correo: 'andrea@uvg.edu.gt',
    fotoUrl: null,
    roles: [{ idRolProyecto: 1, nombreRol: 'Backend Developer' }],
    participaciones: [{ idParticipacion: 51, idRolProyecto: 1, nombreRol: 'Backend Developer' }],
    totales: {
      tareasDistintas: 1,
      estimacionAsociada: 10,
      reportadas: '11.00',
      legacy: '0.00',
      exceso: '1.00',
      propuestas: '11.00',
      filasPendientes: 1,
      filasConsumidas: 0,
      tramos: [tramo()],
    },
    ...overrides,
  };
}

const LUIS = participante({
  idUsuario: 2,
  nombre: 'Luis',
  apellido: 'Gómez',
  roles: [{ idRolProyecto: 2, nombreRol: 'Logística' }],
  participaciones: [{ idParticipacion: 52, idRolProyecto: 2, nombreRol: 'Logística' }],
  totales: {
    tareasDistintas: 2,
    estimacionAsociada: null,
    reportadas: '6.50',
    legacy: '0.00',
    exceso: '0.00',
    propuestas: '5.00',
    filasPendientes: 3,
    filasConsumidas: 0,
    tramos: [
      tramo({ idAsignacion: 401, idTarea: 20, tituloTarea: 'Inventario', idParticipacion: 52, reportadas: '2.00', propuestas: '2.00' }),
      tramo({ idAsignacion: 402, idTarea: 20, tituloTarea: 'Inventario', idParticipacion: 52, reportadas: '1.50', propuestas: '1.50' }),
      tramo({ idAsignacion: 403, idTarea: 21, tituloTarea: 'Rutas', idParticipacion: 52, reportadas: '3.00', ajuste: '-1.50', propuestas: '1.50', justificacionAjuste: 'Duplicado' }),
    ],
  },
});

function summary(overrides: Partial<SprintClosingSummaryDto> = {}): SprintClosingSummaryDto {
  return { idProyecto: 42, idSprint: 1, estadoSprint: 'EN_FINALIZACION', blockers: [], participantes: [participante(), LUIS], ...overrides } as SprintClosingSummaryDto;
}

const refetch = vi.fn();
function mockSummary(overrides: Record<string, unknown> = {}) {
  (useSprintClosingSummary as any).mockReturnValue({ summary: summary(), isLoading: false, isError: false, error: null, refetch, ...overrides });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
  return render(createElement(SprintHoursReviewPage), { wrapper });
}

let ajustes: { upsert: ReturnType<typeof mutationStub>; revert: ReturnType<typeof mutationStub>; history: ReturnType<typeof mutationStub> };

beforeEach(() => {
  searchParamsMock.mockReturnValue(new URLSearchParams());
  (useProjectDetail as any).mockReturnValue({ data: { idProyecto: 42, creador: { idUsuario: 1 } }, isLoading: false });
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 }, isLoading: false });
  (useProjectSprints as any).mockReturnValue({ sprints: [{ idSprint: 1, idProyecto: 42, numero: 4, estado: 'EN_FINALIZACION' }], isLoading: false });
  ajustes = { upsert: mutationStub(), revert: mutationStub(), history: mutationStub() };
  (useHourAdjustments as any).mockReturnValue(ajustes);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const detalle = () => screen.getByRole('region', { name: /Andrea Pérez|Luis Gómez/ });

describe('Revisión de horas — navegación y contexto', () => {
  it('muestra el título, el estado y «Volver a finalizar Sprint» hacia la pantalla de cierre', () => {
    mockSummary();
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Revisión de horas · Sprint 4' })).toBeInTheDocument();
    expect(screen.getByText('En finalización')).toBeInTheDocument();
    for (const enlace of screen.getAllByRole('link', { name: 'Volver a finalizar Sprint' })) {
      expect(enlace).toHaveAttribute('href', '/dashboard/proyectos/42/sprints/1/finalizar');
    }
    expect(useSprintClosingSummary).toHaveBeenCalledWith(42, 1);
    expect(useHourAdjustments).toHaveBeenCalledWith(42, 1);
  });

  it('nunca confirma el cierre: no monta la mutación de cierre ni ofrece el botón', () => {
    mockSummary();
    renderPage();

    expect(screen.queryByRole('button', { name: /confirmar cierre/i })).not.toBeInTheDocument();
    expect(useCloseSprint).not.toHaveBeenCalled();
  });

  it('sin `?integrante=` elige al primero; con él (recarga o enlace directo) elige al indicado', () => {
    mockSummary();
    const { unmount } = renderPage();
    expect(screen.getByRole('heading', { level: 2, name: 'Andrea Pérez' })).toBeInTheDocument();
    unmount();

    searchParamsMock.mockReturnValue(new URLSearchParams('integrante=2'));
    renderPage();
    expect(screen.getByRole('heading', { level: 2, name: 'Luis Gómez' })).toBeInTheDocument();
    const lista = screen.getByRole('navigation', { name: 'Integrantes del Sprint' });
    expect(within(lista).getByRole('button', { name: /Luis Gómez/ })).toHaveAttribute('aria-current', 'true');
    expect(within(lista).getByRole('button', { name: /Andrea Pérez/ })).not.toHaveAttribute('aria-current');
  });

  it('un integrante desconocido en la URL cae en el primero', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('integrante=999'));
    mockSummary();
    renderPage();
    expect(screen.getByRole('heading', { level: 2, name: 'Andrea Pérez' })).toBeInTheDocument();
  });

  it('cambiar de integrante actualiza la URL con replace y sin scroll, sin recargar', () => {
    mockSummary();
    renderPage();

    const lista = screen.getByRole('navigation', { name: 'Integrantes del Sprint' });
    fireEvent.click(within(lista).getByRole('button', { name: /Luis Gómez/ }));

    expect(replace).toHaveBeenCalledWith('/dashboard/proyectos/42/sprints/1/finalizar/revision?integrante=2', { scroll: false });
    expect(push).not.toHaveBeenCalled();
  });

  it('la lista muestra nombre, rol y horas propuestas; el selector compacto ofrece a los mismos integrantes', () => {
    mockSummary();
    renderPage();

    const lista = screen.getByRole('navigation', { name: 'Integrantes del Sprint' });
    const luis = within(lista).getByRole('button', { name: /Luis Gómez/ });
    expect(luis).toHaveTextContent('Logística');
    expect(luis).toHaveTextContent('5 h');
    expect(screen.getByRole('combobox', { name: 'Integrante' })).toHaveTextContent('Andrea Pérez');
  });
});

describe('Revisión de horas — detalle del integrante', () => {
  it('resume reportadas, propuestas, exceso y tareas distintas con los totales del backend', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('integrante=2'));
    mockSummary();
    renderPage();

    const region = detalle();
    const valor = (rotulo: string) => within(region).getByText(rotulo).closest('div') as HTMLElement;
    expect(valor('Horas reportadas')).toHaveTextContent('6.5 h');
    expect(valor('Horas propuestas')).toHaveTextContent('5 h');
    expect(valor('Exceso sobre estimación')).toHaveTextContent('0 h');
    expect(valor('Tareas distintas')).toHaveTextContent('2');
  });

  it('con varias tareas los acordeones empiezan cerrados y cada uno abre sus tramos', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('integrante=2'));
    mockSummary();
    renderPage();

    const inventario = screen.getByRole('button', { name: /Inventario/ });
    expect(inventario).toHaveTextContent('2 tramos');
    expect(inventario).toHaveTextContent('Logística');
    expect(inventario).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /^Ajustar/ })).not.toBeInTheDocument();

    fireEvent.click(inventario);
    expect(inventario).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('button', { name: /^Ajustar/ })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /Rutas/ }));
    expect(screen.getByRole('button', { name: /Editar ajuste — Tramo 1 · Rutas/ })).toBeInTheDocument();
    expect(screen.getByText('Duplicado')).toBeInTheDocument();
  });

  it('con una sola tarea se abre de entrada, en lectura y con «Ajustar»', () => {
    mockSummary();
    renderPage();

    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Ajustar/ })).toBeEnabled();
  });
});

describe('Revisión de horas — ajustes e historial (misma lógica que antes)', () => {
  it('«Ajustar» → «Guardar ajuste» envía el delta por la mutación existente', () => {
    mockSummary();
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /^Ajustar/ }));
    expect(screen.getByRole('spinbutton', { name: 'Horas aceptadas' })).toHaveValue(11);
    fireEvent.change(screen.getByLabelText('Horas aceptadas'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText(/Justificación del líder/), { target: { value: 'Se descontaron 2 horas' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar ajuste/ }));

    expect(ajustes.upsert.mutate).toHaveBeenCalledTimes(1);
    expect(ajustes.upsert.mutate.mock.calls[0][0]).toEqual({
      idAsignacion: 300,
      input: { deltaHoras: '-2.00', justificacion: 'Se descontaron 2 horas' },
    });
  });

  it('«Revertir» usa la mutación de reversión del tramo con ajuste vigente', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('integrante=2'));
    mockSummary();
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Rutas/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Revertir/ }));

    expect(ajustes.revert.mutate.mock.calls[0][0]).toEqual({ idAsignacion: 403 });
  });

  it('«Ver historial» carga la cadena bajo demanda', async () => {
    ajustes.history.mutateAsync = vi.fn().mockResolvedValue([
      { idAjusteHora: 1, deltaHoras: '-2.00', horasBase: '11.00', propuesta: '9.00', creadoEn: '2026-08-01T12:00:00.000Z', vigente: true, justificacion: 'Primer ajuste' },
    ]);
    mockSummary();
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Ver historial/ }));

    await waitFor(() => expect(ajustes.history.mutateAsync).toHaveBeenCalledWith({ idAsignacion: 300 }));
    expect(await screen.findByText('Vigente')).toBeInTheDocument();
    expect(screen.getByText('Primer ajuste')).toBeInTheDocument();
  });

  it('un 409 al guardar se muestra como aviso global y «Actualizar» vuelve a pedir el resumen', () => {
    ajustes.upsert.mutate = vi.fn((_vars, opciones) => {
      opciones.onError(Object.assign(new Error('Conflicto'), { statusCode: 409 }));
      opciones.onSettled();
    });
    mockSummary();
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /^Ajustar/ }));
    fireEvent.change(screen.getByLabelText('Horas aceptadas'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText(/Justificación del líder/), { target: { value: 'Motivo' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar ajuste/ }));

    expect(screen.getByRole('alert')).toHaveTextContent(/El resumen cambió mientras trabajabas/);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un Sprint cerrado es de solo lectura: «Ajustar» queda deshabilitado', () => {
    mockSummary({ summary: summary({ estadoSprint: 'CERRADO' }) });
    renderPage();

    expect(screen.getByRole('button', { name: /^Ajustar/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Revertir/ })).not.toBeInTheDocument();
  });
});

describe('Revisión de horas — estados y autorización', () => {
  it('mientras carga: skeleton, sin integrantes', () => {
    mockSummary({ summary: undefined, isLoading: true });
    const { container } = renderPage();
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByRole('navigation', { name: 'Integrantes del Sprint' })).not.toBeInTheDocument();
  });

  it('error: role=alert y «Reintentar» llama a refetch', () => {
    mockSummary({ summary: undefined, isError: true, error: new Error('fallo') });
    renderPage();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('sin contribuciones: vacío en tarjeta con vuelta a la pantalla de cierre', () => {
    mockSummary({ summary: summary({ participantes: [] }) });
    renderPage();
    expect(screen.getByText('Este Sprint no tiene contribuciones registradas.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Integrantes del Sprint' })).not.toBeInTheDocument();
  });

  it('un no-líder ve el aviso en vez de la revisión', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 99 }, isLoading: false });
    mockSummary();
    renderPage();
    expect(screen.getByText('¡No eres líder!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Ajustar/ })).not.toBeInTheDocument();
  });
});
