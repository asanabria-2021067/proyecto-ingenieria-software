'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  MessageCircle,
  Minus,
  UserRound,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CreateMilestoneDialog } from '@/components/projects/create-milestone-dialog';
import {
  ESTADO_COLUMNA_STYLE,
  ESTADO_LABEL,
  FILTRO_SIN_HITO,
  FILTRO_SIN_ROL,
  FILTRO_TODOS,
  PRIORIDAD_COLOR,
  PRIORIDAD_ICON,
  PRIORIDAD_LABEL,
  coincideFiltroRol,
  estaVencida,
  formatearFechaLimite,
  getProgressVisualState,
  ordenarTareas,
} from '@/components/projects/task-board.utils';
import type { MiembroProyecto } from '@/hooks/use-project-members';
import type { useProjectTasks } from '@/hooks/use-project-tasks';
import type { useProjectMilestones } from '@/hooks/use-project-milestones';
import type { HitoDTO as Hito } from '@/lib/dto/project.dto';
import type { LabelDTO } from '@/lib/services/labels';
import type { EstadoTarea, TareaPublicaDTO } from '@/lib/types/tasks';

type ProjectTasksHook = ReturnType<typeof useProjectTasks>;
type MilestonesHook = ReturnType<typeof useProjectMilestones>;

/** Sección enfocada al abrir la vista dedicada de la tarea. */
type DetalleTab = 'detalles' | 'comentarios';

interface HitosSectionProps {
  hitos: Hito[];
  tareas: TareaPublicaDTO[];
  idProyecto: number;
  filtroRol?: string;
  filtroHito?: string;
  onLimpiarFiltros?: () => void;
  onVerTodasLasTareas?: (idHito: number) => void;
  isLeader?: boolean;
  currentUserId?: number | null;
  cambiarEstadoTarea?: ProjectTasksHook['cambiarEstadoTarea'];
  eliminarTarea?: ProjectTasksHook['eliminarTarea'];
  crearTarea?: ProjectTasksHook['crearTarea'];
  editarTarea?: ProjectTasksHook['editarTarea'];
  asignarTarea?: ProjectTasksHook['asignarTarea'];
  desasignarTarea?: ProjectTasksHook['desasignarTarea'];
  roles?: { idRolProyecto: number; nombreRol: string }[];
  milestones?: { idHito: number; tituloHito: string }[];
  members?: MiembroProyecto[];
  labels?: LabelDTO[];
  /**
   * T-186 (HU-147): líder o participante activo — habilita la selección
   * múltiple y el botón "Crear hito y asignar" en «Tareas sin hito». Sin
   * esto (o sin `crearHito`), esa sección queda solo de lectura, igual que
   * antes de T-186.
   */
  puedeCrear?: boolean;
  crearHito?: MilestonesHook['crearHito'];
}

interface HitoStats {
  total: number;
  completadas: number;
  porcentaje: number;
  estado: 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADO';
}

const MAX_TAREAS_VISIBLES = 5;

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function calcularStats(tareas: TareaPublicaDTO[]): HitoStats {
  const total = tareas.length;
  const completadas = tareas.filter((t) => t.estadoTarea === 'HECHO').length;
  const porcentaje = total === 0 ? 0 : Math.round((completadas / total) * 100);
  return {
    total,
    completadas,
    porcentaje,
    estado: porcentaje === 100 && total > 0 ? 'COMPLETADO' : porcentaje > 0 ? 'EN_PROGRESO' : 'PENDIENTE',
  };
}

function estadoHitoConfig(estado: HitoStats['estado']) {
  if (estado === 'COMPLETADO') {
    return {
      label: 'Completado',
      className: 'bg-[#E2F1DD] text-[#286327] dark:bg-green-500/10 dark:text-green-300',
      icon: CheckCircle2,
      dot: 'bg-[#3E9B3A]',
    };
  }
  if (estado === 'EN_PROGRESO') {
    return {
      label: 'En progreso',
      className: 'bg-[#FFF1CC] text-[#8A6300] dark:bg-amber-500/10 dark:text-amber-300',
      icon: Circle,
      dot: 'bg-[#D9A400]',
    };
  }
  return {
    label: 'Pendiente',
    className: 'bg-[#E9EDF1] text-[#59616C] dark:bg-white/5 dark:text-slate-300',
    icon: Circle,
    dot: 'bg-[#8A93A0]',
  };
}

function fechaHitoClass(hito: Hito, stats: HitoStats): string {
  if (!hito.fechaLimite || stats.estado === 'COMPLETADO') return 'text-tertiary';
  const vencida = hito.fechaLimite < new Date().toISOString().slice(0, 10);
  if (vencida) return 'font-semibold text-red-600 dark:text-red-400';
  return 'text-tertiary';
}

