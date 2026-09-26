'use client';

import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { escucharConfirmaciones, type SolicitudConfirmacion } from '@/lib/mensajes';

export function ConfirmacionHost() {
  const [pendientes, setPendientes] = useState<SolicitudConfirmacion[]>([]);

  useEffect(() => escucharConfirmaciones((solicitud) => setPendientes((cola) => [...cola, solicitud])), []);

  const actual = pendientes[0] ?? null;

  const responder = (confirmado: boolean) => {
    if (!actual) return;
    actual.responder(confirmado);
    setPendientes((cola) => (cola[0] === actual ? cola.slice(1) : cola));
  };

  return (
    <AlertDialog
      open={actual !== null}
      onOpenChange={(open) => {
        if (!open) responder(false);
      }}
    >
      {actual && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{actual.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{actual.descripcion}</AlertDialogDescription>
            {actual.destructiva && (
              <span className="pill pill-error w-fit">No se puede deshacer</span>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={(event) => {
                event.preventDefault();
                responder(false);
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className={actual.destructiva ? buttonVariants({ variant: 'destructive' }) : undefined}
              onClick={(event) => {
                event.preventDefault();
                responder(true);
              }}
            >
              {actual.textoAccion}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
