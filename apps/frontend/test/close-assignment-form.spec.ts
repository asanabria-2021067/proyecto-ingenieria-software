import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Radix Dialog/Checkbox miden su contenido con ResizeObserver, ausente en
// jsdom — mismo polyfill mínimo que task-board.spec.ts / exit-preparation-workspace.spec.ts.
beforeAll(() => {
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const mutate = vi.fn();
const reset = vi.fn();
let isPending = false;
let isError = false;
let error: unknown = null;

vi.mock('../hooks/use-project-tasks', () => ({
  useProjectTasks: vi.fn(() => ({
    cerrarAsignacion: {
      mutate,
      reset,
      isPending,
      isError,
      error,
    },
  })),
}));

import { CloseAssignmentForm } from '../components/projects/close-assignment-form';
import { useProjectTasks } from '../hooks/use-project-tasks';

function caracteres(n: number): string {
  return 'a'.repeat(n);
}

function renderForm(overrides: Record<string, unknown> = {}) {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();
  const utils = render(
    createElement(CloseAssignmentForm, {
      open: true,
      onOpenChange,
      idProyecto: 7,
      idTarea: 12,
      idAsignacion: 34,
      tituloTarea: 'Documentar procesos',
      onSuccess,
      ...overrides,
    }),
  );
  return { ...utils, onOpenChange, onSuccess };
}

describe('CloseAssignmentForm (F10)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    isPending = false;
    isError = false;
    error = null;
  });

  it('no renderiza el formulario cuando está cerrado', () => {
    render(
      createElement(CloseAssignmentForm, {
        open: false,
        onOpenChange: vi.fn(),
        idProyecto: 7,
        idTarea: 12,
        idAsignacion: 34,
      }),
    );
    expect(screen.queryByText('Cerrar tramo')).not.toBeInTheDocument();
  });

  it('muestra título, subtítulo y ambos campos obligatorios cuando está abierto', () => {
    renderForm();
    expect(screen.getByRole('heading', { name: 'Cerrar tramo' })).toBeInTheDocument();
    expect(
      screen.getByText('Registra el trabajo realizado en este tramo antes de cerrarlo — "Documentar procesos".'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Horas reales/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Registro de avance/)).toBeInTheDocument();
    expect(screen.getByText('Marcar tarea como completada')).toBeInTheDocument();
  });

  // ── Test 1: contador inicial ─────────────────────────────────────────────
  it('contador inicial: textarea vacío muestra 0/200 caracteres', () => {
    renderForm();
    expect(screen.getByText('0/200 caracteres · Mín. 200 caracteres')).toBeInTheDocument();
  });

  // ── Test 2: contador en tiempo real ─────────────────────────────────────
  it('contador en tiempo real: escribir 50 caracteres actualiza sin submit', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Registro de avance/), {
      target: { value: caracteres(50) },
    });
    expect(screen.getByText('50/200 caracteres · Mín. 200 caracteres')).toBeInTheDocument();
  });

  // ── Test 3: menos de 200 ─────────────────────────────────────────────────
  it('con 199 caracteres el formulario es inválido y no llama a la mutación', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Horas reales/), { target: { value: '3.5' } });
    fireEvent.change(screen.getByLabelText(/Registro de avance/), {
      target: { value: caracteres(199) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar tramo' }));

    await waitFor(() =>
      expect(
        screen.getByText('El registro de avance debe tener al menos 200 caracteres.'),
      ).toBeInTheDocument(),
    );
    expect(mutate).not.toHaveBeenCalled();
  });

  it('espacios en blanco no cuentan para el mínimo (misma semántica trim que el backend)', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Horas reales/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Registro de avance/), {
      target: { value: `  ${caracteres(199)}  ` },
    });
    // El contador cuenta el contenido recortado: 199, no 203.
    expect(screen.getByText('199/200 caracteres · Mín. 200 caracteres')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar tramo' }));
    await waitFor(() =>
      expect(
        screen.getByText('El registro de avance debe tener al menos 200 caracteres.'),
      ).toBeInTheDocument(),
    );
    expect(mutate).not.toHaveBeenCalled();
  });

  // ── Test 4: exactamente 200 ──────────────────────────────────────────────
  it('con exactamente 200 caracteres el registro de avance es válido', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Horas reales/), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Registro de avance/), {
      target: { value: caracteres(200) },
    });
    expect(screen.getByText('200/200 caracteres · Mín. 200 caracteres')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar tramo' }));

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText('El registro de avance debe tener al menos 200 caracteres.'),
    ).not.toBeInTheDocument();
  });

  // ── Test 5: más de 200 ────────────────────────────────────────────────────
  it('con 236 caracteres sigue siendo válido y el contador muestra 236/200', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Horas reales/), { target: { value: '3.5' } });
    fireEvent.change(screen.getByLabelText(/Registro de avance/), {
      target: { value: caracteres(236) },
    });
    expect(screen.getByText('236/200 caracteres · Mín. 200 caracteres')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar tramo' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  });

  // ── Test 6: horas ─────────────────────────────────────────────────────────
  describe('validación de horas reales', () => {
    it('horas vacías: formulario inválido, no llama a la mutación', async () => {
      renderForm();
      fireEvent.change(screen.getByLabelText(/Registro de avance/), {
        target: { value: caracteres(200) },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar tramo' }));

      await waitFor(() =>
        expect(screen.getByText('Ingresa las horas reales dedicadas en este tramo.')).toBeInTheDocument(),
      );
      expect(mutate).not.toHaveBeenCalled();
    });

    it('acepta un valor decimal válido (3.5), igual que el DTO real (@IsNumber, sin restricción de entero)', async () => {
      renderForm();
      fireEvent.change(screen.getByLabelText(/Horas reales/), { target: { value: '3.5' } });
      fireEvent.change(screen.getByLabelText(/Registro de avance/), {
        target: { value: caracteres(200) },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar tramo' }));

      await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
      expect(mutate.mock.calls[0][0].input.horasReales).toBe(3.5);
    });

    it('rechaza un valor negativo (el DTO real exige @Min(0))', async () => {
      renderForm();
      const horasInput = screen.getByLabelText(/Horas reales/);
      fireEvent.change(horasInput, { target: { value: '-1' } });
      fireEvent.change(screen.getByLabelText(/Registro de avance/), {
        target: { value: caracteres(200) },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar tramo' }));

      await waitFor(() =>
        expect(screen.getByText('Ingresa un número válido, mayor o igual a 0.')).toBeInTheDocument(),
      );
      expect(mutate).not.toHaveBeenCalled();
    });
  });

  // ── Test 37: checkbox HECHO ───────────────────────────────────────────────
  describe('checkbox "Marcar tarea como completada"', () => {
    it('sin marcar: el payload envía marcarComoHecha=false', async () => {
      renderForm();
      fireEvent.change(screen.getByLabelText(/Horas reales/), { target: { value: '2' } });
      fireEvent.change(screen.getByLabelText(/Registro de avance/), {
        target: { value: caracteres(200) },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar tramo' }));

      await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
      expect(mutate.mock.calls[0][0].input.marcarComoHecha).toBe(false);
    });

    it('marcado: el payload envía marcarComoHecha=true en la MISMA llamada de cierre (sin una segunda mutación)', async () => {
      renderForm();
      fireEvent.change(screen.getByLabelText(/Horas reales/), { target: { value: '2' } });
      fireEvent.change(screen.getByLabelText(/Registro de avance/), {
        target: { value: caracteres(200) },
      });
      fireEvent.click(screen.getByRole('checkbox', { name: 'Marcar tarea como completada' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar tramo' }));

      await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
      expect(mutate.mock.calls[0][0].input.marcarComoHecha).toBe(true);
    });
  });

  // ── Test 38: submit exacto ────────────────────────────────────────────────
  it('submit con datos válidos: mutate se llama exactamente una vez con taskId/assignmentId/payload correctos', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Horas reales/), { target: { value: '3.5' } });
    fireEvent.change(screen.getByLabelText(/Registro de avance/), {
      target: { value: caracteres(236) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar tramo' }));

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate.mock.calls[0][0]).toEqual({
      taskId: 12,
      assignmentId: 34,
      input: { horasReales: 3.5, contenidoAvance: caracteres(236), marcarComoHecha: false },
    });
  });

  it('mientras isPending=true, el botón queda disabled y un segundo click no genera doble request', () => {
    isPending = true;
    renderForm();

    const boton = screen.getByRole('button', { name: 'Cerrando...' });
    expect(boton).toBeDisabled();
    fireEvent.click(boton);
    fireEvent.click(boton);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('usa el idProyecto pasado por props para instanciar useProjectTasks (mismo hook, sin duplicar data layer)', () => {
    renderForm({ idProyecto: 99 });
    expect(useProjectTasks).toHaveBeenCalledWith(99);
  });

  // ── Test 39: success ──────────────────────────────────────────────────────
  it('en éxito: cierra el modal, resetea la mutation y ejecuta onSuccess', async () => {
    mutate.mockImplementation((_vars, opts) => opts.onSuccess?.());
    const { onOpenChange, onSuccess } = renderForm();

    fireEvent.change(screen.getByLabelText(/Horas reales/), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Registro de avance/), {
      target: { value: caracteres(200) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar tramo' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  // ── Test 40: error ────────────────────────────────────────────────────────
  it('en fallo del backend: el modal permanece abierto, muestra el mensaje real y no se llama onSuccess', async () => {
    isError = true;
    error = Object.assign(new Error('La asignación ya fue cerrada'), { statusCode: 409 });
    const { onOpenChange, onSuccess } = renderForm();

    fireEvent.change(screen.getByLabelText(/Horas reales/), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Registro de avance/), {
      target: { value: caracteres(200) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar tramo' }));

    expect(screen.getByRole('alert')).toHaveTextContent('La asignación ya fue cerrada');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onSuccess).not.toHaveBeenCalled();
    // Los datos escritos permanecen: se puede corregir/reintentar.
    expect(screen.getByLabelText(/Horas reales/)).toHaveValue(2);
  });

  it('Cancelar cierra el modal sin llamar a la mutación', () => {
    const { onOpenChange } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mutate).not.toHaveBeenCalled();
  });

  // ── Test 41: mismo componente en ambos contextos (PREPARACION y Kanban) ──
  it('el mismo componente funciona con ids distintos según el contexto que lo abra (PREPARACION vs Kanban)', async () => {
    // Contexto Kanban: idProyecto/idTarea/idAsignacion de una tarea cualquiera.
    const kanban = render(
      createElement(CloseAssignmentForm, {
        open: true,
        onOpenChange: vi.fn(),
        idProyecto: 7,
        idTarea: 101,
        idAsignacion: 501,
      }),
    );
    fireEvent.change(screen.getByLabelText(/Horas reales/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Registro de avance/), {
      target: { value: caracteres(200) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar tramo' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 101, assignmentId: 501 }),
      expect.anything(),
    ));
    kanban.unmount();
    vi.clearAllMocks();

    // Contexto PREPARACION (F9): misma UI, ids de la responsabilidad seleccionada.
    render(
      createElement(CloseAssignmentForm, {
        open: true,
        onOpenChange: vi.fn(),
        idProyecto: 7,
        idTarea: 202,
        idAsignacion: 902,
      }),
    );
    fireEvent.change(screen.getByLabelText(/Horas reales/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Registro de avance/), {
      target: { value: caracteres(200) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar tramo' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 202, assignmentId: 902 }),
      expect.anything(),
    ));
  });
});
