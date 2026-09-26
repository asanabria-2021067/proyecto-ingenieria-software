'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { login, type LoginPayload } from '@/lib/services/auth';
import { getMe } from '@/lib/services/users';
import { isAdminUser } from '@/hooks/use-current-user';
import uvgSwal from '@/lib/swal';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { readNextFromLocation } from '@/lib/api/session';

export function useLogin() {
  const router = useRouter();

  return useMutation({
    mutationFn: (data: LoginPayload) => login(data),
    onSuccess: async () => {
      const user = await getMe().catch(() => null);
      // T-221: volver a donde estaba el usuario si la sesión le había vencido.
      const destination = readNextFromLocation() ?? (isAdminUser(user) ? '/dashboard/admin' : '/dashboard');
      uvgSwal.fire({
        icon: 'success',
        title: 'Bienvenido',
        text: 'Inicio de sesion exitoso',
        timer: 1500,
        showConfirmButton: false,
      }).then(() => {
        router.push(destination);
      });
    },
    onError: (error: Error & { details?: string | string[] }) => {
      const msg = getApiErrorMessage(error, 'auth');
      uvgSwal.fire({
        icon: 'error',
        title: 'Error al iniciar sesion',
        text: msg,
      });
    },
  });
}
