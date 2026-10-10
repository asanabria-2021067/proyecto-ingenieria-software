'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useCurrentUser } from '@/hooks/use-current-user';
import { puede, type AccionPermiso } from '@/lib/permissions/matriz-permisos';

export const MENSAJE_SIN_PERMISO = 'No tienes permiso para acceder a esa pantalla.';
export const RUTA_SIN_PERMISO = '/dashboard';

interface OpcionesPermiso {
  esLider?: boolean;
}

interface OpcionesRequerirPermiso extends OpcionesPermiso {
  listo?: boolean;
  activo?: boolean;
}

export function avisarSinPermiso() {
  toast.error(MENSAJE_SIN_PERMISO, { id: 'sin-permiso' });
}

export function useCan(accion: AccionPermiso, { esLider = false }: OpcionesPermiso = {}): boolean {
  const { data: user } = useCurrentUser();
  if (!user) return false;
  return puede(accion, user.roles, esLider);
}

export function useRequireCan(
  accion: AccionPermiso,
  { esLider = false, listo = true, activo = true }: OpcionesRequerirPermiso = {},
) {
  const router = useRouter();
  const { data: user, isLoading } = useCurrentUser();
  const permitido = useCan(accion, { esLider });
  const denegado = activo && listo && !!user && !permitido;
  const verificando = activo && (isLoading || (!!user && !listo));

  useEffect(() => {
    if (!denegado) return;
    avisarSinPermiso();
    router.replace(RUTA_SIN_PERMISO);
  }, [denegado, router]);

  return { permitido, denegado, verificando };
}
