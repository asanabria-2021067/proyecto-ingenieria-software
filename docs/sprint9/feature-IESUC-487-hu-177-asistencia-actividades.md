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
