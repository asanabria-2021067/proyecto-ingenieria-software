import { z } from 'zod';
import type { CreateTaskInput, Prioridad, TareaPublicaDTO, UpdateTaskInput } from '@/lib/types/tasks';
import type { MiembroProyecto } from '@/hooks/use-project-members';

export const SIN_ROL = 'sin-rol';
export const SIN_HITO = 'sin-hito';
export const SIN_ASIGNAR = 'sin-asignar';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

function hoyGuatemalaISO(ahora: Date): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ahora);
  const valor = (tipo: 'year' | 'month' | 'day') =>
    partes.find((parte) => parte.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

function fechaCalendarioValida(value: string): boolean {
  if (!DATE_FORMAT.test(value)) return false;
  const [anio, mes, dia] = value.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

export interface BuildTaskFormSchemaOptions {
  /** Fecha límite ya persistida (solo relevante en modo edición). */
  fechaOriginal?: string | null;
  /** Candidatos reales para el cascada rol → usuario asignado. */
  miembros: MiembroProyecto[];
  ahora?: Date;
  /**
   * HU-147/T-185: el backend exige idHito en la creación y ya no admite
   * quitarlo en la edición (ver CreateTaskDto/UpdateTaskDto). Por defecto
   * 'edit' — permisivo, sin exigir hito — para no romper los muchos tests
   * de este schema que no ejercitan la regla de hito; quien construye un
   * formulario de CREACIÓN real debe pasar 'create' explícitamente
   * (TaskFormDialogContent ya lo hace).
   */
  mode?: 'create' | 'edit';
  /** Hito ya persistido de la tarea (null si nunca tuvo uno). Solo importa en modo 'edit'. */
  hitoOriginal?: number | null;
}

/**
 * Única fuente de validación del formulario de tarea. Se construye como
 * función (no como objeto Zod estático) porque la validez de
 * `idUsuarioAsignado` depende de datos dinámicos (miembros reales del
 * proyecto) y porque la excepción de "fecha vencida sin cambios" depende
 * del modo/tarea original — evita mantener dos schemas duplicados para
 * crear/editar.
 */
export function buildTaskFormSchema({
  fechaOriginal = null,
  miembros,
  ahora = new Date(),
  mode = 'edit',
  hitoOriginal = null,
}: BuildTaskFormSchemaOptions) {
  const hoy = hoyGuatemalaISO(ahora);

  return z
    .object({
      tituloTarea: z
        .string()
        .trim()
        .min(1, 'El título no puede estar vacío.')
        .max(150, 'El título no puede exceder 150 caracteres.'),
      descripcionTarea: z.string().refine(
        (value) => value.trim().length <= 5000,
        'La descripción no puede exceder 5000 caracteres.',
      ),
      prioridad: z.enum(['ALTA', 'MEDIA', 'BAJA'], {
        errorMap: () => ({ message: 'Selecciona una prioridad válida.' }),
      }),
      fechaLimite: z.string().refine(fechaCalendarioValida, 'Selecciona una fecha límite válida.'),
      tiempoEstimadoHoras: z.string(),
      puntosHistoria: z.string(),
      idRolProyecto: z.string().min(1),
      idUsuarioAsignado: z.string().min(1),
      idHito: z.string().min(1),
      idsEtiquetas: z.array(z.number().int().positive()),
    })
    .superRefine((values, ctx) => {
      const fechaSinCambios = fechaOriginal !== null && values.fechaLimite === fechaOriginal;
      if (!fechaSinCambios && values.fechaLimite <= hoy) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fechaLimite'],
          message: 'La fecha límite debe ser posterior al día de hoy.',
        });
      }

      if (values.tiempoEstimadoHoras !== '') {
        const n = Number(values.tiempoEstimadoHoras);
        if (!Number.isInteger(n) || n < 1 || n > 1000) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['tiempoEstimadoHoras'],
            message: 'El tiempo estimado debe ser un número entero entre 1 y 1000.',
          });
        }
      }

      if (values.puntosHistoria !== '') {
        const n = Number(values.puntosHistoria);
        if (!Number.isInteger(n) || n < 1 || n > 100) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['puntosHistoria'],
            message: 'Los puntos de historia deben ser un número entero entre 1 y 100.',
          });
        }
      }

      if (values.idUsuarioAsignado !== SIN_ASIGNAR) {
        const idUsuario = Number(values.idUsuarioAsignado);
        const candidatos =
          values.idRolProyecto === SIN_ROL
            ? miembros
            : miembros.filter((m) => m.idRolProyecto === Number(values.idRolProyecto));
        const compatible = candidatos.some((m) => m.idUsuario === idUsuario);
        if (!compatible) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['idUsuarioAsignado'],
            message: 'El usuario seleccionado ya no es compatible con el rol elegido.',
          });
        }
      }

      if (new Set(values.idsEtiquetas).size !== values.idsEtiquetas.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['idsEtiquetas'],
          message: 'Hay etiquetas duplicadas.',
        });
      }

      // HU-147/T-185: toda tarea nueva necesita un hito para poder entrar al
      // tablero/sprint (no existe backlog separado en este proyecto — crear
      // la tarea YA la coloca ahí).
      if (mode === 'create' && values.idHito === SIN_HITO) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['idHito'],
          message: 'Selecciona un hito: la tarea lo necesita para poder entrar al tablero.',
        });
      }
      // Igual regla en edición, pero solo si la tarea YA tenía un hito: no
      // se puede retirarlo (el backend rechaza idHito: null en ese caso).
      // Una tarea legacy sin hito puede seguir dejándose así.
      if (mode === 'edit' && hitoOriginal !== null && values.idHito === SIN_HITO) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['idHito'],
          message: 'No puedes quitar el hito de una tarea que ya está en el tablero o en un sprint.',
        });
      }
    });
}

