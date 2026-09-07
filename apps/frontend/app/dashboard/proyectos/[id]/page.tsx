'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  FolderOpen,
  FolderX,
  GraduationCap,
  History,
  Layers,
  LogOut,
  MapPin,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { Postulacion, Proyecto, MODALIDAD_LABEL, NIVEL_LABEL } from '@/types';
import {
  MODALIDAD_ICON,
  estadoBadgeLabel,
  estadoBadgeStyle,
  formatFechaCorta,
  getIniciales,
  tipoBadgeLabel,
  tipoBadgeStyle,
} from '@/components/projects/available-project-card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import ProjectDetailClient from '@/app/dashboard/projects/[id]/project-detail-client';
import { ExitRequestSection } from '@/components/projects/detail/exit-request-section';
import { LeaveProjectModal } from '@/components/projects/leave-project-modal';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useCurrentExitRequest } from '@/hooks/use-exit-request';
import { useProjectRoles } from '@/hooks/use-project-roles';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReadOnlyProjectBanner } from '@/components/projects/read-only-project-banner';
import { ClosureDocumentViewer, formatearTamano } from '@/components/closure/closure-document-viewer';
import { useHistoricalProject } from '@/hooks/use-historical-project';
import { getApiErrorStatus } from '@/components/projects/api-error';
import uvgSwal from '@/lib/swal';
import type { Rol } from '@/types';
import type { HistoricalProjectView, HistoricalRevision } from '@/lib/services/historical';

const MODALIDAD_BADGE = 'bg-[#EEF1F5] text-[#48515C] dark:bg-surface-container-high dark:text-on-surface-variant';

const ESTADO_POSTULACION_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
};

const ULTIMO_ROL_MSG = 'No puedes abandonar tu último rol desde esta opción.';

const TAB_BASE =
  'relative flex shrink-0 items-center gap-1.5 border-b-2 px-1 pb-2.5 pt-1 text-[13px] font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/30';
const TAB_ACTIVE = `${TAB_BASE} border-primary text-on-surface`;
const TAB_INACTIVE = `${TAB_BASE} border-transparent text-tertiary hover:border-outline-variant hover:text-on-surface`;

function formatCupos(n: number): string {
  return n === 1 ? '1 cupo' : `${n} cupos`;
}

function CardShell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[10px] border border-[#D3DDD3] dark:border-outline-variant bg-white dark:bg-surface-container-lowest shadow-[0_1px_4px_rgba(24,28,32,0.05)] ${className}`}
    >
      {children}
    </div>
  );
}

