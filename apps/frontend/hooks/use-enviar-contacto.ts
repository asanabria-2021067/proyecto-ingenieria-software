'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { enviarContacto, type ContactoPayload } from '@/lib/services/contacto';

export const MENSAJE_CONTACTO_ENVIADO = 'Administración recibió tu mensaje y te responderá al correo que indicaste.';

export function mensajeErrorContacto(error: unknown): string {
  if (getApiErrorStatus(error) === 429) {
    return 'Enviaste varios mensajes seguidos. Espera un minuto antes de volver a intentarlo.';
  }
  return getApiErrorMessage(error, 'general', 'No se pudo enviar tu mensaje. Intenta de nuevo.');
}

export function useEnviarContacto() {
  return useMutation({
    mutationFn: (payload: ContactoPayload) => enviarContacto(payload),
    onSuccess: () => {
      toast.success('Mensaje enviado', { description: MENSAJE_CONTACTO_ENVIADO });
    },
    onError: (error) => {
      toast.error('No se pudo enviar tu mensaje', { description: mensajeErrorContacto(error) });
    },
  });
}
