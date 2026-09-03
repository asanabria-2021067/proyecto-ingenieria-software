import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/swal', () => ({
  default: {
    fire: vi.fn(),
  },
}));

import uvgSwal from '@/lib/swal';
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

function cleanupDialog() {
  cleanup();
  vi.mocked(uvgSwal.fire).mockClear();
}

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
    puedeGestionarTarea: true,
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
  const input = screen.getByLabelText('Título de la tarea', { exact: false });
  fireEvent.change(input, { target: { value: texto } });
}

async function llenarFecha(fecha: string) {
  const input = screen.getByLabelText('Fecha límite', { exact: false });
  fireEvent.change(input, { target: { value: fecha } });
}

/** Abre el multiselect de etiquetas, alterna una opción por nombre y lo cierra. */
async function alternarEtiqueta(nombre: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: 'Seleccionar etiquetas' }));
  fireEvent.click(await screen.findByRole('option', { name: nombre }));
  // Cierra el popover (segundo click en el disparador) para no interferir con el submit.
  fireEvent.click(screen.getByRole('button', { name: 'Seleccionar etiquetas' }));
}

describe('TaskFormDialog — reutilización', () => {
  afterEach(() => cleanupDialog());

  it('el mismo componente muestra el título "Crear nueva tarea" en modo creación', () => {
    renderDialog({ mode: 'create', task: null });
    expect(screen.getByText('Crear nueva tarea')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear tarea' })).toBeInTheDocument();
  });

  it('el mismo componente muestra el título "Editar tarea" en modo edición', () => {
    renderDialog({ mode: 'edit', task: tarea({ tituloTarea: 'Mi tarea' }) });
    expect(screen.getByText('Editar tarea')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios de la tarea' })).toBeInTheDocument();
  });

  it('no existen dos formularios: los mismos campos aparecen en ambos modos', () => {
    const { unmount } = renderDialog({ mode: 'create', task: null });
    expect(screen.getByLabelText('Título de la tarea', { exact: false })).toBeInTheDocument();
    unmount();

    renderDialog({ mode: 'edit', task: tarea() });
    expect(screen.getByLabelText('Título de la tarea', { exact: false })).toBeInTheDocument();
  });

  it('muestra las tres secciones numeradas en ambos modos', () => {
    const { unmount } = renderDialog({ mode: 'create', task: null });
    expect(screen.getByText('Información básica')).toBeInTheDocument();
    expect(screen.getByText('Organización')).toBeInTheDocument();
    expect(screen.getByText('Etiquetas')).toBeInTheDocument();
    unmount();

    renderDialog({ mode: 'edit', task: tarea() });
    expect(screen.getByText('Información básica')).toBeInTheDocument();
    expect(screen.getByText('Organización')).toBeInTheDocument();
    expect(screen.getByText('Etiquetas')).toBeInTheDocument();
  });

  it('no existe un selector de estado dentro del formulario', () => {
    renderDialog({ mode: 'edit', task: tarea() });
    expect(screen.queryByLabelText(/estado/i)).not.toBeInTheDocument();
  });
});

describe('TaskFormDialog — creación', () => {
  afterEach(() => cleanupDialog());

  it('valores iniciales vacíos en creación', () => {
    renderDialog({ mode: 'create', task: null });
    expect(screen.getByLabelText('Título de la tarea', { exact: false })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Seleccionar prioridad' })).toHaveTextContent('Media');
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
    expect(uvgSwal.fire).toHaveBeenCalledWith(
      expect.objectContaining({
        toast: true,
        icon: 'success',
        title: 'Tarea creada',
      }),
    );
  });

  it('incluye asignado inicial cuando se seleccionó uno', async () => {
    const crearTarea = mutationStub();
    renderDialog({ mode: 'create', task: null, crearTarea });

    await llenarTitulo('Con asignado');
    await llenarFecha('2027-01-01');

    const selectAsignado = screen.getByRole('combobox', { name: 'Seleccionar usuario asignado' });
    fireEvent.keyDown(selectAsignado, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: /Ana Lopez/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }));
    await waitFor(() => expect(crearTarea.mutateAsync).toHaveBeenCalledTimes(1));
    expect(crearTarea.mutateAsync.mock.calls[0][0].idUsuarioAsignado).toBe(5);
  });

  it('deduplica por idUsuario en el selector de asignado para una tarea sin rol (Sección 7)', async () => {
    renderDialog({
      mode: 'create',
      task: null,
      members: [
        miembro({ idUsuario: 5, idRolProyecto: 1, nombre: 'Ana', apellido: 'Lopez' }),
        // Mismo usuario en un segundo rol: no debe duplicarse en el selector.
        miembro({ idUsuario: 5, idRolProyecto: 2, nombre: 'Ana', apellido: 'Lopez' }),
        miembro({ idUsuario: 9, idRolProyecto: 2, nombre: 'Beto', apellido: 'Ruiz' }),
      ],
    });

    const selectAsignado = screen.getByRole('combobox', { name: 'Seleccionar usuario asignado' });
    fireEvent.keyDown(selectAsignado, { key: 'Enter' });

    expect(await screen.findAllByRole('option', { name: /Ana Lopez/i })).toHaveLength(1);
  });

  it('solo los participantes activos son candidatos: un usuario ausente de members (líder sin rol) no aparece', async () => {
    renderDialog({
      mode: 'create',
      task: null,
      members: [miembro({ idUsuario: 5, idRolProyecto: 1, nombre: 'Ana', apellido: 'Lopez' })],
    });

    const selectAsignado = screen.getByRole('combobox', { name: 'Seleccionar usuario asignado' });
    fireEvent.keyDown(selectAsignado, { key: 'Enter' });

    expect(await screen.findByRole('option', { name: /Ana Lopez/i })).toBeInTheDocument();
    // El líder sin participación no está en `members`, por lo que no es candidato.
    expect(screen.queryByRole('option', { name: /Lía Der/i })).not.toBeInTheDocument();
  });

  it('incluye etiquetas seleccionadas', async () => {
    const crearTarea = mutationStub();
    renderDialog({ mode: 'create', task: null, crearTarea });

    await llenarTitulo('Con etiqueta');
    await llenarFecha('2027-01-01');
    await alternarEtiqueta(/Urgente/i);

    fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }));
    await waitFor(() => expect(crearTarea.mutateAsync).toHaveBeenCalledTimes(1));
    expect(crearTarea.mutateAsync.mock.calls[0][0].idsEtiquetas).toEqual([1]);
  });

  it('el selector de etiquetas no es una lista permanente de checkboxes', () => {
    renderDialog({ mode: 'create', task: null });
    // Sección 27/28: el control compacto reemplaza la cuadrícula de checkboxes.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seleccionar etiquetas' })).toBeInTheDocument();
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
  afterEach(() => cleanupDialog());

  it('precarga los valores públicos de la tarea', () => {
    const original = tarea({ tituloTarea: 'Tarea existente', descripcionTarea: 'Detalle', prioridad: 'ALTA' });
    renderDialog({ mode: 'edit', task: original });

    expect(screen.getByLabelText('Título de la tarea', { exact: false })).toHaveValue('Tarea existente');
    expect(screen.getByLabelText('Descripción')).toHaveValue('Detalle');
    expect(screen.getByRole('combobox', { name: 'Seleccionar prioridad' })).toHaveTextContent('Alta');
  });

  it('payload exacto: solo el campo cambiado viaja al PATCH', async () => {
    const original = tarea({ tituloTarea: 'Original', fechaLimite: '2026-01-01' });
    const editarTarea = mutationStub();
    const onOpenChange = vi.fn();
    renderDialog({ mode: 'edit', task: original, editarTarea, onOpenChange });

    await llenarTitulo('Modificado');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios de la tarea' }));

    await waitFor(() => expect(editarTarea.mutateAsync).toHaveBeenCalledTimes(1));
    expect(editarTarea.mutateAsync).toHaveBeenCalledWith({
      taskId: original.idTarea,
      input: { tituloTarea: 'Modificado' },
    });
    expect(uvgSwal.fire).toHaveBeenCalledWith(
      expect.objectContaining({
        toast: true,
        icon: 'success',
        title: 'Cambios guardados',
      }),
    );
  });

  it('campos no tocados quedan omitidos del payload', async () => {
    const original = tarea({ tituloTarea: 'Original', descripcionTarea: 'Algo', tiempoEstimadoHoras: 5 });
    const editarTarea = mutationStub();
    renderDialog({ mode: 'edit', task: original, editarTarea });

    await llenarTitulo('Otro título');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios de la tarea' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios de la tarea' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios de la tarea' }));

    await waitFor(() => expect(editarTarea.mutateAsync).toHaveBeenCalledTimes(1));
    expect(asignarTarea.mutateAsync).not.toHaveBeenCalled();
    expect(desasignarTarea.mutateAsync).not.toHaveBeenCalled();
  });

  it('nueva asignación llama a asignarTarea con el endpoint real', async () => {
    const original = tarea({ asignacionActiva: null });
    const asignarTarea = mutationStub();
    renderDialog({ mode: 'edit', task: original, asignarTarea });

    const selectAsignado = screen.getByRole('combobox', { name: 'Seleccionar usuario asignado' });
    fireEvent.keyDown(selectAsignado, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: /Ana Lopez/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios de la tarea' }));
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

    const selectAsignado = screen.getByRole('combobox', { name: 'Seleccionar usuario asignado' });
    fireEvent.keyDown(selectAsignado, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: /Beto Ruiz/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios de la tarea' }));
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

    const selectAsignado = screen.getByRole('combobox', { name: 'Seleccionar usuario asignado' });
    fireEvent.keyDown(selectAsignado, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'Sin asignar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios de la tarea' }));
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

    const selectAsignado = screen.getByRole('combobox', { name: 'Seleccionar usuario asignado' });
    fireEvent.keyDown(selectAsignado, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: /Ana Lopez/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios de la tarea' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios de la tarea' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(editarTarea.mutateAsync).not.toHaveBeenCalled();
    expect(asignarTarea.mutateAsync).not.toHaveBeenCalled();
    expect(desasignarTarea.mutateAsync).not.toHaveBeenCalled();
  });
});

describe('TaskFormDialog — cascada rol → usuario', () => {
  afterEach(() => cleanupDialog());

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

    expect(screen.getByRole('combobox', { name: 'Seleccionar usuario asignado' })).toHaveTextContent(/Ana Lopez/i);

    const selectRol = screen.getByRole('combobox', { name: 'Seleccionar rol del proyecto' });
    fireEvent.keyDown(selectRol, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'Frontend' }));

    expect(screen.getByRole('combobox', { name: 'Seleccionar usuario asignado' })).toHaveTextContent('Sin asignar');
    expect(screen.getByRole('status')).toHaveTextContent(/se limpió el usuario asignado/i);
  });
});

