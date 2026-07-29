'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Plus, Tags } from 'lucide-react';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectTasks } from '@/hooks/use-project-tasks';
import { useProjectLabels } from '@/hooks/use-project-labels';
import { useProjectMilestones } from '@/hooks/use-project-milestones';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useProjectAvance } from '@/hooks/use-project-avance';
import { useCurrentUser } from '@/hooks/use-current-user';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TaskBoard } from '@/components/projects/task-board';
import { HitosSection } from '@/components/projects/hitos-section';
import { ProjectLabelsDrawer } from '@/components/projects/project-labels-drawer';
import { CreateMilestoneDialog } from '@/components/projects/create-milestone-dialog';
import { TaskFormDialog } from '@/components/projects/task-form-dialog';
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
  tipoBadgeLabel,
  tipoBadgeStyle,
} from '@/components/projects/available-project-card';
import {
  ESTADO_COLUMNA_STYLE,
  FILTRO_TODOS,
  computeTaskProgress,
  derivarOpcionesHito,
  derivarOpcionesRol,
  getProgressVisualState,
} from '@/components/projects/task-board.utils';
import { MODALIDAD_LABEL } from '@/types';
import type { AvanceProyectoDTO, ProyectoDetalleDTO } from '@/lib/dto/project.dto';
import type { TareaPublicaDTO } from '@/lib/types/tasks';

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
    <div className="mx-auto w-full max-w-[1600px] px-5 py-6 md:px-7">
      <Skeleton className="mb-4 h-4 w-72" />
      <Skeleton className="mb-6 h-16 w-full max-w-xl rounded-xl" />
      <Skeleton className="mb-4 h-9 w-48" />
      <div className="flex gap-4 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[480px] w-[300px] shrink-0 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// ─── Workspace ─────────────────────────────────────────────────────────────
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
  const [crearAbierto, setCrearAbierto] = useState(false);
  const [etiquetasAbierto, setEtiquetasAbierto] = useState(false);
  const [crearHitoAbierto, setCrearHitoAbierto] = useState(false);

  const { data: currentUser } = useCurrentUser();
  const isLeader = currentUser?.idUsuario === proyecto.creador.idUsuario;

  const { data: avance, isSuccess: puedeVerAvance } = useProjectAvance(idProyecto);
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
  const { members } = useProjectMembers(idProyecto);
  const { crearHito } = useProjectMilestones(idProyecto);
  const opcionesRol = useMemo(() => derivarOpcionesRol(tasks), [tasks]);
  const opcionesHito = useMemo(() => derivarOpcionesHito(tasks), [tasks]);
  const hayFiltrosActivos = filtroRol !== FILTRO_TODOS || filtroHito !== FILTRO_TODOS;
  const limpiarFiltros = () => {
    setFiltroRol(FILTRO_TODOS);
    setFiltroHito(FILTRO_TODOS);
  };

  // Chips de rol(es) del usuario en el proyecto (Sección 28): deduplicados y
  // resueltos contra los nombres reales de `proyecto.roles`.
  const misRoles = useMemo(() => {
    if (!currentUser) return [];
    const misIds = new Set(
      members.filter((m) => m.idUsuario === currentUser.idUsuario).map((m) => m.idRolProyecto),
    );
    return proyecto.roles.filter((rol) => misIds.has(rol.idRolProyecto));
  }, [currentUser, members, proyecto.roles]);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-5 pb-10 pt-5 md:px-7">
      {/* BREADCRUMB (Sección 26) */}
      <Breadcrumb className="mb-4">
        <BreadcrumbList className="text-[13px]">
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard/projects/mine" className="text-tertiary hover:text-on-surface">
                Mis proyectos
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link
                href={`/dashboard/projects/${idProyecto}`}
                className="max-w-[16rem] truncate text-tertiary hover:text-on-surface"
              >
                {proyecto.tituloProyecto}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-medium text-on-surface">Kanban</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* TARJETA RESUMEN DEL PROYECTO (Secciones 10-15) */}
      <div className="mb-4 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="line-clamp-2 text-2xl font-bold leading-tight text-on-surface md:text-[28px]">
              {proyecto.tituloProyecto}
            </h1>
            <p className="text-sm text-tertiary">Workspace del proyecto</p>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${estadoBadgeStyle(proyecto.estadoProyecto)}`}
              >
                {estadoBadgeLabel(proyecto.estadoProyecto)}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tipoBadgeStyle(proyecto.tipoProyecto)}`}
              >
                {tipoBadgeLabel(proyecto.tipoProyecto)}
              </span>
              <span className="inline-flex items-center rounded-full border border-outline-variant/30 px-2.5 py-0.5 text-[11px] font-medium text-on-surface-variant">
                {MODALIDAD_LABEL[proyecto.modalidadProyecto as keyof typeof MODALIDAD_LABEL] ??
                  proyecto.modalidadProyecto}
              </span>
              {isLeader && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                  Líder
                </span>
              )}
              {misRoles.map((rol) => (
                <span
                  key={rol.idRolProyecto}
                  className="inline-flex items-center rounded-full border border-outline-variant/30 px-2.5 py-0.5 text-[11px] font-medium text-on-surface-variant"
                >
                  {rol.nombreRol}
                </span>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-lg border-outline-variant text-xs font-bold"
            >
              <Link href={`/dashboard/projects/${idProyecto}`}>
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                Volver al proyecto
              </Link>
            </Button>
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
      <div className="min-h-0 overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm md:p-5">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-0 gap-0">
          <TabsList className="mb-7 h-9 w-full justify-start gap-0 rounded-none border-b border-outline-variant/40 bg-transparent p-0">
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

          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-on-surface md:text-[22px]">
                {activeTab === 'hitos' ? 'Hitos' : 'Tablero de tareas'}
              </h2>
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {tasks.length} {tasks.length === 1 ? 'tarea' : 'tareas'}
              </span>
              {isFetchingTasks && (
                <span aria-live="polite" className="flex items-center gap-1 text-[11px] text-tertiary">
                  <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
                  Sincronizando...
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
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

              {isLeader && activeTab === 'hitos' && (
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

              {isLeader && (
                <>
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
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setCrearAbierto(true)}
                    className={`${WORKSPACE_CONTROL_CLASS} w-full gap-1.5 border-primary bg-primary text-on-primary hover:bg-primary/90 sm:w-auto md:min-w-36`}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    Nueva tarea
                  </Button>
                </>
              )}
            </div>
          </div>

          <TabsContent value="tablero" className="mt-0 min-h-0">
            <TaskBoard
              idProyecto={idProyecto}
              tasks={tasks}
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
            />
          </TabsContent>

          <TabsContent value="hitos" className="mt-5">
            <HitosSection
              hitos={proyecto.hitos}
              tareas={tasks}
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
            />
          </TabsContent>
        </Tabs>
        <TaskFormDialog
          open={crearAbierto}
          mode="create"
          task={null}
          roles={proyecto.roles}
          milestones={proyecto.hitos}
          members={members}
          labels={labels}
          isLeader={isLeader}
          crearTarea={crearTarea}
          editarTarea={editarTarea}
          asignarTarea={asignarTarea}
          desasignarTarea={desasignarTarea}
          onOpenChange={setCrearAbierto}
          onManageLabels={isLeader ? () => setEtiquetasAbierto(true) : undefined}
        />
        {isLeader && (
          <CreateMilestoneDialog
            open={crearHitoAbierto}
            onOpenChange={setCrearHitoAbierto}
            crearHito={crearHito}
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
    </div>
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
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <p className="font-medium text-red-600">No se pudo cargar el proyecto. Intenta nuevamente.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/dashboard/proyectos">Volver a mis proyectos</Link>
          </Button>
        </div>
    );
  }

  return (
      <Suspense fallback={<WorkspaceSkeleton />}>
        <KanbanWorkspaceView proyecto={proyecto} />
      </Suspense>
  );
}
