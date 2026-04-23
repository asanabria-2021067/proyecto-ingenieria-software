'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { register, type RegisterPayload } from '@/lib/services/auth';
import uvgSwal from '@/lib/swal';

export function useRegister() {
  const router = useRouter();

  return useMutation({
    mutationFn: (data: RegisterPayload) => register(data),
    onSuccess: (res) => {
      localStorage.setItem('token', res.accessToken);
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
    onError: (error: any) => {
      const messages: string[] = error?.message
        ? Array.isArray(error.message)
          ? error.message
          : [error.message]
        : ['Error al registrarse'];

      uvgSwal.fire({
        icon: 'error',
        title: 'Error en el registro',
        html: messages.join('<br>'),
      });
    },
  });
}
