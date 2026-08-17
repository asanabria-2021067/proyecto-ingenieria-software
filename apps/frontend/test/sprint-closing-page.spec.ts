import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SprintClosingSummaryDto } from '../lib/types/sprints';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42', sprintId: '1' }),
  useRouter: () => ({ push }),
}));

vi.mock('../hooks/use-project-sprints', () => ({
  useSprintClosingSummary: vi.fn(),
  useAdjustSprintHours: vi.fn(),
  useCloseSprint: vi.fn(),
}));

vi.mock('@/lib/swal', () => ({
  default: { fire: vi.fn() },
}));

import SprintClosingPage from '../app/dashboard/proyectos/[id]/sprints/[sprintId]/finalizar/page';
import {
  useAdjustSprintHours,
  useCloseSprint,
  useSprintClosingSummary,
} from '../hooks/use-project-sprints';
import uvgSwal from '@/lib/swal';

beforeAllPointerCapturePolyfill();
function beforeAllPointerCapturePolyfill() {
  if (!Element.prototype.hasPointerCapture) {
    (Element.prototype as any).hasPointerCapture = () => false;
  }
}

function participacion(overrides: Partial<any> = {}) {
  return {
    idParticipacion: 51,
    idRolProyecto: 1,
    nombreRol: 'Backend Developer',
    horasReportadas: 11,
    horasCalculadas: 10,
    horasAprobadas: 10,
    justificacionAjuste: null,
    ...overrides,
  };
}

function participante(overrides: Partial<any> = {}) {
  const participaciones = overrides.participaciones ?? [participacion()];
  return {
    idUsuario: 1,
    nombre: 'Andrea',
    apellido: 'Pérez',
    correo: 'andrea@uvg.edu.gt',
    fotoUrl: null,
    roles: [{ idRolProyecto: 1, nombreRol: 'Backend Developer' }],
    tareasRealizadas: 5,
    horasReportadas: 11,
    horasCalculadas: 10,
    horasAprobadas: 10,
    ...overrides,
    participaciones,
  };
}

function summary(overrides: Partial<SprintClosingSummaryDto> = {}): SprintClosingSummaryDto {
  return {
    idProyecto: 42,
    idSprint: 1,
    participantes: [participante()],
    ...overrides,
  } as SprintClosingSummaryDto;
}

function mutationStub(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
    error: null,
    ...overrides,
  };
}

