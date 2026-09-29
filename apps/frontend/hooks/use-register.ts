'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { register, type RegisterPayload } from '@/lib/services/auth';
import { aviso } from '@/lib/mensajes';

function mensajeErrorRegistroToast(error: (Error & { statusCode?: number }) | null): string {
  if (!error) return 'No se pudo completar el registro. Intenta de nuevo.';
  if (error.statusCode === 429) {
    return 'Demasiados intentos de registro. Espera un minuto antes de volver a intentarlo.';
  }
  return 'No se pudo completar el registro. Intenta de nuevo.';
}

export function useRegister() {
  const router = useRouter();

  return useMutation({
    mutationFn: (data: RegisterPayload) => register(data),
    onSuccess: () => {
      aviso.exito('Cuenta creada', 'Bienvenido a UVGenius. Redirigiendo…');
      setTimeout(() => router.push('/dashboard'), 1500);
    },
    onError: (error) => {
      aviso.error('No se pudo completar el registro', mensajeErrorRegistroToast(error as Error & { statusCode?: number }));
    },
  });
}
