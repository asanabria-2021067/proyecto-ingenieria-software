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
    comment?: string;
  };
  TAREA_ASIGNADA: {
    taskTitle: string;
    projectTitle: string;
    assignedBy: string;
    taskId: number;
    projectId: number;
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
} as const;

export type NotificationTemplateKey = keyof typeof NOTIFICATION_TEMPLATES;