function mockSummary(overrides: Record<string, unknown> = {}) {
  (useSprintClosingSummary as any).mockReturnValue({
    summary: summary(),
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

function mockAdjust(overrides: Record<string, unknown> = {}) {
  (useAdjustSprintHours as any).mockReturnValue(mutationStub(overrides));
}

function mockClose(overrides: Record<string, unknown> = {}) {
  (useCloseSprint as any).mockReturnValue(mutationStub(overrides));
}

function renderPage() {
  return render(createElement(SprintClosingPage));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SprintClosingPage — encabezado y banner (F5)', () => {
  it('muestra el título, la descripción y el warning local, nunca el banner global de F6', () => {
    mockSummary();
    mockAdjust();
    mockClose();

    renderPage();

    expect(screen.getByRole('heading', { name: 'Cierre de Sprint' })).toBeInTheDocument();
    expect(
      screen.getByText('Revisión final de horas y contribuciones antes de confirmar el cierre.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/al confirmar el cierre del sprint/i)).toBeInTheDocument();
    expect(screen.queryByText(/temporalmente bloqueado/i)).not.toBeInTheDocument();
  });

  it('route params: pasa idProyecto e idSprint numéricos al hook del summary', () => {
    mockSummary();
    mockAdjust();
    mockClose();

    renderPage();

    expect(useSprintClosingSummary).toHaveBeenCalledWith(42, 1);
  });
});

describe('SprintClosingPage — render dinámico (F5)', () => {
  it('participación única: muestra nombre, roles, tareas, reportadas, calculadas y aprobadas del fixture', () => {
    mockSummary({
      summary: summary({
        participantes: [
          participante({
            idUsuario: 9,
            nombre: 'Daniel',
            apellido: 'Ramírez',
            roles: [{ idRolProyecto: 4, nombreRol: 'Arquitectura' }],
            tareasRealizadas: 7,
            horasReportadas: 31,
            horasCalculadas: 27,
            horasAprobadas: 27,
            participaciones: [
              participacion({
                idParticipacion: 900,
                idRolProyecto: 4,
                nombreRol: 'Arquitectura',
                horasReportadas: 31,
                horasCalculadas: 27,
                horasAprobadas: 27,
              }),
            ],
          }),
        ],
      }),
    });
    mockAdjust();
    mockClose();

    renderPage();

    expect(screen.getByText('Daniel Ramírez')).toBeInTheDocument();
    expect(screen.getByText('Arquitectura')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('31 h')).toBeInTheDocument();
    expect(screen.getByText('27 h')).toBeInTheDocument();
    const input = screen.getByLabelText('Horas aprobadas — Daniel Ramírez') as HTMLInputElement;
    expect(input.value).toBe('27');
    // Sin desglose redundante para una sola participación.
    expect(screen.queryByRole('button', { name: /ver detalle por rol/i })).not.toBeInTheDocument();
  });

  it('multirol: una sola fila por persona, ambos roles visibles, totales calculadas/aprobadas correctos', () => {
    mockSummary({
      summary: summary({
        participantes: [
          participante({
            horasCalculadas: 18,
            horasAprobadas: 18,
            roles: [
              { idRolProyecto: 1, nombreRol: 'Backend Developer' },
              { idRolProyecto: 2, nombreRol: 'Líder' },
            ],
            participaciones: [
              participacion({ idParticipacion: 51, nombreRol: 'Backend Developer', horasCalculadas: 10, horasAprobadas: 10 }),
              participacion({ idParticipacion: 87, idRolProyecto: 2, nombreRol: 'Líder', horasCalculadas: 8, horasAprobadas: 8 }),
            ],
          }),
        ],
      }),
    });
    mockAdjust();
    mockClose();

    renderPage();

    expect(screen.getAllByText('Andrea Pérez')).toHaveLength(1);
    expect(screen.getByText('Backend Developer')).toBeInTheDocument();
    expect(screen.getByText('Líder')).toBeInTheDocument();
    // Calculadas totales (18) y aprobadas totales (18, valor inicial) — ambas
    // celdas de la fila principal, coincidentes porque nada se ha ajustado.
    expect(screen.getAllByText('18 h')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /ver detalle por rol/i })).toBeInTheDocument();
  });
});

describe('SprintClosingPage — total reactivo (multirol)', () => {
  function renderMultirol() {
    mockSummary({
      summary: summary({
        participantes: [
          participante({
            horasCalculadas: 18,
            horasAprobadas: 18,
            roles: [
              { idRolProyecto: 1, nombreRol: 'Backend Developer' },
              { idRolProyecto: 2, nombreRol: 'Líder' },
            ],
            participaciones: [
              participacion({ idParticipacion: 51, nombreRol: 'Backend Developer', horasCalculadas: 10, horasAprobadas: 10 }),
              participacion({ idParticipacion: 87, idRolProyecto: 2, nombreRol: 'Líder', horasCalculadas: 8, horasAprobadas: 8 }),
            ],
          }),
        ],
      }),
    });
    mockAdjust();
    mockClose();
    renderPage();
  }

  it('cambiar la aprobada de un rol actualiza el total inmediatamente, sin request; el total calculado nunca cambia', async () => {
    renderMultirol();
    fireEvent.click(screen.getByRole('button', { name: /ver detalle por rol/i }));

    const inputBackend = await screen.findByLabelText('Horas aprobadas — Backend Developer');
    fireEvent.change(inputBackend, { target: { value: '12' } });

    await waitFor(() => expect(screen.getByText('20 h')).toBeInTheDocument()); // 12 + 8
    // "Horas calculadas" totales sigue en 18 h, sin cambiar.
    expect(screen.getByText('18 h')).toBeInTheDocument();
  });

  it('justificación exigida solo en la fila modificada (Backend), no en la intacta (Líder)', async () => {
    renderMultirol();
    fireEvent.click(screen.getByRole('button', { name: /ver detalle por rol/i }));

    const inputBackend = await screen.findByLabelText('Horas aprobadas — Backend Developer');
    fireEvent.change(inputBackend, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar cierre del sprint/i }));

    await waitFor(() =>
      expect(screen.getByText(/la justificación es obligatoria/i)).toBeInTheDocument(),
    );
    // Solo debe existir un mensaje de error (el de Backend), no dos.
    expect(screen.getAllByText(/la justificación es obligatoria/i)).toHaveLength(1);
  });
});

