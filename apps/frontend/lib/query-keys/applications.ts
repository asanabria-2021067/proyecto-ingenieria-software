/**
 * Postulaciones pendientes del proyecto integradas en Miembros — B13,
 * `GET /proyectos/:id/miembros/postulaciones-pendientes`
 * (`TeamService.getPendingPostulations`, reutiliza `ApplicationsService.findAll`
 * como única fuente de verdad, sin un segundo modelo de Postulacion).
 *
 * Distinta a propósito de:
 *  - `['postulaciones-proyecto', id]` — legacy `GET /proyectos/:id/postulaciones`
 *    (`ProjectsService.findPostulacionesByProject`), TODAS las postulaciones del
 *    proyecto sin filtrar por estado (`app/dashboard/proyectos/[id]/postulaciones/page.tsx`).
 *  - `['mis-postulaciones']` — perspectiva del postulante, no del líder
 *    (`app/dashboard/mis-postulaciones/page.tsx`).
 *  - `projectTeamSummaryQueryKey`/`projectMembersQueryKey` (`./members.ts`) — equipo,
 *    no postulaciones.
 *
 * Compartir esta key entre el lector (`useProjectPendingPostulations`) y la
 * mutation de resolución (`useResolvePostulacion`) es lo que permite
 * invalidar exactamente este read-model tras aceptar/rechazar.
 */
export const projectPendingPostulationsQueryKey = (idProyecto: number) =>
  ['proyecto-postulaciones-pendientes', idProyecto] as const;
