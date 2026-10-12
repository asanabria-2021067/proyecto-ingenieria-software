/**
 * Query key única del calendario administrativo de Sprints. Todo lo que el
 * panel muestra de Sprints (métricas, mini calendario, próxima finalización)
 * sale de esta misma consulta, así que comparte una sola petición.
 */
export const adminSprintCalendarQueryKey = ['admin', 'sprints', 'calendario'] as const;