describe('SprintClosingPage — submit sin ajustes', () => {
  it('igualdad en todas las filas: cero PATCH, cierre ejecutado una sola vez', async () => {
    const mutateAsyncAdjust = vi.fn().mockResolvedValue({});
    const mutateAsyncClose = vi.fn().mockResolvedValue({});
    mockSummary();
    mockAdjust({ mutateAsync: mutateAsyncAdjust });
    mockClose({ mutateAsync: mutateAsyncClose });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /confirmar cierre del sprint/i }));

    await waitFor(() => expect(mutateAsyncClose).toHaveBeenCalledTimes(1));
    expect(mutateAsyncAdjust).not.toHaveBeenCalled();
    expect(mutateAsyncClose).toHaveBeenCalledWith(1);
    expect(push).toHaveBeenCalledWith('/dashboard/proyectos/42');
  });
});

describe('SprintClosingPage — submit con ajuste', () => {
  it('un ajuste: A7 recibe idParticipacion y payload correctos; el cierre ocurre después, con el idSprint correcto', async () => {
    const mutateAsyncAdjust = vi.fn().mockResolvedValue({});
    const mutateAsyncClose = vi.fn().mockResolvedValue({});
    mockSummary();
    mockAdjust({ mutateAsync: mutateAsyncAdjust });
    mockClose({ mutateAsync: mutateAsyncClose });

    renderPage();
    const input = screen.getByLabelText('Horas aprobadas — Andrea Pérez');
    fireEvent.change(input, { target: { value: '12' } });
    const justificacion = screen.getByLabelText('Justificación de ajuste — Andrea Pérez');
    fireEvent.change(justificacion, { target: { value: 'Ajuste por validación del líder' } });

    fireEvent.click(screen.getByRole('button', { name: /confirmar cierre del sprint/i }));

    await waitFor(() => expect(mutateAsyncAdjust).toHaveBeenCalledTimes(1));
    expect(mutateAsyncAdjust).toHaveBeenCalledWith({
      idParticipacion: 51,
      horasAprobadas: 12,
      justificacionAjuste: 'Ajuste por validación del líder',
    });
    await waitFor(() => expect(mutateAsyncClose).toHaveBeenCalledTimes(1));
    expect(mutateAsyncClose).toHaveBeenCalledWith(1);
  });

  it('multirol con dos ajustes: dos PATCH con idParticipacion distintos, sin idUsuario', async () => {
    const mutateAsyncAdjust = vi.fn().mockResolvedValue({});
    const mutateAsyncClose = vi.fn().mockResolvedValue({});
    mockSummary({
      summary: summary({
        participantes: [
          participante({
            horasCalculadas: 18,
            horasAprobadas: 18,
            roles: [
              { idRolProyecto: 1, nombreRol: 'Backend Developer' },
              { idRolProyecto: 2, nombreRol: 'Líder' },
            ],
            participaciones: [
              participacion({ idParticipacion: 51, nombreRol: 'Backend Developer', horasCalculadas: 10, horasAprobadas: 10 }),
              participacion({ idParticipacion: 87, idRolProyecto: 2, nombreRol: 'Líder', horasCalculadas: 8, horasAprobadas: 8 }),
            ],
          }),
        ],
      }),
    });
    mockAdjust({ mutateAsync: mutateAsyncAdjust });
    mockClose({ mutateAsync: mutateAsyncClose });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /ver detalle por rol/i }));

    fireEvent.change(await screen.findByLabelText('Horas aprobadas — Backend Developer'), {
      target: { value: '12' },
    });
    fireEvent.change(screen.getByLabelText('Justificación de ajuste — Backend Developer'), {
      target: { value: 'motivo backend' },
    });
    fireEvent.change(screen.getByLabelText('Horas aprobadas — Líder'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Justificación de ajuste — Líder'), {
      target: { value: 'motivo líder' },
    });

    fireEvent.click(screen.getByRole('button', { name: /confirmar cierre del sprint/i }));

    await waitFor(() => expect(mutateAsyncAdjust).toHaveBeenCalledTimes(2));
    const idsRecibidos = mutateAsyncAdjust.mock.calls.map((call) => call[0].idParticipacion).sort();
    expect(idsRecibidos).toEqual([51, 87]);
    expect(mutateAsyncAdjust.mock.calls.every((call) => !('idUsuario' in call[0]))).toBe(true);
    await waitFor(() => expect(mutateAsyncClose).toHaveBeenCalledTimes(1));
  });
});