export type TaskFormSchema = ReturnType<typeof buildTaskFormSchema>;
export type TaskFormValues = z.infer<TaskFormSchema>;

export function defaultTaskFormValues(tarea: TareaPublicaDTO | null): TaskFormValues {
  if (!tarea) {
    return {
      tituloTarea: '',
      descripcionTarea: '',
      prioridad: 'MEDIA',
      fechaLimite: '',
      tiempoEstimadoHoras: '',
      puntosHistoria: '',
      idRolProyecto: SIN_ROL,
      idUsuarioAsignado: SIN_ASIGNAR,
      idHito: SIN_HITO,
      idsEtiquetas: [],
    };
  }

  return {
    tituloTarea: tarea.tituloTarea,
    descripcionTarea: tarea.descripcionTarea ?? '',
    prioridad: tarea.prioridad,
    fechaLimite: tarea.fechaLimite ?? '',
    tiempoEstimadoHoras: tarea.tiempoEstimadoHoras === null ? '' : String(tarea.tiempoEstimadoHoras),
    puntosHistoria: tarea.puntosHistoria === null ? '' : String(tarea.puntosHistoria),
    idRolProyecto: tarea.idRolProyecto === null ? SIN_ROL : String(tarea.idRolProyecto),
    // Precarga el asignado activo; las asignaciones históricas nunca llegan
    // aquí (mapTarea ya filtra `desasignadaEn: null` en el backend).
    idUsuarioAsignado:
      tarea.asignacionActiva === null ? SIN_ASIGNAR : String(tarea.asignacionActiva.idUsuario),
    idHito: tarea.idHito === null ? SIN_HITO : String(tarea.idHito),
    idsEtiquetas: tarea.etiquetas.map((e) => e.idEtiqueta),
  };
}

/** Body de `POST /proyectos/:projectId/tareas` — sin projectId ni campos internos. */
export function buildCreatePayload(values: TaskFormValues): CreateTaskInput {
  const input: CreateTaskInput = {
    tituloTarea: values.tituloTarea.trim(),
    fechaLimite: values.fechaLimite,
    prioridad: values.prioridad as Prioridad,
  };

  const descripcion = values.descripcionTarea.trim();
  if (descripcion !== '') input.descripcionTarea = descripcion;

  if (values.tiempoEstimadoHoras !== '') input.tiempoEstimadoHoras = Number(values.tiempoEstimadoHoras);
  if (values.puntosHistoria !== '') input.puntosHistoria = Number(values.puntosHistoria);
  if (values.idHito !== SIN_HITO) input.idHito = Number(values.idHito);
  if (values.idRolProyecto !== SIN_ROL) input.idRolProyecto = Number(values.idRolProyecto);
  if (values.idUsuarioAsignado !== SIN_ASIGNAR) input.idUsuarioAsignado = Number(values.idUsuarioAsignado);
  if (values.idsEtiquetas.length > 0) {
    input.idsEtiquetas = [...values.idsEtiquetas].sort((a, b) => a - b);
  }

  return input;
}

/**
 * Payload de edición construido por diferencia contra la tarea original:
 * solo incluye campos realmente cambiados. `estadoTarea` nunca se incluye
 * (confirmado contra `UpdateTaskDto`: no existe ese campo en ese contrato,
 * el estado se administra exclusivamente vía
 * `PATCH .../estado` desde TaskCard). El tiempo estimado no admite
 * retirarse a través de este endpoint (`UpdateTaskDto.tiempoEstimadoHoras`
 * rechaza `null`): si el usuario lo vacía, el valor previo permanece sin
 * cambios (limitación real del contrato, no un defecto de este formulario).
 */
