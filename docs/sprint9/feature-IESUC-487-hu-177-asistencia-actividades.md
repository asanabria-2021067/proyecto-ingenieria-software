# HU-177 — Registro de asistencia a reuniones y actividades

Rama: `feature/IESUC-487-hu-177-asistencia-actividades`

Esta rama contiene **solo las subtareas de Angel** (T-295, T-296, T-297).
T-298 (pantalla de asistencia, Saúl) y T-299 (pruebas de horas, Samuel) se
quitaron: cada quien las agrega con sus propios commits sobre esta base.

## T-295 — Modelo de actividades y asistencia

- `ActividadProyecto` (proyecto, título, tipo, fecha, horas que vale) y
  `AsistenciaActividad` (actividad, usuario, asistió, confirmado por, con FK
  opcional a `HorasParticipacion` para la idempotencia de T-297) en
  `schema.prisma`.
- Migración `20261004084555_add_actividad_asistencia`, probada limpia contra
  una base local.
- Seed actualizado con 2 actividades de ejemplo en el Proyecto 1 (una con
  asistencia ya confirmada y acreditada, otra pendiente).

## T-296 — Endpoints de actividades y marcado de asistencia

Módulo `apps/backend/src/attendance/`, montado en `AppModule`. Rutas reales:

- `GET /proyectos/:projectId/actividades` — lista actividades del proyecto.
- `GET /proyectos/:projectId/actividades/:actividadId` — detalle con asistencia por integrante.
- `POST /proyectos/:projectId/actividades` — crea actividad (solo líder).
- `PATCH /proyectos/:projectId/actividades/:actividadId/asistencia/:usuarioId` — marca/corrige/quita asistencia (solo líder).

Solo el líder del proyecto puede crear actividades y marcar asistencia:
`ProjectWriteGuard` + nueva familia `ACTIVIDAD_ASISTENCIA` en
`ProjectPolicyService` (actor `LIDER`), mismo patrón que el resto de
escrituras de proyecto. Las lecturas usan el scope `'asistencia'` de
`ProjectReadPolicyService`. Cada escritura (`ACTIVITY_CREATED`,
`ATTENDANCE_MARKED`) queda en la bitácora del proyecto.

## T-297 — Suma automática de horas de extensión

`AttendanceService.marcarAsistencia`: confirmar asistencia crea/actualiza
(nunca duplica) una fila de `HorasParticipacion` (`estadoHoras: APROBADA`) —
el mismo modelo que ya lee "Mis horas" (HU-158), vía `idRegistroHoras` en
`AsistenciaActividad` como ancla de idempotencia. Quitar la asistencia borra
esa fila. Todo corre dentro de la transacción con lock que abre
`ProjectTransactionService.run`.

## Verificación

- Migración y seed corren limpios contra una base local recién creada.
- `npm run build`, `eslint src/attendance` y `tsc --noEmit` (sin errores
  nuevos; el resto de errores de `tsc` son preexistentes y ajenos a esta
  rama) en verde.
- `test/s7-modules-and-routes.spec.ts` (el `AppModule` completo, incluido
  `AttendanceModule`, resuelve sin ciclos) en verde.
- **No se agregó una prueba de servicio propia a propósito**: T-299 (suma de
  horas, corrección que no duplica, quitar que resta, rechazo a no líder) es
  la subtarea de Samuel; el servicio ya expone el comportamiento descrito
  arriba, listo para que la pruebe.

## Para Saúl y Samuel

- **Saúl (T-298):** el backend ya expone todo lo que la pantalla de
  "Asistencia" necesita — las 4 rutas de arriba. `obtenerActividad` devuelve
  la actividad con la lista de participantes y su estado de asistencia
  (revisa `AttendanceService.obtenerActividad` para la forma exacta del
  DTO). Falta solo el componente de frontend.
- **Samuel (T-299):** `AttendanceService` (constructor inyecta
  `PrismaService`, `BitacoraEventosService`, `ProjectTransactionService`) ya
  sigue el mismo estilo de prueba que el resto del repo (Prisma simulado a
  mano con `vi.fn()`, ver `apps/backend/test/g05-user-status-events.spec.ts`
  como referencia). Los casos a cubrir: asistencia nueva suma horas,
  corrección no duplica, quitar asistencia resta, rechazo a quien no es
  líder.
