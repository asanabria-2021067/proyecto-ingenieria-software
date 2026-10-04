'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowRightLeft,
  Award,
  CalendarPlus,
  CheckCircle2,
  Clock,
  ClipboardCheck,
  ClipboardList,
  Crown,
  FileSpreadsheet,
  FileText,
  Flag,
  Gavel,
  ListPlus,
  Lock,
  MessageSquareWarning,
  Paperclip,
  Pencil,
  Repeat,
  ScrollText,
  Search,
  Trash2,
  Undo2,
  Upload,
  UserCheck,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { DashboardSearchField, DASHBOARD_FILTER_TRIGGER_CLASS } from '@/components/dashboard/dashboard-search-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useIsProjectLeader } from '@/hooks/use-is-project-leader';
import { useProjectSprints } from '@/hooks/use-project-sprints';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useProjectBitacora } from '@/hooks/use-project-bitacora';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import type { EventoBitacoraDto, TipoEventoBitacoraValor } from '@/lib/types/bitacora';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { ProjectBackLink, ProjectPageHeader, ProjectPageShell } from '@/components/projects/detail/project-page-shell';

const LIMITE_POR_PAGINA = 20;
const DEBOUNCE_BUSQUEDA_MS = 400;

/** Valor de «Todos» en los Select (Radix no admite ''); el filtro guarda ''. */
const TODOS = '__ALL__';
/** Opción resaltada igual que en los filtros de Mis Proyectos. */
const ITEM_CLASS = 'focus:bg-primary focus:text-on-primary';
/** Fechas con la misma caja que el buscador y los selects de la barra. */
const FECHA_CLASS =
  'h-11.5 rounded-lg border border-outline-variant bg-surface-container-lowest px-3.5 text-sm text-on-surface outline-none transition-[border-color,box-shadow] hover:border-outline focus:ring-2 focus:ring-primary';

/** Exhaustivo por diseño: un TipoEventoBitacoraValor nuevo en el backend rompe la compilación en vez de mostrarse en blanco. */
interface EstiloEvento {
  label: string;
  icon: typeof ClipboardList;
}

const EVENTO_STYLE: Record<TipoEventoBitacoraValor, EstiloEvento> = {
  TASK_CREATED: { label: 'Tarea creada', icon: ListPlus },
  TASK_UPDATED: { label: 'Tarea actualizada', icon: Pencil },
  TASK_STATUS_CHANGED: { label: 'Cambio de estado', icon: ArrowRightLeft },
  TASK_ASSIGNED: { label: 'Tarea asignada', icon: UserPlus },
  TASK_REASSIGNED: { label: 'Tarea reasignada', icon: UserPlus },
  TASK_HOURS_LOGGED: { label: 'Horas registradas', icon: Clock },
  SPRINT_STARTED: { label: 'Sprint iniciado', icon: Repeat },

  // ---- Sprint 7 (06 v2 §43) ----
  TIME_RECORD_EDITED: { label: 'Registro de horas editado', icon: Pencil },
  TIME_RECORD_REVOKED: { label: 'Registro de horas revocado', icon: Undo2 },
  ASSIGNMENT_CLOSED: { label: 'Tramo cerrado', icon: CheckCircle2 },
  TASK_HOURS_ADJUSTED: { label: 'Horas ajustadas', icon: Clock },
  TASK_HOURS_ADJUSTMENT_REVERTED: { label: 'Ajuste de horas revertido', icon: Undo2 },
  SPRINT_FINALIZED: { label: 'Sprint en finalización', icon: Flag },
  SPRINT_CLOSED: { label: 'Sprint cerrado', icon: Lock },
  SPRINT_HOURS_CONSOLIDATED: { label: 'Horas del Sprint consolidadas', icon: Clock },
  EXIT_REQUEST_APPROVED: { label: 'Salida aprobada', icon: UserMinus },
  EXIT_REQUEST_REJECTED: { label: 'Salida rechazada', icon: UserMinus },
  LEADERSHIP_APPEAL_CREATED: { label: 'Apelación de liderazgo enviada', icon: Gavel },
  LEADERSHIP_APPEAL_CANCELLED: { label: 'Apelación de liderazgo cancelada', icon: Gavel },
  LEADERSHIP_APPEAL_ACCEPTED: { label: 'Apelación de liderazgo aceptada', icon: Gavel },
  LEADERSHIP_APPEAL_DENIED: { label: 'Apelación de liderazgo denegada', icon: Gavel },
  LEADERSHIP_CHANGED: { label: 'Cambio de liderazgo', icon: Crown },
  PROJECT_CLOSE_REQUESTED: { label: 'Cierre solicitado', icon: ClipboardCheck },
  POSTULATIONS_AUTO_REJECTED: { label: 'Postulaciones rechazadas automáticamente', icon: UserMinus },
  CLOSURE_DRAFT_CREATED: { label: 'Borrador de cierre creado', icon: FileText },
  CLOSURE_AUTOREPORT_GENERATED: { label: 'Informe automático generado', icon: FileText },
  CLOSURE_DOCUMENT_ADDED: { label: 'Documento de cierre adjuntado', icon: Paperclip },
  CLOSURE_DOCUMENT_REMOVED: { label: 'Documento de cierre retirado', icon: Trash2 },
  PROJECT_CLOSE_DOCUMENTS_SUBMITTED: { label: 'Documentación de cierre enviada', icon: Upload },
  PROJECT_CLOSE_REVIEW_APPROVED: { label: 'Cierre aprobado', icon: CheckCircle2 },
  PROJECT_HOURS_CREDITED: { label: 'Horas acreditadas', icon: Award },
  PROJECT_CLOSE_REVIEW_DOC_CORRECTION: { label: 'Corrección documental solicitada', icon: MessageSquareWarning },
  PROJECT_CLOSE_RETURNED_TO_EXECUTION: { label: 'Proyecto devuelto a ejecución', icon: Undo2 },
  CLOSURE_STORAGE_SWEPT: { label: 'Almacenamiento de cierre depurado', icon: Trash2 },
  LEGACY_HOURS_RECONCILED: { label: 'Horas heredadas reconciliadas', icon: Clock },
  PROJECT_EXPORT_CSV_GENERATED: { label: 'Exportación CSV generada', icon: FileSpreadsheet },
  PROJECT_EXPORT_PDF_GENERATED: { label: 'Reporte PDF generado', icon: FileText },
};

