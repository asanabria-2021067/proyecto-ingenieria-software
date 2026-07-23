import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TaskFormDialog } from '../components/projects/task-form-dialog';
import type { TareaPublicaDTO } from '../lib/types/tasks';
import type { MiembroProyecto } from '../hooks/use-project-members';
import type { LabelDTO } from '../lib/services/labels';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  // Radix Select mide su trigger con ResizeObserver, no implementado en jsdom.
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
    tituloTarea: 'Implementar login',
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    creadaPor: 1,
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    fechaLimite: '2026-01-01',
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
    asignacionActiva: null,
    rolProyecto: null,
    hito: null,
    etiquetas: [],
    cantidadComentarios: 0,
    ...overrides,
  };
}

function miembro(overrides: Partial<MiembroProyecto> = {}): MiembroProyecto {
  return {
    idUsuario: 1,
    nombre: 'Ana',
    apellido: 'Lopez',
    correo: 'ana@uvg.edu.gt',
    fotoUrl: null,
    idRolProyecto: 1,
    ...overrides,
  };
}

function etiqueta(overrides: Partial<LabelDTO> = {}): LabelDTO {
  return { idEtiqueta: 1, nombreEtiqueta: 'Urgente', color: '#FF0000', ...overrides };
}

function mutationStub(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
    ...overrides,
  };
}

function renderDialog(overrides: Record<string, unknown> = {}) {
  const props = {
    open: true,
    mode: 'create',
    task: null,
    roles: [{ idRolProyecto: 1, nombreRol: 'Backend' }, { idRolProyecto: 2, nombreRol: 'Frontend' }],
    milestones: [{ idHito: 1, tituloHito: 'Entrega 1' }],
    members: [miembro({ idUsuario: 5, idRolProyecto: 1 }), miembro({ idUsuario: 9, idRolProyecto: 2, nombre: 'Beto', apellido: 'Ruiz' })],
    labels: [etiqueta()],
    isLeader: true,
    crearTarea: mutationStub(),
    editarTarea: mutationStub(),
    asignarTarea: mutationStub(),
    desasignarTarea: mutationStub(),
    onOpenChange: vi.fn(),
    ...overrides,
  };
  const utils = render(createElement(TaskFormDialog, props as any));
  return { ...utils, props };
}

async function llenarTitulo(texto: string) {
  const input = screen.getByLabelText('Título');
  fireEvent.change(input, { target: { value: texto } });
}

async function llenarFecha(fecha: string) {
  const input = screen.getByLabelText('Fecha límite');
  fireEvent.change(input, { target: { value: fecha } });
}