describe('TaskFormDialog — eliminar desde edición', () => {
  afterEach(() => cleanupDialog());

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

  it('en creación no se muestran acciones destructivas (ni Eliminar ni Desasignar)', () => {
    renderDialog({ mode: 'create', task: null });
    expect(screen.queryByRole('button', { name: 'Eliminar tarea' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desasignar tarea' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear tarea' })).toBeInTheDocument();
  });
});

describe('TaskFormDialog — gestionar etiquetas', () => {
  afterEach(() => cleanupDialog());

  it('el botón "Gestionar etiquetas" invoca onManageLabels y NO cierra el diálogo (conserva el borrador)', async () => {
    const onManageLabels = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ mode: 'create', task: null, onManageLabels, onOpenChange });

    await llenarTitulo('Borrador vivo');
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar etiquetas del proyecto' }));

    expect(onManageLabels).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // El borrador permanece: el título escrito sigue presente.
    expect(screen.getByLabelText('Título de la tarea', { exact: false })).toHaveValue('Borrador vivo');
  });

  it('sin onManageLabels no se muestra el botón "Gestionar etiquetas"', () => {
    renderDialog({ mode: 'create', task: null });
    expect(screen.queryByRole('button', { name: 'Gestionar etiquetas del proyecto' })).not.toBeInTheDocument();
  });
});

