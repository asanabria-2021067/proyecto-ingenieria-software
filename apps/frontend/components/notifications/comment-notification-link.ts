/**
 * HU-200 (T-377): enlace directo al comentario de una notificación de mención
 * (`MENCION_COMENTARIO`) o de comentario nuevo (`COMENTARIO_TAREA`,
 * `COMENTARIO_PROYECTO`, `COMENTARIO_HITO`). Los cuatro tipos llevan el mismo
 * `datosJson: { idProyecto, idComentario, idTarea, idHito }`
 * (apps/backend/src/comentarios/comentarios.service.ts), así que una sola
 * regla decide el destino según dónde vive el comentario:
 *
 *  - tarea    → detalle de la tarea, sección de comentarios
 *  - hito     → pestaña Hitos del Kanban con el panel del hito abierto
 *  - proyecto → detalle del proyecto, conversación del proyecto
 *
 * Con `idComentario` el destino lo lleva a la vista y lo ilumina. Mismo
 * criterio de lectura defensiva que `task-notification-link.ts`.
 */

const TIPOS_NOTIFICACION_COMENTARIO = new Set([
  'MENCION_COMENTARIO',
  'COMENTARIO_TAREA',
  'COMENTARIO_PROYECTO',
  'COMENTARIO_HITO',
]);

function leerId(datos: Record<string, unknown>, clave: string): number | null {
  const valor = datos[clave];
  if (typeof valor === 'number' && Number.isInteger(valor) && valor > 0) return valor;
  if (typeof valor === 'string' && /^[1-9]\d*$/.test(valor)) return Number(valor);
  return null;
}

export function resolveCommentNotificationLink(n: {
  tipoNotificacion: string;
  datosJson?: Record<string, unknown> | null;
}): string | null {
  if (!TIPOS_NOTIFICACION_COMENTARIO.has(n.tipoNotificacion)) return null;
  const datos = n.datosJson;
  if (!datos) return null;

  const idProyecto = leerId(datos, 'idProyecto');
  if (idProyecto === null) return null;
  const idComentario = leerId(datos, 'idComentario');
  const idTarea = leerId(datos, 'idTarea');
  const idHito = leerId(datos, 'idHito');

  const params = new URLSearchParams();
  let ruta: string;
  if (idTarea !== null) {
    ruta = `/dashboard/projects/${idProyecto}/kanban/tasks/${idTarea}`;
    params.set('section', 'comments');
  } else if (idHito !== null) {
    ruta = `/dashboard/projects/${idProyecto}/kanban`;
    params.set('tab', 'hitos');
    params.set('hito', String(idHito));
  } else {
    ruta = `/dashboard/proyectos/${idProyecto}`;
    params.set('section', 'comments');
  }
  if (idComentario !== null) params.set('comment', String(idComentario));
  return `${ruta}?${params.toString()}`;
}
