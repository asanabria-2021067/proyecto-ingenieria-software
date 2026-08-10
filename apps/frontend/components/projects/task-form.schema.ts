import { z } from 'zod';
import type { CreateTaskInput, Prioridad, TareaPublicaDTO, UpdateTaskInput } from '@/lib/types/tasks';
import type { MiembroProyecto } from '@/hooks/use-project-members';

export const SIN_ROL = 'sin-rol';
export const SIN_HITO = 'sin-hito';
export const SIN_ASIGNAR = 'sin-asignar';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Día calendario local (no UTC) — mismo criterio que
 * `task-board.utils.ts#estaVencida` (protegido en esta tarea; se repite
 * aquí en vez de importarlo porque ese archivo no lo exporta). El backend
 * (`IsFutureCalendarDateConstraint`,
 * apps/backend/src/tasks/dto/validators/is-future-calendar-date.validator.ts)
 * exige estrictamente posterior al día de hoy en America/Guatemala; esta es
 * una aproximación con la hora local del navegador — el backend sigue
 * siendo la autoridad final y puede rechazar un valor límite que el cliente
 * aceptó por una diferencia de huso horario.
 */
function hoyLocalISO(ahora: Date): string {
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

export interface BuildTaskFormSchemaOptions {
  /** Fecha límite ya persistida (solo relevante en modo edición). */
  fechaOriginal?: string | null;
  /** Candidatos reales para el cascada rol → usuario asignado. */
  miembros: MiembroProyecto[];
  ahora?: Date;
}

/**
 * Única fuente de validación del formulario de tarea. Se construye como
 * función (no como objeto Zod estático) porque la validez de
 * `idUsuarioAsignado` depende de datos dinámicos (miembros reales del
 * proyecto) y porque la excepción de "fecha vencida sin cambios" depende
 * del modo/tarea original — evita mantener dos schemas duplicados para
 * crear/editar.
 */
export function buildTaskFormSchema({ fechaOriginal = null, miembros, ahora = new Date() }: BuildTaskFormSchemaOptions) {
  const hoy = hoyLocalISO(ahora);

  return z
    .object({
      tituloTarea: z
        .string()
        .trim()
        .min(1, 'El título no puede estar vacío.')
        .max(150, 'El título no puede exceder 150 caracteres.'),
      descripcionTarea: z.string().max(5000, 'La descripción no puede exceder 5000 caracteres.'),
      prioridad: z.enum(['ALTA', 'MEDIA', 'BAJA'], {
        errorMap: () => ({ message: 'Selecciona una prioridad válida.' }),
      }),
      fechaLimite: z.string().regex(DATE_FORMAT, 'Selecciona una fecha límite válida.'),
      tiempoEstimadoHoras: z.string(),
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
