/**
 * T-328 — catálogo de PRESENTACIÓN de las preferencias de notificación.
 *
 * El contrato es el de HU-185 (backend de notificaciones), sin cambios:
 *   GET /notificaciones/preferencias  -> [{ tipo, activa }] con TODOS los tipos del enum
 *   PUT /notificaciones/preferencias  { tipo, activa } -> la lista completa actualizada
 *
 * Lo que este archivo decide es solo cómo se nombran y agrupan los tipos en el
 * perfil. No decide quién recibe qué (eso lo resuelve el backend al emitir) ni
 * oculta tipos: lo que llegue en la respuesta se muestra.
 *
 * Hechos del contrato que la interfaz respeta:
 *  - Sin fila guardada, un tipo está ACTIVO: el backend ya lo informa así.
 *  - El backend no marca ningún tipo como obligatorio; todos admiten PUT. La
 *    interfaz no inventa una lista de «no desactivables».
 *  - NO existe un tipo de notificación para mensajes de chat: el chat entrega
 *    sus mensajes y contadores por su propio canal y no crea notificaciones.
 *    Por eso no hay un interruptor «Chat»; añadirlo exige un tipo nuevo en el
 *    backend, que es decisión de su responsable. `MENSAJE_REVISION` es el hilo
 *    de revisión de publicación de un proyecto, no el chat.
 */

export interface NotificationPreference {
  tipo: string;
  activa: boolean;
}

export const NOTIFICATION_GROUP_IDS = [
  'tareas',
  'postulaciones',
  'proyectos',
  'horas',
  'recordatorios',
  'contactos',
  'organizaciones',
  'cuenta',
  'otras',
] as const;
export type NotificationGroupId = (typeof NOTIFICATION_GROUP_IDS)[number];

export const NOTIFICATION_GROUP_LABEL: Record<NotificationGroupId, { titulo: string; descripcion: string }> = {
  tareas: { titulo: 'Tareas e hitos', descripcion: 'Asignaciones, cambios y comentarios en tu trabajo.' },
  postulaciones: { titulo: 'Postulaciones y equipo', descripcion: 'Postulaciones, roles y participación en proyectos.' },
  proyectos: { titulo: 'Proyectos', descripcion: 'Publicación, revisión, liderazgo y cierre de proyectos.' },
  horas: { titulo: 'Horas y reconocimiento', descripcion: 'Validación y acreditación de tus horas.' },
  recordatorios: { titulo: 'Recordatorios y calendario', descripcion: 'Eventos próximos, reuniones de Administración y calendarios compartidos.' },
  contactos: { titulo: 'Red de contactos', descripcion: 'Solicitudes de amistad y seguidores.' },
  organizaciones: { titulo: 'Organizaciones y asociaciones', descripcion: 'Invitaciones, solicitudes y cambios en organizaciones y juntas de asociación.' },
  cuenta: { titulo: 'Cuenta y seguridad', descripcion: 'Avisos sobre accesos y recuperación de contraseñas.' },
  otras: { titulo: 'Otras notificaciones', descripcion: 'Tipos que la plataforma añadió y aún no tienen una descripción propia.' },
};

interface TypePresentation {
  grupo: Exclude<NotificationGroupId, 'otras'>;
  etiqueta: string;
  descripcion: string;
}

