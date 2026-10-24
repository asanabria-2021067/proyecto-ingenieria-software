import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TareaPublicaDTO } from '../lib/types/tasks';

const mensajes = vi.hoisted(() => ({
  confirmar: vi.fn(),
  aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() },
}));
vi.mock('../lib/mensajes', () => mensajes);

import { TaskBulkActionsBar, type TaskBulkActionsBarProps } from '../components/projects/task-bulk-actions-bar';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

function tarea(overrides: Partial<TareaPublicaDTO> = {}): TareaPublicaDTO {
  return {
    idTarea: 1,
    idProyecto: 10,
    idHito: null,
    idRolProyecto: null,
    tituloTarea: 'Tarea',
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
    ...overrides,
  };
}

function renderBar(overrides: Partial<TaskBulkActionsBarProps> = {}) {
  const mutate = vi.fn();
  const props: TaskBulkActionsBarProps = {
    tareas: [tarea({ idTarea: 1 }), tarea({ idTarea: 2 })],
    members: [
      { idUsuario: 20, nombre: 'Ana', apellido: 'Paz', correo: 'a@x', fotoUrl: null, idRolProyecto: 6 },
      { idUsuario: 30, nombre: 'Luis', apellido: 'Rey', correo: 'l@x', fotoUrl: null, idRolProyecto: 7 },
    ],
    labels: [
      { idEtiqueta: 4, nombreEtiqueta: 'Urgente', color: '#ff0000' },
      { idEtiqueta: 5, nombreEtiqueta: 'Backend', color: '#00ff00' },
    ],
    accionMasiva: { mutate, isPending: false } as unknown as TaskBulkActionsBarProps['accionMasiva'],
    onLimpiar: vi.fn(),
    ...overrides,
  };
  render(<TaskBulkActionsBar {...props} />);
  return { props, mutate };
}

function abrirMenu(nombre: string) {
  fireEvent.keyDown(screen.getByRole('button', { name: nombre }), { key: 'Enter' });
}

describe('TaskBulkActionsBar (HU-202/T-384)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('sin selección no se muestra', () => {
    renderBar({ tareas: [] });
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('muestra cuántas tareas hay seleccionadas', () => {
    renderBar();
    expect(screen.getByRole('toolbar', { name: 'Acciones masivas' })).toHaveTextContent('2seleccionadas');
  });

  it('mover pide confirmación y envía la acción; al éxito avisa y limpia', async () => {
    mensajes.confirmar.mockResolvedValue(true);
    const { mutate, props } = renderBar();

    abrirMenu('Mover a');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'En revisión' }));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mensajes.confirmar).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: '¿Mover 2 tareas a «En revisión»?', textoAccion: 'Mover tareas' }),
    );
    const [input, opciones] = mutate.mock.calls[0];
    expect(input).toEqual({ idsTareas: [1, 2], accion: 'MOVER', estadoTarea: 'EN_REVISION' });

    opciones.onSuccess({ accion: 'MOVER', tareas: [], idsActualizadas: [1] });
    expect(mensajes.aviso.exito).toHaveBeenCalledWith('Tareas movidas', '1 de 2 movidas; el resto ya estaba así.');
    expect(props.onLimpiar).toHaveBeenCalled();
  });

  it('si el líder cancela la confirmación no se envía nada', async () => {
    mensajes.confirmar.mockResolvedValue(false);
    const { mutate } = renderBar();

    abrirMenu('Mover a');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Hecho' }));

    await waitFor(() => expect(mensajes.confirmar).toHaveBeenCalled());
    expect(mutate).not.toHaveBeenCalled();
  });

  it('un error del backend se muestra y conserva la selección', async () => {
    mensajes.confirmar.mockResolvedValue(true);
    const { mutate, props } = renderBar();

    abrirMenu('Mover a');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Hecho' }));
    await waitFor(() => expect(mutate).toHaveBeenCalled());

    const error = Object.assign(new Error('Tarea "Diseñar API": sprint cerrado'), { statusCode: 400 });
    mutate.mock.calls[0][1].onError(error);
    expect(mensajes.aviso.error).toHaveBeenCalledWith('No se pudo completar la acción', expect.any(String));
    expect(props.onLimpiar).not.toHaveBeenCalled();
  });

  it('asignar deshabilita a quien no participa en el rol de todas las tareas', async () => {
    mensajes.confirmar.mockResolvedValue(true);
    const { mutate } = renderBar({
      tareas: [tarea({ idTarea: 1, rolProyecto: { idRolProyecto: 6, nombreRol: 'Backend' } })],
    });

    abrirMenu('Asignar');
    const luis = await screen.findByRole('menuitem', { name: /Luis Rey/ });
    expect(luis).toHaveAttribute('data-disabled');
    expect(luis).toHaveTextContent('No participa en el rol de todas las tareas');

    fireEvent.click(screen.getByRole('menuitem', { name: 'Ana Paz' }));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0]).toEqual({ idsTareas: [1], accion: 'ASIGNAR', idUsuario: 20 });
  });

  it('«Quitar asignación» solo se habilita si alguna seleccionada tiene asignado', async () => {
    renderBar();
    abrirMenu('Asignar');
    expect(await screen.findByRole('menuitem', { name: 'Quitar asignación' })).toHaveAttribute('data-disabled');
  });

  it('etiquetas: elige y agrega a todas las seleccionadas', async () => {
    mensajes.confirmar.mockResolvedValue(true);
    const { mutate } = renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Etiquetas' }));
    const agregar = await screen.findByRole('button', { name: 'Agregar' });
    expect(agregar).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Urgente' }));
    fireEvent.click(agregar);

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mensajes.confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: '¿Agregar «Urgente» a 2 tareas?' }));
    expect(mutate.mock.calls[0][0]).toEqual({ idsTareas: [1, 2], accion: 'AGREGAR_ETIQUETAS', idsEtiquetas: [4] });
  });

  it('el botón de limpiar vacía la selección y se deshabilita mientras la acción está en curso', () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar selección' }));
    expect(props.onLimpiar).toHaveBeenCalled();

    cleanup();
    renderBar({ accionMasiva: { mutate: vi.fn(), isPending: true } as unknown as TaskBulkActionsBarProps['accionMasiva'] });
    expect(screen.getByRole('button', { name: 'Limpiar selección' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mover a' })).toBeDisabled();
  });
});
