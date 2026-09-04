'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Trash2, UserMinus, X } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { TaskFormFields } from '@/components/projects/task-form-fields';
import { getApiErrorMessage } from '@/components/projects/api-error';
import uvgSwal from '@/lib/swal';
import {
  SIN_ASIGNAR,
  buildCreatePayload,
  buildTaskFormSchema,
  defaultTaskFormValues,
  planTaskEditSteps,
  type TaskEditStep,
  type TaskFormValues,
} from '@/components/projects/task-form.schema';
import type { MiembroProyecto } from '@/hooks/use-project-members';
import type { useProjectTasks } from '@/hooks/use-project-tasks';
import type { LabelDTO } from '@/lib/services/labels';
import type { TareaPublicaDTO } from '@/lib/types/tasks';

type ProjectTasksHook = ReturnType<typeof useProjectTasks>;

function mostrarAvisoTareaGuardada(mode: 'create' | 'edit') {
  void uvgSwal.fire({
    toast: true,
    backdrop: false,
    icon: 'success',
    title: mode === 'create' ? 'Tarea creada' : 'Cambios guardados',
    text:
      mode === 'create'
        ? 'La tarea se agregó al tablero.'
        : 'La tarea se actualizó correctamente.',
    position: 'top-end',
    timer: 1800,
    timerProgressBar: true,
    showConfirmButton: false,
  });
}

interface RolOpcion {
  idRolProyecto: number;
  nombreRol: string;
}

interface HitoOpcion {
  idHito: number;
  tituloHito: string;
}

export interface TaskFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  task: TareaPublicaDTO | null;
  roles: RolOpcion[];
  milestones: HitoOpcion[];
  members: MiembroProyecto[];
  labels: LabelDTO[];
  isLeader: boolean;
  puedeGestionarTarea: boolean;
  crearTarea: ProjectTasksHook['crearTarea'];
  editarTarea: ProjectTasksHook['editarTarea'];
  asignarTarea: ProjectTasksHook['asignarTarea'];
  desasignarTarea: ProjectTasksHook['desasignarTarea'];
  onOpenChange: (open: boolean) => void;
  onRequestDelete?: (task: TareaPublicaDTO) => void;
  /**
   * Abre el gestor de etiquetas del proyecto (Sheet) sin desmontar el
   * formulario, conservando el borrador (Secciones 30-31). El diálogo
   * permanece montado mientras el Sheet se muestra encima.
   */
  onManageLabels?: () => void;
}

function stepLabel(step: TaskEditStep): string {
  if (step.kind === 'unassign') return 'Desasignar al usuario anterior';
  if (step.kind === 'assign') return 'Asignar al nuevo usuario';
  return 'Guardar los cambios de la tarea';
}

/**
 * El mismo componente sirve para crear y editar (Sección 4): el modo solo
 * cambia título/descripción/botón/valores iniciales y el orden de operaciones
 * del submit. El contenido se remonta con `key` cuando cambia el modo, la
 * tarea o el estado abierto/cerrado — reinicia el formulario sin `useEffect`
 * (evita el patrón que ya dispara `react-hooks/set-state-in-effect` en otras
 * partes de este proyecto).
 */
export function TaskFormDialog(props: TaskFormDialogProps) {
  const { open, mode, task, onOpenChange } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden border-outline-variant bg-surface-container-lowest p-0 sm:max-w-240"
      >
        <TaskFormDialogContent
          key={`${mode}-${task?.idTarea ?? 'new'}-${open}`}
          {...props}
        />
      </DialogContent>
    </Dialog>
  );
}