function statusIcon(estado: EstadoTarea) {
  if (estado === 'HECHO') {
    return (
      <span
        aria-label="Hecho"
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary"
      >
        <Check className="size-3" aria-hidden="true" />
      </span>
    );
  }
  const estilo = ESTADO_COLUMNA_STYLE[estado];
  return (
    <span
      aria-label={ESTADO_LABEL[estado]}
      className={`inline-block size-2.5 shrink-0 rounded-full ${estilo.dot}`}
    />
  );
}

function CompactTaskRow({
  tarea,
  showDate = false,
  onOpen,
  onOpenComments,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  tarea: TareaPublicaDTO;
  showDate?: boolean;
  onOpen: (tarea: TareaPublicaDTO, tab: DetalleTab) => void;
  onOpenComments: (tarea: TareaPublicaDTO) => void;
  /** T-186: muestra un checkbox de selección múltiple antes del estado. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (idTarea: number) => void;
}) {
  const PrioridadIcon = PRIORIDAD_ICON[tarea.prioridad] ?? Minus;
  const asignado = tarea.asignacionActiva?.usuario ?? null;
  const vencida = estaVencida(tarea);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpen(tarea, 'detalles');
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(tarea, 'detalles')}
      onKeyDown={handleKeyDown}
      aria-label={`Abrir detalles de ${tarea.tituloTarea}`}
      className={`group grid min-h-11 cursor-pointer items-center gap-2 border-b border-outline-variant/25 px-1 py-1.5 text-left outline-none transition-colors last:border-b-0 hover:bg-surface-container-low focus-visible:ring-2 focus-visible:ring-primary/30 ${
        selectable
          ? 'grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] sm:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto]'
          : 'grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]'
      }`}
    >
      {selectable && (
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect?.(tarea.idTarea)}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Seleccionar ${tarea.tituloTarea}`}
          className="border-outline-variant data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-on-primary focus-visible:border-primary focus-visible:ring-primary/40"
        />
      )}
      {statusIcon(tarea.estadoTarea)}
      <div className="min-w-0">
        <p
          title={tarea.tituloTarea}
          className={`truncate text-[12px] font-semibold ${tarea.estadoTarea === 'HECHO' ? 'text-on-surface-variant' : 'text-on-surface'}`}
        >
          {tarea.tituloTarea}
        </p>
        <div className="mt-0.5 flex items-center gap-2 sm:hidden">
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${PRIORIDAD_COLOR[tarea.prioridad]}`}>
            <PrioridadIcon className="size-3" aria-hidden="true" />
            {PRIORIDAD_LABEL[tarea.prioridad]}
          </span>
        </div>
      </div>

      <span className={`hidden items-center gap-1 text-[11px] font-semibold sm:inline-flex ${PRIORIDAD_COLOR[tarea.prioridad]}`}>
        <PrioridadIcon className="size-3" aria-hidden="true" />
        {PRIORIDAD_LABEL[tarea.prioridad]}
      </span>

      <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-tertiary">
        {asignado ? (
          <>
            <Avatar className="size-5">
              {asignado.fotoUrl && <AvatarImage src={asignado.fotoUrl} alt="" />}
              <AvatarFallback className="bg-primary/10 text-[9px] font-bold text-primary">
                {getInitials(asignado.nombre, asignado.apellido)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-20 truncate lg:inline" title={`${asignado.nombre} ${asignado.apellido}`}>
              {asignado.nombre}
            </span>
          </>
        ) : (
          <>
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserRound className="size-3" aria-hidden="true" />
            </span>
            <span className="hidden lg:inline">Sin asignar</span>
          </>
        )}
      </span>

      {showDate && (
        <span className={`hidden items-center gap-1 text-[11px] md:inline-flex ${vencida ? 'font-semibold text-red-600 dark:text-red-400' : 'text-tertiary'}`}>
          {vencida && <AlertTriangle className="size-3" aria-label="Vencida" />}
          <Calendar className="size-3" aria-hidden="true" />
          {tarea.fechaLimite ? formatearFechaLimite(tarea.fechaLimite) : 'Sin fecha'}
        </span>
      )}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenComments(tarea);
        }}
        aria-label={`Abrir comentarios de ${tarea.tituloTarea}`}
        className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-[11px] text-tertiary transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <MessageCircle className="size-3.5" aria-hidden="true" />
        {tarea.cantidadComentarios}
      </button>
    </div>
  );
}

function MilestoneProgress({ hito, stats }: { hito: Hito; stats: HitoStats }) {
  const visual = getProgressVisualState(stats.porcentaje);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-tertiary">Progreso</span>
        <span className={`text-xs font-bold ${visual.text}`}>{stats.porcentaje}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={stats.porcentaje}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progreso del hito ${hito.tituloHito}: ${stats.porcentaje} por ciento`}
        className={`h-1.5 overflow-hidden rounded-full ${visual.track}`}
      >
        <div
          className={`h-full rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none ${visual.bar}`}
          style={{ width: `${stats.porcentaje}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-tertiary">
        {stats.completadas} de {stats.total} {stats.total === 1 ? 'tarea completada' : 'tareas completadas'}
      </p>
    </div>
  );
}

function MilestoneCard({
  hito,
  index,
  tareasTotales,
  tareasVisibles,
  onOpenTask,
  onOpenComments,
  onVerTodas,
}: {
  hito: Hito;
  index: number;
  tareasTotales: TareaPublicaDTO[];
  tareasVisibles: TareaPublicaDTO[];
  onOpenTask: (tarea: TareaPublicaDTO, tab: DetalleTab) => void;
  onOpenComments: (tarea: TareaPublicaDTO) => void;
  onVerTodas?: (idHito: number) => void;
}) {
  const stats = calcularStats(tareasTotales);
  const estado = estadoHitoConfig(stats.estado);
  const EstadoIcon = estado.icon;
  const primerasTareas = ordenarTareas(tareasVisibles).slice(0, MAX_TAREAS_VISIBLES);

  return (
    <article
      data-testid={`hito-${hito.idHito}`}
      className="flex min-h-[310px] min-w-0 flex-col rounded-[10px] border border-outline-variant/40 bg-surface-container-lowest p-3.5 shadow-sm"
    >
      <header className="space-y-2">
        <h3 className="flex min-w-0 items-start gap-2 text-sm font-bold leading-snug text-on-surface">
          <span className="shrink-0 text-primary">{index + 1}.</span>
          <span className="line-clamp-2" title={hito.tituloHito}>{hito.tituloHito}</span>
        </h3>
        <span
          aria-label={`Estado del hito: ${estado.label}`}
          className={`inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold ${estado.className}`}
        >
          <span className={`inline-block size-1.5 rounded-full ${estado.dot}`} aria-hidden="true" />
          <EstadoIcon className="size-3" aria-hidden="true" />
          {estado.label}
        </span>
        <p className={`flex items-center gap-1.5 text-[11px] ${fechaHitoClass(hito, stats)}`}>
          <Calendar className="size-3.5" aria-hidden="true" />
          {hito.fechaLimite ? formatearFechaLimite(hito.fechaLimite) : 'Sin fecha definida'}
        </p>
      </header>

      <div className="mt-3">
        <MilestoneProgress hito={hito} stats={stats} />
      </div>

      <div className="my-2.5 h-px bg-outline-variant/30" />

      <div className="min-h-0 flex-1">
        {tareasTotales.length === 0 ? (
          <p className="rounded-md bg-surface-container-low px-3 py-5 text-center text-xs text-tertiary">
            No hay tareas asociadas a este hito.
          </p>
        ) : primerasTareas.length === 0 ? (
          <p className="rounded-md bg-surface-container-low px-3 py-5 text-center text-xs text-tertiary">
            Los filtros actuales no muestran tareas en este hito.
          </p>
        ) : (
          <div>
            {primerasTareas.map((tarea) => (
              <CompactTaskRow
                key={tarea.idTarea}
                tarea={tarea}
                onOpen={onOpenTask}
                onOpenComments={onOpenComments}
              />
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onVerTodas?.(hito.idHito)}
        aria-label={`Ver todas las tareas del hito ${hito.tituloHito}`}
        className="mt-3 min-h-10 border-t border-outline-variant/30 pt-2 text-center text-[12px] font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        Ver todas las tareas ({tareasTotales.length})
      </button>
    </article>
  );
}

function UnassignedMilestoneTasksSection({
  tareas,
  forcedVisible,
  onOpenTask,
  onOpenComments,
  puedeCrear = false,
  crearHito,
}: {
  tareas: TareaPublicaDTO[];
  forcedVisible: boolean;
  onOpenTask: (tarea: TareaPublicaDTO, tab: DetalleTab) => void;
  onOpenComments: (tarea: TareaPublicaDTO) => void;
  /** T-186 (HU-147): habilita selección múltiple + "Crear hito y asignar". */
  puedeCrear?: boolean;
  crearHito?: MilestonesHook['crearHito'];
}) {
  const [expanded, setExpanded] = useState(true);
  const [seleccionadas, setSeleccionadas] = useState<number[]>([]);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  if (tareas.length === 0 && !forcedVisible) return null;

  // T-186: la selección múltiple solo tiene sentido con permiso de crear
  // hitos y con la mutation disponible (el caller la omite si no la tiene).
  const seleccionHabilitada = puedeCrear && crearHito !== undefined;
  const tareasOrdenadas = ordenarTareas(tareas);
  const idsVisibles = tareasOrdenadas.map((t) => t.idTarea);
  const seleccionadasVisibles = seleccionadas.filter((id) => idsVisibles.includes(id));
  const todasSeleccionadas = idsVisibles.length > 0 && seleccionadasVisibles.length === idsVisibles.length;
  const algunaSeleccionada = seleccionadasVisibles.length > 0;

  const alternarSeleccion = (idTarea: number) => {
    setSeleccionadas((actual) =>
      actual.includes(idTarea) ? actual.filter((id) => id !== idTarea) : [...actual, idTarea],
    );
  };

  const alternarSeleccionarTodas = () => {
    setSeleccionadas((actual) =>
      todasSeleccionadas ? actual.filter((id) => !idsVisibles.includes(id)) : [...new Set([...actual, ...idsVisibles])],
    );
  };

  const tareasSeleccionadasResumen = tareasOrdenadas
    .filter((t) => seleccionadasVisibles.includes(t.idTarea))
    .map((t) => ({ idTarea: t.idTarea, tituloTarea: t.tituloTarea }));

  return (
    <section
      data-testid="tareas-sin-hito"
      className="mt-4 rounded-[10px] border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-on-surface">Tareas sin hito</h3>
          <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[11px] font-semibold text-tertiary">
            {tareas.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {seleccionHabilitada && algunaSeleccionada && (
            <Button
              type="button"
              size="sm"
              onClick={() => setDialogoAbierto(true)}
              className="h-8 gap-1.5 rounded-md bg-primary px-2.5 text-[11px] font-bold text-on-primary hover:bg-primary/90"
            >
              Crear hito y asignar ({seleccionadasVisibles.length})
            </Button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? 'Contraer tareas sin hito' : 'Expandir tareas sin hito'}
            className="inline-flex size-9 items-center justify-center rounded-md text-tertiary hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3">
          {tareas.length === 0 ? (
            <p className="rounded-md bg-surface-container-low px-3 py-5 text-center text-xs text-tertiary">
              No hay tareas sin hito que coincidan con los filtros actuales.
            </p>
          ) : (
            <>
              {seleccionHabilitada && (
                <label className="mb-1.5 flex min-h-8 items-center gap-2 px-1 text-[11px] font-semibold text-on-surface-variant">
                  <Checkbox
                    checked={todasSeleccionadas}
                    onCheckedChange={alternarSeleccionarTodas}
                    aria-label="Seleccionar todas las tareas sin hito"
                    className="border-outline-variant data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-on-primary focus-visible:border-primary focus-visible:ring-primary/40"
                  />
                  Seleccionar todas
                </label>
              )}
              {tareasOrdenadas.map((tarea) => (
                <CompactTaskRow
                  key={tarea.idTarea}
                  tarea={tarea}
                  showDate
                  onOpen={onOpenTask}
                  onOpenComments={onOpenComments}
                  selectable={seleccionHabilitada}
                  selected={seleccionadasVisibles.includes(tarea.idTarea)}
                  onToggleSelect={alternarSeleccion}
                />
              ))}
            </>
          )}
        </div>
      )}

      {seleccionHabilitada && crearHito && (
        <CreateMilestoneDialog
          open={dialogoAbierto}
          onOpenChange={setDialogoAbierto}
          crearHito={crearHito}
          tareasSeleccionadas={tareasSeleccionadasResumen}
          onAsignado={() => setSeleccionadas([])}
        />
      )}
    </section>
  );
}

