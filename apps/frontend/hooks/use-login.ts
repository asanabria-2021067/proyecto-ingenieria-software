'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { login, type LoginPayload } from '@/lib/services/auth';
import { getMe } from '@/lib/services/users';
import { isAdminUser } from '@/hooks/use-current-user';
import { readNextFromLocation } from '@/lib/api/session';
import uvgSwal from '@/lib/swal';

// T-274 (OWASP): un solo mensaje para credenciales invalidas, nunca se dice
// si el correo existe o no. El limite de intentos (5/60s, ver
// auth.controller.ts) se explica aparte para que el bloqueo se sienta como
// un estado temporal y no como otro error de credenciales.
function mensajeErrorLogin(error: (Error & { statusCode?: number }) | null): string {
  if (!error) return 'No se pudo iniciar sesion. Verifica tu correo y contraseña.';
  if (error.statusCode === 429) {
    return 'Demasiados intentos de inicio de sesion. Espera un minuto antes de volver a intentarlo.';
  }
  if (error.statusCode === 403) {
    return 'Tu cuenta está pendiente de verificación por administración.';
  }
  return 'No se pudo iniciar sesion. Verifica tu correo y contraseña.';
}

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
    onError: (error) => {
      uvgSwal.fire({
        icon: 'error',
        title: 'No se pudo iniciar sesión',
        text: mensajeErrorLogin(error as Error & { statusCode?: number }),
      });
    },
  });
}