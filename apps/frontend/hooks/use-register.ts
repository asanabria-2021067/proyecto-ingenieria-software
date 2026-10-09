'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { register, type RegisterPayload } from '@/lib/services/auth';
import uvgSwal from '@/lib/swal';

function mensajeErrorRegistro(error: (Error & { statusCode?: number }) | null): string {
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
      uvgSwal.fire({
        icon: 'success',
        title: 'Cuenta creada',
        text: 'Administración debe verificar tu cuenta antes de que puedas iniciar sesión.',
        timer: 4000,
        timerProgressBar: true,
        showConfirmButton: false,
      });
      setTimeout(() => router.push('/login'), 4000);
    },
    onError: (error) => {
      uvgSwal.fire({
        icon: 'error',
        title: 'No se pudo completar el registro',
        text: mensajeErrorRegistro(error as Error & { statusCode?: number }),
      });
    },
  });
}