describe('TaskFormDialog — desasignar desde el pie', () => {
  afterEach(() => cleanupDialog());

  const asignada = () =>
    tarea({
      asignacionActiva: {
        idAsignacion: 1,
        idUsuario: 5,
        fechaAsignacion: '2026-01-01T00:00:00.000Z',
        usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
      },
    });

  it('aparece solo con asignación activa y desaparece tras usarlo', () => {
    renderDialog({ mode: 'edit', task: asignada(), isLeader: true });
    const boton = screen.getByRole('button', { name: 'Desasignar tarea' });
    fireEvent.click(boton);
    expect(screen.getByRole('combobox', { name: 'Seleccionar usuario asignado' })).toHaveTextContent('Sin asignar');
    expect(screen.queryByRole('button', { name: 'Desasignar tarea' })).not.toBeInTheDocument();
  });

  it('no aparece cuando la tarea ya está sin asignar', () => {
    renderDialog({ mode: 'edit', task: tarea({ asignacionActiva: null }), isLeader: true });
    expect(screen.queryByRole('button', { name: 'Desasignar tarea' })).not.toBeInTheDocument();
  });

  it('al guardar tras desasignar se llama a desasignarTarea', async () => {
    const desasignarTarea = mutationStub();
    renderDialog({ mode: 'edit', task: asignada(), isLeader: true, desasignarTarea });

    fireEvent.click(screen.getByRole('button', { name: 'Desasignar tarea' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios de la tarea' }));

    await waitFor(() =>
      expect(desasignarTarea.mutateAsync).toHaveBeenCalledWith({ taskId: 1 }),
    );
  });

  it('aparece para un colaborador del mismo rol sin ser líder (puedeGestionarTarea sin isLeader)', () => {
    renderDialog({ mode: 'edit', task: asignada(), isLeader: false, puedeGestionarTarea: true });
    expect(screen.getByRole('button', { name: 'Desasignar tarea' })).toBeInTheDocument();
  });

  it('no aparece cuando ni es líder ni comparte el rol de la tarea (puedeGestionarTarea: false)', () => {
    renderDialog({ mode: 'edit', task: asignada(), isLeader: false, puedeGestionarTarea: false });
    expect(screen.queryByRole('button', { name: 'Desasignar tarea' })).not.toBeInTheDocument();
  });
});
