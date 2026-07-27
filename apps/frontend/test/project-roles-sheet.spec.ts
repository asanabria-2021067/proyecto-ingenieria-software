import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/swal', () => ({
  default: {
    fire: vi.fn(),
  },
}));

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

vi.mock('../lib/services/catalogs', () => ({
  getCarreras: vi.fn().mockResolvedValue([{ idCarrera: 3, nombreCarrera: 'Sistemas' }]),
  getHabilidades: vi
    .fn()
    .mockResolvedValue([{ idHabilidad: 7, nombreHabilidad: 'React', categoriaHabilidad: null }]),
}));

import uvgSwal from '@/lib/swal';
import { ProjectRolesSheet } from '../components/projects/project-roles-sheet';
import type { ProjectRoleDTO } from '../lib/services/roles';

function role(overrides: Partial<ProjectRoleDTO> = {}): ProjectRoleDTO {
  return {
    idRolProyecto: 100,
    nombreRol: 'Frontend',
    descripcionRolProyecto: 'Rol de UI',
    idCarreraRequerida: 3,
    carreraRequerida: { idCarrera: 3, nombreCarrera: 'Sistemas' },
    cupos: 3,
    horasSemanalesEstimadas: 8,
    requisitos: [
      { idHabilidad: 7, nombreHabilidad: 'React', nivelMinimo: 'INTERMEDIO', obligatorio: true },
    ],
    participantesActivos: 2,
    cuposDisponibles: 1,
    isMine: false,
    canLeave: false,
    ...overrides,
  };
}

function mutationStub({ mode = 'success', error = null }: { mode?: 'success' | 'error'; error?: unknown } = {}) {
  return {
    mutate: vi.fn((_input: unknown, opts?: { onSuccess?: () => void; onError?: (e: unknown) => void }) => {
      if (mode === 'success') opts?.onSuccess?.();
      else opts?.onError?.(error);
    }),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
  };
}

function renderSheet(overrides: Record<string, unknown> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    roles: [role()],
    crearRol: mutationStub(),
    editarRol: mutationStub(),
    eliminarRol: mutationStub(),
    ...overrides,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(ProjectRolesSheet, props as any),
    ),
  );
  return { ...utils, props };
}

async function elegirOpcion(triggerName: string, optionName: string | RegExp) {
  // Nombre exacto: evita que "Habilidad 1" también matchee "Nivel de la
  // habilidad 1".
  const trigger = screen.getByRole('combobox', { name: triggerName });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name: optionName }));
}

