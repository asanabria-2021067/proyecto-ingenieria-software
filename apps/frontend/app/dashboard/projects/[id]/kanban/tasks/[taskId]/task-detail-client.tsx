'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Flag,
  Loader2,
  MessageSquare,
  MoreVertical,
  Pencil,
  Tag,
  Trash2,
  User,
  UserMinus,
  UserPlus,
  Workflow,
} from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TaskLabelChip } from '@/components/projects/task-label-chip';
import { TaskCommentsPanel } from '@/components/projects/task-comments-panel';
import { TaskHoursPanel } from '@/components/projects/task-hours-panel';
import { TaskFormDialog } from '@/components/projects/task-form-dialog';
import { CloseAssignmentForm } from '@/components/projects/close-assignment-form';
import { ProjectLabelsDrawer } from '@/components/projects/project-labels-drawer';
import { getApiErrorMessage } from '@/components/projects/api-error';
import {
  COLUMNAS_TABLERO,
  ESTADO_COLUMNA_STYLE,
  ESTADO_LABEL,
  PRIORIDAD_COLOR,
  PRIORIDAD_ICON,
  PRIORIDAD_LABEL,
  estaVencida,
  formatearFechaLimite,
} from '@/components/projects/task-board.utils';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectTasks } from '@/hooks/use-project-tasks';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useProjectLabels } from '@/hooks/use-project-labels';
import { useCurrentUser } from '@/hooks/use-current-user';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';
import type { EstadoTarea, TareaPublicaDTO } from '@/lib/types/tasks';

interface Props {
  idProyecto: number;
  idTarea: number;
}

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function formatTiempo(horas: number): string {
  return horas === 1 ? '1 hora' : `${horas} horas`;
}

const CARD = 'rounded-[11px] border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm';

function SeccionTitulo({ icon: Icon, children }: { icon?: typeof Tag; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-on-surface">
      {Icon && <Icon className="size-4 text-tertiary" aria-hidden="true" />}
      {children}
    </h2>
  );
}

function DatoOrganizacion({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof User;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-tertiary" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary">{label}</p>
        <div className="mt-0.5 text-sm text-on-surface">{children}</div>
      </div>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function TaskDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-360 px-6 pb-12 pt-5 md:px-7">
      <Skeleton className="mb-4 h-4 w-80" />
      <Skeleton className="mb-4 h-28 w-full rounded-[11px]" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.8fr)_minmax(340px,1fr)]">
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-[11px]" />
          <Skeleton className="h-40 w-full rounded-[11px]" />
          <Skeleton className="h-28 w-full rounded-[11px]" />
          <Skeleton className="h-24 w-full rounded-[11px]" />
        </div>
        <Skeleton className="h-130 w-full rounded-[11px]" />
      </div>
    </div>
  );
}

