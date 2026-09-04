import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/services/task-hours', () => ({
  getHorasTarea: vi.fn(),
  registrarHorasTarea: vi.fn(),
}));

import { TaskHoursPanel } from '../components/projects/task-hours-panel';
import { getHorasTarea, registrarHorasTarea } from '../lib/services/task-hours';
import { projectAvanceQueryKey, projectTasksQueryKey, taskHoursQueryKey } from '../lib/query-keys/tasks';
import type { RegistroTiempoTareaDTO } from '../lib/types/tasks';

function registro(overrides: Partial<RegistroTiempoTareaDTO> = {}): RegistroTiempoTareaDTO {
  return {
    idRegistroTiempo: 1,
    idAsignacion: 30,
    idUsuario: 5,
    horas: 2,
    fecha: '2026-08-20',
    nota: null,
    creadoEn: '2026-08-20T12:00:00.000Z',
    usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
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

function renderPanel(overrides: Record<string, unknown> = {}) {
  const { wrapper, queryClient } = createWrapper();
  const utils = render(
    createElement(TaskHoursPanel, {
      idProyecto: 7,
      idTarea: 55,
      puedeRegistrar: true,
      enabled: true,
      ...overrides,
    }),
    { wrapper },
  );
  return { ...utils, queryClient };
}

describe('TaskHoursPanel (HU-142 / T-171)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('consulta las horas con taskHoursQueryKey(idProyecto, idTarea)', async () => {
    (getHorasTarea as any).mockResolvedValue([]);
    const { queryClient } = renderPanel();

    await waitFor(() => expect(queryClient.getQueryState(taskHoursQueryKey(7, 55))).toBeDefined());
    expect(getHorasTarea).toHaveBeenCalledWith(7, 55);
  });

  it('muestra el total registrado como la suma de las horas devueltas por el backend', async () => {
    (getHorasTarea as any).mockResolvedValue([registro({ horas: 2 }), registro({ idRegistroTiempo: 2, horas: 1.5 })]);
    renderPanel();

    await waitFor(() => expect(screen.getByText('Total registrado: 3.5 h')).toBeInTheDocument());
  });

  it('sin puedeRegistrar=true, no muestra el formulario de registro (solo lectura)', async () => {
    (getHorasTarea as any).mockResolvedValue([]);
    renderPanel({ puedeRegistrar: false });

    await waitFor(() => expect(getHorasTarea).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Registrar horas' })).not.toBeInTheDocument();
  });

  it('con puedeRegistrar=true, muestra el formulario con horas y fecha', async () => {
    (getHorasTarea as any).mockResolvedValue([]);
    renderPanel();

    expect(await screen.findByLabelText('Horas')).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar horas' })).toBeInTheDocument();
  });

  it('el botón permanece deshabilitado sin horas > 0', async () => {
    (getHorasTarea as any).mockResolvedValue([]);
    renderPanel();

    const boton = await screen.findByRole('button', { name: 'Registrar horas' });
    expect(boton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Horas'), { target: { value: '0' } });
    expect(boton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Horas'), { target: { value: '2' } });
    expect(boton).not.toBeDisabled();
  });

  it('registrar horas exitoso invalida task-hours, project-tasks y project-avance', async () => {
    (getHorasTarea as any).mockResolvedValue([]);
    (registrarHorasTarea as any).mockResolvedValue(registro());
    const { queryClient } = renderPanel();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.change(await screen.findByLabelText('Horas'), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-08-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar horas' }));

    await waitFor(() =>
      expect(registrarHorasTarea).toHaveBeenCalledWith(7, 55, { horas: 2.5, fecha: '2026-08-20' }),
    );
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: taskHoursQueryKey(7, 55) });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectTasksQueryKey(7) });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectAvanceQueryKey(7) });
    });
  });

  it('envía la nota recortada solo cuando el usuario escribió algo', async () => {
    (getHorasTarea as any).mockResolvedValue([]);
    (registrarHorasTarea as any).mockResolvedValue(registro());
    renderPanel();

    fireEvent.change(await screen.findByLabelText('Horas'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('Nota (opcional)'), { target: { value: '  avance de hoy  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar horas' }));

    await waitFor(() =>
      expect(registrarHorasTarea).toHaveBeenCalledWith(
        7,
        55,
        expect.objectContaining({ nota: 'avance de hoy' }),
      ),
    );
  });

  it('en fallo del backend, muestra el mensaje de error y no invalida como éxito', async () => {
    (getHorasTarea as any).mockResolvedValue([]);
    (registrarHorasTarea as any).mockRejectedValue(
      Object.assign(new Error('El tramo ya fue cerrado'), { statusCode: 409 }),
    );
    const { queryClient } = renderPanel();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.change(await screen.findByLabelText('Horas'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar horas' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('muestra la lista de registros con autor, fecha y horas', async () => {
    (getHorasTarea as any).mockResolvedValue([
      registro({ horas: 2, fecha: '2026-08-20', nota: 'Avance inicial' }),
    ]);
    renderPanel();

    await waitFor(() => expect(screen.getByText('Ana Lopez')).toBeInTheDocument());
    expect(screen.getByText('2 h')).toBeInTheDocument();
    expect(screen.getByText('Avance inicial')).toBeInTheDocument();
  });

  it('sin registros, muestra el estado vacío', async () => {
    (getHorasTarea as any).mockResolvedValue([]);
    renderPanel();

    await waitFor(() =>
      expect(screen.getByText('Aún no hay horas registradas en esta tarea.')).toBeInTheDocument(),
    );
  });
});
