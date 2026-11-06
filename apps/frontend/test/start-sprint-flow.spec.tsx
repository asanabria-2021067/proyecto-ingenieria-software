import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/services/sprints', () => ({ startSprint: vi.fn() }));

import { SPRINT_PLAN_MAX_DIAS, StartSprintButton } from '../components/projects/start-sprint-button';
import { startSprint } from '../lib/services/sprints';
import { toDateKey } from '../lib/calendar/utils';

const startSprintMock = vi.mocked(startSprint);

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

function dia(desdeHoy: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + desdeHoy);
  return toDateKey(fecha);
}

let queryClient: QueryClient;
function renderButton() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<StartSprintButton idProyecto={32} />, { wrapper });
}

function abrir() {
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar Sprint' }));
  return screen.getByRole('dialog');
}

function campoFecha() {
  return screen.getByLabelText(/Fecha esperada de finalización/) as HTMLInputElement;
}

function continuar() {
  return screen.getByRole('button', { name: 'Continuar' });
}

function elegirFecha(valor: string) {
  fireEvent.change(campoFecha(), { target: { value: valor } });
}

function irAConfirmacion(fecha = dia(14)) {
  abrir();
  elegirFecha(fecha);
  fireEvent.click(continuar());
  return screen.getByRole('heading', { name: '¿Seguro que quieres iniciar este Sprint?' });
}

beforeEach(() => {
  startSprintMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('StartSprintButton — paso de planificación', () => {
  it('pulsar «Iniciar Sprint» abre el formulario sin crear nada', () => {
    renderButton();
    const dialogo = abrir();

    expect(within(dialogo).getByRole('heading', { name: 'Iniciar Sprint' })).toBeInTheDocument();
    expect(within(dialogo).getByText('Define la planificación inicial del nuevo Sprint.')).toBeInTheDocument();
    expect(startSprintMock).not.toHaveBeenCalled();
  });

  it('muestra la fecha de inicio de hoy como dato de solo lectura, no como campo editable', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 6, 12));
    renderButton();
    abrir();

    const inicio = screen.getByRole('group', { name: 'Fecha de inicio' });
    expect(inicio).toHaveTextContent('6 oct 2026');
    expect(inicio.querySelector('input')).toBeNull();
    expect(screen.getByText('Se establecerá automáticamente al iniciar el Sprint.')).toBeInTheDocument();
    // El único control editable del formulario es la fecha esperada de finalización.
    expect(document.querySelectorAll('input')).toHaveLength(1);
  });

  it('el campo de finalización es obligatorio y explica que no es el cierre formal', () => {
    renderButton();
    abrir();

    expect(campoFecha()).toBeRequired();
    expect(campoFecha()).toHaveAttribute('min', dia(1));
    expect(campoFecha()).toHaveAttribute('max', dia(SPRINT_PLAN_MAX_DIAS));
    expect(screen.getByText(/El cierre formal puede realizarse posteriormente/)).toBeInTheDocument();
    expect(screen.getByRole('dialog').textContent).not.toMatch(/fecha de cierre/i);
  });

  it('el foco entra directamente en el campo de fecha', () => {
    renderButton();
    abrir();
    expect(campoFecha()).toHaveFocus();
  });

  it('sin fecha, «Continuar» está deshabilitado', () => {
    renderButton();
    abrir();
    expect(continuar()).toBeDisabled();
  });

  it('con la fecha de hoy o una pasada no avanza y lo explica', () => {
    renderButton();
    abrir();

    elegirFecha(dia(0));
    expect(continuar()).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/Elige una fecha entre el/);
    expect(campoFecha()).toHaveAttribute('aria-invalid', 'true');

    elegirFecha(dia(-3));
    expect(continuar()).toBeDisabled();
  });

  it(`con más de ${SPRINT_PLAN_MAX_DIAS} días no avanza`, () => {
    renderButton();
    abrir();

    elegirFecha(dia(SPRINT_PLAN_MAX_DIAS + 1));
    expect(continuar()).toBeDisabled();
    expect(screen.getByRole('alert')).toBeInTheDocument();

    elegirFecha(dia(SPRINT_PLAN_MAX_DIAS));
    expect(continuar()).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('con una fecha válida «Continuar» abre la confirmación sin llamar al servicio', () => {
    renderButton();
    irAConfirmacion(dia(14));

    expect(screen.getByText(/las fechas no podrán modificarse durante este Sprint/)).toBeInTheDocument();
    expect(startSprintMock).not.toHaveBeenCalled();
  });

  it('«Cancelar» cierra sin crear el Sprint y limpia la fecha', () => {
    renderButton();
    abrir();
    elegirFecha(dia(14));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(startSprintMock).not.toHaveBeenCalled();

    abrir();
    expect(campoFecha().value).toBe('');
  });

  it('Esc cierra el flujo entero sin crear el Sprint', () => {
    renderButton();
    abrir();
    elegirFecha(dia(14));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(startSprintMock).not.toHaveBeenCalled();
  });
});