export function buildUpdatePayload(original: TareaPublicaDTO, values: TaskFormValues): UpdateTaskInput {
  const input: UpdateTaskInput = {};

  const tituloNuevo = values.tituloTarea.trim();
  if (tituloNuevo !== original.tituloTarea) input.tituloTarea = tituloNuevo;

  const descripcionNueva = values.descripcionTarea.trim();
  const descripcionOriginal = original.descripcionTarea ?? '';
  if (descripcionNueva !== descripcionOriginal) input.descripcionTarea = descripcionNueva;

  if (values.prioridad !== original.prioridad) input.prioridad = values.prioridad as Prioridad;

  const fechaOriginal = original.fechaLimite ?? '';
  if (values.fechaLimite !== fechaOriginal) input.fechaLimite = values.fechaLimite;

  if (values.tiempoEstimadoHoras !== '') {
    const tiempoNuevo = Number(values.tiempoEstimadoHoras);
    if (tiempoNuevo !== original.tiempoEstimadoHoras) input.tiempoEstimadoHoras = tiempoNuevo;
  }

  if (values.puntosHistoria !== '') {
    const puntosNuevos = Number(values.puntosHistoria);
    if (puntosNuevos !== original.puntosHistoria) input.puntosHistoria = puntosNuevos;
  }

  const hitoNuevo = values.idHito === SIN_HITO ? null : Number(values.idHito);
  if (hitoNuevo !== original.idHito) input.idHito = hitoNuevo;

  const rolNuevo = values.idRolProyecto === SIN_ROL ? null : Number(values.idRolProyecto);
  if (rolNuevo !== original.idRolProyecto) input.idRolProyecto = rolNuevo;

  const etiquetasOriginales = original.etiquetas.map((e) => e.idEtiqueta).sort((a, b) => a - b);
  const etiquetasNuevas = [...values.idsEtiquetas].sort((a, b) => a - b);
  if (JSON.stringify(etiquetasOriginales) !== JSON.stringify(etiquetasNuevas)) {
    input.idsEtiquetas = etiquetasNuevas;
  }

  return input;
}

export type AssignmentPlan =
  | { type: 'none' }
  | { type: 'assign'; idUsuario: number }
  | { type: 'unassign' };

/** Compara únicamente la asignación activa original contra la seleccionada. */
export function planAssignment(original: TareaPublicaDTO, values: TaskFormValues): AssignmentPlan {
  const asignadoOriginal = original.asignacionActiva?.idUsuario ?? null;
  const asignadoNuevo = values.idUsuarioAsignado === SIN_ASIGNAR ? null : Number(values.idUsuarioAsignado);

  if (asignadoNuevo === asignadoOriginal) return { type: 'none' };
  if (asignadoNuevo === null) return { type: 'unassign' };
  return { type: 'assign', idUsuario: asignadoNuevo };
}

export type TaskEditStep =
  | { kind: 'unassign' }
  | { kind: 'update'; payload: UpdateTaskInput }
  | { kind: 'assign'; idUsuario: number };

/**
 * Plan explícito de operaciones HTTP para editar una tarea (Tarea 38,
 * sección 26). `update()` en el backend
 * (apps/backend/src/tasks/tasks.service.ts) valida la compatibilidad del
 * asignado activo contra el rol NUEVO únicamente cuando `idRolProyecto`
 * viaja en el PATCH, y solo si existe una asignación activa en ese momento.
 * Por eso, cuando el rol cambia y hay un asignado activo, se desasigna
 * ANTES del PATCH (nunca se envía un PATCH de rol que el backend rechazaría
 * por incompatibilidad transitoria), y el nuevo asignado (si lo hay) se
 * asigna DESPUÉS del PATCH, para que `assign()` lo valide contra el rol ya
 * actualizado. No existe una transacción atómica real entre estas
 * llamadas: son peticiones HTTP independientes, ejecutadas en este orden
 * explícito, nunca simultáneas.
 */
export function planTaskEditSteps(original: TareaPublicaDTO, values: TaskFormValues): TaskEditStep[] {
  const fieldPayload = buildUpdatePayload(original, values);
  const roleChanging = Object.prototype.hasOwnProperty.call(fieldPayload, 'idRolProyecto');
  const assignment = planAssignment(original, values);
  const hadActiveAssignee = original.asignacionActiva !== null;

  const steps: TaskEditStep[] = [];
  const unassignBeforeUpdate = roleChanging && hadActiveAssignee;

  if (unassignBeforeUpdate) {
    steps.push({ kind: 'unassign' });
  }

  if (Object.keys(fieldPayload).length > 0) {
    steps.push({ kind: 'update', payload: fieldPayload });
  }

  if (assignment.type === 'assign') {
    steps.push({ kind: 'assign', idUsuario: assignment.idUsuario });
  } else if (assignment.type === 'unassign' && !unassignBeforeUpdate) {
    steps.push({ kind: 'unassign' });
  }

  return steps;
}
