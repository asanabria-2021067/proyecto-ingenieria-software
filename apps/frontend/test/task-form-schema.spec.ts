import { describe, expect, it } from 'vitest';
import {
  SIN_ASIGNAR,
  SIN_HITO,
  SIN_ROL,
  buildCreatePayload,
  buildTaskFormSchema,
  buildUpdatePayload,
  defaultTaskFormValues,
  planAssignment,
  planTaskEditSteps,
  type TaskFormValues,
} from '../components/projects/task-form.schema';
import type { MiembroProyecto } from '../hooks/use-project-members';
import type { TareaPublicaDTO } from '../lib/types/tasks';

const HOY = new Date('2026-06-15T12:00:00');

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

function valores(overrides: Partial<TaskFormValues> = {}): TaskFormValues {
  return {
    tituloTarea: 'Implementar login',
    descripcionTarea: '',
    prioridad: 'MEDIA',
    fechaLimite: '2026-07-01',
    tiempoEstimadoHoras: '',
    horasReales: '',
    idRolProyecto: SIN_ROL,
    idUsuarioAsignado: SIN_ASIGNAR,
    idHito: SIN_HITO,
    idsEtiquetas: [],
    ...overrides,
  };
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
    fechaLimite: '2026-07-01',
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
    horasReales: null,
    asignacionActiva: null,
    rolProyecto: null,
    hito: null,
    etiquetas: [],
    cantidadComentarios: 0,
    ...overrides,
  };
}

function schema(overrides: Partial<Parameters<typeof buildTaskFormSchema>[0]> = {}) {
  return buildTaskFormSchema({ miembros: [], ahora: HOY, ...overrides });
}

