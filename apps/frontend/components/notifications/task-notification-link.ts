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

const TIPOS_NOTIFICACION_TAREA = new Set(['TAREA_ASIGNADA', 'TAREA_ACTUALIZADA']);

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
  if (!TIPOS_NOTIFICACION_TAREA.has(n.tipoNotificacion)) return null;
  const datos = n.datosJson;
  if (!datos) return null;

  const idProyecto = leerCampoNumerico(datos, ['projectId', 'idProyecto']);
  if (idProyecto === null) return null;

  const idTarea = leerCampoNumerico(datos, ['taskId', 'idTarea']);
  const params = new URLSearchParams({ tab: 'tablero' });
  if (idTarea !== null) {
    params.set('taskId', String(idTarea));
  }

  return `/dashboard/projects/${idProyecto}?${params.toString()}`;
}