/**
 * T-223/T-224 (HU-156): la pastilla de color agrupa por `tipoEntidad` —el
 * campo que el backend ya asigna a cada evento (bitacora-eventos.service.ts)—
 * en vez de mapear cada uno de los ~34 `tipoEvento` a mano. Con solo 5 tonos
 * disponibles (HU-163) y 6 entidades, REVISION_CIERRE y DOCUMENTO_CIERRE
 * comparten tono: siguen siendo distinguibles por su ícono propio, que es la
 * distinción que no depende del color (daltonismo/impresión).
 */
const ENTIDAD_TONE: Record<string, string> = {
  TAREA: 'pill-accent',
  SPRINT: 'pill-success',
  PROYECTO: 'pill-warning',
  APELACION_LIDERAZGO: 'pill-error',
  REVISION_CIERRE: 'pill-neutral',
  DOCUMENTO_CIERRE: 'pill-neutral',
};

const ENTIDAD_LABEL: Record<string, string> = {
  TAREA: 'Tarea',
  SPRINT: 'Sprint',
  PROYECTO: 'Proyecto',
  APELACION_LIDERAZGO: 'Liderazgo',
  REVISION_CIERRE: 'Cierre',
  DOCUMENTO_CIERRE: 'Cierre',
};

/**
 * La bitácora es un registro histórico: puede contener eventos que este
 * cliente todavía no conoce, y uno solo no debe tumbar la página entera.
 * Antes se leía `EVENTO_STYLE[tipo].icon` a pelo y cualquier tipo nuevo del
 * backend lanzaba, dejando la vista en blanco.
 */
function estiloDe(tipoEvento: string): EstiloEvento {
  return EVENTO_STYLE[tipoEvento as TipoEventoBitacoraValor] ?? { label: tipoEvento, icon: ClipboardList };
}

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-GT', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface MiembroResumen {
  idUsuario: number;
  nombre: string;
  apellido: string;
}

function nombreUsuario(idUsuario: number | null | undefined, miembros: MiembroResumen[]): string {
  if (idUsuario === null || idUsuario === undefined) return 'nadie';
  const miembro = miembros.find((m) => m.idUsuario === idUsuario);
  return miembro ? `${miembro.nombre} ${miembro.apellido}` : `Usuario #${idUsuario}`;
}

