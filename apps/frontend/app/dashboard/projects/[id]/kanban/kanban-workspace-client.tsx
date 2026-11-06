'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Kanban, Keyboard, List, MousePointerClick, Plus, Table2, Tags, UserCheck } from 'lucide-react';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectTasks } from '@/hooks/use-project-tasks';
import { useProjectLabels } from '@/hooks/use-project-labels';
import { useProjectMilestones } from '@/hooks/use-project-milestones';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useProjectAvance } from '@/hooks/use-project-avance';
import { useProjectSprints } from '@/hooks/use-project-sprints';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useTaskSelection } from '@/hooks/use-task-selection';
import { useVistaTablero, type VistaTablero } from '@/hooks/use-vista-tablero';
import { Button } from '@/components/ui/button';
import { BorrarEjemploBoton, OfertaEjemploPrimerProyecto } from '@/components/projects/ejemplo-proyecto';
import { BotonAyudaTour } from '@/components/ayuda/boton-ayuda-tour';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TaskBoard } from '@/components/projects/task-board';
import { TaskListView } from '@/components/projects/task-list-view';
import { TaskTableView } from '@/components/projects/task-table-view';
import { SEGMENTED_ITEM_CLASS, ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { StartSprintButton } from '@/components/projects/start-sprint-button';
import { SprintReconocimientos, candidatosAReconocer } from '@/components/projects/sprint-extras';
import { HitosSection } from '@/components/projects/hitos-section';
import { ProjectLabelsDrawer } from '@/components/projects/project-labels-drawer';
import { CreateMilestoneDialog } from '@/components/projects/create-milestone-dialog';
import { TaskFormDialog } from '@/components/projects/task-form-dialog';
import { soloMisTareas } from '@/lib/tasks/extras';
import { TaskBulkActionsBar } from '@/components/projects/task-bulk-actions-bar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  estadoBadgeLabel,
  estadoBadgeStyle,
} from '@/components/projects/available-project-card';
import {
  ESTADO_COLUMNA_STYLE,
  FILTRO_TODOS,
  computeTaskProgress,
  derivarOpcionesHito,
  derivarOpcionesResponsable,
  derivarOpcionesRol,
  filtrarTareas,
  getProgressVisualState,
} from '@/components/projects/task-board.utils';
import { MODALIDAD_LABEL } from '@/types';
import type { AvanceProyectoDTO, ProyectoDetalleDTO } from '@/lib/dto/project.dto';
import type { TareaPublicaDTO } from '@/lib/types/tasks';
import { ProjectPageHeader, ProjectPageShell } from '@/components/projects/detail/project-page-shell';
import { TipoBadge } from '@/components/projects/tipo-badge';
import { OrgSoloLecturaBanner } from '@/components/organizations/org-solo-lectura-banner';

interface Props {
  id: number;
}

interface LeyendaItem {
  label: string;
  value: number;
  dotClassName: string;
}

/**
 * Bloque de progreso del encabezado (Secciones 14-16): barra con color
 * dinámico compartido (rojo → naranja → verde) y leyenda con conteos reales.
 */