function TaskFormDialogContent({
  mode,
  task,
  roles,
  milestones,
  members,
  labels,
  isLeader,
  puedeGestionarTarea,
  crearTarea,
  editarTarea,
  asignarTarea,
  desasignarTarea,
  onOpenChange,
  onRequestDelete,
  onManageLabels,
}: TaskFormDialogProps) {
  const schema = useMemo(
    () => buildTaskFormSchema({ fechaOriginal: task?.fechaLimite ?? null, miembros: members }),
    [task, members],
  );

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultTaskFormValues(task),
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const asignadoActual = form.watch('idUsuarioAsignado');
  // "Desasignar" (Sección 42): solo cuando la tarea tiene una asignación activa
  // real y el usuario del formulario no está ya en "Sin asignar". Retira la
  // asignación seleccionada en el formulario; el guardado reutiliza el mismo
  // plan de pasos que la opción "Sin asignar" del selector — no abre una vía
  // de mutación paralela.
  const puedeDesasignar =
    mode === 'edit' &&
    puedeGestionarTarea &&
    task?.asignacionActiva != null &&
    asignadoActual !== SIN_ASIGNAR;

  const onSubmit = async (values: TaskFormValues) => {
    setSubmitError(null);
    setIsRunning(true);

    try {
      if (mode === 'create') {
        await crearTarea.mutateAsync(buildCreatePayload(values));
        mostrarAvisoTareaGuardada('create');
        onOpenChange(false);
        return;
      }

      if (!task) return;

      const steps = planTaskEditSteps(task, values);
      if (steps.length === 0) {
        onOpenChange(false);
        return;
      }

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        setProgreso(stepLabel(step));
        try {
          if (step.kind === 'unassign') {
            await desasignarTarea.mutateAsync({ taskId: task.idTarea });
          } else if (step.kind === 'update') {
            await editarTarea.mutateAsync({ taskId: task.idTarea, input: step.payload });
          } else {
            await asignarTarea.mutateAsync({ taskId: task.idTarea, input: { idUsuario: step.idUsuario } });
          }
        } catch (error) {
          const scope = step.kind === 'update' ? 'task' : 'assignment';
          const prefijo = i > 0 ? 'Los cambios anteriores se guardaron correctamente. ' : '';
          setSubmitError(
            `${prefijo}No se pudo completar: "${stepLabel(step)}". ${getApiErrorMessage(error, scope)}`,
          );
          return;
        }
      }

      mostrarAvisoTareaGuardada('edit');
      onOpenChange(false);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error, 'task'));
    } finally {
      setProgreso(null);
      setIsRunning(false);
    }
  };

  const closeAriaLabel =
    mode === 'create' ? 'Cerrar formulario para crear tarea' : 'Cerrar formulario para editar tarea';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-h-[90vh] min-h-0 flex-col">
        <DialogHeader className="relative shrink-0 space-y-1 border-b border-outline-variant/40 px-6 py-4 text-left">
          <DialogTitle className="text-xl font-bold text-on-surface">
            {mode === 'create' ? 'Crear nueva tarea' : 'Editar tarea'}
          </DialogTitle>
          <DialogDescription className="text-sm text-on-surface-variant">
            {mode === 'create'
              ? 'Completa la información para registrar una nueva tarea en el proyecto.'
              : 'Actualiza la información de la tarea. Los cambios se reflejarán en el tablero.'}
          </DialogDescription>
          <DialogClose
            aria-label={closeAriaLabel}
            className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <X className="size-4" aria-hidden="true" />
          </DialogClose>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <TaskFormFields
            roles={roles}
            milestones={milestones}
            members={members}
            labels={labels}
            onManageLabels={onManageLabels}
          />

          {progreso && (
            <p role="status" className="mt-4 text-xs text-tertiary">
              {progreso}
            </p>
          )}
        </div>

        {submitError && (
          <div className="shrink-0 border-t border-red-500/30 bg-red-500/5 px-6 py-3">
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {submitError}
            </p>
          </div>
        )}

        <DialogFooter className="shrink-0 flex-col gap-2 border-t border-outline-variant/40 bg-surface-container-lowest px-6 py-4 sm:flex-row sm:justify-between">
          {/* Grupo izquierdo: acciones destructivas / de asignación (solo edición) */}
          <div className="flex flex-wrap items-center gap-2">
            {puedeDesasignar && (
              <Button
                type="button"
                variant="outline"
                disabled={isRunning}
                aria-label="Desasignar tarea"
                onClick={() => form.setValue('idUsuarioAsignado', SIN_ASIGNAR, { shouldDirty: true, shouldValidate: true })}
                className="h-10 gap-1.5 border-red-500/40 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <UserMinus className="size-4" aria-hidden="true" />
                Desasignar
              </Button>
            )}
            {mode === 'edit' && isLeader && task && onRequestDelete && (
              <Button
                type="button"
                variant="ghost"
                disabled={isRunning}
                aria-label="Eliminar tarea"
                onClick={() => {
                  onRequestDelete(task);
                  onOpenChange(false);
                }}
                className="h-10 gap-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Eliminar tarea
              </Button>
            )}
          </div>

          {/* Grupo derecho: cancelar + acción principal */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isRunning}
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-md border-outline-variant"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isRunning}
              aria-label={mode === 'create' ? 'Crear tarea' : 'Guardar cambios de la tarea'}
              className="h-10 gap-1.5 rounded-md bg-primary font-bold text-on-primary hover:bg-primary/90"
            >
              {isRunning && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {isRunning
                ? mode === 'create'
                  ? 'Creando...'
                  : 'Guardando...'
                : mode === 'create'
                  ? 'Crear tarea'
                  : 'Guardar cambios'}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Form>
  );
}