export function HitosSection({
  hitos,
  tareas,
  idProyecto,
  filtroRol = FILTRO_TODOS,
  filtroHito = FILTRO_TODOS,
  onLimpiarFiltros,
  onVerTodasLasTareas,
  puedeCrear = false,
  crearHito,
}: HitosSectionProps) {
  // El detalle de la tarea vive ahora en su propia ruta dedicada (Sección 10):
  // pulsar una tarea o sus comentarios navega hacia ella, no abre un Sheet.
  const router = useRouter();

  const idsHitosCargados = useMemo(() => new Set(hitos.map((h) => h.idHito)), [hitos]);
  const hitosOrdenados = useMemo(
    () => [...hitos].sort((a, b) => a.orden - b.orden || (a.fechaLimite ?? '9999-12-31').localeCompare(b.fechaLimite ?? '9999-12-31') || a.idHito - b.idHito),
    [hitos],
  );

  const tareasPorHito = useMemo(() => {
    return tareas.reduce<Record<number, TareaPublicaDTO[]>>((acc, tarea) => {
      if (tarea.idHito !== null && idsHitosCargados.has(tarea.idHito)) {
        if (!acc[tarea.idHito]) acc[tarea.idHito] = [];
        acc[tarea.idHito].push(tarea);
      }
      return acc;
    }, {});
  }, [idsHitosCargados, tareas]);

  const tareasSinHitoTotales = useMemo(
    () => tareas.filter((t) => t.idHito === null || !idsHitosCargados.has(t.idHito)),
    [idsHitosCargados, tareas],
  );

  const filtroPorHitoSinHito = filtroHito === FILTRO_SIN_HITO;
  const hayFiltrosActivos = filtroRol !== FILTRO_TODOS || filtroHito !== FILTRO_TODOS;
  const tareasSinHitoVisibles = tareasSinHitoTotales.filter((t) => coincideFiltroRol(t, filtroRol));

  const hitosVisibles = hitosOrdenados
    .filter((hito) => filtroHito === FILTRO_TODOS || String(hito.idHito) === filtroHito)
    .map((hito) => {
      const tareasTotales = tareasPorHito[hito.idHito] ?? [];
      const tareasVisibles = tareasTotales.filter((t) => coincideFiltroRol(t, filtroRol));
      return { hito, tareasTotales, tareasVisibles };
    })
    .filter(({ tareasTotales, tareasVisibles }) => {
      if (filtroRol === FILTRO_TODOS) return true;
      return tareasTotales.length === 0 ? false : tareasVisibles.length > 0;
    });

  const abrirDetalle = (tarea: TareaPublicaDTO, tab: DetalleTab) => {
    const base = `/dashboard/projects/${idProyecto}/kanban/tasks/${tarea.idTarea}`;
    router.push(tab === 'comentarios' ? `${base}?section=comments` : base);
  };

  if (hitos.length === 0 && tareasSinHitoTotales.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-outline-variant/50 bg-surface-container-low px-6 py-12 text-center">
        <h2 className="text-base font-bold text-on-surface">Aún no hay hitos registrados</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-on-surface-variant">
          Los hitos permiten organizar las tareas del proyecto por etapas y objetivos.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0">
      {!filtroPorHitoSinHito && hitosVisibles.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {hitosVisibles.map(({ hito, tareasTotales, tareasVisibles }, index) => (
            <MilestoneCard
              key={hito.idHito}
              hito={hito}
              index={index}
              tareasTotales={tareasTotales}
              tareasVisibles={tareasVisibles}
              onOpenTask={abrirDetalle}
              onOpenComments={(tarea) => abrirDetalle(tarea, 'comentarios')}
              onVerTodas={onVerTodasLasTareas}
            />
          ))}
        </div>
      )}

      {!filtroPorHitoSinHito && hitos.length > 0 && hitosVisibles.length === 0 && (
        <div className="rounded-[10px] border border-dashed border-outline-variant/50 bg-surface-container-low px-6 py-10 text-center">
          <h2 className="text-base font-bold text-on-surface">
            No hay hitos con tareas que coincidan con los filtros.
          </h2>
          {onLimpiarFiltros && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onLimpiarFiltros}
              className="mt-4 rounded-md border-primary text-xs font-semibold text-primary hover:bg-primary/10"
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      )}

      {hitos.length === 0 && tareasSinHitoTotales.length > 0 && !filtroPorHitoSinHito && (
        <div className="rounded-[10px] border border-dashed border-outline-variant/50 bg-surface-container-low px-6 py-8 text-center">
          <h2 className="text-base font-bold text-on-surface">Aún no hay hitos registrados</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-on-surface-variant">
            Los hitos permiten organizar las tareas del proyecto por etapas y objetivos.
          </p>
        </div>
      )}

      <UnassignedMilestoneTasksSection
        tareas={tareasSinHitoVisibles}
        forcedVisible={filtroPorHitoSinHito}
        onOpenTask={abrirDetalle}
        onOpenComments={(tarea) => abrirDetalle(tarea, 'comentarios')}
        puedeCrear={puedeCrear}
        crearHito={crearHito}
      />
    </div>
  );
}
