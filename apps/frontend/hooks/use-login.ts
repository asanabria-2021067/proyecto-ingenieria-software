'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { login, type LoginPayload } from '@/lib/services/auth';
import { getMe } from '@/lib/services/users';
import { isAdminUser } from '@/hooks/use-current-user';

// T-263 (redisenio login/registro): el feedback de exito/error ya no usa
// SweetAlert, la pantalla lo muestra inline con el componente Alert
// (T-219) leyendo isPending/isError/isSuccess/error de esta mutacion. El
// retraso antes de navegar reemplaza el timer que antes tenia el popup,
// para que el usuario alcance a ver el estado de exito.
export function useLogin() {
  const router = useRouter();

  return useMutation({
    mutationFn: (data: LoginPayload) => login(data),
    onSuccess: async () => {
      const user = await getMe().catch(() => null);
      const destination = isAdminUser(user) ? '/dashboard/admin' : '/dashboard';
      setTimeout(() => router.push(destination), 1200);
    },
  });
}
