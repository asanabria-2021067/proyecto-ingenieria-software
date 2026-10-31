/**
 * Resuelve el enlace de las notificaciones de tarea (`TAREA_ASIGNADA`,
 * `TAREA_ACTUALIZADA` — apps/backend/src/notifications/templates, Tarea 25)
 * hacia el tablero real del proyecto. No vive en
 * `lib/services/notifications.ts` (protegido en la Tarea 39) sino en un
 * archivo propio de `components/notifications/`, para no tocar ese
 * contrato aprobado.
 *
 * `tasks.service.ts` ya emite `datosJson: { projectId, taskId }` en las
 * cuatro rutas que notifican cambios de tarea (auditoría previa, §16), pero
 * se acepta también `idProyecto`/`idTarea` por si otro emisor usara esa
 * convención — sin inventar un tercer nombre de campo.
 */

// TAREA_POR_VENCER (HU-186): mismo `datosJson: { projectId, taskId }`, emitido
// por tasks-due-reminder.service.ts.
const TIPOS_NOTIFICACION_TAREA = new Set(['TAREA_ASIGNADA', 'TAREA_ACTUALIZADA', 'TAREA_POR_VENCER']);
// ROL_ABANDONADO (Sección 4/18): notificación consolidada del retiro de un rol.
// Enlaza al workspace Kanban para reasignar las tareas que quedaron sin
// asignado. Es consolidada (varias tareas), por lo que no lleva un taskId.
const TIPOS_NOTIFICACION_KANBAN = new Set(['ROL_ABANDONADO']);

function leerCampoNumerico(datos: Record<string, unknown>, claves: string[]): number | null {
  for (const clave of claves) {
    const valor = datos[clave];
    if (typeof valor === 'number' && Number.isInteger(valor) && valor > 0) return valor;
    if (typeof valor === 'string' && /^\d+$/.test(valor)) return Number(valor);
  }
  return null;
}

export function resolveTaskNotificationLink(n: {
  tipoNotificacion: string;
  datosJson?: Record<string, unknown> | null;
}): string | null {
  const esTarea = TIPOS_NOTIFICACION_TAREA.has(n.tipoNotificacion);
  const esKanban = TIPOS_NOTIFICACION_KANBAN.has(n.tipoNotificacion);
  if (!esTarea && !esKanban) return null;
  const datos = n.datosJson;
  if (!datos) return null;

  const idProyecto = leerCampoNumerico(datos, ['projectId', 'idProyecto']);
  if (idProyecto === null) return null;

  // ROL_ABANDONADO: siempre al workspace, sin taskId (notificación consolidada).
  if (esKanban) {
    return `/dashboard/projects/${idProyecto}/kanban`;
  }

  const idTarea = leerCampoNumerico(datos, ['taskId', 'idTarea']);
  // Las tareas tienen ahora una vista dedicada canónica dentro del workspace
  // Kanban: /dashboard/projects/:id/kanban/tasks/:taskId. Una notificación de
  // tarea abre directamente esa página. Sin taskId (no debería ocurrir en estos
  // tipos) se cae al workspace.
  const base = `/dashboard/projects/${idProyecto}/kanban`;
  if (idTarea !== null) {
    return `${base}/tasks/${idTarea}`;
  }
  return base;
}

/**
 * NL-T4: el aviso emergente de `TAREA_ASIGNADA` lleva el botón «Ver mi tarea».
 * Devuelve el detalle de la tarea o `null` si la notificación no es de ese tipo
 * (o no trae ids válidos).
 */
export function resolveAssignedTaskToastLink(n: {
  tipoNotificacion: string;
  datosJson?: Record<string, unknown> | null;
}): string | null {
  if (n.tipoNotificacion !== 'TAREA_ASIGNADA') return null;
  const link = resolveTaskNotificationLink(n);
  return link?.includes('/tasks/') ? link : null;
}