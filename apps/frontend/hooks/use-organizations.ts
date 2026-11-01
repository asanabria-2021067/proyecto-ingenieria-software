'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  actualizarOrganizacion,
  archivarOrganizacion,
  buscarCandidatos,
  buscarOrganizaciones,
  cambiarRolMiembro,
  cancelarInvitacion,
  crearOrganizacion,
  enviarMensajeOrganizacion,
  getCanalOrganizacion,
  getInvitacionesOrganizacion,
  getMensajesOrganizacion,
  getMisInvitaciones,
  getMisOrganizaciones,
  getOrganizacion,
  getSolicitudesOrganizacion,
  invitarMiembro,
  quitarMiembro,
  resolverSolicitud,
  responderInvitacion,
  salirDeOrganizacion,
  solicitarUnirse,
  transferirOrganizacion,
} from '@/lib/services/organizations';
import {
  buscarOrganizacionesQueryKey,
  candidatosOrgQueryKey,
  canalOrgQueryKey,
  invitacionesOrgQueryKey,
  mensajesOrgQueryKey,
  misInvitacionesOrgQueryKey,
  misOrganizacionesQueryKey,
  organizacionQueryKey,
  solicitudesOrgQueryKey,
} from '@/lib/query-keys/organizations';
import { reintentarSiNoEsTerminal } from '@/lib/api/query-retry';
import type {
  ActualizarOrganizacionInput,
  InvitarInput,
  MensajeOrganizacion,
  RolOrganizacion,
} from '@/lib/types/organizations';

/** Todo cambio de organización refresca listados, buscador y detalle: son pocas consultas y baratas. */
function useRefrescarOrganizaciones() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['organizaciones'] });
}

export function useMisOrganizaciones(enabled = true) {
  return useQuery({ queryKey: misOrganizacionesQueryKey, queryFn: getMisOrganizaciones, enabled, retry: false });
}

export function useBuscarOrganizaciones(q: string, page: number) {
  return useQuery({
    queryKey: buscarOrganizacionesQueryKey(q, page),
    queryFn: () => buscarOrganizaciones(q, page),
    placeholderData: (anterior) => anterior,
  });
}

export function useOrganizacion(id: number) {
  return useQuery({
    queryKey: organizacionQueryKey(id),
    queryFn: () => getOrganizacion(id),
    enabled: id > 0,
    retry: reintentarSiNoEsTerminal,
  });
}

export function useMisInvitacionesOrg(enabled = true) {
  return useQuery({ queryKey: misInvitacionesOrgQueryKey, queryFn: getMisInvitaciones, enabled, retry: false });
}

export function useInvitacionesOrg(id: number, enabled: boolean) {
  return useQuery({ queryKey: invitacionesOrgQueryKey(id), queryFn: () => getInvitacionesOrganizacion(id), enabled });
}

export function useSolicitudesOrg(id: number, enabled: boolean) {
  return useQuery({ queryKey: solicitudesOrgQueryKey(id), queryFn: () => getSolicitudesOrganizacion(id), enabled });
}

/** El backend exige 3 letras como mínimo; con menos no se pide nada. */
export function useCandidatosOrg(id: number, q: string) {
  const consulta = q.trim();
  return useQuery({
    queryKey: candidatosOrgQueryKey(id, consulta),
    queryFn: () => buscarCandidatos(id, consulta),
    enabled: consulta.replace(/\s+/g, '').length >= 3,
  });
}

export function useCrearOrganizacion() {
  const refrescar = useRefrescarOrganizaciones();
  return useMutation({ mutationFn: crearOrganizacion, onSuccess: refrescar });
}

export function useActualizarOrganizacion(id: number) {
  const refrescar = useRefrescarOrganizaciones();
  return useMutation({
    mutationFn: (input: ActualizarOrganizacionInput) => actualizarOrganizacion(id, input),
    onSuccess: refrescar,
  });
}

export function useArchivarOrganizacion(id: number) {
  const refrescar = useRefrescarOrganizaciones();
  return useMutation({ mutationFn: () => archivarOrganizacion(id), onSuccess: refrescar });
}

export function useTransferirOrganizacion(id: number) {
  const refrescar = useRefrescarOrganizaciones();
  return useMutation({ mutationFn: (idUsuario: number) => transferirOrganizacion(id, idUsuario), onSuccess: refrescar });
}

export function useSalirDeOrganizacion(id: number) {
  const refrescar = useRefrescarOrganizaciones();
  return useMutation({ mutationFn: () => salirDeOrganizacion(id), onSuccess: refrescar });
}

export function useCambiarRolMiembro(id: number) {
  const refrescar = useRefrescarOrganizaciones();
  return useMutation({
    mutationFn: ({ idUsuario, rol }: { idUsuario: number; rol: RolOrganizacion }) => cambiarRolMiembro(id, idUsuario, rol),
    onSuccess: refrescar,
  });
}

export function useQuitarMiembro(id: number) {
  const refrescar = useRefrescarOrganizaciones();
  return useMutation({ mutationFn: (idUsuario: number) => quitarMiembro(id, idUsuario), onSuccess: refrescar });
}

export function useInvitarMiembro(id: number) {
  const refrescar = useRefrescarOrganizaciones();
  return useMutation({ mutationFn: (input: InvitarInput) => invitarMiembro(id, input), onSuccess: refrescar });
}

export function useCancelarInvitacion(id: number) {
  const refrescar = useRefrescarOrganizaciones();
  return useMutation({ mutationFn: (idInvitacion: number) => cancelarInvitacion(id, idInvitacion), onSuccess: refrescar });
}

export function useResponderInvitacion() {
  const refrescar = useRefrescarOrganizaciones();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ idInvitacion, aceptar }: { idInvitacion: number; aceptar: boolean }) =>
      responderInvitacion(idInvitacion, aceptar),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
      return refrescar();
    },
  });
}

export function useSolicitarUnirse() {
  const refrescar = useRefrescarOrganizaciones();
  return useMutation({ mutationFn: solicitarUnirse, onSuccess: refrescar });
}

export function useResolverSolicitud(id: number) {
  const refrescar = useRefrescarOrganizaciones();
  return useMutation({
    mutationFn: ({ idSolicitud, aceptar }: { idSolicitud: number; aceptar: boolean }) =>
      resolverSolicitud(id, idSolicitud, aceptar),
    onSuccess: refrescar,
  });
}

export function useCanalOrganizacion(id: number, enabled: boolean) {
  return useQuery({ queryKey: canalOrgQueryKey(id), queryFn: () => getCanalOrganizacion(id), enabled, retry: false });
}

/**
 * Mensajes del canal #general. La clave coincide con la de los mensajes de proyecto, así el socket global del
 * chat los actualiza; el sondeo cubre el caso de que la sala del canal no esté unida.
 */
export function useMensajesOrganizacion(id: number, idConversacion: number | null) {
  return useQuery({
    queryKey: mensajesOrgQueryKey(idConversacion ?? 0),
    queryFn: () => getMensajesOrganizacion(id),
    enabled: idConversacion != null,
    refetchInterval: 10_000,
  });
}

export function useEnviarMensajeOrganizacion(id: number, idConversacion: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contenido: string) => enviarMensajeOrganizacion(id, contenido),
    onSuccess: (mensaje) => {
      queryClient.setQueryData<MensajeOrganizacion[]>(mensajesOrgQueryKey(idConversacion ?? 0), (actual = []) =>
        actual.some((m) => m.idMensaje === mensaje.idMensaje) ? actual : [...actual, mensaje],
      );
    },
  });
}