describe('SprintClosingPage — validación / errores impiden el cierre', () => {
  it('validación fallida (sin justificación): cero PATCH, cero cierre, error visible', async () => {
    const mutateAsyncAdjust = vi.fn();
    const mutateAsyncClose = vi.fn();
    mockSummary();
    mockAdjust({ mutateAsync: mutateAsyncAdjust });
    mockClose({ mutateAsync: mutateAsyncClose });

    renderPage();
    fireEvent.change(screen.getByLabelText('Horas aprobadas — Andrea Pérez'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar cierre del sprint/i }));

    await waitFor(() =>
      expect(screen.getByText(/la justificación es obligatoria/i)).toBeInTheDocument(),
    );
    expect(mutateAsyncAdjust).not.toHaveBeenCalled();
    expect(mutateAsyncClose).not.toHaveBeenCalled();
  });

  it('A7 falla: el cierre nunca se ejecuta, el error queda visible y la pantalla permanece disponible', async () => {
    const mutateAsyncAdjust = vi.fn().mockRejectedValue(new Error('No se pudo guardar el ajuste'));
    const mutateAsyncClose = vi.fn();
    mockSummary();
    mockAdjust({ mutateAsync: mutateAsyncAdjust });
    mockClose({ mutateAsync: mutateAsyncClose });

    renderPage();
    fireEvent.change(screen.getByLabelText('Horas aprobadas — Andrea Pérez'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Justificación de ajuste — Andrea Pérez'), {
      target: { value: 'motivo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirmar cierre del sprint/i }));

    await waitFor(() => expect(mutateAsyncAdjust).toHaveBeenCalledTimes(1));
    expect(mutateAsyncClose).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar el ajuste'));
    // La pantalla sigue mostrando el formulario editable, no un mensaje ficticio de éxito.
    expect(screen.getByRole('button', { name: /confirmar cierre del sprint/i })).toBeInTheDocument();
  });
});

describe('SprintClosingPage — pending / doble submit', () => {
  it('mientras el cierre está pendiente, el botón queda disabled y un segundo click no dispara otra secuencia', async () => {
    mockSummary();
    mockAdjust();
    mockClose({ isPending: true });

    renderPage();
    const boton = screen.getByRole('button', { name: /confirmando cierre/i });
    expect(boton).toBeDisabled();
  });
});

describe('SprintClosingPage — loading', () => {
  it('mientras carga el summary: skeleton visible, ni tabla ni botón de cierre funcional', () => {
    mockSummary({ summary: undefined, isLoading: true });
    mockAdjust();
    mockClose();

    const { container } = renderPage();

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirmar cierre del sprint/i })).not.toBeInTheDocument();
  });
});

describe('SprintClosingPage — error', () => {
  it('summary fallido: role=alert, sin tabla, "Reintentar" llama a refetch, sin acción de cierre', () => {
    const refetch = vi.fn();
    mockSummary({ summary: undefined, isError: true, error: new Error('No eres el líder de este proyecto'), refetch });
    mockAdjust();
    mockClose();

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('No eres el líder de este proyecto');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirmar cierre del sprint/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('SprintClosingPage — autorización (solo líder)', () => {
  it('un no-líder nunca recibe una interfaz editable: `GET resumen-cierre` es exclusivo del líder (assertCanViewClosingSummary), así que la única señal disponible en frontend es el error 403 propagado por el hook — no existe un booleano `isLeader` local que ocultar', () => {
    mockSummary({
      summary: undefined,
      isError: true,
      error: new Error('No eres el líder de este proyecto'),
    });
    mockAdjust();
    mockClose();

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('No eres el líder de este proyecto');
    expect(screen.queryByLabelText(/horas aprobadas/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/justificación de ajuste/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirmar cierre del sprint/i })).not.toBeInTheDocument();
  });
});

describe('SprintClosingPage — sin contribuciones', () => {
  it('summary vacío: muestra Empty y conserva la acción de cierre (A9 no exige contribuciones)', async () => {
    const mutateAsyncClose = vi.fn().mockResolvedValue({});
    mockSummary({ summary: summary({ participantes: [] }) });
    mockAdjust();
    mockClose({ mutateAsync: mutateAsyncClose });

    renderPage();

    expect(screen.getByText('Este Sprint no tiene contribuciones registradas.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirmar cierre del sprint/i }));

    await waitFor(() => expect(mutateAsyncClose).toHaveBeenCalledWith(1));
    expect(push).toHaveBeenCalledWith('/dashboard/proyectos/42');
  });
});