/**
 * Traduce valorAnterior/valorNuevo (JSON libre escrito por
 * BitacoraEventosService) a una frase legible por tipoEvento — nunca
 * muestra el JSON crudo al usuario final, que es exactamente lo que HU-140
 * pide evitar ("sin depender de logs técnicos").
 */
function describirEvento(evento: EventoBitacoraDto, miembros: MiembroResumen[]): string {
  const nuevo = (evento.valorNuevo ?? {}) as Record<string, unknown>;
  const anterior = (evento.valorAnterior ?? {}) as Record<string, unknown>;

  switch (evento.tipoEvento) {
    case 'TASK_CREATED':
      return `"${nuevo.tituloTarea ?? ''}"`;
    case 'TASK_UPDATED': {
      const campos = Object.keys(nuevo);
      return campos.length > 0 ? `Campos modificados: ${campos.join(', ')}` : 'Sin cambios detectados';
    }
    case 'TASK_STATUS_CHANGED':
      return `${anterior.estadoTarea ?? '—'} → ${nuevo.estadoTarea ?? '—'}`;
    case 'TASK_ASSIGNED':
      return `Asignada a ${nombreUsuario(nuevo.idUsuario as number | null, miembros)}`;
    case 'TASK_REASSIGNED':
      return `De ${nombreUsuario(anterior.idUsuario as number | null, miembros)} a ${nombreUsuario(
        nuevo.idUsuario as number | null,
        miembros,
      )}`;
    case 'TASK_HOURS_LOGGED':
      return `${nuevo.horasReales ?? 0} horas registradas`;
    case 'SPRINT_STARTED':
      return `Sprint #${nuevo.numero ?? evento.idEntidad} iniciado`;
    default:
      return '';
  }
}

function BitacoraItemSkeleton() {
  return <Skeleton className="h-24 w-full rounded-card" />;
}

/**
 * T-223 (HU-156): tamaño de texto e interlineado subidos con los tokens de
 * HU-163 (`type-subtitle`/`type-body`/`type-meta`), no con tamaños sueltos —
 * fecha y autor bajan a color secundario/tamaño de metadato para no competir
 * con el evento.
 */
function BitacoraItem({ evento, miembros }: { evento: EventoBitacoraDto; miembros: MiembroResumen[] }) {
  const estilo = estiloDe(evento.tipoEvento);
  const Icon = estilo.icon;
  const actor = evento.actor ? `${evento.actor.nombre} ${evento.actor.apellido}` : 'Alguien';
  const tono = ENTIDAD_TONE[evento.tipoEntidad] ?? 'pill-neutral';
  const categoria = ENTIDAD_LABEL[evento.tipoEntidad] ?? evento.tipoEntidad;

  return (
    <div className="flex gap-inline rounded-card border border-outline-variant bg-surface-container-lowest p-card shadow-card">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-tight">
          {/* Icono neutro y sin fondo, al par del título (mismo criterio que Mis Horas). */}
          <Icon data-slot="icono-evento" className="size-5 shrink-0 text-text-primary" aria-hidden="true" />
          {/* Pastilla por tipoEntidad: color con texto oscuro sobre fondo
              sólido (nunca texto de color a secas), contraste AA heredado de
              los mismos tonos ya usados para estados de tarea/prioridad. */}
          <span className={`pill ${tono}`}>{categoria}</span>
          <p className="type-subtitle text-text-primary">{estilo.label}</p>
          <time className="type-meta ml-auto shrink-0" dateTime={evento.fechaEvento}>
            {formatearFechaHora(evento.fechaEvento)}
          </time>
        </div>
        <p className="type-body mt-tight text-text-primary">{describirEvento(evento, miembros)}</p>
        <p className="type-meta mt-micro">Por {actor}</p>
      </div>
    </div>
  );
}