export default function ProyectoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);

  const { data: proyecto, isLoading, isError, error, refetch } = useQuery<Proyecto>({
    queryKey: ['proyecto', id],
    queryFn: () => apiFetch(`/proyectos/${id}`),
    retry: false,
  });
  const publicStatus = isError ? getApiErrorStatus(error) : undefined;
  const isNotFound = isError && publicStatus === 404;

  // S7 (VIEW-02): un proyecto CERRADO se lee como histórico completo. El GET
  // público sigue limitado a publicado/en progreso, así que el histórico se
  // consulta cuando el detalle dice CERRADO o cuando el público lo rechaza
  // (403/404) y hay que comprobar si existe como histórico. Un proyecto
  // abierto NUNCA monta esta query.
  const historicoHabilitado = proyecto?.estadoProyecto === 'CERRADO' || (isError && (publicStatus === 403 || publicStatus === 404));
  const historicoQuery = useHistoricalProject(projectId, historicoHabilitado);
  const historico = historicoQuery.data ?? null;
  const proyectoCerrado = historico?.resumen.estadoProyecto === 'CERRADO';

  const { data: misPostulaciones = [], isLoading: isLoadingPostulaciones } = useQuery<Postulacion[]>({
    queryKey: ['mis-postulaciones'],
    queryFn: () => apiFetch('/postulaciones/mis-postulaciones'),
  });

  // Única URL para todos: el líder ve aquí mismo el workspace completo
  // (Editar Información/Revisiones/Editar Roles/Miembros/Sprints/Tablero),
  // reutilizando ProjectDetailClient tal cual. Un participante que no es
  // líder conserva ESTA página (mismo layout de "Explorar Proyectos" de
  // siempre) — solo se le añaden pestañas Resumen/Tablero, el banner de
  // salida y el estado real de sus roles; nunca ve los campos exclusivos
  // del líder (Miembros, Sprints, etc.), que solo existen en el workspace.
  const { data: currentUser, isLoading: isLoadingCurrentUser } = useCurrentUser();
  const { members, isLoading: isLoadingMembers } = useProjectMembers(projectId);
  const isLeader = !!currentUser && !!proyecto && currentUser.idUsuario === proyecto.creador.idUsuario;
  const esParticipante =
    !!currentUser && members.some((m) => m.idUsuario === currentUser.idUsuario);
  const resolviendoPertenencia = isLoadingCurrentUser || (!!currentUser && isLoadingMembers);

  // Roles + isMine/canLeave: solo se piden para un participante activo (el
  // backend 403 a un no-líder sin ningún rol activo; `esParticipante` ya
  // descarta ese caso). Para un visitante que no pertenece, `rolesAdmin`
  // queda vacío y cada rol cae en el flujo de postulación de siempre.
  const { roles: rolesAdmin, salirDeRol } = useProjectRoles(projectId, { enabled: esParticipante });
  const { request: solicitudSalidaAbierta } = useCurrentExitRequest(projectId);
  const [modalSalidaAbierto, setModalSalidaAbierto] = useState(false);

  const handleSalirDeRol = async (rol: Rol) => {
    const { isConfirmed } = await uvgSwal.fire({
      icon: 'warning',
      title: `¿Salir del rol "${rol.nombreRol}"?`,
      text: 'Dejarás de participar en este rol. Las tareas de este rol que tengas asignadas quedarán sin asignar; conservarás tus demás roles del proyecto.',
      showCancelButton: true,
      confirmButtonText: 'Sí, salir',
      cancelButtonText: 'Cancelar',
    });
    if (!isConfirmed) return;
    salirDeRol.mutate({ roleId: rol.idRolProyecto });
  };

  const totalRoles = proyecto?.roles.length ?? 0;
  const totalCupos = proyecto?.roles.reduce((sum, r) => sum + r.cupos, 0) ?? 0;
  const organizacion = proyecto?.organizaciones[0]?.organizacion.nombreOrganizacion;
  const objetivos = proyecto?.objetivosProyecto
    ? proyecto.objetivosProyecto.split('\n').map((l) => l.trim()).filter(Boolean)
    : [];
  const ModalidadIcon = proyecto ? (MODALIDAD_ICON[proyecto.modalidadProyecto] ?? MapPin) : MapPin;
  // El aviso de "ya te postulaste" solo tiene sentido para postulaciones aún
  // pendientes: una vez aceptado, el rol pasa a mostrarse como "Mi rol" con
  // su propio botón "Salir de este rol" en la tarjeta correspondiente.
  const misPostulacionesPendientes = proyecto
    ? misPostulaciones.filter(
        (p) => p.rolProyecto.proyecto.idProyecto === proyecto.idProyecto && p.estadoPostulacion === 'PENDIENTE',
      )
    : [];

  if (proyectoCerrado && historico) {
    return (
      <HistoricalProjectPage
        historico={historico}
        proyecto={proyecto ?? null}
        projectId={projectId}
        esParticipante={esParticipante || isLeader}
      />
    );
  }

  if (historicoHabilitado && historicoQuery.isPending) {
    return (
      <div className="mx-auto max-w-[1400px] px-7 pt-6 pb-12">
        <ProyectoDetalleSkeleton />
      </div>
    );
  }

  if (isError && historicoHabilitado && historicoQuery.isError && getApiErrorStatus(historicoQuery.error) === 403) {
    return (
      <div className="mx-auto max-w-[1400px] px-7 pt-6 pb-12">
        <Empty tone="muted" className="surface-enter" role="status">
          <EmptyMedia variant="icon">
            <ShieldAlert aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Este proyecto histórico no está disponible para tu cuenta.</EmptyTitle>
            <EmptyDescription>Solo quienes participaron en el proyecto pueden consultar su histórico.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              href="/dashboard/proyectos"
              className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
            >
              Volver a proyectos
            </Link>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  if (proyecto && !resolviendoPertenencia && isLeader) {
    return <ProjectDetailClient id={projectId} />;
  }

  return (
      <div className="mx-auto max-w-[1400px] px-7 pt-6 pb-12">
        {/* Breadcrumb */}
        <nav aria-label="Ruta de navegación" className="mb-4.5 flex items-center gap-2 text-[13px]">
          <Link
            href="/dashboard/proyectos"
            className="flex items-center gap-1 text-[#626A73] dark:text-tertiary hover:text-primary transition-colors"
          >
            Proyectos disponibles
          </Link>
          {proyecto && (
            <>
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-[#626A73] dark:text-tertiary" />
              <span className="truncate text-on-surface font-medium">{proyecto.tituloProyecto}</span>
            </>
          )}
        </nav>

        {(isLoading || (proyecto && resolviendoPertenencia)) && <ProyectoDetalleSkeleton />}

        {!isLoading && isError && !isNotFound && (
          <Empty tone="danger" className="surface-enter" role="alert">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No fue posible cargar la información del proyecto.</EmptyTitle>
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

        {!isLoading && isNotFound && (
          <Empty tone="muted" className="surface-enter" role="status">
            <EmptyMedia variant="icon">
              <FolderX aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Proyecto no encontrado</EmptyTitle>
              <EmptyDescription>El proyecto que buscas no existe o ya no está disponible.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link
                href="/dashboard/proyectos"
                className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
              >
                Volver a proyectos
              </Link>
            </EmptyContent>
          </Empty>
        )}

        {proyecto && !resolviendoPertenencia && (
          <>
            {/* ── Fila 1: tarjeta principal · Responsable ──────────────── */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
              <CardShell className="p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex h-6.5 items-center rounded-full px-3 text-[12px] font-semibold whitespace-nowrap ${estadoBadgeStyle(proyecto.estadoProyecto)}`}
                  >
                    {estadoBadgeLabel(proyecto.estadoProyecto)}
                  </span>
                  <span
                    className={`inline-flex h-6.5 items-center rounded-full px-3 text-[12px] font-semibold whitespace-nowrap ${tipoBadgeStyle(proyecto.tipoProyecto)}`}
                  >
                    {tipoBadgeLabel(proyecto.tipoProyecto)}
                  </span>
                  <span
                    className={`inline-flex h-6.5 items-center gap-1 rounded-full px-3 text-[12px] font-semibold whitespace-nowrap ${MODALIDAD_BADGE}`}
                  >
                    <ModalidadIcon aria-hidden="true" className="h-3 w-3" />
                    {MODALIDAD_LABEL[proyecto.modalidadProyecto]}
                  </span>
                </div>

                <h1 className="mt-3.5 text-[26px] leading-8 font-bold text-on-surface line-clamp-2">
                  {proyecto.tituloProyecto}
                </h1>

                <p className="mt-2 text-[14px] leading-5.25 text-on-surface-variant line-clamp-3">
                  {proyecto.descripcionProyecto || 'Sin descripción disponible.'}
                </p>

                {proyecto.intereses.length > 0 && (
                  <div className="mt-4.5 flex flex-wrap gap-2">
                    {proyecto.intereses.map(({ interes }) => (
                      <span
                        key={interes.nombreInteres}
                        className="rounded-md bg-[#F0F2F5] dark:bg-surface-container-high px-2.5 py-1.5 text-[11px] font-medium text-[#4D5661] dark:text-on-surface-variant"
                      >
                        {interes.nombreInteres}
                      </span>
                    ))}
                  </div>
                )}
              </CardShell>

              {/* Responsable */}
              <CardShell className="p-5">
                <h2 className="mb-3 text-[14px] font-bold text-[#20262D] dark:text-on-surface">Responsable</h2>
                {proyecto.creador ? (
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#D7F2C3] dark:bg-[#1f3a0a] text-[15px] font-bold text-[#286327] dark:text-[#b8f27a]"
                      aria-hidden="true"
                    >
                      {getIniciales(proyecto.creador.nombre, proyecto.creador.apellido)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-on-surface">
                        {proyecto.creador.nombre} {proyecto.creador.apellido}
                      </p>
                      <p className="text-[12px] text-on-surface-variant">Responsable del proyecto</p>
                      {proyecto.creador.correo && (
                        <p className="truncate text-[12px] text-on-surface-variant">{proyecto.creador.correo}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-on-surface-variant">Responsable no disponible</p>
                )}
              </CardShell>
            </div>

            {/* Barra "Resumen / Solicitud de salida / Tablero": solo para un
                participante activo (el líder ya se fue por ProjectDetailClient
                arriba). Nunca incluye Miembros/Sprints/Editar Roles — esos son
                exclusivos del líder. Misma posición que en el workspace del
                líder: debajo de la fila principal, no antes. */}
            {esParticipante && (
              <div className="my-4.5 flex items-center gap-5 overflow-x-auto border-b border-outline-variant/50">
                <span className={TAB_ACTIVE} aria-current="page">
                  Resumen
                </span>
                {solicitudSalidaAbierta ? (
                  <Link
                    href={`/dashboard/projects/${projectId}/salida/preparacion`}
                    className={TAB_INACTIVE}
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    Solicitud de salida
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => setModalSalidaAbierto(true)}
                    className={TAB_INACTIVE}
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    Solicitud de salida
                  </button>
                )}
                <Link href={`/dashboard/projects/${projectId}/kanban`} className={TAB_INACTIVE}>
                  Tablero
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            )}

            <LeaveProjectModal
              open={modalSalidaAbierto}
              onOpenChange={setModalSalidaAbierto}
              idProyecto={projectId}
            />

          <div className={`grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px] lg:items-start ${esParticipante ? '' : 'mt-5'}`}>
            {/* ── Columna principal ─────────────────────────────────── */}
            <div className="min-w-0 space-y-4">
              {/* Descripción completa + Objetivos */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[58fr_42fr]">
                <CardShell className="p-5">
                  <h2 className="mb-3 text-[15px] font-bold text-[#20262D] dark:text-on-surface">
                    Descripción del proyecto
                  </h2>
                  <p className="whitespace-pre-wrap text-[13px] leading-4.75 text-[#505861] dark:text-on-surface-variant">
                    {proyecto.descripcionProyecto || 'Sin descripción disponible.'}
                  </p>
                </CardShell>

                <CardShell className="p-5">
                  <h2 className="mb-3 text-[15px] font-bold text-[#20262D] dark:text-on-surface">Objetivos</h2>
                  {objetivos.length > 0 ? (
                    <ul className="space-y-2.5">
                      {objetivos.map((objetivo, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2
                            aria-hidden="true"
                            className="mt-0.5 h-4 w-4 shrink-0 text-[#008542]"
                          />
                          <span className="text-[13px] leading-4.5 text-[#424A53] dark:text-on-surface-variant">
                            {objetivo}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] leading-4.5 text-on-surface-variant">
                      No se han registrado objetivos para este proyecto.
                    </p>
                  )}
                </CardShell>
              </div>

              {/* Roles */}
              <div>
                <h2 className="mt-4.5 mb-3 text-[17px] font-bold text-[#20262D] dark:text-on-surface">
                  Roles disponibles ({totalRoles})
                </h2>

                {esParticipante && solicitudSalidaAbierta && (
                  <div className="mb-3.5">
                    <ExitRequestSection idProyecto={projectId} solicitud={solicitudSalidaAbierta} />
                  </div>
                )}

                {!isLoadingPostulaciones && misPostulacionesPendientes.length > 0 && (
                  <CardShell className="mb-3.5 p-4">
                    <p className="text-sm font-semibold text-on-surface">
                      {misPostulacionesPendientes.length === 1
                        ? 'Ya registraste una postulación para este proyecto.'
                        : `Ya registraste ${misPostulacionesPendientes.length} postulaciones para este proyecto.`}
                    </p>
                    <div className="mt-1 space-y-0.5">
                      {misPostulacionesPendientes.map((p) => (
                        <p key={p.idPostulacion} className="text-xs text-on-surface-variant">
                          Rol: {p.rolProyecto.nombreRol} · Estado:{' '}
                          {ESTADO_POSTULACION_LABEL[p.estadoPostulacion] ?? p.estadoPostulacion}
                        </p>
                      ))}
                    </div>
                  </CardShell>
                )}

                {totalRoles === 0 ? (
                  <CardShell className="p-6 text-center">
                    <p className="text-sm text-on-surface-variant">
                      Actualmente este proyecto no tiene roles disponibles.
                    </p>
                  </CardShell>
                ) : (
                  <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                    {proyecto.roles.map((rol) => {
                      const rolAdmin = rolesAdmin.find((r) => r.idRolProyecto === rol.idRolProyecto);
                      const esMiRol = rolAdmin?.isMine ?? false;
                      const puedeSalir = rolAdmin?.canLeave ?? false;
                      const saliendo =
                        salirDeRol.isPending && salirDeRol.variables?.roleId === rol.idRolProyecto;
                      const misPostulacionRol = misPostulaciones.find(
                        (p) =>
                          p.rolProyecto.idRolProyecto === rol.idRolProyecto &&
                          p.estadoPostulacion === 'PENDIENTE',
                      );

                      return (
                      <CardShell key={rol.idRolProyecto} className="flex flex-col p-4.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="min-w-0 flex-1 text-[16px] font-bold leading-5.5 text-[#20262D] dark:text-on-surface line-clamp-2">
                            {rol.nombreRol}
                          </h3>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {esMiRol && (
                              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                                Mi rol
                              </span>
                            )}
                            {rol.cupos > 0 && (
                              <span className="rounded-full bg-[#DCF6AE] dark:bg-[#1f3a0a] px-2.5 py-1 text-[11px] font-semibold text-[#397016] dark:text-[#b8f27a]">
                                Disponible
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="mt-1.5 text-[12px] leading-4.25 text-[#565E67] dark:text-on-surface-variant line-clamp-2">
                          {rol.descripcionRolProyecto || 'Sin descripción disponible.'}
                        </p>

                        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] text-on-surface-variant">
                          {rol.carreraRequerida && (
                            <span className="flex items-center gap-1.5 min-w-0">
                              <GraduationCap aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{rol.carreraRequerida.nombreCarrera}</span>
                            </span>
                          )}
                          {rol.horasSemanalesEstimadas != null && (
                            <span className="flex items-center gap-1.5">
                              <Clock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                              {rol.horasSemanalesEstimadas} h/semana
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <Users aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                            {formatCupos(rol.cupos)}
                          </span>
                        </div>

                        {rol.requisitos.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {rol.requisitos.map((req) => (
                              <span
                                key={req.habilidad.nombreHabilidad}
                                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                                  req.obligatorio
                                    ? 'bg-primary-container text-on-primary-container'
                                    : 'bg-surface-container-high text-on-surface-variant'
                                }`}
                              >
                                {req.habilidad.nombreHabilidad} · {NIVEL_LABEL[req.nivelMinimo]}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mt-4 pt-3 border-t border-outline-variant/40">
                          {esMiRol ? (
                            puedeSalir ? (
                              <button
                                type="button"
                                onClick={() => handleSalirDeRol(rol)}
                                disabled={saliendo}
                                aria-label={`Salir del rol ${rol.nombreRol}`}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-error px-4 text-[12px] font-semibold text-white transition-colors hover:bg-error/90 disabled:opacity-60"
                              >
                                {saliendo ? 'Saliendo…' : 'Salir de este rol'}
                              </button>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span tabIndex={0} aria-label={ULTIMO_ROL_MSG} className="inline-block">
                                    <button
                                      type="button"
                                      disabled
                                      className="pointer-events-none inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-outline-variant px-4 text-[12px] font-semibold text-tertiary"
                                    >
                                      Salir de este rol
                                    </button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{ULTIMO_ROL_MSG}</TooltipContent>
                              </Tooltip>
                            )
                          ) : misPostulacionRol ? (
                            <Link
                              href="/dashboard/mis-postulaciones"
                              aria-label={`Ver mi postulación para el rol ${rol.nombreRol}`}
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-outline-variant bg-white dark:bg-surface-container-lowest px-4 text-[12px] font-semibold text-on-surface transition-colors hover:bg-surface-container"
                            >
                              Ver mi postulación
                            </Link>
                          ) : (
                            <Link
                              href={`/dashboard/proyectos/${projectId}/postular/${rol.idRolProyecto}`}
                              aria-label={`Postularme al rol ${rol.nombreRol}`}
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#006735] px-4 text-[12px] font-semibold text-white transition-colors hover:bg-[#00582D]"
                            >
                              Postularme a este rol
                              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                            </Link>
                          )}
                        </div>
                      </CardShell>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── Columna lateral ───────────────────────────────────── */}
            <div className="space-y-4 lg:sticky lg:top-25">
              {/* Detalles del proyecto */}
              <CardShell className="p-5">
                <h2 className="mb-3 text-[14px] font-bold text-[#20262D] dark:text-on-surface">
                  Detalles del proyecto
                </h2>
                <ul className="space-y-2.5">
                  {proyecto.fechaInicio && (
                    <DetalleRow icon={Calendar} label="Fecha de inicio" value={formatFechaCorta(proyecto.fechaInicio)} />
                  )}
                  {proyecto.fechaFinEstimada && (
                    <DetalleRow
                      icon={CalendarCheck}
                      label="Fecha final estimada"
                      value={formatFechaCorta(proyecto.fechaFinEstimada)}
                    />
                  )}
                  <DetalleRow
                    icon={(() => MODALIDAD_ICON[proyecto.modalidadProyecto] ?? MapPin)()}
                    label="Modalidad"
                    value={MODALIDAD_LABEL[proyecto.modalidadProyecto]}
                  />
                  {organizacion && <DetalleRow icon={Building2} label="Organización" value={organizacion} />}
                </ul>
              </CardShell>

              {/* Resumen de oportunidades */}
              <CardShell className="p-5">
                <h2 className="mb-3 text-[14px] font-bold text-[#20262D] dark:text-on-surface">
                  Resumen de oportunidades
                </h2>
                <ul className="space-y-2.5">
                  <DetalleRow icon={FolderOpen} label="Roles" value={totalRoles === 1 ? '1 rol' : `${totalRoles} roles`} />
                  <DetalleRow icon={Users} label="Cupos totales" value={formatCupos(totalCupos)} />
                </ul>
              </CardShell>
            </div>
          </div>
          </>
        )}
      </div>
  );
}

function DetalleRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 text-[12px]">
      <span className="flex items-center gap-2 text-on-surface-variant">
        <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
        {label}
      </span>
      <span className="truncate text-right font-medium text-on-surface">{value}</span>
    </li>
  );
}

function ProyectoDetalleSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="rounded-[10px] border border-outline-variant/40 bg-surface-container-lowest p-6">
          <div className="flex gap-2">
            <Skeleton className="h-6.5 w-20 rounded-full" />
            <Skeleton className="h-6.5 w-20 rounded-full" />
            <Skeleton className="h-6.5 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-4 h-7 w-3/4" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[58fr_42fr]">
          <Skeleton className="h-40 rounded-[10px]" />
          <Skeleton className="h-40 rounded-[10px]" />
        </div>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-[10px]" />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-[10px]" />
        ))}
      </div>
    </div>
  );
}

// ─── S7 · VIEW-02 — vista histórica de un proyecto CERRADO ───────────────────

const ESTADO_REVISION_LABEL: Record<string, { label: string; className: string }> = {
  APROBADA: { label: 'Aprobado', className: 'bg-primary/10 text-primary' },
  DEVUELTA_A_EJECUCION: { label: 'Devuelta a ejecución', className: 'bg-error/10 text-error' },
  CORRECCION_DOCUMENTAL: { label: 'Corrección documental', className: 'bg-amber-400/15 text-amber-800 dark:text-amber-200' },
  ENVIADA: { label: 'Enviada', className: 'bg-surface-container-high text-on-surface-variant' },
  BORRADOR: { label: 'Borrador', className: 'bg-surface-container-high text-on-surface-variant' },
};

/** Los importes llegan como string decimal: se formatean, nunca se operan en punto flotante. */
function formatearDecimal(value: string | null | undefined): string {
  if (value == null) return '—';
  const [entera, decimal = ''] = value.split('.');
  const dec = decimal.replace(/0+$/, '');
  return dec.length > 0 ? `${entera}.${dec}` : entera;
}

/** Promedio en centésimas enteras (sin coma flotante) para una métrica derivada de presentación. */
function promedioDecimal(total: string, divisor: number): string {
  if (divisor <= 0) return '0';
  const cent = Math.round(Number(total) * 100);
  const prom = Math.round(cent / divisor);
  return formatearDecimal(`${Math.floor(prom / 100)}.${String(prom % 100).padStart(2, '0')}`);
}

function formatearFechaLarga(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' });
}

function HistoricalKpi({ label, value, unidad }: { label: string; value: string; unidad: string }) {
  return (
    <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low p-3" role="group" aria-label={label}>
      <p className="text-[11px] text-tertiary">{label}</p>
      <p className="mt-1 text-2xl font-bold text-on-surface">
        {value} <span className="text-xs font-normal text-on-surface-variant">{unidad}</span>
      </p>
    </div>
  );
}

function HistoricalProjectPage({
  historico,
  proyecto,
  projectId,
  esParticipante,
}: {
  historico: HistoricalProjectView;
  proyecto: Proyecto | null;
  projectId: number;
  esParticipante: boolean;
}) {
  const [visorAbierto, setVisorAbierto] = useState(false);
  const { resumen, liderazgo, miembrosHistoricos, sprintsCerrados, totales, revisiones, informeOficial } = historico;

  const revisionAprobada: HistoricalRevision | null = useMemo(
    () => [...revisiones].reverse().find((r) => r.estadoRevision === 'APROBADA') ?? null,
    [revisiones],
  );
  const fechaCierre = revisionAprobada?.resueltaEn ?? null;
  const miembrosDistintos = new Set(miembrosHistoricos.map((m) => m.usuario.idUsuario)).size;
  const periodo = [formatFechaCorta(resumen.fechaInicio ?? ''), resumen.fechaFinEstimada ? formatFechaCorta(resumen.fechaFinEstimada) : null]
    .filter(Boolean)
    .join(' – ');
  const objetivos = proyecto?.objetivosProyecto
    ? proyecto.objetivosProyecto.split('\n').map((l) => l.trim()).filter(Boolean)
    : [];

  return (
    <div className="mx-auto max-w-[1400px] px-7 pt-6 pb-12">
      <nav aria-label="Ruta de navegación" className="mb-4.5 flex items-center gap-2 text-[13px]">
        <Link href="/dashboard/projects/mine" className="flex items-center gap-1 text-[#626A73] dark:text-tertiary hover:text-primary transition-colors">
          Mis proyectos
        </Link>
        <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-[#626A73] dark:text-tertiary" />
        <span className="truncate text-on-surface font-medium">{resumen.tituloProyecto}</span>
      </nav>

      <ReadOnlyProjectBanner
        fechaCierre={fechaCierre}
        actionLabel={informeOficial ? 'Ver informe oficial' : undefined}
        onAction={informeOficial ? () => setVisorAbierto(true) : undefined}
        className="mb-5"
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
        <CardShell className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex h-6.5 items-center rounded-full px-3 text-[12px] font-semibold whitespace-nowrap ${estadoBadgeStyle('CERRADO')}`}>
              {estadoBadgeLabel('CERRADO')}
            </span>
            <span className={`inline-flex h-6.5 items-center rounded-full px-3 text-[12px] font-semibold whitespace-nowrap ${tipoBadgeStyle(resumen.tipoProyecto)}`}>
              {tipoBadgeLabel(resumen.tipoProyecto)}
            </span>
            {proyecto && (
              <span className={`inline-flex h-6.5 items-center rounded-full px-3 text-[12px] font-semibold whitespace-nowrap ${MODALIDAD_BADGE}`}>
                {MODALIDAD_LABEL[proyecto.modalidadProyecto]}
              </span>
            )}
          </div>
          <h1 className="mt-3.5 text-[26px] leading-8 font-bold text-on-surface line-clamp-2">{resumen.tituloProyecto}</h1>
          <p className="mt-2 text-[14px] leading-5.25 text-on-surface-variant">
            {resumen.descripcionProyecto || 'Sin descripción disponible.'}
          </p>
          <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-outline-variant/40 pt-4 text-[13px] sm:grid-cols-3">
            <div className="flex items-start gap-2">
              <Calendar className="mt-0.5 size-4 shrink-0 text-tertiary" aria-hidden="true" />
              <div>
                <dt className="text-[11px] text-tertiary">Fecha de cierre</dt>
                <dd className="font-semibold text-on-surface">{formatearFechaLarga(fechaCierre) ?? '—'}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 size-4 shrink-0 text-tertiary" aria-hidden="true" />
              <div>
                <dt className="text-[11px] text-tertiary">Periodo de ejecución</dt>
                <dd className="font-semibold text-on-surface">{periodo || '—'}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Users className="mt-0.5 size-4 shrink-0 text-tertiary" aria-hidden="true" />
              <div>
                <dt className="text-[11px] text-tertiary">Cerrado por</dt>
                <dd className="font-semibold text-on-surface">
                  {liderazgo.liderActual.nombre} {liderazgo.liderActual.apellido}
                </dd>
              </div>
            </div>
          </dl>
        </CardShell>

        <CardShell className="p-5">
          <h2 className="mb-3 text-[12px] font-black uppercase tracking-widest text-tertiary">Responsable del proyecto</h2>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[15px] font-bold text-primary" aria-hidden="true">
              {getIniciales(liderazgo.liderActual.nombre, liderazgo.liderActual.apellido)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-on-surface">
                {liderazgo.liderActual.nombre} {liderazgo.liderActual.apellido}
              </p>
              {proyecto?.creador.correo && <p className="truncate text-[12px] text-on-surface-variant">{proyecto.creador.correo}</p>}
            </div>
          </div>
        </CardShell>
      </div>

      <Tabs defaultValue="historico" className="mt-5">
        <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-none border-b border-outline-variant/50 bg-transparent p-0">
          <TabsTrigger value="resumen" className="rounded-none border-b-2 border-transparent px-2 pb-2.5 pt-1 text-[13px] font-bold data-[state=active]:border-primary data-[state=active]:shadow-none">
            Resumen
          </TabsTrigger>
          {esParticipante && (
            <Link href={`/dashboard/projects/${projectId}/kanban`} className={TAB_INACTIVE}>
              Tablero
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
          <TabsTrigger value="historico" className="rounded-none border-b-2 border-transparent px-2 pb-2.5 pt-1 text-[13px] font-bold data-[state=active]:border-primary data-[state=active]:shadow-none">
            <History className="mr-1.5 size-4" aria-hidden="true" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="mt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[58fr_42fr]">
            <CardShell className="p-5">
              <h2 className="mb-3 text-[15px] font-bold text-[#20262D] dark:text-on-surface">Descripción del proyecto</h2>
              <p className="whitespace-pre-wrap text-[13px] leading-4.75 text-[#505861] dark:text-on-surface-variant">
                {resumen.descripcionProyecto || 'Sin descripción disponible.'}
              </p>
            </CardShell>
            <CardShell className="p-5">
              <h2 className="mb-3 text-[15px] font-bold text-[#20262D] dark:text-on-surface">Objetivos</h2>
              {objetivos.length > 0 ? (
                <ul className="space-y-2.5">
                  {objetivos.map((objetivo, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#008542]" />
                      <span className="text-[13px] leading-4.5 text-[#424A53] dark:text-on-surface-variant">{objetivo}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] leading-4.5 text-on-surface-variant">No hay objetivos disponibles en el histórico.</p>
              )}
            </CardShell>
          </div>
        </TabsContent>

        <TabsContent value="historico" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Miembros históricos */}
            <CardShell className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-on-surface">
                <Users className="size-4 text-primary" aria-hidden="true" />
                Miembros históricos ({miembrosHistoricos.length})
              </h2>
              {miembrosHistoricos.length === 0 ? (
                <Empty tone="muted" className="py-6"><EmptyHeader><EmptyTitle className="text-sm">Sin miembros registrados.</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <ul className="divide-y divide-outline-variant/30" aria-label="Miembros históricos">
                  {miembrosHistoricos.map((m) => (
                    <li key={m.idParticipacion} className="flex items-center gap-3 py-2 text-[13px]">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary" aria-hidden="true">
                        {getIniciales(m.usuario.nombre, m.usuario.apellido)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-on-surface">
                        {m.usuario.nombre} {m.usuario.apellido}
                      </span>
                      <span className="hidden text-on-surface-variant sm:inline">{m.rol.nombreRol}</span>
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                        {m.estadoParticipacion === 'ACTIVO' || m.estadoParticipacion === 'COMPLETADO' ? 'Participó' : m.estadoParticipacion}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardShell>

            {/* Sprints cerrados */}
            <CardShell className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-on-surface">
                <Layers className="size-4 text-primary" aria-hidden="true" />
                Sprints cerrados ({sprintsCerrados.length})
              </h2>
              {sprintsCerrados.length === 0 ? (
                <Empty tone="muted" className="py-6"><EmptyHeader><EmptyTitle className="text-sm">Sin sprints cerrados.</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <ul className="divide-y divide-outline-variant/30" aria-label="Sprints cerrados">
                  {sprintsCerrados.map((sp) => (
                    <li key={sp.idSprint} className="flex flex-wrap items-center gap-3 py-2 text-[13px]">
                      <Link href={`/dashboard/proyectos/${projectId}/sprints/${sp.idSprint}`} className="min-w-0 flex-1 font-medium text-on-surface hover:text-primary hover:underline">
                        Sprint {sp.numero}
                      </Link>
                      <span className="text-on-surface-variant">
                        {formatFechaCorta(sp.fechaInicio)}{sp.fechaCierre ? ` – ${formatFechaCorta(sp.fechaCierre)}` : ''}
                      </span>
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">Completado</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardShell>

            {/* Horas acreditadas */}
            <CardShell className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-on-surface">
                <Clock className="size-4 text-primary" aria-hidden="true" />
                Horas acreditadas
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <HistoricalKpi label="Total de horas" value={formatearDecimal(totales.acreditadas)} unidad="horas" />
                <HistoricalKpi label="Promedio por miembro" value={promedioDecimal(totales.acreditadas, miembrosDistintos)} unidad="horas" />
                <HistoricalKpi label="Tareas distintas" value={String(totales.tareasDistintas)} unidad="tareas" />
              </div>
              {totales.porUsuario.length > 0 && (
                <ul className="mt-3 divide-y divide-outline-variant/30 text-[13px]" aria-label="Horas acreditadas por integrante">
                  {totales.porUsuario.map((u) => (
                    <li key={u.idUsuario} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="truncate text-on-surface">{u.nombre} {u.apellido}</span>
                      <span className="font-semibold text-on-surface">{formatearDecimal(u.acreditadas)} h</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardShell>

            {/* Revisiones de cierre */}
            <CardShell className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-on-surface">
                <FileText className="size-4 text-primary" aria-hidden="true" />
                Revisiones de cierre ({revisiones.length})
              </h2>
              {revisiones.length === 0 ? (
                <Empty tone="muted" className="py-6"><EmptyHeader><EmptyTitle className="text-sm">Sin revisiones de cierre.</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <ul className="divide-y divide-outline-variant/30" aria-label="Revisiones de cierre">
                  {revisiones.map((r) => {
                    const estilo = ESTADO_REVISION_LABEL[r.estadoRevision] ?? { label: r.estadoRevision, className: 'bg-surface-container-high text-on-surface-variant' };
                    return (
                      <li key={r.idRevisionCierre} className="grid grid-cols-1 gap-1 py-2 text-[13px] sm:grid-cols-[auto_auto_auto_1fr] sm:items-center sm:gap-3">
                        <span className="font-medium text-on-surface">Entrega #{r.numeroRevision}</span>
                        <span className="text-on-surface-variant">{formatFechaCorta(r.resueltaEn ?? r.enviadaEn ?? '') || '—'}</span>
                        <span className={`w-fit rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${estilo.className}`}>{estilo.label}</span>
                        <span className="text-on-surface-variant">{r.comentarioRevisor ?? ''}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardShell>
          </div>

          {/* Informe oficial */}
          <CardShell className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-on-surface">
              <FileText className="size-4 text-primary" aria-hidden="true" />
              Informe oficial
            </h2>
            {informeOficial ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-tertiary">Documento</p>
                  <p className="truncate text-[14px] font-semibold text-on-surface">{informeOficial.nombreArchivo}</p>
                  <p className="text-[12px] text-on-surface-variant">
                    PDF{formatearTamano(informeOficial.tamanoBytes) ? ` · ${formatearTamano(informeOficial.tamanoBytes)}` : ''}
                    {formatearFechaLarga(fechaCierre) ? ` · ${formatFechaCorta(fechaCierre as string)}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setVisorAbierto(true)}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-primary/40 px-4 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/5"
                >
                  <FileText className="size-3.5" aria-hidden="true" />
                  Ver informe oficial
                </button>
              </div>
            ) : (
              <p className="text-[13px] text-on-surface-variant">El informe oficial no está disponible.</p>
            )}
          </CardShell>
        </TabsContent>
      </Tabs>

      {informeOficial && (
        <ClosureDocumentViewer
          projectId={projectId}
          documentId={informeOficial.idDocumentoCierre}
          nombre={informeOficial.nombreArchivo}
          tipo="INFORME_OFICIAL_FINAL"
          tamanoBytes={informeOficial.tamanoBytes}
          fecha={fechaCierre}
          open={visorAbierto}
          onOpenChange={setVisorAbierto}
        />
      )}
    </div>
  );
}
