'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { register, type RegisterPayload } from '@/lib/services/auth';
import uvgSwal from '@/lib/swal';
import { getApiErrorMessage } from '@/components/projects/api-error';

export function useRegister() {
  const router = useRouter();

  return useMutation({
    mutationFn: (data: RegisterPayload) => register(data),
    onSuccess: () => {
      uvgSwal.fire({
        icon: 'success',
        title: 'Registro exitoso',
        text: 'Bienvenido a UVGenius',
        timer: 1500,
        showConfirmButton: false,
      }).then(() => {
        router.push('/dashboard');
      });
    },
    onError: (error: unknown) => {
      uvgSwal.fire({
        icon: 'error',
        title: 'Error en el registro',
        text: getApiErrorMessage(error, 'auth', 'No se pudo completar el registro. Intenta nuevamente.'),
      });
    },
  });
}