describe('buildTaskFormSchema — validación', () => {
  it('acepta un conjunto de valores válido en creación', () => {
    const result = schema().safeParse(valores());
    expect(result.success).toBe(true);
  });

  it('acepta un conjunto de valores válido en edición', () => {
    const result = schema({ fechaOriginal: '2026-07-01' }).safeParse(valores());
    expect(result.success).toBe(true);
  });

  it('rechaza título vacío', () => {
    const result = schema().safeParse(valores({ tituloTarea: '' }));
    expect(result.success).toBe(false);
  });

  it('rechaza título compuesto solo por espacios', () => {
    const result = schema().safeParse(valores({ tituloTarea: '    ' }));
    expect(result.success).toBe(false);
  });

  it('rechaza título que excede 150 caracteres', () => {
    const result = schema().safeParse(valores({ tituloTarea: 'a'.repeat(151) }));
    expect(result.success).toBe(false);
  });

  it('acepta descripción omitida (cadena vacía)', () => {
    const result = schema().safeParse(valores({ descripcionTarea: '' }));
    expect(result.success).toBe(true);
  });

  it('rechaza descripción que excede 5000 caracteres', () => {
    const result = schema().safeParse(valores({ descripcionTarea: 'a'.repeat(5001) }));
    expect(result.success).toBe(false);
  });

  it('acepta las tres prioridades válidas', () => {
    for (const prioridad of ['ALTA', 'MEDIA', 'BAJA'] as const) {
      expect(schema().safeParse(valores({ prioridad })).success).toBe(true);
    }
  });

  it('rechaza una prioridad inválida', () => {
    const result = schema().safeParse(valores({ prioridad: 'URGENTE' as any }));
    expect(result.success).toBe(false);
  });

  it('acepta una fecha futura válida', () => {
    const result = schema().safeParse(valores({ fechaLimite: '2026-06-16' }));
    expect(result.success).toBe(true);
  });

  it('rechaza una fecha inválida (formato incorrecto)', () => {
    const result = schema().safeParse(valores({ fechaLimite: '16/06/2026' }));
    expect(result.success).toBe(false);
  });

  it('rechaza el día de hoy (debe ser estrictamente posterior)', () => {
    const result = schema().safeParse(valores({ fechaLimite: '2026-06-15' }));
    expect(result.success).toBe(false);
  });

  it('rechaza una fecha vencida nueva (elegida por el usuario)', () => {
    const result = schema({ fechaOriginal: '2026-05-01' }).safeParse(
      valores({ fechaLimite: '2026-05-02' }),
    );
    expect(result.success).toBe(false);
  });

  it('acepta una fecha vencida original sin cambios (edición)', () => {
    const result = schema({ fechaOriginal: '2026-01-01' }).safeParse(
      valores({ fechaLimite: '2026-01-01' }),
    );
    expect(result.success).toBe(true);
  });

  it('acepta tiempo estimado entero dentro de rango', () => {
    expect(schema().safeParse(valores({ tiempoEstimadoHoras: '8' })).success).toBe(true);
  });

  it('acepta tiempo estimado vacío (omitido)', () => {
    expect(schema().safeParse(valores({ tiempoEstimadoHoras: '' })).success).toBe(true);
  });

  it('rechaza tiempo estimado cero', () => {
    expect(schema().safeParse(valores({ tiempoEstimadoHoras: '0' })).success).toBe(false);
  });

  it('rechaza tiempo estimado negativo', () => {
    expect(schema().safeParse(valores({ tiempoEstimadoHoras: '-1' })).success).toBe(false);
  });

  it('rechaza tiempo estimado decimal', () => {
    expect(schema().safeParse(valores({ tiempoEstimadoHoras: '2.5' })).success).toBe(false);
  });

  it('rechaza tiempo estimado por encima de 1000', () => {
    expect(schema().safeParse(valores({ tiempoEstimadoHoras: '1001' })).success).toBe(false);
  });

  it('acepta horas reales dentro de rango con decimales', () => {
    expect(schema().safeParse(valores({ horasReales: '7.5' })).success).toBe(true);
  });

  it('acepta horas reales vacío (omitido)', () => {
    expect(schema().safeParse(valores({ horasReales: '' })).success).toBe(true);
  });

  it('acepta horas reales en 0', () => {
    expect(schema().safeParse(valores({ horasReales: '0' })).success).toBe(true);
  });

  it('rechaza horas reales negativo', () => {
    expect(schema().safeParse(valores({ horasReales: '-1' })).success).toBe(false);
  });

  it('rechaza horas reales con más de 2 decimales', () => {
    expect(schema().safeParse(valores({ horasReales: '1.234' })).success).toBe(false);
  });

  it('rechaza horas reales por encima de 1000', () => {
    expect(schema().safeParse(valores({ horasReales: '1001' })).success).toBe(false);
  });

  it('acepta un rol válido (sin restringir por miembros)', () => {
    const result = schema().safeParse(valores({ idRolProyecto: '5' }));
    expect(result.success).toBe(true);
  });

  it('acepta un asignado compatible con el rol elegido', () => {
    const result = schema({ miembros: [miembro({ idUsuario: 7, idRolProyecto: 3 })] }).safeParse(
      valores({ idRolProyecto: '3', idUsuarioAsignado: '7' }),
    );
    expect(result.success).toBe(true);
  });

  it('rechaza un asignado incompatible con el rol elegido', () => {
    const result = schema({ miembros: [miembro({ idUsuario: 7, idRolProyecto: 3 })] }).safeParse(
      valores({ idRolProyecto: '4', idUsuarioAsignado: '7' }),
    );
    expect(result.success).toBe(false);
  });

  it('acepta un hito válido', () => {
    expect(schema().safeParse(valores({ idHito: '9' })).success).toBe(true);
  });

  it('rechaza etiquetas duplicadas', () => {
    const result = schema().safeParse(valores({ idsEtiquetas: [1, 2, 1] }));
    expect(result.success).toBe(false);
  });

  it('acepta etiquetas deduplicadas', () => {
    const result = schema().safeParse(valores({ idsEtiquetas: [1, 2, 3] }));
    expect(result.success).toBe(true);
  });

  it('rechaza IDs de etiqueta inválidos (no positivos)', () => {
    const result = schema().safeParse(valores({ idsEtiquetas: [0, -1] as any }));
    expect(result.success).toBe(false);
  });
});