describe('ProjectRolesSheet — gestión completa (Sección 23/5C)', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(uvgSwal.fire).mockClear();
  });

  it('entrada directa CREATE: abre formulario, no lista, y cancelar cierra el Sheet', () => {
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange, intent: { kind: 'create' } });

    expect(screen.getByRole('heading', { name: 'Gestionar roles' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nueva posición' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del rol')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nuevo rol/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Roles existentes')).not.toBeInTheDocument();
    expect(screen.queryByText('Frontend')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar creación de rol' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('entrada directa CREATE: crear exitosamente cierra el Sheet', () => {
    const onOpenChange = vi.fn();
    const crearRol = mutationStub();
    renderSheet({ onOpenChange, crearRol, intent: { kind: 'create' } });

    fireEvent.change(screen.getByLabelText('Nombre del rol'), { target: { value: 'Backend' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear rol' }));

    expect(crearRol.mutate).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(uvgSwal.fire).toHaveBeenCalledWith(
      expect.objectContaining({
        toast: true,
        icon: 'success',
        title: 'Rol creado',
      }),
    );
  });

  it('entrada directa EDIT: abre el rol seleccionado y cancelar cierra el Sheet', () => {
    const onOpenChange = vi.fn();
    renderSheet({
      onOpenChange,
      roles: [
        role({ idRolProyecto: 1, nombreRol: 'Frontend' }),
        role({ idRolProyecto: 2, nombreRol: 'Backend', descripcionRolProyecto: 'API' }),
      ],
      intent: { kind: 'edit', role: role({ idRolProyecto: 2, nombreRol: 'Backend', descripcionRolProyecto: 'API' }) },
    });

    expect(screen.getByRole('heading', { name: 'Gestionar roles' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Editar posición' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del rol')).toHaveValue('Backend');
    expect(screen.getByLabelText('Descripción')).toHaveValue('API');
    expect(screen.queryByText('Frontend')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar edición del rol Backend' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('entrada directa EDIT: guardar exitosamente cierra el Sheet', () => {
    const onOpenChange = vi.fn();
    const editarRol = mutationStub();
    renderSheet({
      onOpenChange,
      editarRol,
      intent: { kind: 'edit', role: role({ idRolProyecto: 2, nombreRol: 'Backend' }) },
    });

    fireEvent.change(screen.getByLabelText('Nombre del rol'), { target: { value: 'Backend v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(editarRol.mutate).toHaveBeenCalledWith(
      { roleId: 2, input: expect.objectContaining({ nombreRol: 'Backend v2' }) },
      expect.anything(),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(uvgSwal.fire).toHaveBeenCalledWith(
      expect.objectContaining({
        toast: true,
        icon: 'success',
        title: 'Cambios guardados',
      }),
    );
  });

  it('entrada MANAGER: abre lista, muestra todos los roles y Nuevo rol', () => {
    renderSheet({
      roles: [
        role({ idRolProyecto: 1, nombreRol: 'Frontend' }),
        role({ idRolProyecto: 2, nombreRol: 'Backend' }),
      ],
      intent: { kind: 'list' },
    });

    expect(screen.getByRole('heading', { name: 'Gestionar roles' })).toBeInTheDocument();
    expect(screen.getByText('Roles existentes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear nuevo rol' })).toBeInTheDocument();
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.getByText('Backend')).toBeInTheDocument();
    expect(screen.getAllByTestId('role-list-card')).toHaveLength(2);
    expect(screen.getAllByText('2/3 ocupados')).toHaveLength(2);
    expect(screen.queryByLabelText('Nombre del rol')).not.toBeInTheDocument();
  });

  it('crear desde MANAGER: cancelar y éxito regresan a LIST sin cerrar Sheet', () => {
    const onOpenChange = vi.fn();
    const crearRol = mutationStub();
    renderSheet({ onOpenChange, roles: [role()], crearRol, intent: { kind: 'list' } });

    fireEvent.click(screen.getByRole('button', { name: 'Crear nuevo rol' }));
    expect(screen.getByRole('heading', { name: 'Nueva posición' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver a la lista de roles' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar creación de rol' }));
    expect(screen.getByText('Roles existentes')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Crear nuevo rol' }));
    fireEvent.change(screen.getByLabelText('Nombre del rol'), { target: { value: 'Backend' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear rol' }));
    expect(crearRol.mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Roles existentes')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('editar desde MANAGER: cancelar y éxito regresan a LIST sin cerrar Sheet', () => {
    const onOpenChange = vi.fn();
    const editarRol = mutationStub();
    renderSheet({ onOpenChange, roles: [role()], editarRol, intent: { kind: 'list' } });

    fireEvent.click(screen.getByRole('button', { name: 'Editar rol Frontend' }));
    expect(screen.getByRole('heading', { name: 'Editar posición' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del rol')).toHaveValue('Frontend');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar edición del rol Frontend' }));
    expect(screen.getByText('Roles existentes')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Editar rol Frontend' }));
    fireEvent.change(screen.getByLabelText('Nombre del rol'), { target: { value: 'Frontend v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(editarRol.mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Roles existentes')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('CREATE muestra la jerarquía visual completa del formulario y no la lista', () => {
    renderSheet({ intent: { kind: 'create' } });

    expect(screen.getByRole('heading', { name: 'Nueva posición' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del rol')).toBeInTheDocument();
    expect(screen.getByLabelText('Descripción')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Carrera o área' })).toBeInTheDocument();
    expect(screen.getByLabelText('Cupos')).toBeInTheDocument();
    expect(screen.getByLabelText('Horas / semana')).toBeInTheDocument();
    expect(screen.getByText('Habilidades requeridas')).toBeInTheDocument();
    expect(screen.getByText('Sin habilidades requeridas.')).toBeInTheDocument();
    expect(screen.queryByText('Roles existentes')).not.toBeInTheDocument();
  });

  it('EDIT muestra datos precargados, ocupación y habilidades editables sin lista', () => {
    renderSheet({ intent: { kind: 'edit', role: role() } });

    expect(screen.getByRole('heading', { name: 'Editar posición' })).toBeInTheDocument();
    expect(screen.getByText('2/3 ocupados')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del rol')).toHaveValue('Frontend');
    expect(screen.getByText('2 activo(s); no puedes bajar de ese número.')).toBeInTheDocument();
    expect(screen.getByTestId('role-skill-row')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Habilidad 1' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Nivel de la habilidad 1' })).toBeInTheDocument();
    expect(screen.getByLabelText('Habilidad 1 obligatoria')).toBeChecked();
    expect(screen.queryByText('Roles existentes')).not.toBeInTheDocument();
  });

  it('crea un rol con carrera, habilidad y nivel usando los catálogos reales', async () => {
    const crearRol = mutationStub();
    renderSheet({ roles: [], crearRol });

    fireEvent.click(screen.getByRole('button', { name: /nuevo rol/i }));
    fireEvent.change(screen.getByLabelText('Nombre del rol'), { target: { value: 'Backend' } });

    await elegirOpcion('Carrera o área', 'Sistemas');

    fireEvent.click(screen.getByRole('button', { name: /agregar habilidad/i }));
    await elegirOpcion('Habilidad 1', 'React');
    await elegirOpcion('Nivel de la habilidad 1', 'Intermedio');

    fireEvent.click(screen.getByRole('button', { name: 'Crear rol' }));

    expect(crearRol.mutate).toHaveBeenCalledTimes(1);
    const input = crearRol.mutate.mock.calls[0][0];
    expect(input).toMatchObject({
      nombreRol: 'Backend',
      idCarreraRequerida: 3,
      requisitos: [{ idHabilidad: 7, nivelMinimo: 'INTERMEDIO', obligatorio: false }],
    });
  });

  it('precarga los valores reales al editar (nombre, descripción, cupos, habilidad existente)', () => {
    renderSheet({ roles: [role()] });

    fireEvent.click(screen.getByRole('button', { name: /editar rol frontend/i }));

    expect(screen.getByLabelText('Nombre del rol')).toHaveValue('Frontend');
    expect(screen.getByLabelText('Descripción')).toHaveValue('Rol de UI');
    expect(screen.getByLabelText('Cupos')).toHaveValue(3);
    expect(screen.getByLabelText('Horas / semana')).toHaveValue(8);
    // La habilidad existente se precarga como una fila editable (su control de
    // quitar demuestra que el requisito llegó al formulario).
    expect(screen.getByRole('button', { name: /quitar habilidad 1/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Carrera o área' })).toBeInTheDocument();
  });

  it('bloquea reducir cupos por debajo de los participantes activos (no envía)', () => {
    const editarRol = mutationStub();
    renderSheet({ roles: [role({ participantesActivos: 2 })], editarRol });

    fireEvent.click(screen.getByRole('button', { name: /editar rol frontend/i }));
    fireEvent.change(screen.getByLabelText('Cupos'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/no puedes reducir los cupos/i);
    expect(editarRol.mutate).not.toHaveBeenCalled();
  });

  it('un error del backend conserva el formulario y sus valores', () => {
    const crearRol = mutationStub({ mode: 'error', error: { statusCode: 400, message: 'Nombre inválido' } });
    renderSheet({ roles: [], crearRol });

    fireEvent.click(screen.getByRole('button', { name: /nuevo rol/i }));
    fireEvent.change(screen.getByLabelText('Nombre del rol'), { target: { value: 'Backend' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear rol' }));

    // El formulario sigue abierto con el valor escrito y muestra el error real.
    expect(screen.getByLabelText('Nombre del rol')).toHaveValue('Backend');
    expect(screen.getByRole('alert')).toHaveTextContent(/nombre inválido/i);
  });

  it('un error en entrada directa conserva el formulario abierto y no cierra', () => {
    const onOpenChange = vi.fn();
    const crearRol = mutationStub({ mode: 'error', error: { statusCode: 400, message: 'Nombre inválido' } });
    renderSheet({ onOpenChange, crearRol, intent: { kind: 'create' } });

    fireEvent.change(screen.getByLabelText('Nombre del rol'), { target: { value: 'Backend' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear rol' }));

    expect(screen.getByLabelText('Nombre del rol')).toHaveValue('Backend');
    expect(screen.getByRole('alert')).toHaveTextContent(/nombre inválido/i);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('eliminar un rol pide confirmación y llama a eliminarRol', async () => {
    const eliminarRol = mutationStub();
    renderSheet({ roles: [role()], eliminarRol });

    fireEvent.click(screen.getByRole('button', { name: /eliminar rol frontend/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar rol' }));

    expect(eliminarRol.mutate).toHaveBeenCalledWith({ roleId: 100 }, expect.anything());
  });

  it('cancelar eliminación mantiene el Sheet abierto y no llama mutation', async () => {
    const eliminarRol = mutationStub();
    renderSheet({ roles: [role()], eliminarRol, intent: { kind: 'list' } });

    fireEvent.click(screen.getByRole('button', { name: /eliminar rol frontend/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(eliminarRol.mutate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Roles existentes')).toBeInTheDocument());
  });
});
