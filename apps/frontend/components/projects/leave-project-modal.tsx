'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, TriangleAlert } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { useCreateExitRequest } from '@/hooks/use-exit-request';

/**
 * Único campo del formulario (Sección 1 del prompt de F8: "puede existir un
 * schema local pequeño"). `.trim()` normaliza antes de `.min(1)` — el mismo
 * criterio que `CreateSolicitudSalidaDto` en el backend
 * (@Transform trim + @MinLength(1)): un motivo compuesto solo de espacios
 * ("   ") llega vacío a la validación y se rechaza.
 */
const leaveProjectSchema = z.object({
  motivo: z.string().trim().min(1, 'Describe el motivo de tu salida.'),
});

type LeaveProjectFormValues = z.infer<typeof leaveProjectSchema>;

export interface LeaveProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idProyecto: number;
  /** Se ejecuta solo tras confirmar y crear la solicitud exitosamente (B5). */
  onSuccess?: () => void;
}

/**
 * F8 — inicia una solicitud de salida (B5) en dos pasos, tal como muestra
 * Pantalla4(1).png: un primer paso con el formulario de `motivo` (RHF + Zod
 * + `zodResolver` + `components/ui/form.tsx`, mismo patrón que
 * `TaskFormDialog`/`task-form.schema.ts`) y un segundo paso de confirmación
 * explícita vía `ConfirmActionDialog` (ya existente,
 * admin/ConfirmActionDialog.tsx — no se crea un diálogo de confirmación
 * paralelo, porque ese componente no tiene campo de motivo). Nunca abre
 * ambos diálogos a la vez.
 *
 * Consume `useCreateExitRequest` de F7 tal cual: el body enviado es
 * exactamente `{ motivo }` ya recortado por el schema — sin `idUsuario` ni
 * campos inventados, el backend deriva el actor del JWT. Este componente no
 * implementa el flujo de PREPARACION (F9): tras el éxito, solo cierra el
 * modal y notifica vía `onSuccess`.
 */
export function LeaveProjectModal({ open, onOpenChange, idProyecto, onSuccess }: LeaveProjectModalProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Motivo ya validado/recortado por el schema, capturado al pasar al paso
  // de confirmación — el segundo paso envía exactamente este valor, nunca
  // vuelve a leer el `<textarea>` (que además queda oculto mientras
  // `confirmOpen` es true).
  const [pendingMotivo, setPendingMotivo] = useState('');

  const crearSolicitud = useCreateExitRequest(idProyecto);

  const form = useForm<LeaveProjectFormValues>({
    resolver: zodResolver(leaveProjectSchema),
    defaultValues: { motivo: '' },
  });

  const resetState = () => {
    form.reset({ motivo: '' });
    setSubmitError(null);
    setConfirmOpen(false);
    setPendingMotivo('');
    crearSolicitud.reset();
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      resetState();
    }
    onOpenChange(next);
  };

  const handleContinuar = form.handleSubmit((values) => {
    setSubmitError(null);
    setPendingMotivo(values.motivo);
    setConfirmOpen(true);
  });

  const handleConfirmCancel = () => {
    // Vuelve al paso del formulario: el motivo escrito (en `form`) se conserva.
    setConfirmOpen(false);
  };

  const handleConfirm = async () => {
    try {
      await crearSolicitud.mutateAsync({ motivo: pendingMotivo });
      setConfirmOpen(false);
      handleOpenChange(false);
      onSuccess?.();
    } catch (error) {
      // Fallo: no se finge éxito, no se navega. Vuelve al formulario (con el
      // motivo intacto) mostrando el error real, para permitir reintentar.
      setSubmitError(getApiErrorMessage(error));
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <Dialog open={open && !confirmOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="w-[96vw] max-w-[480px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
          <Form {...form}>
            <form onSubmit={handleContinuar}>
              <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
                <DialogTitle className="text-xl font-bold text-on-surface">Salir del proyecto</DialogTitle>
                <DialogDescription className="text-sm text-on-surface-variant">
                  Al salir del proyecto, serás removido de él y se te revocará el acceso a toda la
                  información y recursos asociados. Esta acción no se puede deshacer.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 px-6 py-5">
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-900/10">
                  <TriangleAlert
                    className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    Esta acción es irreversible.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="motivo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold text-on-surface">Motivo</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          disabled={crearSolicitud.isPending}
                          placeholder="Describe brevemente por qué deseas salir del proyecto"
                          className="mt-1 min-h-28 rounded-md border-outline-variant text-sm"
                        />
                      </FormControl>
                      <FormMessage className="text-xs text-red-600 dark:text-red-400" />
                    </FormItem>
                  )}
                />

                {submitError && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                    {submitError}
                  </p>
                )}
              </div>

              <DialogFooter className="gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={crearSolicitud.isPending}
                  onClick={() => handleOpenChange(false)}
                  className="h-10 rounded-md border-outline-variant text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={crearSolicitud.isPending}
                  className="h-10 gap-1.5 rounded-md bg-orange-500 text-xs font-bold text-white hover:bg-orange-600"
                >
                  {crearSolicitud.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                  Continuar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={open && confirmOpen}
        title="Salir del proyecto"
        description="¿Confirmas que deseas salir del proyecto? Esta acción no se puede deshacer."
        actionLabel="Salir del proyecto"
        variant="warning"
        isPending={crearSolicitud.isPending}
        onConfirm={handleConfirm}
        onCancel={handleConfirmCancel}
      />
    </>
  );
}
