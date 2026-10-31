'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { login, type LoginPayload } from '@/lib/services/auth';
import { getMe } from '@/lib/services/users';
import { isAdminUser } from '@/hooks/use-current-user';
import { readNextFromLocation } from '@/lib/api/session';
import uvgSwal from '@/lib/swal';

// T-221: si la sesión había vencido, vuelve a la ruta desde la que se
// redirigió al login (`next`) en vez de ir siempre al dashboard.
export function useLogin() {
  const router = useRouter();

  return useMutation({
    mutationFn: (data: LoginPayload) => login(data),
    onSuccess: async () => {
      // Dialog centrado, no un toast de esquina (T-274 lo mostraba en
      // esquina; aca va en medio de la pantalla y se cierra solo).
      uvgSwal.fire({
        icon: 'success',
        title: 'Inicio de sesión exitoso',
        text: 'Redirigiendo…',
        timer: 1200,
        timerProgressBar: true,
        showConfirmButton: false,
      });
      const user = await getMe().catch(() => null);
      const destination = readNextFromLocation() ?? (isAdminUser(user) ? '/dashboard/admin' : '/dashboard');
      setTimeout(() => router.push(destination), 1200);
    },
    // NL-T1: los errores se muestran en el formulario (app/login/page.tsx), no en un popup.
  });
}