describe('StartSprintButton — confirmación', () => {
  it('resume ambas fechas y mueve el foco al título del paso', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 6, 12));
    renderButton();
    const titulo = irAConfirmacion('2026-10-20');

    expect(titulo).toHaveFocus();
    expect(screen.getByText('Fecha de inicio').nextElementSibling).toHaveTextContent('6 oct 2026');
    expect(screen.getByText('Fecha esperada de finalización').nextElementSibling).toHaveTextContent('20 oct 2026');
    expect(screen.getByRole('button', { name: 'Sí, iniciar Sprint' })).toBeInTheDocument();
  });

  it('«Cancelar» vuelve al formulario conservando la fecha, sin llamar al servicio', () => {
    renderButton();
    const fecha = dia(14);
    irAConfirmacion(fecha);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByRole('heading', { name: 'Iniciar Sprint' })).toBeInTheDocument();
    expect(campoFecha().value).toBe(fecha);
    expect(campoFecha()).toHaveFocus();
    expect(startSprintMock).not.toHaveBeenCalled();
  });

  it('confirmar envía una sola vez solo fechaFinPlaneada y cierra al terminar', async () => {
    startSprintMock.mockResolvedValue({ idSprint: 1 } as never);
    renderButton();
    const fecha = dia(14);
    irAConfirmacion(fecha);

    fireEvent.click(screen.getByRole('button', { name: 'Sí, iniciar Sprint' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(startSprintMock).toHaveBeenCalledTimes(1);
    expect(startSprintMock).toHaveBeenCalledWith(32, fecha);
  });

  it('al iniciar invalida la lista de Sprints del proyecto para que el Tablero se actualice', async () => {
    startSprintMock.mockResolvedValue({ idSprint: 1 } as never);
    renderButton();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    irAConfirmacion(dia(14));

    fireEvent.click(screen.getByRole('button', { name: 'Sí, iniciar Sprint' }));

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['project-sprints', 32] }));
  });

  it('un doble clic produce una sola petición', async () => {
    let resolver: (valor: unknown) => void = () => {};
    startSprintMock.mockReturnValue(new Promise((resolve) => (resolver = resolve)) as never);
    renderButton();
    irAConfirmacion(dia(14));

    const confirmar = screen.getByRole('button', { name: 'Sí, iniciar Sprint' });
    fireEvent.click(confirmar);
    fireEvent.click(confirmar);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Iniciando…' })).toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Iniciando…' }));

    expect(startSprintMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();

    resolver({ idSprint: 1 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('mientras envía, Esc no cierra el diálogo', async () => {
    startSprintMock.mockReturnValue(new Promise(() => {}) as never);
    renderButton();
    irAConfirmacion(dia(14));

    fireEvent.click(screen.getByRole('button', { name: 'Sí, iniciar Sprint' }));
    await screen.findByRole('button', { name: 'Iniciando…' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('si el backend rechaza, el diálogo permanece con el error visible y permite reintentar', async () => {
    startSprintMock.mockRejectedValueOnce(
      Object.assign(new Error('conflicto'), {
        statusCode: 409,
        message: 'Ya existe un Sprint activo o en finalización para este proyecto',
      }),
    );
    renderButton();
    irAConfirmacion(dia(14));

    fireEvent.click(screen.getByRole('button', { name: 'Sí, iniciar Sprint' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sí, iniciar Sprint' })).toBeEnabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sí, iniciar Sprint' })).toHaveFocus());

    startSprintMock.mockResolvedValue({ idSprint: 1 } as never);
    fireEvent.click(screen.getByRole('button', { name: 'Sí, iniciar Sprint' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(startSprintMock).toHaveBeenCalledTimes(2);
  });

  it('volver al formulario tras un error limpia el mensaje', async () => {
    startSprintMock.mockRejectedValueOnce(new Error('500'));
    renderButton();
    irAConfirmacion(dia(14));

    fireEvent.click(screen.getByRole('button', { name: 'Sí, iniciar Sprint' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(continuar());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