describe('defaultTaskFormValues', () => {
  it('produce valores vacíos en modo creación (task null)', () => {
    const v = defaultTaskFormValues(null);
    expect(v.tituloTarea).toBe('');
    expect(v.prioridad).toBe('MEDIA');
    expect(v.idRolProyecto).toBe(SIN_ROL);
    expect(v.idUsuarioAsignado).toBe(SIN_ASIGNAR);
    expect(v.idHito).toBe(SIN_HITO);
    expect(v.idsEtiquetas).toEqual([]);
  });

  it('precarga valores públicos reales en modo edición', () => {
    const original = tarea({
      idRolProyecto: 2,
      idHito: 3,
      tiempoEstimadoHoras: 8,
      etiquetas: [{ idEtiqueta: 1, nombreEtiqueta: 'A', nombreNormalizado: 'a', color: '#FFFFFF' }],
      asignacionActiva: {
        idAsignacion: 1,
        idUsuario: 5,
        fechaAsignacion: '2026-01-01T00:00:00.000Z',
        usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
      },
    });
    const v = defaultTaskFormValues(original);
    expect(v.idRolProyecto).toBe('2');
    expect(v.idHito).toBe('3');
    expect(v.idUsuarioAsignado).toBe('5');
    expect(v.tiempoEstimadoHoras).toBe('8');
    expect(v.idsEtiquetas).toEqual([1]);
  });

  it('ignora asignaciones históricas: solo precarga la activa', () => {
    // mapTarea del backend ya filtra desasignadaEn: null — asignacionActiva
    // solo puede ser la vigente o null; no hay forma de que este DTO
    // exponga una asignación histórica.
    const v = defaultTaskFormValues(tarea({ asignacionActiva: null }));
    expect(v.idUsuarioAsignado).toBe(SIN_ASIGNAR);
  });
});

describe('buildCreatePayload', () => {
  it('nunca incluye projectId ni campos internos', () => {
    const payload = buildCreatePayload(valores()) as unknown as Record<string, unknown>;
    expect(payload.idProyecto).toBeUndefined();
    expect(payload.creadaPor).toBeUndefined();
    expect(payload.eliminadoEn).toBeUndefined();
  });

  it('omite rol/hito/asignado/etiquetas cuando están en su valor "sin"', () => {
    const payload = buildCreatePayload(valores());
    expect(payload).not.toHaveProperty('idRolProyecto');
    expect(payload).not.toHaveProperty('idHito');
    expect(payload).not.toHaveProperty('idUsuarioAsignado');
    expect(payload).not.toHaveProperty('idsEtiquetas');
  });

  it('incluye asignado inicial cuando se seleccionó uno', () => {
    const payload = buildCreatePayload(valores({ idUsuarioAsignado: '9' }));
    expect(payload.idUsuarioAsignado).toBe(9);
  });

  it('incluye etiquetas ordenadas de forma determinista', () => {
    const payload = buildCreatePayload(valores({ idsEtiquetas: [3, 1, 2] }));
    expect(payload.idsEtiquetas).toEqual([1, 2, 3]);
  });

  it('omite descripción vacía y tiempo estimado vacío', () => {
    const payload = buildCreatePayload(valores({ descripcionTarea: '   ', tiempoEstimadoHoras: '' }));
    expect(payload).not.toHaveProperty('descripcionTarea');
    expect(payload).not.toHaveProperty('tiempoEstimadoHoras');
  });
});

