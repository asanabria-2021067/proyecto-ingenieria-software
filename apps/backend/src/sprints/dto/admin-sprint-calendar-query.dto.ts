/**
 * Query de `GET /admin/sprints/calendario`: deliberadamente SIN propiedades.
 *
 * El endpoint no acepta parámetros: devuelve todos los Sprints operables de
 * proyectos activos y el cliente agrupa, busca y navega meses sobre ese mismo
 * payload. Declarar la clase vacía hace que el `ValidationPipe` global
 * (`whitelist` + `forbidNonWhitelisted`) rechace con 400 cualquier parámetro,
 * en vez de ignorarlo en silencio y aparentar un filtro que no existe.
 */
export class AdminSprintCalendarQueryDto {}