export default function BitacoraPage() {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);

  const [page, setPage] = useState(1);
  const [idSprintFiltro, setIdSprintFiltro] = useState<string>('');
  const [idActorFiltro, setIdActorFiltro] = useState<string>('');
  const [tipoEventoFiltro, setTipoEventoFiltro] = useState<string>('');
  const [desdeFiltro, setDesdeFiltro] = useState<string>('');
  const [hastaFiltro, setHastaFiltro] = useState<string>('');
  const [personaInput, setPersonaInput] = useState<string>('');
  const [personaFiltro, setPersonaFiltro] = useState<string>('');

  useEffect(() => {
    const identificador = setTimeout(() => {
      setPersonaFiltro(personaInput.trim());
      setPage(1);
    }, DEBOUNCE_BUSQUEDA_MS);
    return () => clearTimeout(identificador);
  }, [personaInput]);

  const { data: proyecto, isLoading: cargandoProyecto } = useProjectDetail(idProyecto);
  const { data: currentUser, isLoading: cargandoUsuario } = useCurrentUser();
  // Validación de rol vía el usuario identificado por la cookie JWT httpOnly
  // (ver hooks/use-is-project-leader.ts) — misma fuente de verdad que usa
  // ProjectSidebar para decidir si mostrar el enlace "Bitácora".
  const isLeader = useIsProjectLeader(idProyecto);

  const { sprints } = useProjectSprints(idProyecto);
  const { members, isLoading: cargandoMembers } = useProjectMembers(idProyecto);
  // HU-170: un integrante activo también puede leer la bitácora en modo
  // solo lectura — mismo criterio de "esParticipante" que ya usa
  // ProjectSidebar para decidir a quién mostrarle el enlace "Bitácora". El
  // backend (BitacoraConsultaService vía ProjectReadPolicyService) es quien
  // realmente autoriza esto; aquí solo evitamos pedirle al backend lo que
  // ya sabemos que va a rechazar.
  const esParticipante = !!currentUser && members.some((m) => m.idUsuario === currentUser.idUsuario);
  const puedeVerBitacora = isLeader || esParticipante;

  const filtros = {
    idSprint: idSprintFiltro ? Number(idSprintFiltro) : undefined,
    idActor: idActorFiltro ? Number(idActorFiltro) : undefined,
    persona: personaFiltro ? personaFiltro : undefined,
    tipoEvento: tipoEventoFiltro ? (tipoEventoFiltro as TipoEventoBitacoraValor) : undefined,
    desde: desdeFiltro ? desdeFiltro : undefined,
    hasta: hastaFiltro ? hastaFiltro : undefined,
    page,
    limit: LIMITE_POR_PAGINA,
  };
  // `habilitado: puedeVerBitacora` evita disparar la petición mientras no se
  // sabe que el usuario (identificado vía la cookie JWT) es líder o
  // integrante activo — el backend respondería 403 igual, pero no hace
  // falta pedirlo.
  const { eventos, total, totalPages, isLoading, isError, error, refetch } = useProjectBitacora(
    idProyecto,
    filtros,
    puedeVerBitacora,
  );

  const cargando = isLoading || cargandoProyecto || cargandoUsuario;
  const hayFiltrosActivos =
    idSprintFiltro !== '' ||
    idActorFiltro !== '' ||
    personaFiltro !== '' ||
    tipoEventoFiltro !== '' ||
    desdeFiltro !== '' ||
    hastaFiltro !== '';

  function actualizarFiltro(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  function limpiarFiltros() {
    setIdSprintFiltro('');
    setIdActorFiltro('');
    setPersonaInput('');
    setPersonaFiltro('');
    setTipoEventoFiltro('');
    setDesdeFiltro('');
    setHastaFiltro('');
    setPage(1);
  }

  const sprintSeleccionado = sprints.find((sprint) => String(sprint.idSprint) === idSprintFiltro);
  const integranteSeleccionado = members.find((miembro) => String(miembro.idUsuario) === idActorFiltro);

  const chipsActivos: { key: string; label: string; onQuitar: () => void }[] = [];
  if (sprintSeleccionado) {
    chipsActivos.push({
      key: 'sprint',
      label: `Sprint ${sprintSeleccionado.numero}`,
      onQuitar: () => actualizarFiltro(setIdSprintFiltro, ''),
    });
  }
  if (integranteSeleccionado) {
    chipsActivos.push({
      key: 'integrante',
      label: `${integranteSeleccionado.nombre} ${integranteSeleccionado.apellido}`,
      onQuitar: () => actualizarFiltro(setIdActorFiltro, ''),
    });
  }
  if (personaFiltro !== '') {
    chipsActivos.push({
      key: 'persona',
      label: `Buscando "${personaFiltro}"`,
      onQuitar: () => {
        setPersonaInput('');
        setPersonaFiltro('');
        setPage(1);
      },
    });
  }
  if (tipoEventoFiltro !== '') {
    chipsActivos.push({
      key: 'tipoEvento',
      label: EVENTO_STYLE[tipoEventoFiltro as TipoEventoBitacoraValor]?.label ?? tipoEventoFiltro,
      onQuitar: () => actualizarFiltro(setTipoEventoFiltro, ''),
    });
  }
  if (desdeFiltro !== '') {
    chipsActivos.push({
      key: 'desde',
      label: `Desde ${desdeFiltro}`,
      onQuitar: () => actualizarFiltro(setDesdeFiltro, ''),
    });
  }
  if (hastaFiltro !== '') {
    chipsActivos.push({
      key: 'hasta',
      label: `Hasta ${hastaFiltro}`,
      onQuitar: () => actualizarFiltro(setHastaFiltro, ''),
    });
  }

  return (
    <ProjectPageShell>
      {!cargandoProyecto && !cargandoUsuario && !cargandoMembers && !puedeVerBitacora ? (
        <>
          <ProjectBackLink href={`/dashboard/projects/${id}`} label="Volver al proyecto" className="mb-card" />
          <LeaderOnlyNotice description="No puedes acceder a la bitácora de este proyecto." />
        </>
      ) : (
        <>
          <ProjectPageHeader
            back={{ href: `/dashboard/projects/${id}`, label: 'Volver al proyecto' }}
            title="Bitácora"
            description="Registro de quién hizo qué, cuándo y cómo evolucionó el trabajo durante el sprint."
          >
            {/* HU-170/T-268: el integrante necesita saber que está en modo
                solo lectura para no buscar un botón de crear/editar/borrar
                que no existe en esta pantalla. */}
            {!isLeader && (
              <p className="type-meta mt-tight flex items-center gap-1.5 text-tertiary" role="status">
                <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Estás viendo esta bitácora en modo solo lectura: no puedes crear, editar ni borrar entradas.
              </p>
            )}
          </ProjectPageHeader>

          {/* Misma barra que Mis Proyectos: buscador del dashboard que ocupa el
              espacio libre y los selects del sistema con su disparador común.
              Mide el contenedor del proyecto (hay dos sidebars): en fila desde
              48rem y, si no caben todos, los selects bajan a la línea siguiente. */}
          <div data-slot="bitacora-filtros" className="mb-6 flex flex-col gap-4">
            <div className="flex flex-col gap-4 @3xl/project:flex-row @3xl/project:flex-wrap">
              <DashboardSearchField
                containerClassName="flex-1 @3xl/project:min-w-52"
                aria-label="Buscar por persona"
                placeholder="Buscar por persona..."
                value={personaInput}
                onChange={(e) => setPersonaInput(e.target.value)}
              />

              <Select
                value={idSprintFiltro || TODOS}
                onValueChange={(v) => actualizarFiltro(setIdSprintFiltro, v === TODOS ? '' : v)}
              >
                <SelectTrigger
                  aria-label="Filtrar por sprint"
                  className={`w-full @3xl/project:w-44 ${DASHBOARD_FILTER_TRIGGER_CLASS}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-9999">
                  <SelectItem value={TODOS} className={ITEM_CLASS}>Todos los sprints</SelectItem>
                  {sprints.map((sprint) => (
                    <SelectItem key={sprint.idSprint} value={String(sprint.idSprint)} className={ITEM_CLASS}>
                      Sprint {sprint.numero}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={idActorFiltro || TODOS}
                onValueChange={(v) => actualizarFiltro(setIdActorFiltro, v === TODOS ? '' : v)}
              >
                <SelectTrigger
                  aria-label="Filtrar por integrante"
                  className={`w-full @3xl/project:w-52 ${DASHBOARD_FILTER_TRIGGER_CLASS}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-9999">
                  <SelectItem value={TODOS} className={ITEM_CLASS}>Todos los integrantes</SelectItem>
                  {members.map((miembro) => (
                    <SelectItem key={miembro.idUsuario} value={String(miembro.idUsuario)} className={ITEM_CLASS}>
                      {miembro.nombre} {miembro.apellido}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={tipoEventoFiltro || TODOS}
                onValueChange={(v) => actualizarFiltro(setTipoEventoFiltro, v === TODOS ? '' : v)}
              >
                <SelectTrigger
                  aria-label="Filtrar por tipo de evento"
                  className={`w-full @3xl/project:w-40 ${DASHBOARD_FILTER_TRIGGER_CLASS}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-9999">
                  <SelectItem value={TODOS} className={ITEM_CLASS}>Todos los tipos</SelectItem>
                  {(Object.keys(EVENTO_STYLE) as TipoEventoBitacoraValor[]).map((tipo) => (
                    <SelectItem key={tipo} value={tipo} className={ITEM_CLASS}>
                      {EVENTO_STYLE[tipo].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div data-slot="rango-fechas" className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-tight text-sm text-text-secondary">
                Desde
                <input
                  type="date"
                  aria-label="Filtrar desde"
                  value={desdeFiltro}
                  onChange={(e) => actualizarFiltro(setDesdeFiltro, e.target.value)}
                  max={hastaFiltro || undefined}
                  className={FECHA_CLASS}
                />
              </label>

              <label className="flex items-center gap-tight text-sm text-text-secondary">
                Hasta
                <input
                  type="date"
                  aria-label="Filtrar hasta"
                  value={hastaFiltro}
                  onChange={(e) => actualizarFiltro(setHastaFiltro, e.target.value)}
                  min={desdeFiltro || undefined}
                  className={FECHA_CLASS}
                />
              </label>

              {hayFiltrosActivos && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={limpiarFiltros}
                  className="font-medium text-primary"
                >
                  Limpiar todo
                </Button>
              )}
            </div>
          </div>

          {chipsActivos.length > 0 && (
            <div className="-mt-3 mb-6 flex flex-wrap items-center gap-2" aria-label="Filtros aplicados">
              {chipsActivos.map((chip) => (
                <span key={chip.key} className="pill pill-accent inline-flex items-center gap-1 pr-1">
                  {chip.label}
                  <button
                    type="button"
                    aria-label={`Quitar filtro ${chip.label}`}
                    onClick={chip.onQuitar}
                    className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-black/10"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Refleja si se está viendo todo o una parte filtrada — el
              usuario siempre sabe qué alcance tiene la lista de abajo. */}
          {!cargando && !isError && (
            <div className="mb-stack flex items-center gap-tight" aria-live="polite" role="status">
              <span className="pill pill-accent">
                {total} {total === 1 ? 'evento' : 'eventos'}
              </span>
              {hayFiltrosActivos && <span className="type-meta">con filtros aplicados</span>}
            </div>
          )}

          {cargando && (
            <div className="space-y-stack">
              <BitacoraItemSkeleton />
              <BitacoraItemSkeleton />
              <BitacoraItemSkeleton />
            </div>
          )}

          {!cargando && isError && (
            <Empty tone="danger" role="alert">
              <EmptyMedia variant="icon">
                <AlertCircle aria-hidden="true" className="h-7 w-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>
                  {getApiErrorMessage(error, 'general', 'No fue posible cargar la bitácora del proyecto.')}
                </EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
                >
                  Reintentar
                </button>
              </EmptyContent>
            </Empty>
          )}

          {!cargando && !isError && eventos.length === 0 && hayFiltrosActivos && (
            <Empty tone="muted" role="status">
              <EmptyMedia variant="icon">
                <Search aria-hidden="true" className="h-7 w-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Ningún evento coincide con estos filtros.</EmptyTitle>
                <EmptyDescription>
                  Prueba a quitar alguno o usa «Limpiar todo» para ver la bitácora completa.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
                >
                  Limpiar todo
                </button>
              </EmptyContent>
            </Empty>
          )}

          {!cargando && !isError && eventos.length === 0 && !hayFiltrosActivos && (
            <Empty tone="muted" role="status">
              <EmptyMedia variant="icon">
                <ScrollText aria-hidden="true" className="h-7 w-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Todavía no hay eventos registrados.</EmptyTitle>
                <EmptyDescription>
                  Cuando el equipo cree, edite o asigne tareas, cada acción aparecerá aquí.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {!cargando && !isError && eventos.length > 0 && (
            <>
              {/* Región con nombre: separa los eventos del panel de filtros,
                  que ahora repite las mismas etiquetas en su desplegable. */}
              <section aria-label="Eventos de la bitácora" className="space-y-stack">
                {eventos.map((evento) => (
                  <BitacoraItem key={evento.idAuditoria} evento={evento} miembros={members} />
                ))}
              </section>

              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="text-sm text-tertiary">
                    Página {page} de {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </ProjectPageShell>
  );
}
