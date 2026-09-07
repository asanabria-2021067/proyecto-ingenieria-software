import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../lib/services/task-hours', () => ({
  getHorasTarea: vi.fn(),
  getTaskHoursSummary: vi.fn(),
  registrarHorasTarea: vi.fn(),
  updateTimeRecord: vi.fn(),
  revokeTimeRecord: vi.fn(),
}));

// Radix Tooltip mide su contenido con ResizeObserver, ausente en jsdom.
if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const swalFire = vi.hoisted(() => vi.fn());
vi.mock('../lib/swal', () => ({
  default: { fire: swalFire },
  swalCustomClass: {},
}));

import { TaskHoursSection } from '../components/hours/task-hours-section';
import { crossesEstimate } from '../hooks/use-task-hours';
import {
  getHorasTarea,
  getTaskHoursSummary,
  registrarHorasTarea,
  revokeTimeRecord,
  updateTimeRecord,
} from '../lib/services/task-hours';
import {
  projectTasksQueryKey,
  taskHoursQueryKey,
  taskHoursSummaryQueryKey,
} from '../lib/query-keys/tasks';
import type { RegistroTiempoTareaDTO, TaskHoursSummaryDTO } from '../lib/types/tasks';

const USUARIO = { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null };

function registro(overrides: Partial<RegistroTiempoTareaDTO> = {}): RegistroTiempoTareaDTO {
  return {
    idRegistroTiempo: 1,
    idAsignacion: 30,
    idUsuario: 5,
    horas: 4,
    fecha: '2026-08-20',
    nota: null,
    creadoEn: '2026-08-20T12:00:00.000Z',
    revocadoEn: null,
    usuario: USUARIO,
    ...overrides,
  };
}

