'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { register, type RegisterPayload } from '@/lib/services/auth';
import uvgSwal from '@/lib/swal';

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
    // NL-T2: los errores se muestran en el formulario (por campo o en la alerta
    // de app/registro/page.tsx), no en un popup duplicado.
  });
}