/** Un registro por cada valor de `TipoNotificacion` (apps/backend/prisma/schema.prisma). */
export const NOTIFICATION_TYPE_PRESENTATION: Record<string, TypePresentation> = {
  TAREA_ASIGNADA: { grupo: 'tareas', etiqueta: 'Tarea asignada', descripcion: 'Te asignan una tarea.' },
  TAREA_ACTUALIZADA: { grupo: 'tareas', etiqueta: 'Tarea actualizada', descripcion: 'Cambia una tarea en la que participas.' },
  HITO_ACTUALIZADO: { grupo: 'tareas', etiqueta: 'Hito actualizado', descripcion: 'Cambia un hito de tu proyecto.' },
  COMENTARIO_TAREA: { grupo: 'tareas', etiqueta: 'Comentario en una tarea', descripcion: 'Alguien comenta una tarea tuya.' },
  COMENTARIO_HITO: { grupo: 'tareas', etiqueta: 'Comentario en un hito', descripcion: 'Alguien comenta un hito de tu proyecto.' },
  MENCION_COMENTARIO: {
    grupo: 'tareas',
    etiqueta: 'Menciones en comentarios',
    descripcion: 'Alguien te menciona con @ en un comentario de tarea, hito o proyecto.',
  },
  EVIDENCIA_REVISADA: { grupo: 'tareas', etiqueta: 'Evidencia revisada', descripcion: 'Revisan una evidencia que entregaste.' },
  TAREA_POR_VENCER: { grupo: 'tareas', etiqueta: 'Tarea por vencer', descripcion: 'Una tarea tuya está cerca de su fecha límite.' },
  HITO_ATRASADO: { grupo: 'tareas', etiqueta: 'Hito atrasado', descripcion: 'Un hito de un proyecto que lideras pasó su fecha límite sin completarse.' },
  TU_SEMANA: { grupo: 'tareas', etiqueta: 'Tu semana', descripcion: 'Cada lunes: tareas por vencer, horas de la semana pasada y postulaciones pendientes.' },

  NUEVA_POSTULACION: { grupo: 'postulaciones', etiqueta: 'Nueva postulación', descripcion: 'Alguien se postula a un rol de tu proyecto.' },
  POSTULACION_RESUELTA: { grupo: 'postulaciones', etiqueta: 'Postulación resuelta', descripcion: 'Aceptan o rechazan tu postulación.' },
  POSTULACION_RECHAZADA_POR_CIERRE: {
    grupo: 'postulaciones',
    etiqueta: 'Postulación cerrada por fin del proyecto',
    descripcion: 'Tu postulación se cierra porque el proyecto terminó.',
  },
  PARTICIPACION_ACTUALIZADA: { grupo: 'postulaciones', etiqueta: 'Participación actualizada', descripcion: 'Cambia tu participación en un proyecto.' },
  ROL_ABANDONADO: { grupo: 'postulaciones', etiqueta: 'Rol abandonado', descripcion: 'Un integrante deja su rol en tu proyecto.' },
  ROL_ASIGNADO_LIDER: { grupo: 'postulaciones', etiqueta: 'Rol asignado por el líder', descripcion: 'El líder te asigna un rol.' },
  ROL_ACTUALIZADO: { grupo: 'postulaciones', etiqueta: 'Rol actualizado', descripcion: 'Cambia un rol del proyecto.' },
  INVITACION_ORGANIZACION: {
    grupo: 'organizaciones',
    etiqueta: 'Invitación a una organización',
    descripcion: 'Te invitan a unirte a una organización.',
  },
  SOLICITUD_UNIRSE_ORGANIZACION: {
    grupo: 'organizaciones',
    etiqueta: 'Solicitud para unirse a una organización',
    descripcion: 'Alguien pide unirse a una organización que administras.',
  },
  ORGANIZACION_ACTUALIZADA: {
    grupo: 'organizaciones',
    etiqueta: 'Organización actualizada',
    descripcion: 'Cambia tu pertenencia o rol en una organización, o responden a tu invitación.',
  },

  PROYECTO_NUEVO_PARA_TI: {
    grupo: 'proyectos',
    etiqueta: 'Proyecto nuevo para ti',
    descripcion: 'Se publica un proyecto de tu carrera, de tus intereses o de una organización o asociación que sigues.',
  },
  PROYECTO_GUARDADO_AVISO: {
    grupo: 'proyectos',
    etiqueta: 'Aviso de un proyecto guardado',
    descripcion: 'A un proyecto que guardaste le quedan pocos cupos o pasa a solicitud de cierre.',
  },
  INVITACION_ROL_PROYECTO: {
    grupo: 'postulaciones',
    etiqueta: 'Invitación a un rol',
    descripcion: 'Un líder te invita a un rol, o responde a tu invitación.',
  },

  PROYECTO_PUBLICADO: { grupo: 'proyectos', etiqueta: 'Proyecto publicado', descripcion: 'Se publica un proyecto.' },
  PROYECTO_EN_REVISION: { grupo: 'proyectos', etiqueta: 'Proyecto en revisión', descripcion: 'Un proyecto entra a revisión de publicación.' },
  PROYECTO_OBSERVADO: { grupo: 'proyectos', etiqueta: 'Proyecto con observaciones', descripcion: 'La revisión devuelve observaciones.' },
  PROYECTO_APROBADO: { grupo: 'proyectos', etiqueta: 'Proyecto aprobado', descripcion: 'Aprueban la publicación de tu proyecto.' },
  PROYECTO_ACTUALIZADO: { grupo: 'proyectos', etiqueta: 'Proyecto actualizado', descripcion: 'Cambian los datos de un proyecto tuyo.' },
  CAMBIO_ESTADO_PROYECTO: { grupo: 'proyectos', etiqueta: 'Cambio de estado del proyecto', descripcion: 'Un proyecto cambia de estado.' },
  COMENTARIO_PROYECTO: { grupo: 'proyectos', etiqueta: 'Comentario en el proyecto', descripcion: 'Alguien comenta en tu proyecto.' },
  MENSAJE_REVISION: { grupo: 'proyectos', etiqueta: 'Mensaje de la revisión', descripcion: 'Hay un mensaje nuevo en la revisión de publicación.' },
  PROYECTO_ADVERTENCIA_INACTIVIDAD: {
    grupo: 'proyectos',
    etiqueta: 'Aviso de inactividad',
    descripcion: 'Un proyecto lleva tiempo sin actividad.',
  },
  SOLICITUD_CIERRE_PROYECTO: { grupo: 'proyectos', etiqueta: 'Solicitud de cierre', descripcion: 'Se solicita cerrar un proyecto.' },
  CIERRE_APROBADO: { grupo: 'proyectos', etiqueta: 'Cierre aprobado', descripcion: 'Aprueban el cierre de tu proyecto.' },
  CIERRE_RECHAZADO: { grupo: 'proyectos', etiqueta: 'Cierre rechazado', descripcion: 'Rechazan el cierre de tu proyecto.' },
  CIERRE_CORRECCION_DOCUMENTAL: {
    grupo: 'proyectos',
    etiqueta: 'Corrección de documentos de cierre',
    descripcion: 'Piden corregir la documentación del cierre.',
  },
  CIERRE_DEVUELTO_A_EJECUCION: {
    grupo: 'proyectos',
    etiqueta: 'Cierre devuelto a ejecución',
    descripcion: 'El proyecto vuelve a ejecución tras la revisión del cierre.',
  },
  LIDERAZGO_ACTUALIZADO: { grupo: 'proyectos', etiqueta: 'Cambio de liderazgo', descripcion: 'Cambia quién lidera un proyecto.' },
  APELACION_LIDERAZGO_RECIBIDA: { grupo: 'proyectos', etiqueta: 'Apelación de liderazgo recibida', descripcion: 'Llega una apelación de liderazgo.' },
  APELACION_LIDERAZGO_RESUELTA: { grupo: 'proyectos', etiqueta: 'Apelación de liderazgo resuelta', descripcion: 'Resuelven una apelación de liderazgo.' },

  HORAS_VALIDADAS: { grupo: 'horas', etiqueta: 'Horas validadas', descripcion: 'Validan horas que registraste.' },
  HORAS_CONSOLIDADAS: { grupo: 'horas', etiqueta: 'Horas consolidadas', descripcion: 'Se consolidan tus horas de un Sprint.' },
  HORAS_ACREDITADAS: { grupo: 'horas', etiqueta: 'Horas acreditadas', descripcion: 'Se acreditan tus horas al cerrar un proyecto.' },
  CERTIFICADO_EMITIDO: { grupo: 'horas', etiqueta: 'Certificado emitido', descripcion: 'Se emite un certificado a tu nombre.' },
  INSIGNIA_OBTENIDA: { grupo: 'horas', etiqueta: 'Insignia obtenida', descripcion: 'Subes de nivel en una insignia.' },
  RECONOCIMIENTO_RECIBIDO: { grupo: 'horas', etiqueta: 'Reconocimiento de un compañero', descripcion: 'Un compañero te reconoce durante un sprint.' },

  RECORDATORIO_EVENTO: { grupo: 'recordatorios', etiqueta: 'Recordatorio de evento', descripcion: 'Un evento de tu calendario está por empezar.' },
  CALENDARIO_COMPARTIDO: { grupo: 'recordatorios', etiqueta: 'Calendario compartido', descripcion: 'Alguien comparte su calendario contigo.' },
  // HU-195: reuniones que Administración convoca con el equipo de tus proyectos.
  REUNION_PROGRAMADA: { grupo: 'recordatorios', etiqueta: 'Reunión programada', descripcion: 'Administración convoca a tu equipo a una reunión.' },
  REUNION_ACTUALIZADA: { grupo: 'recordatorios', etiqueta: 'Reunión actualizada', descripcion: 'Cambia la fecha, el lugar o el enlace de una reunión de tu equipo.' },
  RECORDATORIO_MENSAJE: { grupo: 'recordatorios', etiqueta: 'Recordatorio de un mensaje', descripcion: 'Un mensaje que pediste que te recordáramos.' },
  HORAS_EN_RIESGO: { grupo: 'horas', etiqueta: 'Horas en riesgo', descripcion: 'Tu avance de horas del semestre va por debajo de lo esperado (máximo un aviso por semana).' },
  RECORDATORIO_HORAS: { grupo: 'recordatorios', etiqueta: 'Recordatorio de registrar horas', descripcion: 'Tienes tareas en progreso sin horas registradas en 3 días.' },
  REUNION_CANCELADA: { grupo: 'recordatorios', etiqueta: 'Reunión cancelada', descripcion: 'Administración cancela una reunión de tu equipo.' },

  SOLICITUD_AMISTAD: { grupo: 'contactos', etiqueta: 'Solicitud de amistad', descripcion: 'Recibes una solicitud de amistad.' },
  AMISTAD_ACEPTADA: { grupo: 'contactos', etiqueta: 'Amistad aceptada', descripcion: 'Aceptan tu solicitud de amistad.' },
  NUEVO_SEGUIDOR: { grupo: 'contactos', etiqueta: 'Nuevo seguidor', descripcion: 'Alguien empieza a seguirte.' },
  // MEJ-131: aviso al autor del mensaje original cuando alguien responde en su hilo.
  RESPUESTA_HILO_CHAT: { grupo: 'contactos', etiqueta: 'Respuestas en tus hilos', descripcion: 'Alguien responde en el hilo de un mensaje tuyo en una conversación de proyecto.' },
  // MEJ-44: llega aunque la conversacion este silenciada; solo esta preferencia la apaga.
  MENCION_CHAT: { grupo: 'contactos', etiqueta: 'Menciones en conversaciones', descripcion: 'Alguien te menciona con @ en una conversación de proyecto, aunque esté silenciada.' },

  SOLICITUD_RECUPERACION_CONTRASENA: {
    grupo: 'cuenta',
    etiqueta: 'Solicitud de recuperación de contraseña',
    descripcion: 'Un usuario pide recuperar su contraseña.',
  },
  CUENTA_PENDIENTE_VERIFICACION: {
    grupo: 'cuenta',
    etiqueta: 'Cuenta pendiente de verificación',
    descripcion: 'Una cuenta nueva espera que administración la verifique.',
  },
  CUENTA_VERIFICADA: { grupo: 'cuenta', etiqueta: 'Cuenta verificada', descripcion: 'Administración verifica tu cuenta.' },
  ALERTA_SEGURIDAD: { grupo: 'cuenta', etiqueta: 'Alerta de seguridad', descripcion: 'La plataforma detecta actividad inusual de acceso.' },
  NUEVO_INICIO_SESION: {
    grupo: 'cuenta',
    etiqueta: 'Nuevo inicio de sesión',
    descripcion: 'Se inicia sesión en tu cuenta desde un navegador que no habíamos visto.',
  },
  SOLICITUD_DESACTIVACION: {
    grupo: 'cuenta',
    etiqueta: 'Solicitud de desactivación de cuenta',
    descripcion: 'Un usuario pide desactivar su cuenta.',
  },
  DESACTIVACION_RESUELTA: {
    grupo: 'cuenta',
    etiqueta: 'Solicitud de desactivación resuelta',
    descripcion: 'Administración resuelve tu solicitud de desactivar la cuenta.',
  },
  AVISO_ASOCIACION: {
    grupo: 'organizaciones',
    etiqueta: 'Avisos de tu asociación',
    descripcion: 'La junta de tu asociación envía un aviso a un grupo de estudiantes del que formas parte.',
  },
  JUNTA_ASOCIACION: {
    grupo: 'organizaciones',
    etiqueta: 'Junta de asociación',
    descripcion: 'Administración te nombra, cambia o quita de la junta de una asociación.',
  },
  ALCANCE_COORDINADOR: {
    grupo: 'organizaciones',
    etiqueta: 'Alcance de coordinación',
    descripcion: 'Administración te asigna o cambia las carreras que coordinas.',
  },
  REPORTE_PERFIL: {
    grupo: 'cuenta',
    etiqueta: 'Reporte de perfil o mensaje',
    descripcion: 'Alguien reporta un perfil o un mensaje y queda pendiente en la bandeja de administración.',
  },
  SOLICITUD_CONTACTO: {
    grupo: 'cuenta',
    etiqueta: 'Solicitud de contacto',
    descripcion: 'Alguien escribe a administración desde la página de contacto.',
  },
};

