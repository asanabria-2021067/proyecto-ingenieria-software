export interface NotificationTemplateData {
  NUEVA_POSTULACION: {
    userName: string;
    roleName: string;
    projectTitle: string;
    projectId: number;
    applicationId: number;
    roleId: number;
  };
  POSTULACION_RESUELTA: {
    roleName: string;
    projectTitle: string;
    projectId: number;
    applicationId: number;
    roleId: number;
    accepted: boolean;
    comment?: string | null;
  };
  TAREA_ASIGNADA: {
    taskTitle: string;
    projectTitle: string;
    assignedBy: string;
    taskId: number;
    projectId: number;
  };
  // Reutiliza TipoNotificacion.TAREA_ACTUALIZADA (Tarea 25): no existe un
  // valor de enum dedicado a "tarea desasignada" y esta tarea no puede
  // agregar un enum Prisma ni una migración. TAREA_ACTUALIZADA ya existía
  // en el schema sin ninguna plantilla asociada.
  TAREA_ACTUALIZADA: {
    taskTitle: string;
    projectTitle: string;
    unassignedBy: string;
    taskId: number;
    projectId: number;
  };
  PROYECTO_EN_REVISION: {
    projectTitle: string;
    projectId: number;
    numeroEnvio: number;
    isResubmission?: boolean;
  };
  PROYECTO_OBSERVADO: {
    projectTitle: string;
    projectId: number;
    revisionId: number;
    comment?: string | null;
  };
  PROYECTO_APROBADO: {
    projectTitle: string;
    projectId: number;
    revisionId: number;
  };
  PROYECTO_ACTUALIZADO: {
    projectTitle: string;
    projectId: number;
    reason?: 'draft_inactivity_cancelled' | string;
  };
  PROYECTO_PUBLICADO: {
    projectTitle: string;
    projectId: number;
  };
  CAMBIO_ESTADO_PROYECTO: {
    projectTitle: string;
    oldStatus: string;
    newStatus: string;
    projectId: number;
  };
  SOLICITUD_CIERRE_PROYECTO: {
    projectTitle: string;
    projectId: number;
  };
  CIERRE_APROBADO: {
    projectTitle: string;
    projectId: number;
  };
  CIERRE_RECHAZADO: {
    projectTitle: string;
    projectId: number;
  };
  PROYECTO_ADVERTENCIA_INACTIVIDAD: {
    projectTitle: string;
    projectId: number;
    diasInactividad: number;
  };
}

