'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { login, type LoginPayload } from '@/lib/services/auth';
import { getMe } from '@/lib/services/users';
import { isAdminUser } from '@/hooks/use-current-user';
import { readNextFromLocation } from '@/lib/api/session';
import { aviso } from '@/lib/mensajes';

// T-274 (OWASP): un solo mensaje para credenciales invalidas, nunca se dice
// si el correo existe o no. El limite de intentos (5/60s, ver
// auth.controller.ts) se explica aparte para que el bloqueo se sienta como
// un estado temporal y no como otro error de credenciales.
function mensajeErrorLogin(error: (Error & { statusCode?: number }) | null): string {
  if (!error) return 'No se pudo iniciar sesion. Verifica tu correo y contraseña.';
  if (error.statusCode === 429) {
    return 'Demasiados intentos de inicio de sesion. Espera un minuto antes de volver a intentarlo.';
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
      aviso.exito('Inicio de sesion exitoso', 'Redirigiendo…');
      const user = await getMe().catch(() => null);
      const destination = readNextFromLocation() ?? (isAdminUser(user) ? '/dashboard/admin' : '/dashboard');
      setTimeout(() => router.push(destination), 1200);
    },
    onError: (error) => {
      aviso.error('No se pudo iniciar sesion', mensajeErrorLogin(error as Error & { statusCode?: number }));
    },
  });
}