import { EstadoProyecto } from '@prisma/client';

/**
 * Estados que Administración considera "proyecto activo": los únicos en los
 * que el equipo opera (se puede iniciar y trabajar un Sprint). Es la misma
 * población para el KPI de proyectos activos, el grupo `activos` de la
 * bandeja administrativa y el calendario de Sprints, para que las tres
 * vistas cuenten lo mismo. Cada consulta sigue añadiendo `eliminadoEn: null`.
 *
 * No es `LIVE_STATES` de la política de lectura: aquella incluye
 * `EN_SOLICITUD_CIERRE`, que para Administración ya es una revisión de
 * cierre con su propia bandeja, no un proyecto en operación.
 */
export const ADMIN_ACTIVE_PROJECT_STATES: readonly EstadoProyecto[] = [
  EstadoProyecto.PUBLICADO,
  EstadoProyecto.EN_PROGRESO,
];