function ProgressBloque({
  label,
  porcentaje,
  resumenTexto,
  leyenda,
}: {
  label: string;
  porcentaje: number;
  resumenTexto: string;
  leyenda: LeyendaItem[];
}) {
  const visual = getProgressVisualState(porcentaje);
  return (
    <div className="min-w-0 flex-1 md:max-w-[400px]">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-on-surface">{label}</span>
        <span className={`text-xs font-bold ${visual.text}`}>{porcentaje}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={porcentaje}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className={`h-1.5 w-full overflow-hidden rounded-full ${visual.track}`}
      >
        <div
          className={`h-full rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none ${visual.bar}`}
          style={{ width: `${porcentaje}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-tertiary">{resumenTexto}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-tertiary">
        {leyenda.map((item) => (
          <span key={item.label} className="flex items-center gap-1">
            <span className={`size-1.5 rounded-full ${item.dotClassName}`} aria-hidden="true" />
            {item.label}: <span className="font-semibold text-on-surface">{item.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const DOT_PENDIENTE = 'bg-surface-container-highest border border-outline-variant';
const WORKSPACE_CONTROL_CLASS =
  'h-10 min-h-10 rounded-md border-outline-variant px-3 text-xs font-semibold shadow-sm';

function WorkspaceProgress({
  tasks,
  avance,
}: {
  tasks: TareaPublicaDTO[];
  avance: AvanceProyectoDTO | undefined;
}) {
  const progreso = computeTaskProgress(tasks);
  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-12 lg:gap-16">
      <ProgressBloque
        label="Progreso de tareas"
        porcentaje={progreso.porcentaje}
        resumenTexto={`${progreso.conteos.HECHO} de ${progreso.total} ${progreso.total === 1 ? 'tarea completada' : 'tareas completadas'}`}
        leyenda={[
          { label: 'Por hacer', value: progreso.conteos.POR_HACER, dotClassName: ESTADO_COLUMNA_STYLE.POR_HACER.dot },
          { label: 'En progreso', value: progreso.conteos.EN_PROGRESO, dotClassName: ESTADO_COLUMNA_STYLE.EN_PROGRESO.dot },
          { label: 'En revisión', value: progreso.conteos.EN_REVISION, dotClassName: ESTADO_COLUMNA_STYLE.EN_REVISION.dot },
          { label: 'Hecho', value: progreso.conteos.HECHO, dotClassName: ESTADO_COLUMNA_STYLE.HECHO.dot },
        ]}
      />
      {avance && (
        <ProgressBloque
          label="Progreso de hitos"
          porcentaje={avance.hitos.porcentaje}
          resumenTexto={`${avance.hitos.completado} de ${avance.hitos.total} ${avance.hitos.total === 1 ? 'hito completado' : 'hitos completados'}`}
          leyenda={[
            { label: 'Pendiente', value: avance.hitos.pendiente, dotClassName: DOT_PENDIENTE },
            { label: 'En progreso', value: avance.hitos.enProgreso, dotClassName: ESTADO_COLUMNA_STYLE.EN_PROGRESO.dot },
            { label: 'Completado', value: avance.hitos.completado, dotClassName: ESTADO_COLUMNA_STYLE.HECHO.dot },
          ]}
        />
      )}
    </div>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────
function WorkspaceSkeleton() {
  return (
    <ProjectPageShell>
      <Skeleton className="mb-4 h-4 w-72" />
      <Skeleton className="mb-6 h-16 w-full max-w-xl rounded-xl" />
      <Skeleton className="mb-4 h-9 w-48" />
      <SkeletonRegion label="Cargando tablero" className="flex gap-4 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[480px] w-[300px] shrink-0 rounded-xl" />
        ))}
      </SkeletonRegion>
    </ProjectPageShell>
  );
}

/** MEJ-112: Lista o Tabla del tablero, con la misma carga, error y vacios que el Kanban. */
function VistaAlterna({
  vista,
  tasks,
  hayTareas,
  isLoading,
  isError,
  onRetry,
  onLimpiarFiltros,
  onAbrir,
}: {
  vista: Exclude<VistaTablero, 'kanban'>;
  tasks: TareaPublicaDTO[];
  hayTareas: boolean;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onLimpiarFiltros: () => void;
  onAbrir: (tarea: TareaPublicaDTO) => void;
}) {
  if (isLoading) {
    return (
      <SkeletonRegion label="Cargando tareas" className="space-y-2">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </SkeletonRegion>
    );
  }
  if (isError) {
    return (
      <div role="alert" className="space-y-3 py-10 text-center">
        <p className="type-body font-medium text-destructive">No se pudieron cargar las tareas. Intenta nuevamente.</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="min-h-11 rounded-lg border-primary text-xs font-bold text-primary hover:bg-primary/10">
          Reintentar
        </Button>
      </div>
    );
  }
  if (tasks.length === 0) {
    return (
      <div role="status" className="space-y-2 py-6 text-center">
        <p className="text-sm text-tertiary">
          {hayTareas ? 'No hay tareas que coincidan con los filtros seleccionados.' : 'Aún no hay tareas en este proyecto.'}
        </p>
        {hayTareas && (
          <Button variant="outline" size="sm" onClick={onLimpiarFiltros} className={`${WORKSPACE_CONTROL_CLASS} border-primary text-primary hover:bg-primary/10`}>
            Limpiar filtros
          </Button>
        )}
      </div>
    );
  }
  return vista === 'lista' ? <TaskListView tasks={tasks} onAbrir={onAbrir} /> : <TaskTableView tasks={tasks} onAbrir={onAbrir} />;
}

// ─── Workspace ─────────────────────────────────────────────────────────────
const PASOS_AYUDA = [
  { target: '#tour-kanban-pestanas', title: 'Tablero e hitos', content: 'Alterna entre el tablero de tareas y los hitos del proyecto.' },
  { target: '#tour-kanban-filtros', title: 'Filtros', content: 'Filtra por rol o hito, o quédate solo con tus tareas.' },
  { target: '#tour-kanban-nueva', title: 'Nueva tarea', content: 'Crea una tarea en el sprint activo.' },
  { target: '#tour-kanban-tablero', title: 'Tus tareas', content: 'Abre una tarjeta para cambiar su estado o registrar horas.' },
];

function KanbanWorkspaceView({ proyecto }: { proyecto: ProyectoDetalleDTO }) {
  const idProyecto = proyecto.idProyecto;
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const taskIdParam = searchParams.get('taskId');

  // Compatibilidad con URLs anteriores (Sección 7): /kanban?taskId=N ahora
  // redirige a la ruta canónica /kanban/tasks/N. Un taskId con formato inválido
  // se ignora (no redirige); una indicación de comentarios se conserva como
  // ?section=comments. No abre el Sheet anterior.
  useEffect(() => {
    if (!taskIdParam || !/^\d+$/.test(taskIdParam)) return;
    const idTarea = Number(taskIdParam);
    if (!Number.isInteger(idTarea) || idTarea <= 0) return;
    const section = searchParams.get('section') === 'comments' ? '?section=comments' : '';
    router.replace(`/dashboard/projects/${idProyecto}/kanban/tasks/${idTarea}${section}`);
  }, [taskIdParam, searchParams, router, idProyecto]);

  const [activeTab, setActiveTab] = useState(tabParam === 'hitos' ? 'hitos' : 'tablero');
  const [filtroRol, setFiltroRol] = useState(FILTRO_TODOS);
  const [filtroHito, setFiltroHito] = useState(FILTRO_TODOS);
  // MEJ-112: responsable y vista viven aquí, no en cada vista, para conservarse al cambiar de Kanban a Lista o Tabla.
  const [filtroResponsable, setFiltroResponsable] = useState(FILTRO_TODOS);
  const [vista, setVista] = useVistaTablero(idProyecto);
  const [atajosAbierto, setAtajosAbierto] = useState(false);
  // MEJ-51: «Solo mis tareas» (asignación activa del usuario actual).
  const [soloMias, setSoloMias] = useState(false);
  const [crearAbierto, setCrearAbierto] = useState(false);
  const [etiquetasAbierto, setEtiquetasAbierto] = useState(false);
  const [crearHitoAbierto, setCrearHitoAbierto] = useState(false);

  const { data: currentUser } = useCurrentUser();
  const isLeader = currentUser?.idUsuario === proyecto.creador.idUsuario;
  // S7: en `EN_SOLICITUD_CIERRE` y `CERRADO` el proyecto no admite Sprints nuevos.
  const estadoProyecto = proyecto.estadoProyecto;
  const proyectoEnCierre = estadoProyecto === 'EN_SOLICITUD_CIERRE' || estadoProyecto === 'CERRADO';

  const { data: avance, isSuccess: puedeVerAvance } = useProjectAvance(idProyecto);
  // Sprint de trabajo disponible (F2): la lista viene ordenada por
  // `numero: desc` (SprintsService.listSprints), y el backend garantiza a lo
  // sumo un Sprint operable (ACTIVO o EN_FINALIZACION) por proyecto vía
  // `sprint_operable_unique` — por eso el primer elemento es siempre el
  // Sprint vigente si existe uno operable; si el primero está CERRADO (o no
  // hay ninguno), no hay Sprint disponible para trabajo normal.
  // EN_FINALIZACION se trata igual que ACTIVO aquí a propósito: ese estado
  // es responsabilidad visual de F6 (banner/lock), F2 solo debe evitar
  // clasificarlo erróneamente como "todavía no existe Sprint".
  const {
    sprints,
    isLoading: isLoadingSprints,
    isError: isErrorSprints,
    refetch: refetchSprints,
  } = useProjectSprints(idProyecto);
  const sprintActual = sprints[0] ?? null;
  const haySprintDeTrabajo =
    sprintActual !== null &&
    (sprintActual.estado === 'ACTIVO' || sprintActual.estado === 'EN_FINALIZACION');
  const {
    tasks,
    isLoading: isLoadingTasks,
    isFetching: isFetchingTasks,
    isError: isErrorTasks,
    refetch: refetchTasks,
    cambiarEstadoTarea,
    eliminarTarea,
    crearTarea,
    editarTarea,
    asignarTarea,
    desasignarTarea,
    fijarResponsables,
    accionMasiva,
  } = useProjectTasks(idProyecto);
  const {
    labels,
    isLoading: isLoadingLabels,
    isError: isErrorLabels,
    refetch: refetchLabels,
    createLabel,
    updateLabel,
    deleteLabel,
  } = useProjectLabels(idProyecto);
  const { members, isLoading: cargandoMiembros } = useProjectMembers(idProyecto);
  const esParticipante =
    !!currentUser && members.some((m) => m.idUsuario === currentUser.idUsuario);
  const puedeCrear = isLeader || esParticipante;
  const { crearHito, asignarHitoTareas } = useProjectMilestones(idProyecto);
  const opcionesRol = useMemo(() => derivarOpcionesRol(tasks), [tasks]);
  const opcionesHito = useMemo(() => derivarOpcionesHito(tasks), [tasks]);
  const opcionesResponsable = useMemo(() => derivarOpcionesResponsable(tasks, members), [tasks, members]);
  const hayFiltrosActivos =
    filtroRol !== FILTRO_TODOS || filtroHito !== FILTRO_TODOS || filtroResponsable !== FILTRO_TODOS || soloMias;
  const limpiarFiltros = () => {
    setFiltroRol(FILTRO_TODOS);
    setFiltroHito(FILTRO_TODOS);
    setFiltroResponsable(FILTRO_TODOS);
    setSoloMias(false);
  };
  const idUsuarioActual = currentUser?.idUsuario ?? null;
  const tareasVisibles = useMemo(
    () => filtrarTareas(soloMias ? soloMisTareas(tasks, idUsuarioActual) : tasks, FILTRO_TODOS, FILTRO_TODOS, filtroResponsable),
    [soloMias, tasks, idUsuarioActual, filtroResponsable],
  );
  // Lista y Tabla aplican aqui el rol y el hito; el Kanban los aplica dentro de TaskBoard con los mismos valores.
  const tareasFiltradas = useMemo(
    () => filtrarTareas(tareasVisibles, filtroRol, filtroHito),
    [tareasVisibles, filtroRol, filtroHito],
  );
  const abrirTarea = (tarea: TareaPublicaDTO) =>
    router.push(`/dashboard/projects/${idProyecto}/kanban/tasks/${tarea.idTarea}`);

  // Selección múltiple (HU-202/T-382): solo el líder, solo en la pestaña
  // Tablero y sobre las tareas que los filtros dejan ver. Fuera de eso la
  // lista de visibles queda vacía y la selección se limpia sola.
  const puedeSeleccionar = isLeader && activeTab === 'tablero' && vista === 'kanban' && haySprintDeTrabajo;
  const idsVisibles = useMemo(
    () => (puedeSeleccionar ? filtrarTareas(tareasVisibles, filtroRol, filtroHito).map((t) => t.idTarea) : []),
    [puedeSeleccionar, tareasVisibles, filtroRol, filtroHito],
  );
  const seleccion = useTaskSelection(idsVisibles);
  const tareasSeleccionadas = useMemo(
    () => tasks.filter((t) => seleccion.seleccionadas.has(t.idTarea)),
    [tasks, seleccion.seleccionadas],
  );

  // Chips de rol(es) del usuario en el proyecto (Sección 28): deduplicados y
  // resueltos contra los nombres reales de `proyecto.roles`.
  const misRoles = useMemo(() => {
    if (!currentUser) return [];
    const misIds = new Set(
      members.filter((m) => m.idUsuario === currentUser.idUsuario).map((m) => m.idRolProyecto),
    );
    return proyecto.roles.filter((rol) => misIds.has(rol.idRolProyecto));
  }, [currentUser, members, proyecto.roles]);

  const ofrecerEjemplo =
    isLeader &&
    !!currentUser &&
    !isLoadingSprints &&
    !isErrorSprints &&
    sprints.length === 0 &&
    (estadoProyecto === 'PUBLICADO' || estadoProyecto === 'EN_PROGRESO');

  return (
    <ProjectPageShell>
      {ofrecerEjemplo && <OfertaEjemploPrimerProyecto idProyecto={idProyecto} idUsuario={currentUser.idUsuario} />}
      {/* Identidad de la página fuera de las tarjetas: la vuelta al proyecto
          (antes breadcrumb + botón dentro de la tarjeta) va en el encabezado. */}
      <ProjectPageHeader
        back={{
          href: isLeader ? `/dashboard/projects/${idProyecto}` : `/dashboard/proyectos/${idProyecto}`,
          label: 'Volver al proyecto',
        }}
        title="Tablero (Kanban)"
        description="Tus tareas y las del equipo por estado. Abre una tarjeta para cambiar su estado o registrar horas."
        actions={<BotonAyudaTour pasos={PASOS_AYUDA} />}
      />

      <OrgSoloLecturaBanner proyecto={proyecto} participantes={cargandoMiembros ? undefined : members} className="mb-grid" />

      {/* TARJETA RESUMEN DEL PROYECTO (Secciones 10-15): contenido, no encabezado de página */}
      <div className="card-base mb-grid">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <h2 className="type-section line-clamp-2 text-text-primary">{proyecto.tituloProyecto}</h2>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span
                className={`pill pill-sm ${estadoBadgeStyle(proyecto.estadoProyecto)}`}
              >
                {estadoBadgeLabel(proyecto.estadoProyecto)}
              </span>
              <TipoBadge tipo={proyecto.tipoProyecto} />
              <span className="pill pill-sm pill-neutral">
                {MODALIDAD_LABEL[proyecto.modalidadProyecto as keyof typeof MODALIDAD_LABEL] ??
                  proyecto.modalidadProyecto}
              </span>
              {isLeader && (
                <span className="pill pill-sm pill-slate">
                  Líder
                </span>
              )}
              {misRoles.map((rol) => (
                <span
                  key={rol.idRolProyecto}
                  className="pill pill-sm pill-neutral"
                >
                  {rol.nombreRol}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* PROGRESO (Secciones 13-16): tareas siempre; hitos solo si hay avance */}
        <div className="mt-5 border-t border-outline-variant/30 pt-4">
          <WorkspaceProgress tasks={tasks} avance={puedeVerAvance ? avance : undefined} />
        </div>
      </div>

      {/* TARJETA PRINCIPAL: pestañas + barra de herramientas + contenido (Sección 10-11).
          Una sola tarjeta blanca envuelve Tablero e Hitos; el scroll horizontal
          del tablero pertenece al área interna del board, no a la página. */}
      <div className="card-base min-h-0 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-0 gap-0">
          <TabsList id="tour-kanban-pestanas" className="mb-7 h-9 w-full justify-start gap-0 rounded-none border-b border-outline-variant/40 bg-transparent p-0">
            <TabsTrigger
              value="tablero"
              className="relative h-9 flex-none rounded-none border-x border-t border-transparent bg-transparent px-2.5 pb-2 text-sm font-semibold text-tertiary shadow-none data-[state=active]:border-outline-variant/50 data-[state=active]:border-b-surface-container-lowest data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary"
            >
              Tablero
            </TabsTrigger>
            <TabsTrigger
              value="hitos"
              className="relative h-9 flex-none rounded-none border-x border-t border-transparent bg-transparent px-5 pb-2 text-sm font-semibold text-tertiary shadow-none data-[state=active]:border-outline-variant/50 data-[state=active]:border-b-surface-container-lowest data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary"
            >
              Hitos
            </TabsTrigger>
          </TabsList>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="type-section whitespace-nowrap">
                {activeTab === 'hitos' ? 'Hitos' : 'Tablero de tareas'}
              </h2>
              <span className="pill pill-sm pill-green">
                {tareasVisibles.length} {tareasVisibles.length === 1 ? 'tarea' : 'tareas'}
              </span>
              {isFetchingTasks && (
                <span aria-live="polite" className="flex items-center gap-1 text-[11px] text-tertiary">
                  <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
                  Sincronizando...
                </span>
              )}
              {activeTab === 'tablero' && (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={vista}
                  onValueChange={(valor) => valor && setVista(valor as VistaTablero)}
                  aria-label="Vista del tablero"
                  className="w-auto"
                >
                  <ToggleGroupItem value="kanban" aria-label="Vista Kanban" className={`${SEGMENTED_ITEM_CLASS} h-10 gap-1.5 px-3`}>
                    <Kanban className="size-3.5" aria-hidden="true" />
                    Kanban
                  </ToggleGroupItem>
                  <ToggleGroupItem value="lista" aria-label="Vista Lista" className={`${SEGMENTED_ITEM_CLASS} h-10 gap-1.5 px-3`}>
                    <List className="size-3.5" aria-hidden="true" />
                    Lista
                  </ToggleGroupItem>
                  <ToggleGroupItem value="tabla" aria-label="Vista Tabla" className={`${SEGMENTED_ITEM_CLASS} h-10 gap-1.5 px-3`}>
                    <Table2 className="size-3.5" aria-hidden="true" />
                    Tabla
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isLeader && <BorrarEjemploBoton idProyecto={idProyecto} />}

              {isLeader && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEtiquetasAbierto(true)}
                  className={`${WORKSPACE_CONTROL_CLASS} w-full gap-1.5 bg-surface-container-lowest sm:w-auto md:min-w-40`}
                >
                  <Tags className="size-3.5" aria-hidden="true" />
                  Gestionar etiquetas
                </Button>
              )}
              {/* Acciones de creación juntas: «Agregar hito» va pegado a
                  «Nueva tarea», con el mismo gap del grupo. */}
              {puedeCrear && activeTab === 'hitos' && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setCrearHitoAbierto(true)}
                  className={`${WORKSPACE_CONTROL_CLASS} w-full gap-1.5 border-primary bg-primary text-on-primary hover:bg-primary/90 sm:w-auto md:min-w-36`}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Agregar hito
                </Button>
              )}
              {/* Sin Sprint de trabajo (F2), la creación de tareas queda
                  bloqueada: este botón es la única entrada que abre
                  TaskFormDialog en modo creación (`setCrearAbierto`), así
                  que ocultarlo cierra por completo esa vía. */}
              {puedeCrear && haySprintDeTrabajo && (
                <Button
                  id="tour-kanban-nueva"
                  type="button"
                  size="sm"
                  onClick={() => setCrearAbierto(true)}
                  className={`${WORKSPACE_CONTROL_CLASS} w-full gap-1.5 border-primary bg-primary text-on-primary hover:bg-primary/90 sm:w-auto md:min-w-36`}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Nueva tarea
                </Button>
              )}
            </div>
          </div>

          <div id="tour-kanban-filtros" className="mb-5 flex flex-wrap items-center gap-2">
              <Select value={filtroResponsable} onValueChange={setFiltroResponsable}>
                <SelectTrigger
                  size="sm"
                  aria-label="Filtrar por responsable"
                  className={`${WORKSPACE_CONTROL_CLASS} w-full justify-between bg-surface-container-lowest sm:w-48`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTRO_TODOS}>Todos los responsables</SelectItem>
                  {opcionesResponsable.map((opcion) => (
                    <SelectItem key={opcion.valor} value={opcion.valor}>
                      {opcion.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filtroRol} onValueChange={setFiltroRol}>
                <SelectTrigger
                  size="sm"
                  aria-label="Filtrar por rol"
                  className={`${WORKSPACE_CONTROL_CLASS} w-full justify-between bg-surface-container-lowest sm:w-44`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTRO_TODOS}>Todos los roles</SelectItem>
                  {opcionesRol.map((opcion) => (
                    <SelectItem key={opcion.valor} value={opcion.valor}>
                      {opcion.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filtroHito} onValueChange={setFiltroHito}>
                <SelectTrigger
                  size="sm"
                  aria-label="Filtrar por hito"
                  className={`${WORKSPACE_CONTROL_CLASS} w-full justify-between bg-surface-container-lowest sm:w-44`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTRO_TODOS}>Todos los hitos</SelectItem>
                  {opcionesHito.map((opcion) => (
                    <SelectItem key={opcion.valor} value={opcion.valor}>
                      {opcion.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant={soloMias ? 'default' : 'outline'}
                size="sm"
                aria-pressed={soloMias}
                onClick={() => setSoloMias((v) => !v)}
                className={`${WORKSPACE_CONTROL_CLASS} w-full gap-1.5 sm:w-auto`}
              >
                <UserCheck className="size-3.5" aria-hidden="true" />
                Solo mis tareas
              </Button>

              {hayFiltrosActivos && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={limpiarFiltros}
                  className={`${WORKSPACE_CONTROL_CLASS} border border-transparent text-tertiary hover:text-on-surface`}
                >
                  Limpiar filtros
                </Button>
              )}

              {activeTab === 'tablero' && vista === 'kanban' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAtajosAbierto(true)}
                  className={`${WORKSPACE_CONTROL_CLASS} hidden gap-1.5 md:inline-flex`}
                >
                  <Keyboard className="size-3.5" aria-hidden="true" />
                  Atajos
                </Button>
              )}

            </div>

          {puedeSeleccionar && tasks.length > 0 && (
            <p
              data-slot="ayuda-seleccion"
              className="-mt-2 mb-5 flex items-start gap-1.5 text-xs text-text-secondary"
            >
              <MousePointerClick className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden md:inline">
                Marca las casillas de las tarjetas para seleccionar varias tareas; mantén <Kbd>Shift</Kbd> al
                hacer clic para seleccionar un rango. <Kbd>Esc</Kbd> limpia la selección.
              </span>
              <span className="md:hidden">Toca las casillas de las tarjetas para seleccionar varias tareas.</span>
            </p>
          )}

          <TabsContent id="tour-kanban-tablero" value="tablero" className="mt-0 min-h-0">
            {isLoadingSprints ? (
              <SkeletonRegion label="Cargando sprints" className="space-y-3">
                <Skeleton className="h-9 w-48" />
                <Skeleton className="h-[420px] w-full rounded-xl" />
              </SkeletonRegion>
            ) : isErrorSprints ? (
              <div role="alert" className="space-y-3 py-10 text-center">
                <p className="type-body font-medium text-destructive">
                  No se pudo verificar el estado del Sprint. Intenta nuevamente.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchSprints()}
                  className="rounded-lg border-primary text-xs font-bold text-primary hover:bg-primary/10"
                >
                  Reintentar
                </Button>
              </div>
            ) : haySprintDeTrabajo ? (
              <>
              {soloMias && !isLoadingTasks && !isErrorTasks && tasks.length > 0 && tareasVisibles.length === 0 && (
                <Empty tone="muted" size="compact" role="status" className="mb-4">
                  <EmptyMedia variant="compact" className="size-10 rounded-control border-transparent text-text-secondary">
                    <UserCheck aria-hidden="true" className="size-5" />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle>No tienes tareas asignadas en este proyecto</EmptyTitle>
                    <EmptyDescription>Cuando te asignen una, aparecerá aquí.</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button type="button" variant="outline" size="sm" onClick={() => setSoloMias(false)}>
                      Ver todas las tareas
                    </Button>
                  </EmptyContent>
                </Empty>
              )}
              {vista !== 'kanban' ? (
                <VistaAlterna
                  vista={vista}
                  tasks={tareasFiltradas}
                  hayTareas={tasks.length > 0}
                  isLoading={isLoadingTasks}
                  isError={isErrorTasks}
                  onRetry={() => refetchTasks()}
                  onLimpiarFiltros={limpiarFiltros}
                  onAbrir={abrirTarea}
                />
              ) : (
              <TaskBoard
                idProyecto={idProyecto}
                tasks={tareasVisibles}
                isLoading={isLoadingTasks}
                isFetching={isFetchingTasks}
                isError={isErrorTasks}
                onRetry={() => refetchTasks()}
                isLeader={isLeader}
                currentUserId={currentUser?.idUsuario ?? null}
                cambiarEstadoTarea={cambiarEstadoTarea}
                eliminarTarea={eliminarTarea}
                crearTarea={crearTarea}
                editarTarea={editarTarea}
                asignarTarea={asignarTarea}
                desasignarTarea={desasignarTarea}
                roles={proyecto.roles}
                milestones={proyecto.hitos}
                members={members}
                labels={labels}
                labelsLoading={isLoadingLabels}
                labelsError={isErrorLabels}
                onRetryLabels={() => refetchLabels()}
                createLabel={createLabel}
                updateLabel={updateLabel}
                deleteLabel={deleteLabel}
                filtroRolExterno={filtroRol}
                filtroHitoExterno={filtroHito}
                onFiltroRolChange={setFiltroRol}
                onFiltroHitoChange={setFiltroHito}
                mostrarToolbar={false}
                atajosAbierto={atajosAbierto}
                onAtajosChange={setAtajosAbierto}
                seleccion={puedeSeleccionar ? seleccion.control : undefined}
                fijarResponsables={fijarResponsables}
              />
              )}
              </>
            ) : proyectoEnCierre ? (
              /* S7: en cierre no se abre trabajo nuevo. Ofrecer «Iniciar
                 Sprint» aquí prometía una acción que el backend rechaza. */
              <Empty tone="muted" role="status">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Kanban aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>
                    {estadoProyecto === 'CERRADO'
                      ? 'Este proyecto está cerrado'
                      : 'Este proyecto está en proceso de cierre'}
                  </EmptyTitle>
                  <EmptyDescription>
                    {estadoProyecto === 'CERRADO'
                      ? 'Un proyecto cerrado ya no admite Sprints nuevos; su historial queda disponible para consulta.'
                      : 'Mientras su cierre esté en revisión no pueden iniciarse Sprints nuevos. Si la administración lo devuelve a ejecución, podrás volver a hacerlo.'}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Kanban aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Todavía no hay un Sprint activo en este proyecto</EmptyTitle>
                  <EmptyDescription>
                    Cuando se cree un Sprint, el tablero y las tareas aparecerán aquí.
                  </EmptyDescription>
                </EmptyHeader>
                {isLeader && (
                  <EmptyContent>
                    <StartSprintButton idProyecto={idProyecto} />
                  </EmptyContent>
                )}
              </Empty>
            )}
          </TabsContent>

          <TabsContent value="hitos" className="mt-5">
            <HitosSection
              hitos={proyecto.hitos}
              tareas={tareasVisibles}
              idProyecto={idProyecto}
              filtroRol={filtroRol}
              filtroHito={filtroHito}
              onLimpiarFiltros={() => {
                limpiarFiltros();
              }}
              onVerTodasLasTareas={(idHito) => {
                setFiltroHito(String(idHito));
                setActiveTab('tablero');
              }}
              isLeader={isLeader}
              currentUserId={currentUser?.idUsuario ?? null}
              cambiarEstadoTarea={cambiarEstadoTarea}
              eliminarTarea={eliminarTarea}
              crearTarea={crearTarea}
              editarTarea={editarTarea}
              asignarTarea={asignarTarea}
              desasignarTarea={desasignarTarea}
              roles={proyecto.roles}
              milestones={proyecto.hitos}
              members={members}
              labels={labels}
              puedeCrear={puedeCrear}
              crearHito={crearHito}
              asignarHitoTareas={asignarHitoTareas}
            />
          </TabsContent>
        </Tabs>
        <TaskFormDialog
          open={crearAbierto}
          mode="create"
          task={null}
          idProyecto={idProyecto}
          roles={proyecto.roles}
          milestones={proyecto.hitos}
          members={members}
          labels={labels}
          isLeader={isLeader}
          puedeGestionarTarea={isLeader}
          crearTarea={crearTarea}
          editarTarea={editarTarea}
          asignarTarea={asignarTarea}
          desasignarTarea={desasignarTarea}
          fijarResponsables={fijarResponsables}
          onOpenChange={setCrearAbierto}
          onManageLabels={isLeader ? () => setEtiquetasAbierto(true) : undefined}
        />
        {puedeCrear && (
          <CreateMilestoneDialog
            open={crearHitoAbierto}
            onOpenChange={setCrearHitoAbierto}
            crearHito={crearHito}
          />
        )}
        {puedeSeleccionar && (
          <TaskBulkActionsBar
            tareas={tareasSeleccionadas}
            members={members}
            labels={labels}
            accionMasiva={accionMasiva}
            onLimpiar={seleccion.limpiar}
          />
        )}
        {isLeader && (
          <ProjectLabelsDrawer
            open={etiquetasAbierto}
            onOpenChange={setEtiquetasAbierto}
            labels={labels}
            isLoading={isLoadingLabels}
            isError={isErrorLabels}
            onRetry={() => refetchLabels()}
            createLabel={createLabel}
            updateLabel={updateLabel}
            deleteLabel={deleteLabel}
          />
        )}
      </div>
      {/* MEJ-57: cada integrante reconoce a un compañero por Sprint; el Sprint cerrado ya no aparece aquí. */}
      {haySprintDeTrabajo && sprintActual && (isLeader || esParticipante) && (
        <div className="mt-section">
          <SprintReconocimientos
            idProyecto={idProyecto}
            idSprint={sprintActual.idSprint}
            estado={sprintActual.estado}
            idUsuarioActual={currentUser?.idUsuario ?? null}
            candidatos={candidatosAReconocer(proyecto.creador, members, currentUser?.idUsuario ?? null)}
          />
        </div>
      )}
    </ProjectPageShell>
  );
}

// ─── Entry point ─────────────────────────────────────────────────────────────
export default function KanbanWorkspaceClient({ id }: Props) {
  const { data: proyecto, isLoading, error } = useProjectDetail(id);

  if (isLoading) {
    return <WorkspaceSkeleton />;
  }

  if (error || !proyecto) {
    return (
        <ProjectPageShell>
          <div className="mx-auto max-w-prose py-16 text-center">
            <p className="font-medium text-destructive">No se pudo cargar el proyecto. Intenta nuevamente.</p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link href="/dashboard/proyectos">Volver a mis proyectos</Link>
            </Button>
          </div>
        </ProjectPageShell>
    );
  }

  return (
      <Suspense fallback={<WorkspaceSkeleton />}>
        <KanbanWorkspaceView proyecto={proyecto} />
      </Suspense>
  );
}
