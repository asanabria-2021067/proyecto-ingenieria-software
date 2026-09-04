/**
 * T-163: catálogo cerrado de eventos funcionales de la bitácora semántica de
 * Sprint (HU-140). Cada valor se persiste tal cual en
 * `BitacoraAuditoria.accion` — a diferencia de AuditInterceptor (que escribe
 * `"${method} ${url}"`), aquí `accion` es siempre uno de estos literales, lo
 * que permite distinguir el log funcional del técnico con un simple filtro
 * `accion IN (...)`, sin tocar la tabla ni su esquema.
 *
 * Clase con constantes `static readonly` (no `enum` de TypeScript) para que
 * agregar un evento nuevo sea tan simple como agregar una línea aquí — p.
 * ej. los eventos de cambio de atributos de tarea de HU-141 — sin depender
 * de las particularidades de un enum (bundling, `isolatedModules`, etc.).
 * `VALORES` es la lista explícita para iterar/validar en runtime; al
 * agregar una constante nueva, agrégala también en `VALORES`.
 */
export class TipoEventoBitacora {
  static readonly TASK_CREATED = 'TASK_CREATED' as const;
  static readonly TASK_UPDATED = 'TASK_UPDATED' as const;
  static readonly TASK_STATUS_CHANGED = 'TASK_STATUS_CHANGED' as const;
  static readonly TASK_ASSIGNED = 'TASK_ASSIGNED' as const;
  static readonly TASK_REASSIGNED = 'TASK_REASSIGNED' as const;
  static readonly TASK_HOURS_LOGGED = 'TASK_HOURS_LOGGED' as const;
  static readonly SPRINT_STARTED = 'SPRINT_STARTED' as const;

  static readonly VALORES = [
    'TASK_CREATED',
    'TASK_UPDATED',
    'TASK_STATUS_CHANGED',
    'TASK_ASSIGNED',
    'TASK_REASSIGNED',
    'TASK_HOURS_LOGGED',
    'SPRINT_STARTED',
  ] as const;
}

/** Tipo derivado del catálogo — usar este nombre (no `TipoEventoBitacora`) en anotaciones de tipo. */
export type TipoEventoBitacoraValor = (typeof TipoEventoBitacora.VALORES)[number];

/** Refleja `BitacoraAuditoria.tipoObjeto` para los eventos funcionales — nunca el `Controller.handler` que usa AuditInterceptor. */
export type TipoEntidadBitacora = 'TAREA' | 'SPRINT';
