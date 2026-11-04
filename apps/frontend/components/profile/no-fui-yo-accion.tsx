'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { Button } from '@/components/ui/button';
import { aviso } from '@/lib/mensajes';
import { reportarNoFuiYo, sesionesQueryKey } from '@/lib/services/cuenta';

/** Id de la sesión que lleva un aviso `NUEVO_INICIO_SESION`; null en cualquier otro caso. */
export function idSesionDeNotificacion(n: {
  tipoNotificacion: string;
  datosJson?: Record<string, unknown> | null;
}): string | null {
  if (n.tipoNotificacion !== 'NUEVO_INICIO_SESION') return null;
  const id = n.datosJson?.idSesion;
  return typeof id === 'string' && id !== '' ? id : null;
}

/**
 * MEJ-82: «No fui yo» cierra esa sesión y lleva a cambiar la contraseña. Si la sesión reportada
 * es la de este mismo navegador, el servidor ya la cerró: se va al inicio de sesión.
 */
export function NoFuiYoAccion({ idSesion, className = 'mt-2 pl-4' }: { idSesion: string; className?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const terminar = (actual: boolean) => {
    void queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
    void queryClient.invalidateQueries({ queryKey: sesionesQueryKey });
    router.push(actual ? '/login' : '/dashboard/configuracion#cambiar-contrasena');
  };

  const reportar = useMutation({
    mutationFn: () => reportarNoFuiYo(idSesion),
    onSuccess: ({ actual }) => {
      aviso.exito('Cerramos esa sesión', 'Cambia tu contraseña para proteger tu cuenta.');
      terminar(actual);
    },
    onError: (error: Error) => {
      // La sesión ya no existe (se cerró o venció): lo que importa sigue siendo cambiar la contraseña.
      if (getApiErrorStatus(error) === 404) return terminar(false);
      aviso.error('No se pudo reportar el inicio de sesión', getApiErrorMessage(error, 'general', 'Intenta de nuevo en unos segundos.'));
    },
  });

  return (
    <div className={className}>
      <Button type="button" size="sm" variant="destructive" disabled={reportar.isPending} onClick={() => reportar.mutate()}>
        <ShieldAlert aria-hidden="true" />
        No fui yo
      </Button>
    </div>
  );
}
