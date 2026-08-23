'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { logout } from '@/lib/services/auth';
import uvgSwal from '@/lib/swal';

/** Confirmación + limpieza de sesión compartida entre DashboardLayout y AdminLayout. */
export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async () => {
    const result = await uvgSwal.fire({
      icon: 'question',
      title: 'Cerrar sesion',
      text: 'Tu sesion actual se cerrara en este dispositivo.',
      showCancelButton: true,
      confirmButtonText: 'Si, cerrar sesion',
      cancelButtonText: 'Cancelar',
    });

    if (!result.isConfirmed) return;

    await logout().catch(() => null);
    queryClient.clear();
    router.replace('/login');
  };
}