describe('buildUpdatePayload — payload por diferencia', () => {
  it('objeto vacío cuando nada cambió', () => {
    const original = tarea();
    const payload = buildUpdatePayload(original, defaultTaskFormValues(original));
    expect(payload).toEqual({});
  });

  it('nunca incluye estadoTarea (UpdateTaskDto no lo admite)', () => {
    const original = tarea();
    const payload = buildUpdatePayload(original, valores({ tituloTarea: 'Nuevo título' })) as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty('estadoTarea');
  });

  it('omite la fecha cuando no cambió respecto a la original', () => {
    const original = tarea({ fechaLimite: '2026-07-01' });
    const payload = buildUpdatePayload(original, defaultTaskFormValues(original));
    expect(payload).not.toHaveProperty('fechaLimite');
  });

  it('incluye la fecha cuando sí cambió', () => {
    const original = tarea({ fechaLimite: '2026-07-01' });
    const payload = buildUpdatePayload(original, valores({ fechaLimite: '2026-08-01' }));
    expect(payload.fechaLimite).toBe('2026-08-01');
  });

  it('idHito/idRolProyecto se envían como null explícito al retirarse', () => {
    const original = tarea({ idHito: 3, idRolProyecto: 2 });
    const payload = buildUpdatePayload(
      original,
      defaultTaskFormValues(original) && { ...defaultTaskFormValues(original), idHito: SIN_HITO, idRolProyecto: SIN_ROL },
    );
    expect(payload.idHito).toBeNull();
    expect(payload.idRolProyecto).toBeNull();
  });

  it('recalcula etiquetas cuando el conjunto cambia', () => {
    const original = tarea({
      etiquetas: [{ idEtiqueta: 1, nombreEtiqueta: 'A', nombreNormalizado: 'a', color: '#fff' }],
    });
    const payload = buildUpdatePayload(original, { ...defaultTaskFormValues(original), idsEtiquetas: [1, 2] });
    expect(payload.idsEtiquetas).toEqual([1, 2]);
  });

  it('omite etiquetas cuando el conjunto no cambió (mismo orden distinto)', () => {
    const original = tarea({
      etiquetas: [
        { idEtiqueta: 2, nombreEtiqueta: 'B', nombreNormalizado: 'b', color: '#fff' },
        { idEtiqueta: 1, nombreEtiqueta: 'A', nombreNormalizado: 'a', color: '#fff' },
      ],
    });
    const payload = buildUpdatePayload(original, { ...defaultTaskFormValues(original), idsEtiquetas: [1, 2] });
    expect(payload).not.toHaveProperty('idsEtiquetas');
  });

  it('no envía tiempoEstimadoHoras como null al vaciarse (limitación real del contrato)', () => {
    const original = tarea({ tiempoEstimadoHoras: 8 });
    const payload = buildUpdatePayload(original, { ...defaultTaskFormValues(original), tiempoEstimadoHoras: '' });
    expect(payload).not.toHaveProperty('tiempoEstimadoHoras');
  });

  it('incluye horasReales cuando cambia', () => {
    const original = tarea({ horasReales: null });
    const payload = buildUpdatePayload(original, { ...defaultTaskFormValues(original), horasReales: '7.5' });
    expect(payload.horasReales).toBe(7.5);
  });

  it('omite horasReales cuando no cambió', () => {
    const original = tarea({ horasReales: 7.5 });
    const payload = buildUpdatePayload(original, defaultTaskFormValues(original));
    expect(payload).not.toHaveProperty('horasReales');
  });

  it('no envía horasReales como null al vaciarse (misma limitación que tiempoEstimadoHoras)', () => {
    const original = tarea({ horasReales: 7.5 });
    const payload = buildUpdatePayload(original, { ...defaultTaskFormValues(original), horasReales: '' });
    expect(payload).not.toHaveProperty('horasReales');
  });
});

describe('planAssignment', () => {
  it('sin cambios de asignación → none', () => {
    const original = tarea({
      asignacionActiva: {
        idAsignacion: 1,
        idUsuario: 5,
        fechaAsignacion: '2026-01-01T00:00:00.000Z',
        usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
      },
    });
    expect(planAssignment(original, defaultTaskFormValues(original))).toEqual({ type: 'none' });
  });

  it('asignado actual → sin asignar', () => {
    const original = tarea({
      asignacionActiva: {
        idAsignacion: 1,
        idUsuario: 5,
        fechaAsignacion: '2026-01-01T00:00:00.000Z',
        usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
      },
    });
    const plan = planAssignment(original, { ...defaultTaskFormValues(original), idUsuarioAsignado: SIN_ASIGNAR });
    expect(plan).toEqual({ type: 'unassign' });
  });

  it('sin asignar → usuario B', () => {
    const original = tarea({ asignacionActiva: null });
    const plan = planAssignment(original, { ...defaultTaskFormValues(original), idUsuarioAsignado: '8' });
    expect(plan).toEqual({ type: 'assign', idUsuario: 8 });
  });

  it('usuario A → usuario B (reasignación)', () => {
    const original = tarea({
      asignacionActiva: {
        idAsignacion: 1,
        idUsuario: 5,
        fechaAsignacion: '2026-01-01T00:00:00.000Z',
        usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
      },
    });
    const plan = planAssignment(original, { ...defaultTaskFormValues(original), idUsuarioAsignado: '8' });
    expect(plan).toEqual({ type: 'assign', idUsuario: 8 });
  });
});