describe('TaskFormDialog — reutilización', () => {
  afterEach(() => cleanup());

  it('el mismo componente muestra el título "Crear nueva tarea" en modo creación', () => {
    renderDialog({ mode: 'create', task: null });
    expect(screen.getByText('Crear nueva tarea')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear tarea' })).toBeInTheDocument();
  });

  it('el mismo componente muestra el título "Editar tarea" en modo edición', () => {
    renderDialog({ mode: 'edit', task: tarea({ tituloTarea: 'Mi tarea' }) });
    expect(screen.getByText('Editar tarea')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
  });

  it('no existen dos formularios: los mismos campos aparecen en ambos modos', () => {
    const { unmount } = renderDialog({ mode: 'create', task: null });
    expect(screen.getByLabelText('Título')).toBeInTheDocument();
    unmount();

    renderDialog({ mode: 'edit', task: tarea() });
    expect(screen.getByLabelText('Título')).toBeInTheDocument();
  });
});

describe('TaskFormDialog — creación', () => {
  afterEach(() => cleanup());

  it('valores iniciales vacíos en creación', () => {
    renderDialog({ mode: 'create', task: null });
    expect(screen.getByLabelText('Título')).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Prioridad' })).toHaveTextContent('Media');
  });

  it('submit exacto: crearTarea recibe el payload construido, sin projectId', async () => {
    const crearTarea = mutationStub();
    const onOpenChange = vi.fn();
    renderDialog({ mode: 'create', task: null, crearTarea, onOpenChange });

    await llenarTitulo('Nueva tarea de prueba');
    await llenarFecha('2027-01-01');
    fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }));

    await waitFor(() => expect(crearTarea.mutateAsync).toHaveBeenCalledTimes(1));
    const payload = crearTarea.mutateAsync.mock.calls[0][0];
    expect(payload).toEqual({
      tituloTarea: 'Nueva tarea de prueba',
      fechaLimite: '2027-01-01',
      prioridad: 'MEDIA',
    });
    expect(payload.idProyecto).toBeUndefined();
  });

  it('incluye asignado inicial cuando se seleccionó uno', async () => {
    const crearTarea = mutationStub();
    renderDialog({ mode: 'create', task: null, crearTarea });

    await llenarTitulo('Con asignado');
    await llenarFecha('2027-01-01');

    const selectAsignado = screen.getByRole('combobox', { name: 'Asignado' });
    fireEvent.keyDown(selectAsignado, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: /Ana Lopez/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }));
    await waitFor(() => expect(crearTarea.mutateAsync).toHaveBeenCalledTimes(1));
    expect(crearTarea.mutateAsync.mock.calls[0][0].idUsuarioAsignado).toBe(5);
  });

  it('incluye etiquetas seleccionadas', async () => {
    const crearTarea = mutationStub();
    renderDialog({ mode: 'create', task: null, crearTarea });

    await llenarTitulo('Con etiqueta');
    await llenarFecha('2027-01-01');
    fireEvent.click(screen.getByLabelText('Urgente', { exact: false }) ?? screen.getByText('Urgente'));

    fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }));
    await waitFor(() => expect(crearTarea.mutateAsync).toHaveBeenCalledTimes(1));
    expect(crearTarea.mutateAsync.mock.calls[0][0].idsEtiquetas).toEqual([1]);
  });

  it('cierra el diálogo solo tras éxito', async () => {
    const crearTarea = mutationStub();
    const onOpenChange = vi.fn();
    renderDialog({ mode: 'create', task: null, crearTarea, onOpenChange });

    await llenarTitulo('Tarea exitosa');
    await llenarFecha('2027-01-01');
    fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('un error conserva el diálogo abierto y lo muestra accesible', async () => {
    const crearTarea = mutationStub({ mutateAsync: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { statusCode: 400 })) });
    const onOpenChange = vi.fn();
    renderDialog({ mode: 'create', task: null, crearTarea, onOpenChange });

    await llenarTitulo('Tarea con error');
    await llenarFecha('2027-01-01');
    fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Revisa los datos ingresados y las relaciones seleccionadas.',
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe('TaskFormDialog — edición', () => {
  afterEach(() => cleanup());

  it('precarga los valores públicos de la tarea', () => {
    const original = tarea({ tituloTarea: 'Tarea existente', descripcionTarea: 'Detalle', prioridad: 'ALTA' });
    renderDialog({ mode: 'edit', task: original });

    expect(screen.getByLabelText('Título')).toHaveValue('Tarea existente');
    expect(screen.getByLabelText('Descripción')).toHaveValue('Detalle');
    expect(screen.getByRole('combobox', { name: 'Prioridad' })).toHaveTextContent('Alta');
  });

  it('payload exacto: solo el campo cambiado viaja al PATCH', async () => {
    const original = tarea({ tituloTarea: 'Original', fechaLimite: '2026-01-01' });
    const editarTarea = mutationStub();
    const onOpenChange = vi.fn();
    renderDialog({ mode: 'edit', task: original, editarTarea, onOpenChange });

    await llenarTitulo('Modificado');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(editarTarea.mutateAsync).toHaveBeenCalledTimes(1));
    expect(editarTarea.mutateAsync).toHaveBeenCalledWith({
      taskId: original.idTarea,
      input: { tituloTarea: 'Modificado' },
    });
  });

  it('campos no tocados quedan omitidos del payload', async () => {
    const original = tarea({ tituloTarea: 'Original', descripcionTarea: 'Algo', tiempoEstimadoHoras: 5 });
    const editarTarea = mutationStub();
    renderDialog({ mode: 'edit', task: original, editarTarea });

    await llenarTitulo('Otro título');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(editarTarea.mutateAsync).toHaveBeenCalledTimes(1));
    const { input } = editarTarea.mutateAsync.mock.calls[0][0];
    expect(input).not.toHaveProperty('descripcionTarea');
    expect(input).not.toHaveProperty('tiempoEstimadoHoras');
  });

  it('fecha histórica sin cambios no bloquea guardar otros campos', async () => {
    const original = tarea({ tituloTarea: 'Vieja', fechaLimite: '2020-01-01' });
    const editarTarea = mutationStub();
    renderDialog({ mode: 'edit', task: original, editarTarea });

    await llenarTitulo('Vieja actualizada');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(editarTarea.mutateAsync).toHaveBeenCalledTimes(1));
    const { input } = editarTarea.mutateAsync.mock.calls[0][0];
    expect(input).not.toHaveProperty('fechaLimite');
    expect(input.tituloTarea).toBe('Vieja actualizada');
  });

  it('asignación sin cambio no llama a asignar/desasignar', async () => {
    const original = tarea({
      tituloTarea: 'Original',
      asignacionActiva: {
        idAsignacion: 1,
        idUsuario: 5,
        fechaAsignacion: '2026-01-01T00:00:00.000Z',
        usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
      },
    });
    const editarTarea = mutationStub();
    const asignarTarea = mutationStub();
    const desasignarTarea = mutationStub();
    renderDialog({ mode: 'edit', task: original, editarTarea, asignarTarea, desasignarTarea });

    await llenarTitulo('Otro título');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(editarTarea.mutateAsync).toHaveBeenCalledTimes(1));
    expect(asignarTarea.mutateAsync).not.toHaveBeenCalled();
    expect(desasignarTarea.mutateAsync).not.toHaveBeenCalled();
  });

  it('nueva asignación llama a asignarTarea con el endpoint real', async () => {
    const original = tarea({ asignacionActiva: null });
    const asignarTarea = mutationStub();
    renderDialog({ mode: 'edit', task: original, asignarTarea });

    const selectAsignado = screen.getByRole('combobox', { name: 'Asignado' });
    fireEvent.keyDown(selectAsignado, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: /Ana Lopez/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(asignarTarea.mutateAsync).toHaveBeenCalledWith({
        taskId: original.idTarea,
        input: { idUsuario: 5 },
      }),
    );
  });

  it('reasignación (usuario A → B) llama a asignarTarea una sola vez, sin desasignar manualmente', async () => {
    const original = tarea({
      idRolProyecto: null,
      asignacionActiva: {
        idAsignacion: 1,
        idUsuario: 5,
        fechaAsignacion: '2026-01-01T00:00:00.000Z',
        usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
      },
    });
    const asignarTarea = mutationStub();
    const desasignarTarea = mutationStub();
    renderDialog({ mode: 'edit', task: original, asignarTarea, desasignarTarea });

    const selectAsignado = screen.getByRole('combobox', { name: 'Asignado' });
    fireEvent.keyDown(selectAsignado, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: /Beto Ruiz/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(asignarTarea.mutateAsync).toHaveBeenCalledWith({ taskId: original.idTarea, input: { idUsuario: 9 } }),
    );
    expect(desasignarTarea.mutateAsync).not.toHaveBeenCalled();
  });

  it('desasignación llama a desasignarTarea', async () => {
    const original = tarea({
      asignacionActiva: {
        idAsignacion: 1,
        idUsuario: 5,
        fechaAsignacion: '2026-01-01T00:00:00.000Z',
        usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
      },
    });
    const desasignarTarea = mutationStub();
    renderDialog({ mode: 'edit', task: original, desasignarTarea });

    const selectAsignado = screen.getByRole('combobox', { name: 'Asignado' });
    fireEvent.keyDown(selectAsignado, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'Sin asignar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(desasignarTarea.mutateAsync).toHaveBeenCalledWith({ taskId: original.idTarea }),
    );
  });

  it('un fallo parcial (falla la asignación) queda visible y no cierra el diálogo', async () => {
    const original = tarea({ asignacionActiva: null });
    const asignarTarea = mutationStub({
      mutateAsync: vi.fn().mockRejectedValue(Object.assign(new Error('conflicto'), { statusCode: 409 })),
    });
    const onOpenChange = vi.fn();
    renderDialog({ mode: 'edit', task: original, asignarTarea, onOpenChange });

    const selectAsignado = screen.getByRole('combobox', { name: 'Asignado' });
    fireEvent.keyDown(selectAsignado, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: /Ana Lopez/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La asignación cambió mientras realizabas la operación',
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('sin cambios de ningún tipo no llama a ninguna mutation y cierra el diálogo', async () => {
    const original = tarea();
    const editarTarea = mutationStub();
    const asignarTarea = mutationStub();
    const desasignarTarea = mutationStub();
    const onOpenChange = vi.fn();
    renderDialog({ mode: 'edit', task: original, editarTarea, asignarTarea, desasignarTarea, onOpenChange });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(editarTarea.mutateAsync).not.toHaveBeenCalled();
    expect(asignarTarea.mutateAsync).not.toHaveBeenCalled();
    expect(desasignarTarea.mutateAsync).not.toHaveBeenCalled();
  });
});

describe('TaskFormDialog — cascada rol → usuario', () => {
  afterEach(() => cleanup());

  it('cambiar de rol limpia el asignado incompatible y muestra un aviso accesible', async () => {
    const original = tarea({
      idRolProyecto: 1,
      asignacionActiva: {
        idAsignacion: 1,
        idUsuario: 5,
        fechaAsignacion: '2026-01-01T00:00:00.000Z',
        usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
      },
    });
    renderDialog({ mode: 'edit', task: original });

    expect(screen.getByRole('combobox', { name: 'Asignado' })).toHaveTextContent(/Ana Lopez/i);

    const selectRol = screen.getByRole('combobox', { name: 'Rol' });
    fireEvent.keyDown(selectRol, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'Frontend' }));

    expect(screen.getByRole('combobox', { name: 'Asignado' })).toHaveTextContent('Sin asignar');
    expect(screen.getByRole('status')).toHaveTextContent(/se limpió el usuario asignado/i);
  });
});

describe('TaskFormDialog — eliminar desde edición', () => {
  afterEach(() => cleanup());

  it('el botón Eliminar tarea delega en onRequestDelete sin ejecutar la eliminación directamente', () => {
    const onRequestDelete = vi.fn();
    const onOpenChange = vi.fn();
    const original = tarea();
    renderDialog({ mode: 'edit', task: original, isLeader: true, onRequestDelete, onOpenChange });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar tarea' }));

    expect(onRequestDelete).toHaveBeenCalledWith(original);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('el botón Eliminar tarea no aparece para un no-líder', () => {
    renderDialog({ mode: 'edit', task: tarea(), isLeader: false, onRequestDelete: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Eliminar tarea' })).not.toBeInTheDocument();
  });
});