// ─── Vista principal ──────────────────────────────────────────────────────────
function TaskDetailView({
  proyecto,
  tarea,
  idProyecto,
}: {
  proyecto: ProyectoDetalleDTO;
  tarea: TareaPublicaDTO;
  idProyecto: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const enfocarComentarios = searchParams.get('section') === 'comments';

  const { data: currentUser } = useCurrentUser();
  const { cambiarEstadoTarea, eliminarTarea, crearTarea, editarTarea, asignarTarea, desasignarTarea } =
    useProjectTasks(idProyecto);
  const { members } = useProjectMembers(idProyecto);
  const {
    labels,
    isLoading: labelsLoading,
    isError: labelsError,
    refetch: refetchLabels,
    createLabel,
    updateLabel,
    deleteLabel,
  } = useProjectLabels(idProyecto);

  const [editarAbierto, setEditarAbierto] = useState(false);
  const [etiquetasAbierto, setEtiquetasAbierto] = useState(false);
  const [borrarAbierto, setBorrarAbierto] = useState(false);
  const [cerrarTramoAbierto, setCerrarTramoAbierto] = useState(false);

  const isLeader = currentUser?.idUsuario === proyecto.creador.idUsuario;
  const asignado = tarea.asignacionActiva?.usuario ?? null;
  const esAsignadoActivo =
    currentUser != null && tarea.asignacionActiva?.idUsuario === currentUser.idUsuario;
  const puedeCambiarEstado = isLeader || esAsignadoActivo;

  // HU-141: gestión colaborativa por rol — un participante activo en el
  // MISMO rol que la tarea puede editarla/asignarla/desasignarla sin ser
  // líder. `members` (useProjectMembers) ya trae solo participaciones
  // ACTIVO (Sección/comentario del hook). Un usuario puede tener varias
  // filas ACTIVO en el mismo proyecto (una por rol) — por eso se usa
  // `.some(...)` sobre TODAS sus participaciones en vez de `.find(...)`
  // (que solo devolvería la primera y podría negar acceso legítimo a un
  // usuario multi-rol cuyo rol coincidente no sea el primero). Una tarea
  // sin rol (tarea.rolProyecto: null) nunca habilita esta vía — sigue
  // siendo exclusiva del líder, igual que en el backend.
  const idRolTarea = tarea.rolProyecto?.idRolProyecto ?? null;
  const mismoRolActivo =
    currentUser != null &&
    idRolTarea != null &&
    members.some((m) => m.idUsuario === currentUser.idUsuario && m.idRolProyecto === idRolTarea);
  const puedeGestionarTarea = isLeader || mismoRolActivo;

  const PrioridadIcon = PRIORIDAD_ICON[tarea.prioridad];
  const vencida = estaVencida(tarea);
  const estiloEstado = ESTADO_COLUMNA_STYLE[tarea.estadoTarea];

  const kanbanHref = `/dashboard/projects/${idProyecto}/kanban`;

  const volverAlTablero = () => {
    // (A) Si se llegó navegando dentro de la app, `back()` conserva filtros,
    // pestaña y scroll del tablero. (B) Si se entró por URL directa o
    // notificación (sin historial), se usa el fallback al workspace Kanban.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(kanbanHref);
    }
  };

  const estadoPending =
    cambiarEstadoTarea.isPending && cambiarEstadoTarea.variables?.taskId === tarea.idTarea;
  const estadoError =
    cambiarEstadoTarea.isError && cambiarEstadoTarea.variables?.taskId === tarea.idTarea
      ? getApiErrorMessage(cambiarEstadoTarea.error, 'task')
      : null;

  const cambiarEstado = (nuevo: EstadoTarea) => {
    if (nuevo === tarea.estadoTarea) return;
    cambiarEstadoTarea.mutate({ taskId: tarea.idTarea, input: { estadoTarea: nuevo } });
  };

  const confirmarEliminar = () => {
    eliminarTarea.mutate(
      { taskId: tarea.idTarea },
      {
        onSuccess: () => {
          setBorrarAbierto(false);
          router.push(kanbanHref);
        },
      },
    );
  };

  // section=comments (Sección 52): al montar con el parámetro, desplaza y enfoca
  // la tarjeta de comentarios sin ocultar los detalles ni tocar la URL.
  const comentariosHeadingRef = useRef<HTMLHeadingElement>(null);
  const focoAplicado = useRef(false);
  useEffect(() => {
    if (!enfocarComentarios || focoAplicado.current) return;
    focoAplicado.current = true;
    requestAnimationFrame(() => {
      comentariosHeadingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      comentariosHeadingRef.current?.focus();
    });
  }, [enfocarComentarios]);

  return (
    <div className="mx-auto w-full max-w-360 px-6 pb-12 pt-5 md:px-7">
      {/* BREADCRUMB (Sección 14) */}
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
                href={isLeader ? `/dashboard/projects/${idProyecto}` : `/dashboard/proyectos/${idProyecto}`}
                className="max-w-56 truncate text-tertiary hover:text-on-surface"
              >
                {proyecto.tituloProyecto}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={kanbanHref} className="text-tertiary hover:text-on-surface">
                Kanban
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-72 truncate font-medium text-on-surface" title={tarea.tituloTarea}>
              {tarea.tituloTarea}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* HEADER (Sección 19-23) */}
      <div className={`${CARD} mb-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={volverAlTablero}
            aria-label="Volver al tablero"
            className="h-9.5 gap-1.5 rounded-md border-outline-variant text-xs font-bold"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Volver al tablero
          </Button>

          {(esAsignadoActivo || puedeGestionarTarea) && (
            <div className="flex flex-wrap items-center gap-2">
              {/* F10 — solo quien tiene la asignación activa puede cerrar su
                  propio tramo (mismo criterio que el backend:
                  tasks.service.ts closeAssignment rechaza con 403 si
                  actorUserId !== asignacion.idUsuario). Independiente de
                  isLeader: un líder sin asignación activa no ve este botón. */}
              {esAsignadoActivo && tarea.asignacionActiva && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCerrarTramoAbierto(true)}
                  aria-label={`Cerrar tramo de ${tarea.tituloTarea}`}
                  className="h-9.5 gap-1.5 rounded-md border-outline-variant text-xs font-bold"
                >
                  Cerrar tramo
                </Button>
              )}
              {puedeGestionarTarea && (
              <Button
                type="button"
                size="sm"
                onClick={() => setEditarAbierto(true)}
                aria-label={`Editar tarea ${tarea.tituloTarea}`}
                className="h-9.5 gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                Editar tarea
              </Button>
              )}
              {puedeGestionarTarea && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label="Más acciones de la tarea"
                    className="h-9.5 gap-1.5 rounded-md border-outline-variant text-xs font-bold"
                  >
                    <MoreVertical className="size-4" aria-hidden="true" />
                    Más
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {asignado ? (
                    <DropdownMenuItem
                      aria-label={`Reasignar tarea ${tarea.tituloTarea}`}
                      onSelect={() => setEditarAbierto(true)}
                    >
                      <UserPlus className="size-4" aria-hidden="true" />
                      Reasignar
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      aria-label={`Asignar tarea ${tarea.tituloTarea}`}
                      onSelect={() => setEditarAbierto(true)}
                    >
                      <UserPlus className="size-4" aria-hidden="true" />
                      Asignar
                    </DropdownMenuItem>
                  )}
                  {asignado && (
                    <DropdownMenuItem
                      aria-label={`Desasignar tarea ${tarea.tituloTarea}`}
                      disabled={desasignarTarea.isPending}
                      onSelect={() => desasignarTarea.mutate({ taskId: tarea.idTarea })}
                    >
                      <UserMinus className="size-4" aria-hidden="true" />
                      Desasignar
                    </DropdownMenuItem>
                  )}
                  {isLeader && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        aria-label={`Eliminar tarea ${tarea.tituloTarea}`}
                        onSelect={() => setBorrarAbierto(true)}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        Eliminar tarea
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              )}
            </div>
          )}
        </div>

        <h1 className="mt-4 line-clamp-3 text-[26px] font-bold leading-tight text-on-surface md:text-[28px]">
          {tarea.tituloTarea}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${estiloEstado.headerBg} ${estiloEstado.headerText}`}
          >
            <span className={`inline-block size-2 rounded-full ${estiloEstado.dot}`} aria-hidden="true" />
            {ESTADO_LABEL[tarea.estadoTarea]}
          </span>
          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${PRIORIDAD_COLOR[tarea.prioridad]}`}>
            <PrioridadIcon className="size-3.5" aria-hidden="true" />
            {PRIORIDAD_LABEL[tarea.prioridad]}
          </span>
          {tarea.rolProyecto && (
            <span className="inline-flex max-w-56 items-center truncate rounded-md bg-secondary-container px-2 py-0.5 text-xs font-medium text-on-secondary-container">
              {tarea.rolProyecto.nombreRol}
            </span>
          )}
          {tarea.hito && (
            <span
              className="inline-flex max-w-56 items-center gap-1 truncate rounded-md bg-surface-container-high px-2 py-0.5 text-xs font-medium text-on-surface-variant"
              title={tarea.hito.tituloHito}
            >
              <Flag className="size-3 shrink-0" aria-hidden="true" />
              {tarea.hito.tituloHito}
            </span>
          )}
        </div>
      </div>

      {/* LAYOUT PRINCIPAL (Sección 15-16) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.8fr)_minmax(340px,1fr)]">
        {/* COLUMNA IZQUIERDA */}
        <div className="min-w-0 space-y-4">
          {/* Descripción (Sección 29) */}
          <section className={CARD}>
            <SeccionTitulo icon={Workflow}>Descripción</SeccionTitulo>
            {tarea.descripcionTarea ? (
              <p className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-on-surface-variant">
                {tarea.descripcionTarea}
              </p>
            ) : (
              <p className="text-sm italic text-tertiary">Esta tarea no tiene una descripción.</p>
            )}
          </section>

          {/* Organización (Sección 30-35) */}
          <section className={CARD}>
            <SeccionTitulo icon={Tag}>Organización</SeccionTitulo>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DatoOrganizacion icon={Workflow} label="Estado">
                {puedeCambiarEstado ? (
                  <div className="mt-1 flex items-center gap-2">
                    <Select
                      value={tarea.estadoTarea}
                      disabled={estadoPending}
                      onValueChange={(valor) => cambiarEstado(valor as EstadoTarea)}
                    >
                      <SelectTrigger
                        aria-label={`Cambiar estado de ${tarea.tituloTarea}`}
                        className="h-9 w-full max-w-55 bg-surface-container-lowest text-sm"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COLUMNAS_TABLERO.map((columna) => (
                          <SelectItem key={columna.estado} value={columna.estado}>
                            {ESTADO_LABEL[columna.estado]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {estadoPending && (
                      <Loader2 className="size-4 shrink-0 animate-spin text-tertiary" aria-hidden="true" />
                    )}
                  </div>
                ) : (
                  ESTADO_LABEL[tarea.estadoTarea]
                )}
                {estadoError && (
                  <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {estadoError}
                  </p>
                )}
              </DatoOrganizacion>

              <DatoOrganizacion icon={Tag} label="Rol">
                {tarea.rolProyecto ? tarea.rolProyecto.nombreRol : <span className="text-tertiary">Sin rol</span>}
              </DatoOrganizacion>

              <DatoOrganizacion icon={User} label="Usuario asignado">
                {asignado ? (
                  <span className="inline-flex items-center gap-2">
                    <Avatar className="size-6">
                      {asignado.fotoUrl && <AvatarImage src={asignado.fotoUrl} alt="" />}
                      <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                        {getInitials(asignado.nombre, asignado.apellido)}
                      </AvatarFallback>
                    </Avatar>
                    {asignado.nombre} {asignado.apellido}
                  </span>
                ) : (
                  <span className="text-tertiary">Sin asignar</span>
                )}
              </DatoOrganizacion>

              <DatoOrganizacion icon={Flag} label="Hito">
                {tarea.hito ? tarea.hito.tituloHito : <span className="text-tertiary">Sin hito</span>}
              </DatoOrganizacion>
            </div>
          </section>

          {/* Planificación (Sección 36-39) */}
          <section className={CARD}>
            <SeccionTitulo icon={Calendar}>Planificación</SeccionTitulo>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DatoOrganizacion icon={PrioridadIcon} label="Prioridad">
                <span className={`font-medium ${PRIORIDAD_COLOR[tarea.prioridad]}`}>
                  {PRIORIDAD_LABEL[tarea.prioridad]}
                </span>
              </DatoOrganizacion>
              <DatoOrganizacion icon={Calendar} label="Fecha límite">
                {tarea.fechaLimite ? (
                  <span className={vencida ? 'font-semibold text-red-600 dark:text-red-400' : undefined}>
                    {formatearFechaLimite(tarea.fechaLimite)}
                    {vencida && ' · Vencida'}
                  </span>
                ) : (
                  <span className="text-tertiary">Sin fecha</span>
                )}
              </DatoOrganizacion>
              <DatoOrganizacion icon={Clock} label="Tiempo estimado">
                {tarea.tiempoEstimadoHoras != null ? (
                  formatTiempo(tarea.tiempoEstimadoHoras)
                ) : (
                  <span className="text-tertiary">No estimado</span>
                )}
              </DatoOrganizacion>
            </div>
          </section>

          {/* Horas trabajadas (HU-142) */}
          <section className={CARD}>
            <SeccionTitulo icon={Clock}>Horas trabajadas</SeccionTitulo>
            <TaskHoursPanel
              idProyecto={idProyecto}
              idTarea={tarea.idTarea}
              puedeRegistrar={esAsignadoActivo}
              enabled
            />
          </section>

          {/* Etiquetas (Sección 40) */}
          <section className={CARD}>
            <SeccionTitulo icon={Tag}>Etiquetas</SeccionTitulo>
            {tarea.etiquetas.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {tarea.etiquetas.map((etiqueta) => (
                  <TaskLabelChip key={etiqueta.idEtiqueta} etiqueta={etiqueta} />
                ))}
              </div>
            ) : (
              <p className="text-sm italic text-tertiary">Esta tarea no tiene etiquetas.</p>
            )}
          </section>
        </div>

        {/* COLUMNA DERECHA: COMENTARIOS (Sección 41-51) */}
        <div className="min-w-0">
          <section
            className={`${CARD} flex flex-col lg:sticky lg:top-22 lg:max-h-[calc(100vh-140px)]`}
          >
            <div className="mb-3 shrink-0">
              <h2
                ref={comentariosHeadingRef}
                tabIndex={-1}
                className="flex items-center gap-2 text-sm font-bold text-on-surface focus:outline-none"
              >
                <MessageSquare className="size-4 text-tertiary" aria-hidden="true" />
                Comentarios ({tarea.cantidadComentarios})
              </h2>
              <p className="mt-1 text-xs text-tertiary">
                Comparte avances, dudas o información relacionada con la tarea.
              </p>
            </div>
            <TaskCommentsPanel
              idProyecto={idProyecto}
              idTarea={tarea.idTarea}
              enabled
              scroll
            />
          </section>
        </div>
      </div>

      {/* EDITAR (reutiliza el formulario compartido — Sección 24/67) */}
      {puedeGestionarTarea && (
        <TaskFormDialog
          open={editarAbierto}
          mode="edit"
          task={tarea}
          roles={proyecto.roles}
          milestones={proyecto.hitos}
          members={members}
          labels={labels}
          isLeader={isLeader}
          puedeGestionarTarea={puedeGestionarTarea}
          crearTarea={crearTarea}
          editarTarea={editarTarea}
          asignarTarea={asignarTarea}
          desasignarTarea={desasignarTarea}
          onOpenChange={(open) => setEditarAbierto(open)}
          onRequestDelete={() => setBorrarAbierto(true)}
          onManageLabels={isLeader ? () => setEtiquetasAbierto(true) : undefined}
        />
      )}

      {/* Eliminar (Sección 25) */}
      <AlertDialog
        open={borrarAbierto}
        onOpenChange={(open) => {
          if (!open) setBorrarAbierto(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta tarea?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Esta acción eliminará la tarea "${tarea.tituloTarea}". Esta acción no se puede deshacer.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {eliminarTarea.isError && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {getApiErrorMessage(eliminarTarea.error, 'task')}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarTarea.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={eliminarTarea.isPending}
              onClick={(event) => {
                event.preventDefault();
                confirmarEliminar();
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {eliminarTarea.isPending ? 'Eliminando...' : 'Eliminar tarea'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* F10 — Cerrar tramo (Kanban normal): reutiliza el mismo componente que F9. */}
      {tarea.asignacionActiva && (
        <CloseAssignmentForm
          open={cerrarTramoAbierto}
          onOpenChange={setCerrarTramoAbierto}
          idProyecto={idProyecto}
          idTarea={tarea.idTarea}
          idAsignacion={tarea.asignacionActiva.idAsignacion}
          tituloTarea={tarea.tituloTarea}
        />
      )}

      {/* Gestor de etiquetas (solo líder), abierto desde el formulario de edición */}
      {isLeader && (
        <ProjectLabelsDrawer
          open={etiquetasAbierto}
          onOpenChange={setEtiquetasAbierto}
          labels={labels}
          isLoading={labelsLoading}
          isError={labelsError}
          onRetry={() => refetchLabels()}
          createLabel={createLabel}
          updateLabel={updateLabel}
          deleteLabel={deleteLabel}
        />
      )}
    </div>
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────
export default function TaskDetailClient({ idProyecto, idTarea }: Props) {
  const idsValidos =
    Number.isInteger(idProyecto) && idProyecto > 0 && Number.isInteger(idTarea) && idTarea > 0;
  const idProyectoSeguro = idsValidos ? idProyecto : 0;

  const {
    data: proyecto,
    isLoading: proyectoLoading,
    isError: proyectoError,
    refetch: refetchProyecto,
  } = useProjectDetail(idProyectoSeguro);
  const {
    tasks,
    isLoading: tasksLoading,
    isError: tasksError,
    refetch: refetchTasks,
  } = useProjectTasks(idProyectoSeguro);

  const tarea = useMemo(
    () => (idsValidos ? tasks.find((t) => t.idTarea === idTarea) ?? null : null),
    [idsValidos, tasks, idTarea],
  );

  const kanbanHref = `/dashboard/projects/${idProyecto}/kanban`;
  const cargando = idsValidos && (proyectoLoading || tasksLoading) && (!tarea || !proyecto);

  if (cargando) {
    return <TaskDetailSkeleton />;
  }

  // Error de carga (Sección 58): la red falló; se permite reintentar.
  if (idsValidos && (proyectoError || tasksError) && (!proyecto || !tarea)) {
    return (
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-lg font-bold text-on-surface">
            No fue posible cargar la información de la tarea.
          </h1>
          <div className="mt-5 flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchProyecto();
                refetchTasks();
              }}
            >
              Reintentar
            </Button>
            <Button asChild size="sm" className="bg-primary text-on-primary hover:bg-primary/90">
              <Link href={kanbanHref}>Volver al tablero</Link>
            </Button>
          </div>
        </div>
    );
  }

  // Tarea inexistente, eliminada o de otro proyecto (Sección 55-56): la lista de
  // tareas es por proyecto, así que una tarea ajena simplemente no aparece.
  if (!proyecto || !tarea) {
    return (
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-lg font-bold text-on-surface">Tarea no encontrada</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            Esta tarea no existe o ya no está disponible.
          </p>
          <div className="mt-5 flex justify-center">
            <Button asChild size="sm" className="bg-primary text-on-primary hover:bg-primary/90">
              <Link href={kanbanHref}>Volver al tablero</Link>
            </Button>
          </div>
        </div>
    );
  }

  return <TaskDetailView proyecto={proyecto} tarea={tarea} idProyecto={idProyecto} />;
}