function resumen(overrides: Partial<TaskHoursSummaryDTO> = {}): TaskHoursSummaryDTO {
  return {
    taskId: 55,
    sprintId: 9,
    estimacion: 10,
    horasReportadasTarea: '9.00',
    horasLegacyNoGranulares: '0.00',
    restantes: '1.00',
    sobreEstimacion: null,
    puedeCrear: true,
    puedeEditar: true,
    puedeRevocar: true,
    tramos: [],
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

function renderSection(props: Record<string, unknown> = {}) {
  const { wrapper, queryClient } = createWrapper();
  const utils = render(
    createElement(TaskHoursSection, {
      idProyecto: 7,
      idTarea: 55,
      idUsuarioActual: 5,
      enabled: true,
      ...props,
    }),
    { wrapper },
  );
  return { ...utils, queryClient };
}

async function esperarCarga() {
  await waitFor(() => expect(screen.getByLabelText('Horas')).toBeInTheDocument());
}

describe('crossesEstimate (06 v2 §10)', () => {
  it('solo cruza cuando antes ≤ estimación y después > estimación', () => {
    expect(crossesEstimate('9.00', 2, 10)).toBe(true);
    expect(crossesEstimate('10.00', 0.01, 10)).toBe(true);
    expect(crossesEstimate('13.00', 2, 10)).toBe(false); // ya estaba por encima
    expect(crossesEstimate('13.00', -1, 10)).toBe(false); // reducir nunca cruza
    expect(crossesEstimate('9.00', 1, 10)).toBe(false); // llega justo al umbral
    expect(crossesEstimate('9.00', 5, null)).toBe(false); // sin estimación no hay umbral
  });
});

describe('TaskHoursSection (VIEW-04 / F001)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('registra horas e invalida task-hours, task-hours-summary y project-tasks', async () => {
    (getHorasTarea as any).mockResolvedValue([]);
    (getTaskHoursSummary as any).mockResolvedValue(resumen({ horasReportadasTarea: '2.00', restantes: '8.00' }));
    (registrarHorasTarea as any).mockResolvedValue(registro());
    const { queryClient } = renderSection();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await esperarCarga();
    fireEvent.change(screen.getByLabelText('Horas'), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-08-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() =>
      expect(registrarHorasTarea).toHaveBeenCalledWith(7, 55, { horas: 2.5, fecha: '2026-08-20' }),
    );
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: taskHoursQueryKey(7, 55) });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: taskHoursSummaryQueryKey(7, 55) });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectTasksQueryKey(7) });
    });
  });

  it('exige justificación cuando la operación cruza la estimación y la envía como justificacionExceso', async () => {
    (getHorasTarea as any).mockResolvedValue([]);
    (getTaskHoursSummary as any).mockResolvedValue(resumen({ estimacion: 10, horasReportadasTarea: '9.00' }));
    (registrarHorasTarea as any).mockResolvedValue(registro());
    renderSection();

    await esperarCarga();
    expect(screen.queryByLabelText(/Justificación del exceso/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Horas'), { target: { value: '2' } });
    const justificacion = await screen.findByLabelText(/Justificación del exceso/);
    expect(justificacion).toBeRequired();
    expect(screen.getByRole('button', { name: 'Registrar' })).toBeDisabled();

    fireEvent.change(justificacion, { target: { value: 'Cambios de última hora' } });
    expect(screen.getByRole('button', { name: 'Registrar' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() =>
      expect(registrarHorasTarea).toHaveBeenCalledWith(
        7,
        55,
        expect.objectContaining({ horas: 2, justificacionExceso: 'Cambios de última hora' }),
      ),
    );
  });

  it('NO exige justificación al reducir horas aunque el total siga por encima de la estimación', async () => {
    (getHorasTarea as any).mockResolvedValue([registro({ horas: 4, nota: 'Ajustes' })]);
    (getTaskHoursSummary as any).mockResolvedValue(
      resumen({ estimacion: 10, horasReportadasTarea: '13.00', restantes: '-3.00', sobreEstimacion: '3.00' }),
    );
    (updateTimeRecord as any).mockResolvedValue(registro({ horas: 3 }));
    renderSection();

    await esperarCarga();
    fireEvent.click(await screen.findByRole('button', { name: /^Editar registro/ }));
    fireEvent.change(screen.getByLabelText('Horas'), { target: { value: '3' } });

    expect(screen.queryByLabelText(/Justificación del exceso/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(updateTimeRecord).toHaveBeenCalledWith(7, 55, 1, { horas: 3, fecha: '2026-08-20' }));
    const enviado = (updateTimeRecord as any).mock.calls[0][3];
    expect(enviado).not.toHaveProperty('justificacionExceso');
    expect(enviado).not.toHaveProperty('nota');
  });

  it('al editar, retirar la nota envía nota:null y una nota nueva viaja recortada', async () => {
    (getHorasTarea as any).mockResolvedValue([registro({ horas: 4, nota: 'Ajustes' })]);
    (getTaskHoursSummary as any).mockResolvedValue(resumen({ horasReportadasTarea: '4.00', restantes: '6.00' }));
    (updateTimeRecord as any).mockResolvedValue(registro());
    renderSection();

    await esperarCarga();
    fireEvent.click(await screen.findByRole('button', { name: /^Editar registro/ }));
    fireEvent.change(screen.getByLabelText('Nota'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(updateTimeRecord).toHaveBeenCalledWith(7, 55, 1, expect.objectContaining({ nota: null })),
    );
  });

  it('estimacion: null → Restantes muestra «—» y nunca «0 h»', async () => {
    (getHorasTarea as any).mockResolvedValue([]);
    (getTaskHoursSummary as any).mockResolvedValue(
      resumen({ estimacion: null, restantes: null, sobreEstimacion: null, horasReportadasTarea: '3.50' }),
    );
    renderSection();

    await esperarCarga();
    const restantes = screen.getByRole('group', { name: 'Restantes' });
    expect(within(restantes).getByText('—')).toBeInTheDocument();
    expect(within(restantes).queryByText(/0 h/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Estimación' })).getByText('—')).toBeInTheDocument();
    // Sin umbral tampoco hay exceso: «—», nunca «0 h».
    const sobre = screen.getByRole('group', { name: 'Horas sobreestimadas' });
    expect(within(sobre).getByText('—')).toBeInTheDocument();
    expect(within(sobre).queryByText(/0 h/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Reportadas' })).getByText('3.5 h')).toBeInTheDocument();

    // Sin estimación nunca se pide justificación.
    fireEvent.change(screen.getByLabelText('Horas'), { target: { value: '50' } });
    expect(screen.queryByLabelText(/Justificación del exceso/)).not.toBeInTheDocument();
  });

  it('puedeEditar:false deshabilita Editar con tooltip explicativo', async () => {
    (getHorasTarea as any).mockResolvedValue([registro()]);
    (getTaskHoursSummary as any).mockResolvedValue(resumen({ puedeEditar: false }));
    renderSection();

    await esperarCarga();
    const editar = await screen.findByRole('button', { name: 'Editar' });
    expect(editar).toBeDisabled();
    const wrapper = editar.parentElement as HTMLElement;
    expect(wrapper.tagName).toBe('SPAN');
    expect(wrapper).toHaveAttribute('tabindex', '0');

    fireEvent.focus(wrapper);
    await waitFor(() => expect(screen.getAllByText(/no está disponible/).length).toBeGreaterThan(0));
  });

  it('puedeCrear:false deshabilita el formulario y el botón con tooltip', async () => {
    (getHorasTarea as any).mockResolvedValue([]);
    (getTaskHoursSummary as any).mockResolvedValue(resumen({ puedeCrear: false }));
    renderSection();

    await esperarCarga();
    expect(screen.getByLabelText('Horas')).toBeDisabled();
    const registrar = screen.getByRole('button', { name: 'Registrar' });
    expect(registrar).toBeDisabled();
    expect((registrar.parentElement as HTMLElement).getAttribute('tabindex')).toBe('0');
  });

  it('las filas de otros usuarios no muestran «Propio» ni acciones', async () => {
    (getHorasTarea as any).mockResolvedValue([
      registro({ idRegistroTiempo: 1, idUsuario: 5 }),
      registro({
        idRegistroTiempo: 2,
        idUsuario: 8,
        usuario: { idUsuario: 8, nombre: 'Beatriz', apellido: 'Solano', fotoUrl: null },
      }),
    ]);
    (getTaskHoursSummary as any).mockResolvedValue(resumen());
    renderSection();

    await esperarCarga();
    await screen.findByText('Beatriz Solano');
    expect(screen.getAllByText('Propio')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^Editar registro/ })).toHaveLength(1);
  });

  it('revocar dos veces (409 REGISTRO_YA_REVOCADO) no muestra error destructivo e invalida', async () => {
    (getHorasTarea as any).mockResolvedValue([registro()]);
    (getTaskHoursSummary as any).mockResolvedValue(resumen());
    swalFire.mockResolvedValue({ isConfirmed: true });
    (revokeTimeRecord as any).mockRejectedValue(
      Object.assign(new Error('El registro de tiempo ya estaba revocado'), {
        statusCode: 409,
        code: 'REGISTRO_YA_REVOCADO',
      }),
    );
    const { queryClient } = renderSection();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await esperarCarga();
    fireEvent.click(await screen.findByRole('button', { name: /^Revocar registro/ }));

    await waitFor(() => expect(revokeTimeRecord).toHaveBeenCalledWith(7, 55, 1));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: taskHoursSummaryQueryKey(7, 55) }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un 409 distinto al revocar sí muestra el mensaje', async () => {
    (getHorasTarea as any).mockResolvedValue([registro()]);
    (getTaskHoursSummary as any).mockResolvedValue(resumen());
    swalFire.mockResolvedValue({ isConfirmed: true });
    (revokeTimeRecord as any).mockRejectedValue(
      Object.assign(new Error('El Sprint ya no admite cambios'), { statusCode: 409 }),
    );
    renderSection();

    await esperarCarga();
    fireEvent.click(await screen.findByRole('button', { name: /^Revocar registro/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('El Sprint ya no admite cambios'));
  });

  it('cancelar la confirmación no llama al DELETE', async () => {
    (getHorasTarea as any).mockResolvedValue([registro()]);
    (getTaskHoursSummary as any).mockResolvedValue(resumen());
    swalFire.mockResolvedValue({ isConfirmed: false });
    renderSection();

    await esperarCarga();
    fireEvent.click(await screen.findByRole('button', { name: /^Revocar registro/ }));
    await waitFor(() => expect(swalFire).toHaveBeenCalled());
    expect(revokeTimeRecord).not.toHaveBeenCalled();
  });
});

/**
 * El resumen dedicaba un KPI a las horas «Legacy» —un detalle de origen que
 * solo decide algo al cerrar el Sprint— mientras que lo reportado por encima
 * de la estimación, que es lo que el líder revisa, no se mostraba pese a
 * venir ya calculado por el backend (`sobreEstimacion`).
 */
describe('TaskHoursSection — horas sobreestimadas en el resumen', () => {
  it('muestra el exceso que reporta el backend, sin recalcularlo', async () => {
    (getHorasTarea as any).mockResolvedValue([]);
    (getTaskHoursSummary as any).mockResolvedValue(
      resumen({ estimacion: 2, horasReportadasTarea: '4.00', restantes: '0.00', sobreEstimacion: '2.00' }),
    );
    renderSection();

    await esperarCarga();
    const sobre = screen.getByRole('group', { name: 'Horas sobreestimadas' });
    expect(within(sobre).getByText('2 h')).toBeInTheDocument();
  });

  it('dentro de la estimación el exceso es cero, no «—»', async () => {
    (getHorasTarea as any).mockResolvedValue([]);
    (getTaskHoursSummary as any).mockResolvedValue(
      resumen({ estimacion: 10, horasReportadasTarea: '4.00', restantes: '6.00', sobreEstimacion: '0.00' }),
    );
    renderSection();

    await esperarCarga();
    const sobre = screen.getByRole('group', { name: 'Horas sobreestimadas' });
    expect(within(sobre).getByText('0 h')).toBeInTheDocument();
  });

  it('ya no ocupa un KPI con las horas legacy', async () => {
    (getHorasTarea as any).mockResolvedValue([]);
    (getTaskHoursSummary as any).mockResolvedValue(resumen({ horasLegacyNoGranulares: '5.00' }));
    renderSection();

    await esperarCarga();
    expect(screen.queryByRole('group', { name: 'Legacy' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('group')).toHaveLength(4);
  });
});

/**
 * Revocar es un borrado lógico. La lista no lo distinguía, así que el líder
 * —el único que conserva el histórico— veía un registro retirado idéntico a
 * uno vigente, y con sus botones de editar y revocar encima.
 */
describe('TaskHoursSection — registros revocados', () => {
  it('el registro revocado se marca y aparece tachado', async () => {
    (getHorasTarea as any).mockResolvedValue([
      registro({ idRegistroTiempo: 9, horas: 1, revocadoEn: '2026-09-07T18:00:00.000Z' }),
    ]);
    (getTaskHoursSummary as any).mockResolvedValue(resumen());
    renderSection();

    await esperarCarga();
    const marca = screen.getByText('Revocado');
    const fila = marca.closest('tr') as HTMLElement;
    expect(within(fila).getByText('1 h')).toHaveClass('line-through');
  });

  it('no ofrece editar ni revocar sobre algo ya retirado', async () => {
    (getHorasTarea as any).mockResolvedValue([
      registro({ idRegistroTiempo: 9, horas: 1, revocadoEn: '2026-09-07T18:00:00.000Z' }),
    ]);
    (getTaskHoursSummary as any).mockResolvedValue(resumen());
    renderSection();

    await esperarCarga();
    expect(screen.queryByRole('button', { name: /^Editar registro/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Revocar registro/ })).not.toBeInTheDocument();
  });

  it('un registro vigente conserva sus acciones y no se marca', async () => {
    (getHorasTarea as any).mockResolvedValue([registro({ horas: 3, revocadoEn: null })]);
    (getTaskHoursSummary as any).mockResolvedValue(resumen());
    renderSection();

    await esperarCarga();
    expect(screen.queryByText('Revocado')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Editar registro/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Revocar registro/ })).toBeInTheDocument();
  });
});

/**
 * Una justificación de exceso pertenece a un registro concreto. La lista las
 * filtraba solo por autor, así que al revocar el registro su justificación
 * seguía en pantalla: el estudiante veía argumentada una hora que ya había
 * retirado, y el líder no podía distinguir si justificaba horas que aún cuentan.
 */
describe('TaskHoursSection — justificaciones de exceso revocadas', () => {
  function tramo(justificaciones: Array<{ texto: string; revocadoEn: string | null }>) {
    return {
      idAsignacion: 3,
      usuario: { idUsuario: 1, nombre: 'V', apellido: 'H', fotoUrl: null },
      idParticipacion: 7,
      rolHistorico: null,
      abierto: true,
      origen: 'GRANULAR' as const,
      reportadas: '3.00',
      ajuste: null,
      propuestas: '3.00',
      reconocidoEn: null,
      justificaciones,
    };
  }

  it('la justificación de un registro retirado se marca y se tacha', async () => {
    (getHorasTarea as any).mockResolvedValue([]);
    (getTaskHoursSummary as any).mockResolvedValue(
      resumen({ tramos: [tramo([{ texto: 'Hubo retrabajo', revocadoEn: '2026-09-07T18:00:00.000Z' }])] }),
    );
    renderSection();

    await esperarCarga();
    const texto = screen.getByText('Hubo retrabajo');
    expect(texto).toHaveClass('line-through');
    expect(within(texto.closest('li') as HTMLElement).getByText('Revocado')).toBeInTheDocument();
  });

  it('una justificación vigente se lee sin marca alguna', async () => {
    (getHorasTarea as any).mockResolvedValue([]);
    (getTaskHoursSummary as any).mockResolvedValue(
      resumen({ tramos: [tramo([{ texto: 'Se cayó el proveedor', revocadoEn: null }])] }),
    );
    renderSection();

    await esperarCarga();
    const texto = screen.getByText('Se cayó el proveedor');
    expect(texto).not.toHaveClass('line-through');
    expect(within(texto.closest('li') as HTMLElement).queryByText('Revocado')).not.toBeInTheDocument();
  });

  it('sin justificaciones no se dibuja el apartado', async () => {
    (getHorasTarea as any).mockResolvedValue([]);
    (getTaskHoursSummary as any).mockResolvedValue(resumen({ tramos: [tramo([])] }));
    renderSection();

    await esperarCarga();
    expect(screen.queryByText('Justificaciones de exceso')).not.toBeInTheDocument();
  });
});
