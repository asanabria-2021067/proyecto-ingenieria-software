export const misOrganizacionesQueryKey = ['organizaciones', 'mias'] as const;

export const plantillasOrgQueryKey = ['organizaciones', 'plantillas'] as const;

export const misInvitacionesOrgQueryKey = ['organizaciones', 'invitaciones-mias'] as const;

export const buscarOrganizacionesQueryKey = (q: string, page: number) =>
  ['organizaciones', 'buscar', q, page] as const;

export const organizacionQueryKey = (id: number) => ['organizaciones', 'detalle', id] as const;

export const invitacionesOrgQueryKey = (id: number) => ['organizaciones', 'detalle', id, 'invitaciones'] as const;

export const solicitudesOrgQueryKey = (id: number) => ['organizaciones', 'detalle', id, 'solicitudes'] as const;

export const candidatosOrgQueryKey = (id: number, q: string) =>
  ['organizaciones', 'detalle', id, 'candidatos', q] as const;

export const canalOrgQueryKey = (id: number) => ['organizaciones', 'detalle', id, 'chat'] as const;

/**
 * Misma forma que las claves de mensajes de proyecto (`proyecto-conversaciones`, 0, idConversacion, 'mensajes'):
 * el socket global del chat actualiza por `idConversacion` sin distinguir el proyecto.
 */
export const mensajesOrgQueryKey = (idConversacion: number) =>
  ['proyecto-conversaciones', 0, idConversacion, 'mensajes'] as const;
