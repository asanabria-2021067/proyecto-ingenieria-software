import {
  BarChart3,
  ClipboardCheck,
  Crown,
  FolderOutput,
  History,
  Kanban,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Pencil,
  Rocket,
  ScrollText,
  Settings2,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * HU-154 (T-215): única fuente de la navegación contextual del proyecto. La
 * sidebar de escritorio (expandida y colapsada) y la navegación móvil leen
 * de aquí los mismos destinos y las mismas acciones, así que la visibilidad
 * por rol y estado no puede divergir entre superficies.
 *
 * Módulo puro (sin React): quién es el actor y en qué estado está el
 * proyecto lo resuelve `useProjectNavContext`; aquí solo se decide qué se
 * muestra y a dónde lleva.
 */

/**
 * `leader`: Proyecto.creadoPor (ver hooks/use-is-project-leader.ts).
 * `participant`: miembro activo del proyecto que no es el líder.
 * `visitor`: cualquier otro usuario (proyecto publicado, sin pertenencia).
 */
export type ProjectNavActor = 'leader' | 'participant' | 'visitor';

export interface ProjectNavContext {
  idProyecto: number;
  actor: ProjectNavActor;
  estadoProyecto: string | undefined;
  /** El participante tiene una solicitud de salida abierta (PREPARACION o PENDIENTE_LIDER). */
  tieneSolicitudSalida: boolean;
}

export interface ProjectNavItem {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
}

export type ProjectNavGroupId = 'resumen' | 'trabajo' | 'equipo' | 'seguimiento';

export interface ProjectNavGroup {
  id: ProjectNavGroupId;
  /** `null` para «Resumen», que va sin encabezado. */
  label: string | null;
  items: ProjectNavItem[];
}

export type ProjectAction =
  | {
      id: 'editar-informacion' | 'editar-roles' | 'revisiones-pasadas' | 'ver-solicitud-salida';
      kind: 'link';
      href: string;
      label: string;
      icon: LucideIcon;
    }
  | {
      id: 'solicitar-salida';
      kind: 'leave-modal';
      label: string;
      icon: LucideIcon;
    };

/**
 * S7 (VIEW-01/VIEW-02): ni en CERRADO ni en EN_SOLICITUD_CIERRE existe
 * escritura sobre la información del proyecto. Mientras solo se comprobaba
 * CERRADO, un proyecto en solicitud de cierre seguía ofreciendo «Editar
 * Información»; el formulario rechaza ese estado y redirige nada más
 * abrirse, perdiendo el `returnTo`.
 */
function admiteEditarInformacion(estadoProyecto: string | undefined): boolean {
  return estadoProyecto !== 'CERRADO' && estadoProyecto !== 'EN_SOLICITUD_CIERRE';
}

/** S7 (VIEW-13): la preparación del cierre solo existe mientras el proyecto puede prepararse o corregirse. */
function cierreDisponible(estadoProyecto: string | undefined): boolean {
  return estadoProyecto === 'EN_PROGRESO' || estadoProyecto === 'EN_SOLICITUD_CIERRE';
}

export function buildProjectNavGroups(ctx: ProjectNavContext): ProjectNavGroup[] {
  const { idProyecto, actor, estadoProyecto } = ctx;
  const isLeader = actor === 'leader';
  const esMiembro = actor === 'leader' || actor === 'participant';

  const resumen: ProjectNavItem[] = [
    {
      id: 'resumen',
      href: isLeader ? `/dashboard/projects/${idProyecto}` : `/dashboard/proyectos/${idProyecto}`,
      label: 'Resumen',
      icon: LayoutDashboard,
    },
  ];

  const trabajo: ProjectNavItem[] = [];
  if (esMiembro) {
    trabajo.push(
      { id: 'tablero', href: `/dashboard/projects/${idProyecto}/kanban`, label: 'Tablero', icon: Kanban },
      {
        id: 'lista-tareas',
        href: `/dashboard/projects/${idProyecto}/tareas`,
        label: 'Lista de tareas',
        icon: ListChecks,
      },
    );
  }
  if (isLeader) {
    trabajo.push({ id: 'sprints', href: `/dashboard/proyectos/${idProyecto}/sprints`, label: 'Sprints', icon: Rocket });
  }

  const equipo: ProjectNavItem[] = [];
  if (isLeader) {
    equipo.push(
      { id: 'miembros', href: `/dashboard/proyectos/${idProyecto}/miembros`, label: 'Miembros', icon: Users },
      // S7 (VIEW-06): el liderazgo salió de «Miembros» a su propia vista.
      { id: 'liderazgo', href: `/dashboard/proyectos/${idProyecto}/liderazgo`, label: 'Liderazgo', icon: Crown },
    );
  }

  const seguimiento: ProjectNavItem[] = [];
  // HU-170/T-269: la bitácora también se abre al integrante en solo lectura;
  // el backend (BitacoraConsultaService vía ProjectReadPolicyService) es
  // quien realmente lo autoriza.
  if (esMiembro) {
    seguimiento.push(
      { id: 'bitacora', href: `/dashboard/proyectos/${idProyecto}/bitacora`, label: 'Bitácora', icon: ScrollText },
      // HU-143: la analítica es «líder o integrante», el mismo criterio que
      // aplica el backend (assertCanListSprintAnalytics).
      {
        id: 'analitica',
        href: `/dashboard/proyectos/${idProyecto}/sprints/analytics`,
        label: 'Analítica',
        icon: BarChart3,
      },
    );
  }
  if (isLeader) {
    // T-259/T-260 (HU-164): la administración exporta desde su propia vista
    // de solo lectura, no desde esta navegación.
    seguimiento.push({
      id: 'reportes',
      href: `/dashboard/proyectos/${idProyecto}/reportes`,
      label: 'Reportes',
      icon: FolderOutput,
    });
    if (cierreDisponible(estadoProyecto)) {
      seguimiento.push({
        id: 'cierre',
        href: `/dashboard/projects/${idProyecto}/cierre`,
        label: 'Cierre',
        icon: ClipboardCheck,
      });
    }
  }

  const grupos: ProjectNavGroup[] = [
    { id: 'resumen', label: null, items: resumen },
    { id: 'trabajo', label: 'Trabajo', items: trabajo },
    { id: 'equipo', label: 'Equipo', items: equipo },
    { id: 'seguimiento', label: 'Seguimiento', items: seguimiento },
  ];
  return grupos.filter((grupo) => grupo.items.length > 0);
}

/** Acciones secundarias: abren formularios o modales, nunca aparecen como destinos de la navegación. */
export function buildProjectActions(ctx: ProjectNavContext): ProjectAction[] {
  const { idProyecto, actor, estadoProyecto, tieneSolicitudSalida } = ctx;

  if (actor === 'leader') {
    const acciones: ProjectAction[] = [];
    if (admiteEditarInformacion(estadoProyecto)) {
      acciones.push({
        id: 'editar-informacion',
        kind: 'link',
        href: `/dashboard/projects/mine/form?id=${idProyecto}`,
        label: 'Editar información',
        icon: Pencil,
      });
      // «Editar roles» no tiene ruta propia: ProjectDetailClient traduce
      // ?openRoles=1 a abrir el sheet de roles.
      acciones.push({
        id: 'editar-roles',
        kind: 'link',
        href: `/dashboard/projects/${idProyecto}?openRoles=1`,
        label: 'Editar roles',
        icon: Settings2,
      });
    }
    acciones.push({
      id: 'revisiones-pasadas',
      kind: 'link',
      href: `/dashboard/projects/mine/${idProyecto}?returnTo=/dashboard/projects/${idProyecto}`,
      label: 'Revisiones pasadas',
      icon: History,
    });
    return acciones;
  }

  if (actor === 'participant') {
    // F9: con una solicitud abierta el único destino es su preparación; sin
    // ella, la acción abre el modal que la crea.
    return tieneSolicitudSalida
      ? [
          {
            id: 'ver-solicitud-salida',
            kind: 'link',
            href: `/dashboard/projects/${idProyecto}/salida/preparacion`,
            label: 'Ver solicitud de salida',
            icon: LogOut,
          },
        ]
      : [{ id: 'solicitar-salida', kind: 'leave-modal', label: 'Solicitar salida', icon: LogOut }];
  }

  return [];
}

export function flattenNavItems(groups: ProjectNavGroup[]): ProjectNavItem[] {
  return groups.flatMap((grupo) => grupo.items);
}

/**
 * Varios destinos anidan la misma ruta (p. ej. Resumen en `/projects/:id` y
 * Tablero en `/projects/:id/kanban`): un match por prefijo ingenuo marcaría
 * ambos como activos a la vez. Gana el href más específico (el más largo)
 * que calce con la ruta actual.
 */
export function resolveActiveHref(groups: ProjectNavGroup[], pathname: string): string | null {
  return flattenNavItems(groups)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .reduce<string | null>(
      (mejor, item) => (mejor === null || item.href.length > mejor.length ? item.href : mejor),
      null,
    );
}
