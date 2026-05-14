'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { login, type LoginPayload } from '@/lib/services/auth';
import { setTokens } from '@/lib/utils/token';
import uvgSwal from '@/lib/swal';

export function useLogin() {
  const router = useRouter();

  return useMutation({
    mutationFn: (data: LoginPayload) => login(data),
    onSuccess: (res) => {
      setTokens(res.accessToken, res.refreshToken);
      uvgSwal.fire({
        icon: 'success',
        title: 'Bienvenido',
        text: 'Inicio de sesion exitoso',
        timer: 1500,
        showConfirmButton: false,
      }).then(() => {
        router.push('/dashboard');
      });
    },
    onError: (error: Error & { details?: string | string[] }) => {
      const msg = error.message || 'Credenciales invalidas';
      uvgSwal.fire({
        icon: 'error',
        title: 'Error al iniciar sesion',
        text: msg,
      });
    },
  });
}
