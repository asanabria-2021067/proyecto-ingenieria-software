'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
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
import {
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
  crearTarea: ProjectTasksHook['crearTarea'];
  editarTarea: ProjectTasksHook['editarTarea'];
  asignarTarea: ProjectTasksHook['asignarTarea'];
  desasignarTarea: ProjectTasksHook['desasignarTarea'];
  onOpenChange: (open: boolean) => void;
  onRequestDelete?: (task: TareaPublicaDTO) => void;
}

function stepLabel(step: TaskEditStep): string {
  if (step.kind === 'unassign') return 'Desasignar al usuario anterior';
  if (step.kind === 'assign') return 'Asignar al nuevo usuario';
  return 'Guardar los cambios de la tarea';
}

/**
 * El mismo componente sirve para crear y editar (Tarea 38, sección 10): el
 * modo solo cambia título/botón/valores iniciales y el orden de
 * operaciones del submit. El contenido se remonta con `key` cuando cambia
 * el modo, la tarea o el estado abierto/cerrado — reinicia el formulario
 * sin `useEffect` (evita el patrón que ya dispara
 * `react-hooks/set-state-in-effect` en otras partes de este proyecto).
 */
export function TaskFormDialog(props: TaskFormDialogProps) {
  const { open, mode, task, onOpenChange } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto bg-surface-container-lowest border-outline-variant">
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
  crearTarea,
  editarTarea,
  asignarTarea,
  desasignarTarea,
  onOpenChange,
  onRequestDelete,
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

  const onSubmit = async (values: TaskFormValues) => {
    setSubmitError(null);
    setIsRunning(true);

    try {
      if (mode === 'create') {
        await crearTarea.mutateAsync(buildCreatePayload(values));
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

      onOpenChange(false);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error, 'task'));
    } finally {
      setProgreso(null);
      setIsRunning(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Crear nueva tarea' : 'Editar tarea'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Completa los campos para agregar una tarea a este proyecto.'
              : `Actualiza los datos de "${task?.tituloTarea ?? ''}".`}
          </DialogDescription>
        </DialogHeader>

        <TaskFormFields roles={roles} milestones={milestones} members={members} labels={labels} />

        {progreso && (
          <p role="status" className="text-xs text-tertiary">
            {progreso}
          </p>
        )}

        {submitError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {submitError}
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {mode === 'edit' && isLeader && task && onRequestDelete && (
            <Button
              type="button"
              variant="ghost"
              disabled={isRunning}
              onClick={() => {
                onRequestDelete(task);
                onOpenChange(false);
              }}
              className="mr-auto text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              Eliminar tarea
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={isRunning}
            onClick={() => onOpenChange(false)}
            className="rounded-lg"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={isRunning}
            className="rounded-lg bg-primary hover:bg-primary/90 text-on-primary font-bold"
          >
            {isRunning
              ? mode === 'create'
                ? 'Creando...'
                : 'Guardando...'
              : mode === 'create'
                ? 'Crear tarea'
                : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
