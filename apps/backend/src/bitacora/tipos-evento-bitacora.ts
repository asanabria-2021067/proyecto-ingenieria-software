/**
 * T-163: catálogo cerrado de eventos funcionales de la bitácora semántica de
 * Sprint (HU-140). Cada valor se persiste tal cual en
 * `BitacoraAuditoria.accion` — a diferencia de AuditInterceptor (que escribe
 * `"${method} ${url}"`), aquí `accion` es siempre uno de estos literales, lo
 * que permite distinguir el log funcional del técnico con un simple filtro
 * `accion IN (...)`, sin tocar la tabla ni su esquema.
 */
export enum TipoEventoBitacora {
  TASK_CREATED = 'TASK_CREATED',
  TASK_UPDATED = 'TASK_UPDATED',
  TASK_STATUS_CHANGED = 'TASK_STATUS_CHANGED',
  TASK_ASSIGNED = 'TASK_ASSIGNED',
  TASK_REASSIGNED = 'TASK_REASSIGNED',
  TASK_HOURS_LOGGED = 'TASK_HOURS_LOGGED',
  SPRINT_STARTED = 'SPRINT_STARTED',
}

/** Refleja `BitacoraAuditoria.tipoObjeto` para los eventos funcionales — nunca el `Controller.handler` que usa AuditInterceptor. */
export type TipoEntidadBitacora = 'TAREA' | 'SPRINT';
