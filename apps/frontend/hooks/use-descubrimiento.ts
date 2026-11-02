'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dejarAsociacion,
  dejarOrganizacion,
  duplicarProyecto,
  getAsociacionesSeguibles,
  getMisInvitacionesRol,
  getMisSeguimientos,
  getProyectosParaTi,
  getSugerenciasInvitado,
  invitarARol,
  responderInvitacionRol,
  seguirAsociacion,
  seguirOrganizacion,
  type DuenioProyecto,
} from '@/lib/services/descubrimiento';

const seguimientosKey = ['seguimientos'] as const;
const invitacionesRolKey = ['invitaciones-rol'] as const;

/** MEJ-15: «Para ti» solo se consulta cuando la vista está activa. */
export function useProyectosParaTi(activo: boolean, duenio: DuenioProyecto | '') {
  return useQuery({
    queryKey: ['proyectos', 'para-ti', duenio],
    queryFn: () => getProyectosParaTi(duenio),
    enabled: activo,
  });
}

export function useDuplicarProyecto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: duplicarProyecto,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useMisSeguimientos() {
  return useQuery({ queryKey: [...seguimientosKey, 'mios'], queryFn: getMisSeguimientos });
}

export function useAsociacionesSeguibles() {
  return useQuery({ queryKey: [...seguimientosKey, 'asociaciones'], queryFn: getAsociacionesSeguibles });
}

/** Seguir / dejar de seguir una organización o una asociación; refresca ambos listados. */
export function useAlternarSeguimiento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tipo, id, seguir }: { tipo: 'organizacion' | 'asociacion'; id: number; seguir: boolean }) => {
      if (tipo === 'organizacion') return seguir ? seguirOrganizacion(id) : dejarOrganizacion(id);
      return seguir ? seguirAsociacion(id) : dejarAsociacion(id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: seguimientosKey }),
  });
}

export function useMisInvitacionesRol() {
  return useQuery({ queryKey: [...invitacionesRolKey, 'mias'], queryFn: getMisInvitacionesRol });
}

export function useInvitarARol() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: invitarARol,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitacionesRolKey }),
  });
}

export function useResponderInvitacionRol() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, aceptar }: { id: number; aceptar: boolean }) => responderInvitacionRol(id, aceptar),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitacionesRolKey });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['proyectos'] });
    },
  });
}

export function useSugerenciasInvitado(params: { habilidades: number[]; idCarrera?: number | null; idProyecto?: number }) {
  const habilidades = [...params.habilidades].sort((a, b) => a - b);
  return useQuery({
    queryKey: [...invitacionesRolKey, 'sugerencias', habilidades, params.idCarrera ?? null, params.idProyecto ?? null],
    queryFn: () => getSugerenciasInvitado({ ...params, habilidades }),
    enabled: habilidades.length > 0 || Boolean(params.idCarrera),
    staleTime: 30_000,
  });
}
