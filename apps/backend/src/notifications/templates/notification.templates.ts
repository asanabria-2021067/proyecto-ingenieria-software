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
    revisionId?: number;
    numeroRevision?: number;
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
  // Ampliación roles/participación (Sección 18A): un integrante dejó un rol.
  // Se envía una notificación consolidada por destinatario (nunca una por
  // tarea afectada). taskCount = tareas del rol que quedaron sin asignar.
  ROL_ABANDONADO: {
    userName: string;
    roleName: string;
    projectTitle: string;
    projectId: number;
    roleId: number;
    taskCount: number;
  };

  // Sección 18B: el líder se auto-asignó a un rol. El actor (líder) siempre se
  // excluye de los destinatarios, por lo que puede resultar en cero envíos.
  ROL_ASIGNADO_LIDER: {
    userName: string;
    roleName: string;
    projectTitle: string;
    projectId: number;
    roleId: number;
  };

  // Sección 18C: el líder modificó datos relevantes de un rol utilizado.
  ROL_ACTUALIZADO: {
    roleName: string;
    projectTitle: string;
    projectId: number;
    roleId: number;
  };

  SOLICITUD_RECUPERACION_CONTRASENA: {
    userName: string;
    carne: string;
    solicitudId: number;
  };

  // T-113 (HU-125, salida completa del proyecto): notifica al solicitante la
  // resolución de su SolicitudSalidaProyecto. Reutiliza
  // TipoNotificacion.PARTICIPACION_ACTUALIZADA — existe en el schema desde la
  // migración inicial y no tenía ninguna plantilla asociada. Se descartó
  // ROL_ABANDONADO a propósito: esa semántica es abandonar UN rol, mientras
  // que HU-125 es la salida completa del proyecto (todas las participaciones
  // ACTIVO). `approved` distingue aprobación/rechazo dentro del mismo tipo,
  // igual que POSTULACION_RESUELTA.accepted.
  PARTICIPACION_ACTUALIZADA: {
    projectTitle: string;
    projectId: number;
    approved: boolean;
  };

  // HORAS_VALIDADAS ya existía en el enum sin plantilla asociada.
  HORAS_VALIDADAS: {
    projectTitle: string;
    projectId: number;
    horasReconocidas: number;
    fueAjustado: boolean;
  };

  SOLICITUD_AMISTAD: {
    userName: string;
    idAmistad: number;
  };

  AMISTAD_ACEPTADA: {
    userName: string;
    idAmistad: number;
  };

  NUEVO_SEGUIDOR: {
    userName: string;
  };

  // ---- Sprint 7 (06 v2 §44): plantillas de los ocho valores añadidos por M6. Importes de horas como
  // strings decimales de dos posiciones (§8); ningún emisor las usa todavía. ----
  APELACION_LIDERAZGO_RECIBIDA: {
    projectTitle: string;
    projectId: number;
    appealId: number;
    asunto: string;
    leaderName: string;
  };
  APELACION_LIDERAZGO_RESUELTA: {
    projectTitle: string;
    projectId: number;
    appealId: number;
    accepted: boolean;
    newLeaderName?: string | null;
    mensajeResolucion?: string | null;
  };
  LIDERAZGO_ACTUALIZADO: {
    projectTitle: string;
    projectId: number;
    previousLeaderName: string;
    newLeaderName: string;
    /** Destinatario: líder saliente, líder nuevo o integrante activo del equipo. */
    audiencia: 'SALIENTE' | 'NUEVO' | 'EQUIPO';
    /** Solo para el saliente: efecto real Q1 según su participación activa al confirmar. */
    salienteConservaMembresia?: boolean;
  };
  POSTULACION_RECHAZADA_POR_CIERRE: {
    projectTitle: string;
    projectId: number;
    applicationId: number;
    roleName: string;
  };
  CIERRE_CORRECCION_DOCUMENTAL: {
    projectTitle: string;
    projectId: number;
    revisionId: number;
    numeroRevision: number;
    comentario: string;
  };
  CIERRE_DEVUELTO_A_EJECUCION: {
    projectTitle: string;
    projectId: number;
    revisionId: number;
    comentario: string;
  };
  HORAS_CONSOLIDADAS: {
    projectTitle: string;
    projectId: number;
    sprintId: number;
    numeroSprint: number;
    horasReportadas: string;
    horasPropuestas: string;
  };
  HORAS_ACREDITADAS: {
    projectTitle: string;
    projectId: number;
    horasAcreditadas: string;
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
      `El líder solicitó cierre para "${data.projectTitle}"${data.numeroRevision === undefined ? '' : ` con la revisión ${data.numeroRevision}`}.`,
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
  ROL_ABANDONADO: {
    title: 'Un integrante dejó un rol',
    message: (data: NotificationTemplateData['ROL_ABANDONADO']) =>
      data.taskCount > 0
        ? `${data.userName} dejó el rol "${data.roleName}" en "${data.projectTitle}". ${data.taskCount} ${
            data.taskCount === 1 ? 'tarea quedó' : 'tareas quedaron'
          } sin asignar.`
        : `${data.userName} dejó el rol "${data.roleName}" en "${data.projectTitle}".`,
  },

  ROL_ASIGNADO_LIDER: {
    title: 'El líder se unió a un rol',
    message: (data: NotificationTemplateData['ROL_ASIGNADO_LIDER']) =>
      `${data.userName} se asignó al rol "${data.roleName}" en el proyecto "${data.projectTitle}".`,
  },

  ROL_ACTUALIZADO: {
    title: 'Un rol fue actualizado',
    message: (data: NotificationTemplateData['ROL_ACTUALIZADO']) =>
      `El rol "${data.roleName}" del proyecto "${data.projectTitle}" fue actualizado.`,
  },

  SOLICITUD_RECUPERACION_CONTRASENA: {
    title: 'Solicitud de recuperación de contraseña',
    message: (
      data: NotificationTemplateData['SOLICITUD_RECUPERACION_CONTRASENA'],
    ) =>
      `${data.userName} (carné ${data.carne}) solicitó recuperar su contraseña.`,
  },

  PARTICIPACION_ACTUALIZADA: {
    title: (data: NotificationTemplateData['PARTICIPACION_ACTUALIZADA']) =>
      data.approved ? 'Tu salida del proyecto fue aprobada' : 'Tu solicitud de salida fue rechazada',
    message: (data: NotificationTemplateData['PARTICIPACION_ACTUALIZADA']) =>
      data.approved
        ? `Tu solicitud de salida de "${data.projectTitle}" fue aprobada. Tu participación en el proyecto quedó en estado RETIRADO.`
        : `Tu solicitud de salida de "${data.projectTitle}" fue rechazada. Continúas activo en el proyecto.`,
  },

  HORAS_VALIDADAS: {
    title: 'Se validaron tus horas',
    message: (data: NotificationTemplateData['HORAS_VALIDADAS']) =>
      data.fueAjustado
        ? `Se cerró tu participación en "${data.projectTitle}" con ${data.horasReconocidas} horas reconocidas (con ajuste justificado).`
        : `Se cerró tu participación en "${data.projectTitle}" con ${data.horasReconocidas} horas reconocidas.`,
  },

  SOLICITUD_AMISTAD: {
    title: 'Nueva solicitud de amistad',
    message: (data: NotificationTemplateData['SOLICITUD_AMISTAD']) =>
      `${data.userName} te envió una solicitud de amistad.`,
  },

  AMISTAD_ACEPTADA: {
    title: 'Solicitud de amistad aceptada',
    message: (data: NotificationTemplateData['AMISTAD_ACEPTADA']) =>
      `${data.userName} aceptó tu solicitud de amistad.`,
  },

  NUEVO_SEGUIDOR: {
    title: 'Nuevo seguidor',
    message: (data: NotificationTemplateData['NUEVO_SEGUIDOR']) =>
      `${data.userName} comenzó a seguirte.`,
  },

  // ---- Sprint 7 (06 v2 §44) ----
  APELACION_LIDERAZGO_RECIBIDA: {
    title: 'Nueva apelación de liderazgo',
    message: (data: NotificationTemplateData['APELACION_LIDERAZGO_RECIBIDA']) =>
      `${data.leaderName} solicitó transferir el liderazgo del proyecto "${data.projectTitle}": ${data.asunto}. Revisa la apelación para aceptarla o denegarla.`,
  },
  APELACION_LIDERAZGO_RESUELTA: {
    title: (data: NotificationTemplateData['APELACION_LIDERAZGO_RESUELTA']) =>
      data.accepted ? 'Tu apelación de liderazgo fue aceptada' : 'Tu apelación de liderazgo fue denegada',
    message: (data: NotificationTemplateData['APELACION_LIDERAZGO_RESUELTA']) =>
      data.accepted
        ? `La transferencia del liderazgo de "${data.projectTitle}" fue aceptada. ${data.newLeaderName ?? 'El sucesor designado'} es el nuevo líder.`
        : `Tu apelación para transferir el liderazgo de "${data.projectTitle}" fue denegada.${data.mensajeResolucion ? ` Motivo: ${data.mensajeResolucion}` : ''}`,
  },
  LIDERAZGO_ACTUALIZADO: {
    title: 'Liderazgo del proyecto actualizado',
    message: (data: NotificationTemplateData['LIDERAZGO_ACTUALIZADO']) => {
      if (data.audiencia === 'NUEVO') {
        return `Ahora eres el líder del proyecto "${data.projectTitle}". ${data.previousLeaderName} dejó el liderazgo.`;
      }
      if (data.audiencia === 'SALIENTE') {
        return data.salienteConservaMembresia
          ? `Dejaste el liderazgo de "${data.projectTitle}"; ${data.newLeaderName} es el nuevo líder. Conservas tus roles y continúas como integrante del proyecto.`
          : `Dejaste el liderazgo de "${data.projectTitle}"; ${data.newLeaderName} es el nuevo líder. Al no tener una participación activa, ya no tienes acceso como integrante del proyecto. Tu historial como líder permanece registrado.`;
      }
      return `${data.newLeaderName} es el nuevo líder del proyecto "${data.projectTitle}" en reemplazo de ${data.previousLeaderName}.`;
    },
  },
  POSTULACION_RECHAZADA_POR_CIERRE: {
    title: (data: NotificationTemplateData['POSTULACION_RECHAZADA_POR_CIERRE']) =>
      `Postulación al proyecto "${data.projectTitle}" rechazada`,
    message: () =>
      'Tu postulación fue rechazada automáticamente porque el proyecto inició su proceso de cierre',
  },
  CIERRE_CORRECCION_DOCUMENTAL: {
    title: 'Corrección documental solicitada',
    message: (data: NotificationTemplateData['CIERRE_CORRECCION_DOCUMENTAL']) =>
      `El administrador solicitó una corrección documental del cierre de "${data.projectTitle}" y abrió el borrador ${data.numeroRevision}. Comentario: ${data.comentario}`,
  },
  CIERRE_DEVUELTO_A_EJECUCION: {
    title: 'Cierre devuelto a ejecución',
    message: (data: NotificationTemplateData['CIERRE_DEVUELTO_A_EJECUCION']) =>
      `El administrador devolvió el proyecto "${data.projectTitle}" a ejecución. Comentario: ${data.comentario}`,
  },
  HORAS_CONSOLIDADAS: {
    title: 'Horas consolidadas del Sprint',
    message: (data: NotificationTemplateData['HORAS_CONSOLIDADAS']) =>
      `En el Sprint ${data.numeroSprint} de "${data.projectTitle}" se consolidaron ${data.horasReportadas} horas reportadas y ${data.horasPropuestas} horas propuestas. Quedan pendientes hasta el cierre administrativo del proyecto.`,
  },
  HORAS_ACREDITADAS: {
    title: 'Horas acreditadas',
    message: (data: NotificationTemplateData['HORAS_ACREDITADAS']) =>
      `Se acreditaron ${data.horasAcreditadas} horas por tu participación en el proyecto "${data.projectTitle}".`,
  },
} as const;

export type NotificationTemplateKey = keyof typeof NOTIFICATION_TEMPLATES;
