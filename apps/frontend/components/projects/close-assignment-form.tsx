'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { useProjectTasks } from '@/hooks/use-project-tasks';
import {
  MIN_PROGRESO_CARACTERES,
  buildCloseAssignmentPayload,
  closeAssignmentFormSchema,
  defaultCloseAssignmentFormValues,
  type CloseAssignmentFormValues,
} from '@/components/projects/close-assignment-form.schema';

export interface CloseAssignmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idProyecto: number;
  idTarea: number;
  idAsignacion: number;
  tituloTarea?: string;
  /** Se ejecuta solo tras un cierre exitoso (B2) — el llamador decide qué invalidar fuera del dominio de tareas. */
  onSuccess?: () => void;
}

/**
 * F10 — formulario compartido "Cerrar tramo" (B2:
 * `POST /proyectos/:id/tareas/:taskId/asignaciones/:assignmentId/cerrar`).
 * Un único componente, abierto tanto desde el Kanban normal
 * (task-detail-client.tsx) como desde el workspace de PREPARACION (F9,
 * exit-preparation-workspace-client.tsx) — ninguno de los dos duplica este
 * markup. Reutiliza `useProjectTasks(idProyecto).cerrarAsignacion`: el mismo
 * mutation que ya centraliza las invalidaciones de `project-tasks`/
 * `project-avance`, nunca un segundo endpoint ni un segundo hook.
 */
export function CloseAssignmentForm({
  open,
  onOpenChange,
  idProyecto,
  idTarea,
  idAsignacion,
  tituloTarea,
  onSuccess,
}: CloseAssignmentFormProps) {
  const { cerrarAsignacion } = useProjectTasks(idProyecto);

  const form = useForm<CloseAssignmentFormValues>({
    resolver: zodResolver(closeAssignmentFormSchema),
    defaultValues: defaultCloseAssignmentFormValues(),
  });

  // Misma semántica que el backend (`@Transform` trim antes de `@MinLength`,
  // close-assignment.dto.ts): el contador SIEMPRE cuenta la longitud
  // recortada, igual que la validación del schema — nunca dos criterios
  // distintos entre lo que el usuario ve y lo que se valida.
  const contenidoAvance = useWatch({ control: form.control, name: 'contenidoAvance' });
  const longitudActual = contenidoAvance.trim().length;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      form.reset(defaultCloseAssignmentFormValues());
      cerrarAsignacion.reset();
    }
    onOpenChange(next);
  };

  const onSubmit = form.handleSubmit((values) => {
    cerrarAsignacion.mutate(
      { taskId: idTarea, assignmentId: idAsignacion, input: buildCloseAssignmentPayload(values) },
      {
        onSuccess: () => {
          handleOpenChange(false);
          onSuccess?.();
        },
      },
    );
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[96vw] max-w-[560px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
        <Form {...form}>
          <form onSubmit={onSubmit}>
            <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
              <DialogTitle className="text-xl font-bold text-on-surface">Cerrar tramo</DialogTitle>
              <DialogDescription className="text-sm text-on-surface-variant">
                Registra el trabajo realizado en este tramo antes de cerrarlo
                {tituloTarea ? ` — "${tituloTarea}"` : ''}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 px-6 py-5">
              <FormField
                control={form.control}
                name="horasReales"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-on-surface">
                      Horas reales <span className="text-error">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="any"
                        inputMode="decimal"
                        placeholder="3.5"
                        disabled={cerrarAsignacion.isPending}
                        className="mt-1 h-10 rounded-md border-outline-variant text-sm"
                      />
                    </FormControl>
                    <FormDescription className="text-xs text-tertiary">
                      Ingresa las horas reales dedicadas en este tramo.
                    </FormDescription>
                    <FormMessage className="text-xs text-error" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contenidoAvance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-on-surface">
                      Registro de avance <span className="text-error">*</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        disabled={cerrarAsignacion.isPending}
                        placeholder="Describe el trabajo realizado en este tramo"
                        className="mt-1 min-h-36 rounded-md border-outline-variant text-sm"
                      />
                    </FormControl>
                    <p
                      className={`text-xs ${longitudActual < MIN_PROGRESO_CARACTERES ? 'text-error' : 'text-tertiary'}`}
                    >
                      {longitudActual}/{MIN_PROGRESO_CARACTERES} caracteres · Mín. {MIN_PROGRESO_CARACTERES}{' '}
                      caracteres
                    </p>
                    <FormMessage className="text-xs text-error" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="marcarComoHecha"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-2.5 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                        disabled={cerrarAsignacion.isPending}
                        className="mt-0.5 border-outline-variant data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-on-primary focus-visible:border-primary focus-visible:ring-primary/40"
                      />
                    </FormControl>
                    <div className="space-y-0.5 leading-none">
                      <FormLabel className="text-sm font-medium text-on-surface">
                        Marcar tarea como completada
                      </FormLabel>
                      <FormDescription className="text-xs text-tertiary">
                        La tarea se marcará como completada al cerrar este tramo.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {cerrarAsignacion.isError && (
                <p role="alert" className="text-xs text-error">
                  {getApiErrorMessage(cerrarAsignacion.error, 'task')}
                </p>
              )}
            </div>

            <DialogFooter className="gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={cerrarAsignacion.isPending}
                onClick={() => handleOpenChange(false)}
                className="h-10 rounded-md border-outline-variant text-xs font-bold"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={cerrarAsignacion.isPending}
                className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
              >
                {cerrarAsignacion.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                {cerrarAsignacion.isPending ? 'Cerrando...' : 'Cerrar tramo'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
