/**
 * GPI01-C08 (H-06): en qué proyectos se puede agendar un evento.
 *
 * Contrato del backend (EventsService.create), verificado contra una base
 * aislada con un proyecto por estado: `POST /proyectos/:id/eventos` solo
 * rechaza un proyecto CERRADO (409). EN_SOLICITUD_CIERRE, EN_REVISION,
 * OBSERVADO, PUBLICADO y EN_PROGRESO se aceptan, así que no se restringen aquí.
 */
export function esProyectoAgendable(estadoProyecto: string | undefined): boolean {
  return estadoProyecto !== 'CERRADO';
}
