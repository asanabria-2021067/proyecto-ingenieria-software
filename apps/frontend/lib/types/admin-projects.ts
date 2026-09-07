/**
 * Contratos administrativos de proyectos (Sprint 7, 06 v2 §34/§46).
 * Reflejan `apps/backend/src/project-closure/admin-projects.controller.ts`
 * y `historical-project-read.service.ts` (`adminList` / `adminDetail`).
 */

/** Los cuatro grupos son fijos y espejan estados concretos; no existe un quinto. */
export const ADMIN_PROJECT_GROUPS = ['activos', 'revision', 'cierres', 'cerrados'] as const;
export type AdminProjectGroup = (typeof ADMIN_PROJECT_GROUPS)[number];

export const ADMIN_PROJECTS_DEFAULT_LIMIT = 20;
export const ADMIN_PROJECTS_MAX_LIMIT = 50;

export function isAdminProjectGroup(value: string | null | undefined): value is AdminProjectGroup {
  return (ADMIN_PROJECT_GROUPS as readonly string[]).includes(value ?? '');
}

/** Etiqueta visible de cada grupo (encabezado, breadcrumb y sidebar administrativa). */
export const ADMIN_PROJECT_GROUP_LABEL: Record<AdminProjectGroup, string> = {
  activos: 'Activos',
  revision: 'En revisión',
  cierres: 'Solicitudes de cierre',
  cerrados: 'Cerrados',
};

/**
 * URL canónica de un grupo. El grupo vive en `?grupo=` para que la bandeja sea
 * compartible y sobreviva a la recarga; la navegación entre grupos es de la
 * sidebar administrativa, no de la propia página.
 */
export function adminProjectsGroupHref(grupo: AdminProjectGroup): string {
  return `/dashboard/admin/proyectos?grupo=${grupo}`;
}

/** Acción SUGERIDA de navegación por grupo; nunca habilita por sí sola una escritura. */
export type AdminProjectAction = 'MONITOREAR' | 'REVISAR_PUBLICACION' | 'REVISAR_CIERRE' | 'CONSULTAR_HISTORICO' | string;

export interface AdminProjectSprintSummary {
  idSprint: number;
  numero: number;
  estado: string;
}

export interface AdminProjectListItem {
  idProyecto: number;
  tituloProyecto: string;
  estadoProyecto: string;
  lider: { idUsuario: number; nombre: string; apellido: string };
  /** Usuarios ACTIVOS distintos (alguien con dos roles cuenta una vez). Nunca se recalcula en cliente. */
  usuariosActivos: number;
  /** Resumen del Sprint operable; nunca un detalle operable por el administrador. */
  sprintAmbiente: AdminProjectSprintSummary | null;
  accion: AdminProjectAction;
}

export interface AdminProjectsPage {
  items: AdminProjectListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminProjectsQuery {
  grupo: AdminProjectGroup;
  page?: number;
  limit?: number;
}

// ─── Detalle (E117) ──────────────────────────────────────────────────────────

export interface AdminProjectMember {
  idParticipacion: number;
  estadoParticipacion: string;
  usuario: { idUsuario: number; nombre: string; apellido: string };
  rolProyecto: { idRolProyecto: number; nombreRol: string };
}

export interface AdminProjectLeadershipItem {
  idHistorialLiderazgo: number;
  idLiderAnterior: number | null;
  idLiderNuevo: number;
  origen: string;
  registradoEn: string;
}

/**
 * `GET /admin/proyectos/:pid` en proyecto VIVO. En `CERRADO` el backend delega
 * en el histórico (`HistoricalProjectView`, `lib/services/historical.ts`).
 * `permisos` llega SIEMPRE en `false`: esta vista no muta nada.
 */
export interface AdminProjectDetail {
  projectId: number;
  resumen: {
    idProyecto: number;
    tituloProyecto: string;
    descripcionProyecto: string | null;
    tipoProyecto: string;
    estadoProyecto: string;
    creador: { idUsuario: number; nombre: string; apellido: string };
  };
  liderazgo: {
    liderActual: { idUsuario: number; nombre: string; apellido: string };
    historial: AdminProjectLeadershipItem[];
  };
  miembros: AdminProjectMember[];
  /** En proyecto vivo, SOLO Sprints `CERRADO` (filtro aplicado en la consulta). */
  sprints: AdminProjectSprintSummary[];
  permisos: { puedeEditar: false; puedeOperar: false };
  lector: { perfil: string; sprintEstados: string[] | null };
}