export interface NotificationPreferenceItem extends NotificationPreference {
  etiqueta: string;
  descripcion: string;
  /** false = tipo que el backend entrega y este catálogo aún no describe. */
  conocido: boolean;
}

export interface NotificationPreferenceGroup {
  id: NotificationGroupId;
  titulo: string;
  descripcion: string;
  items: NotificationPreferenceItem[];
}

/** `ALGO_NUEVO` -> «Algo nuevo»: nombre legible de un tipo que el catálogo no conoce. */
function etiquetaGenerica(tipo: string): string {
  const texto = tipo.replace(/_+/g, ' ').trim().toLowerCase();
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : 'Tipo sin nombre';
}

/**
 * Agrupa las preferencias que entrega el backend para mostrarlas. Cada tipo de
 * la respuesta aparece exactamente una vez; un tipo desconocido va al grupo
 * «Otras notificaciones» en vez de desaparecer. Los grupos vacíos se omiten.
 */
export function groupNotificationPreferences(preferences: readonly NotificationPreference[]): NotificationPreferenceGroup[] {
  const porGrupo = new Map<NotificationGroupId, NotificationPreferenceItem[]>();
  const vistos = new Set<string>();
  for (const { tipo, activa } of preferences) {
    if (typeof tipo !== 'string' || !tipo || vistos.has(tipo)) continue;
    vistos.add(tipo);
    const conocido = Object.prototype.hasOwnProperty.call(NOTIFICATION_TYPE_PRESENTATION, tipo);
    const presentacion = conocido ? NOTIFICATION_TYPE_PRESENTATION[tipo] : null;
    const grupo: NotificationGroupId = presentacion?.grupo ?? 'otras';
    const items = porGrupo.get(grupo) ?? [];
    items.push({
      tipo,
      activa: activa === true,
      etiqueta: presentacion?.etiqueta ?? etiquetaGenerica(tipo),
      descripcion: presentacion?.descripcion ?? 'Tipo de notificación añadido recientemente.',
      conocido,
    });
    porGrupo.set(grupo, items);
  }
  return NOTIFICATION_GROUP_IDS.filter((id) => porGrupo.has(id)).map((id) => ({
    id,
    ...NOTIFICATION_GROUP_LABEL[id],
    items: porGrupo.get(id) as NotificationPreferenceItem[],
  }));
}