describe('planTaskEditSteps — secuencia de operaciones (Tarea 38, sección 26)', () => {
  it('sin cambios de campos ni asignación produce cero pasos', () => {
    const original = tarea();
    expect(planTaskEditSteps(original, defaultTaskFormValues(original))).toEqual([]);
  });

  it('solo cambia un campo simple: un único paso "update"', () => {
    const original = tarea();
    const steps = planTaskEditSteps(original, { ...defaultTaskFormValues(original), tituloTarea: 'Nuevo' });
    expect(steps).toEqual([{ kind: 'update', payload: { tituloTarea: 'Nuevo' } }]);
  });

  it('solo cambia la asignación (sin rol): único paso "assign", sin "update"', () => {
    const original = tarea({ asignacionActiva: null });
    const steps = planTaskEditSteps(original, { ...defaultTaskFormValues(original), idUsuarioAsignado: '9' });
    expect(steps).toEqual([{ kind: 'assign', idUsuario: 9 }]);
  });

  it('desasignar sin cambio de rol: único paso "unassign"', () => {
    const original = tarea({
      asignacionActiva: {
        idAsignacion: 1,
        idUsuario: 5,
        fechaAsignacion: '2026-01-01T00:00:00.000Z',
        usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
      },
    });
    const steps = planTaskEditSteps(original, { ...defaultTaskFormValues(original), idUsuarioAsignado: SIN_ASIGNAR });
    expect(steps).toEqual([{ kind: 'unassign' }]);
  });

  it('cambio de rol con asignado activo: desasigna ANTES del update (nunca envía un update de rol con asignado incompatible en vilo)', () => {
    const original = tarea({
      idRolProyecto: 1,
      asignacionActiva: {
        idAsignacion: 1,
        idUsuario: 5,
        fechaAsignacion: '2026-01-01T00:00:00.000Z',
        usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
      },
    });
    const steps = planTaskEditSteps(original, {
      ...defaultTaskFormValues(original),
      idRolProyecto: '2',
      idUsuarioAsignado: SIN_ASIGNAR,
    });
    expect(steps).toEqual([
      { kind: 'unassign' },
      { kind: 'update', payload: { idRolProyecto: 2 } },
    ]);
  });

  it('cambio de rol + nuevo asignado compatible: desasigna, actualiza el rol y asigna al nuevo DESPUÉS del update', () => {
    const original = tarea({
      idRolProyecto: 1,
      asignacionActiva: {
        idAsignacion: 1,
        idUsuario: 5,
        fechaAsignacion: '2026-01-01T00:00:00.000Z',
        usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
      },
    });
    const steps = planTaskEditSteps(original, {
      ...defaultTaskFormValues(original),
      idRolProyecto: '2',
      idUsuarioAsignado: '9',
    });
    expect(steps).toEqual([
      { kind: 'unassign' },
      { kind: 'update', payload: { idRolProyecto: 2 } },
      { kind: 'assign', idUsuario: 9 },
    ]);
  });

  it('cambio de rol sin asignado activo previo: no desasigna (nada que desasignar)', () => {
    const original = tarea({ idRolProyecto: 1, asignacionActiva: null });
    const steps = planTaskEditSteps(original, { ...defaultTaskFormValues(original), idRolProyecto: '2' });
    expect(steps).toEqual([{ kind: 'update', payload: { idRolProyecto: 2 } }]);
  });

  it('no duplica una desasignación cuando el plan de asignación y el cambio de rol coinciden', () => {
    const original = tarea({
      idRolProyecto: 1,
      asignacionActiva: {
        idAsignacion: 1,
        idUsuario: 5,
        fechaAsignacion: '2026-01-01T00:00:00.000Z',
        usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
      },
    });
    const steps = planTaskEditSteps(original, {
      ...defaultTaskFormValues(original),
      idRolProyecto: '2',
      idUsuarioAsignado: SIN_ASIGNAR,
    });
    expect(steps.filter((s) => s.kind === 'unassign')).toHaveLength(1);
  });
});