export const NOTIFICATION_TEMPLATES = {
  NUEVA_POSTULACION: {
    title: 'Nueva postulación recibida',
    message: (data: NotificationTemplateData['NUEVA_POSTULACION']) =>
      `${data.userName} se postuló para el rol "${data.roleName}" en tu proyecto "${data.projectTitle}".`,
  },
  POSTULACION_RESUELTA: {
    title: (data: NotificationTemplateData['POSTULACION_RESUELTA']) =>
      data.accepted ? 'Tu postulación fue aceptada' : 'Tu postulación fue rechazada',
    message: (data: NotificationTemplateData['POSTULACION_RESUELTA']) =>
      data.accepted
        ? `Felicidades, tu postulación para el rol "${data.roleName}" en el proyecto "${data.projectTitle}" ha sido aceptada.`
        : `Tu postulación para el rol "${data.roleName}" en el proyecto "${data.projectTitle}" ha sido rechazada.${data.comment ? ` Comentario: ${data.comment}` : ''}`,
  },
  TAREA_ASIGNADA: {
    title: 'Nueva tarea asignada',
    message: (data: NotificationTemplateData['TAREA_ASIGNADA']) =>
      `${data.assignedBy} te asignó la tarea "${data.taskTitle}" en el proyecto "${data.projectTitle}".`,
  },
  TAREA_ACTUALIZADA: {
    title: 'Ya no estás asignado a esta tarea',
    message: (data: NotificationTemplateData['TAREA_ACTUALIZADA']) =>
      `${data.unassignedBy} te quitó la asignación de la tarea "${data.taskTitle}" en el proyecto "${data.projectTitle}".`,
  },
  PROYECTO_EN_REVISION: {
    title: (data: NotificationTemplateData['PROYECTO_EN_REVISION']) =>
      data.isResubmission ? 'Proyecto reenviado a revisión' : 'Proyecto enviado a revisión',
    message: (data: NotificationTemplateData['PROYECTO_EN_REVISION']) =>
      data.isResubmission
        ? `El proyecto "${data.projectTitle}" fue reenviado a revisión (envío ${data.numeroEnvio}).`
        : `El proyecto "${data.projectTitle}" fue enviado a revisión (envío ${data.numeroEnvio}).`,
  },
  PROYECTO_OBSERVADO: {
    title: 'Proyecto observado',
    message: (data: NotificationTemplateData['PROYECTO_OBSERVADO']) =>
      `Tu proyecto "${data.projectTitle}" recibió observaciones. Revisa el feedback.${data.comment ? ` Comentario: ${data.comment}` : ''}`,
  },
  PROYECTO_APROBADO: {
    title: 'Proyecto aprobado',
    message: (data: NotificationTemplateData['PROYECTO_APROBADO']) =>
      `Tu proyecto "${data.projectTitle}" fue aprobado y publicado.`,
  },
  PROYECTO_ACTUALIZADO: {
    title: (data: NotificationTemplateData['PROYECTO_ACTUALIZADO']) =>
      data.reason === 'draft_inactivity_cancelled'
        ? 'Proyecto cancelado por inactividad'
        : 'Proyecto actualizado',
    message: (data: NotificationTemplateData['PROYECTO_ACTUALIZADO']) =>
      data.reason === 'draft_inactivity_cancelled'
        ? `Tu borrador "${data.projectTitle}" fue cancelado por inactividad.`
        : `El proyecto "${data.projectTitle}" fue actualizado.`,
  },
  PROYECTO_PUBLICADO: {
    title: 'Proyecto publicado exitosamente',
    message: (data: NotificationTemplateData['PROYECTO_PUBLICADO']) =>
      `Tu proyecto "${data.projectTitle}" ha sido publicado y ahora está visible para todos los usuarios.`,
  },
  CAMBIO_ESTADO_PROYECTO: {
    title: 'Estado del proyecto actualizado',
    message: (data: NotificationTemplateData['CAMBIO_ESTADO_PROYECTO']) =>
      `El estado de tu proyecto "${data.projectTitle}" cambió de ${data.oldStatus} a ${data.newStatus}.`,
  },
  SOLICITUD_CIERRE_PROYECTO: {
    title: 'Solicitud de cierre de proyecto',
    message: (data: NotificationTemplateData['SOLICITUD_CIERRE_PROYECTO']) =>
      `El líder solicitó cierre para "${data.projectTitle}".`,
  },
  CIERRE_APROBADO: {
    title: 'Cierre de proyecto aprobado',
    message: (data: NotificationTemplateData['CIERRE_APROBADO']) =>
      `El cierre administrativo de "${data.projectTitle}" fue aprobado.`,
  },
  CIERRE_RECHAZADO: {
    title: 'Cierre de proyecto rechazado',
    message: (data: NotificationTemplateData['CIERRE_RECHAZADO']) =>
      `La solicitud de cierre de "${data.projectTitle}" fue rechazada.`,
  },
  PROYECTO_ADVERTENCIA_INACTIVIDAD: {
    title: 'Borrador inactivo',
    message: (data: NotificationTemplateData['PROYECTO_ADVERTENCIA_INACTIVIDAD']) =>
      `Tu borrador "${data.projectTitle}" lleva más de ${data.diasInactividad} días sin actividad.`,
  },
} as const;

export type NotificationTemplateKey = keyof typeof NOTIFICATION_TEMPLATES;
