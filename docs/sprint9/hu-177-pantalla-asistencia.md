# T-298 (HU-177) — Pantalla de asistencia del proyecto

El backend (T-295/T-296/T-297, ver
`docs/sprint9/feature-IESUC-487-hu-177-asistencia-actividades.md`) ya estaba
en producción. Esta tarea agrega la pantalla que faltaba: crear actividades,
ver cuántos asistieron y marcar/quitar la asistencia de cada integrante.

## Qué se hizo

- **Nuevo destino de navegación** «Asistencia»
  (`components/projects/navigation/project-nav-model.ts`), junto a
  «Bitácora»/«Analítica» en el grupo Seguimiento, visible al líder y al
  integrante activo (`esMiembro`) — mismo criterio de visibilidad que la
  bitácora; la autorización real la sigue decidiendo el backend
  (`ProjectReadPolicyService`, scope `'asistencia'`).
- **Pantalla** `app/dashboard/proyectos/[id]/asistencia/page.tsx`:
  - Lista las actividades del proyecto (título, tipo, fecha, horas que vale,
    `asistieron/integrantes`).
  - Cada actividad se expande (acordeón, `components/ui/collapsible`) para
    cargar su detalle (`GET .../actividades/:id`) y mostrar la lista de
    integrantes.
  - El líder ve un switch «Asistió» por integrante y el botón «Nueva
    actividad»; el resto ve la misma información en solo lectura (pastilla
    Asistió/No asistió) y un aviso de modo lectura.
  - Un usuario sin acceso (ni líder ni integrante activo) ve el mismo aviso
    que la bitácora («No puedes acceder a la asistencia…») en vez de un 403
    crudo — se decide client-side con el mismo criterio que ya usa
    `BitacoraPage`, antes de disparar la query real.
  - Estados de carga (skeletons), vacío («Todavía no hay actividades») y
    error con «Reintentar», mismo lenguaje visual que el resto del proyecto.
- **Diálogo** `components/projects/attendance/create-activity-dialog.tsx`:
  título (1–200), tipo (`REUNION|JORNADA|TALLER|OTRO`), fecha y horas (> 0),
  con las mismas validaciones del DTO del backend reflejadas en el cliente
  antes de enviar. Mismo patrón que `create-milestone-dialog.tsx` (toast de
  éxito con `sonner`, error con `getApiErrorMessage`).
- **Switch** `components/projects/attendance/attendance-switch.tsx`: dispara
  el `PATCH .../asistencia/:usuarioId`. El optimismo (reflejar el cambio
  antes de que responda el servidor) y la reversión en error viven en el
  hook (`onMutate`/`onError` sobre la caché de detalle, mismo patrón que
  `cambiarEstadoTarea` en `use-project-tasks.ts`); el componente solo llama a
  la mutación y muestra un toast de error si falla.
- **Capa de datos**: `lib/types/attendance.ts`, `lib/services/attendance.ts`,
  `lib/query-keys/attendance.ts`, `hooks/use-project-attendance.ts`
  (`useProjectActivities`, `useProjectActivity`,
  `useProjectAttendanceMutations`) — mismos nombres y forma que expone
  `AttendanceService` en el backend, sin inventar campos.
- **E2E** `e2e/actividades-asistencia.spec.ts`: el flujo principal (el líder
  crea la actividad y marca asistencia, la integrante ve sus horas en «Mis
  Horas») ahora ejerce la pantalla real en vez de la API a mano; se actualizó
  el comentario del encabezado, que decía que el frontend no tenía pantalla.
  Las pruebas de autorización (quién puede y en qué estado del proyecto)
  siguen por API porque son negativas por diseño.

## Archivos

Nuevos:
- `apps/frontend/lib/types/attendance.ts`
- `apps/frontend/lib/services/attendance.ts`
- `apps/frontend/lib/query-keys/attendance.ts`
- `apps/frontend/hooks/use-project-attendance.ts`
- `apps/frontend/components/projects/attendance/create-activity-dialog.tsx`
- `apps/frontend/components/projects/attendance/attendance-switch.tsx`
- `apps/frontend/components/projects/attendance/activity-type.utils.ts`
- `apps/frontend/app/dashboard/proyectos/[id]/asistencia/page.tsx`
- `apps/frontend/test/create-activity-dialog.spec.ts`
- `apps/frontend/test/attendance-switch.spec.tsx`
- `apps/frontend/test/use-project-attendance.spec.ts`

Modificados:
- `apps/frontend/components/projects/navigation/project-nav-model.ts` (nuevo destino «Asistencia»)
- `apps/frontend/test/project-nav-model.spec.ts`, `test/project-sidebar.spec.tsx` (reflejan el nuevo destino)
- `apps/frontend/e2e/actividades-asistencia.spec.ts` (flujo principal por la UI)

Backend: sin cambios (fuera de alcance salvo bug real; no se encontró ninguno).

## Cómo probarlo

1. Backend + frontend levantados contra la base sembrada.
2. Como líder de un proyecto (p. ej. `carlos.mendoza@uvg.edu.gt` en
   «Plataforma de Tutorías UVG»): entrar a
   `/dashboard/proyectos/:id/asistencia`, crear una actividad con «Nueva
   actividad», expandirla y activar el switch de un integrante.
3. Como ese integrante: entrar a `/dashboard/mis-horas` y confirmar que las
   horas acreditadas subieron exactamente lo que vale la actividad.
4. Como un integrante (no líder) del mismo proyecto: entrar a la misma
   pantalla y confirmar que no hay botón «Nueva actividad» ni switches
   (solo pastillas de solo lectura) y que aparece el aviso de modo lectura.
5. `npm run test -- create-activity-dialog attendance-switch use-project-attendance project-nav-model project-sidebar`
   dentro de `apps/frontend`.
6. `npx playwright test actividades-asistencia` dentro de `apps/frontend`
   (requiere el stack aislado, ver `scripts/e2e/isolated-stack.sh`).
