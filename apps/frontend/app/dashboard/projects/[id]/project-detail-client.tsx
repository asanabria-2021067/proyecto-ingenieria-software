'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { type RolesSheetIntent } from '@/components/projects/project-roles-sheet';
import { ProjectSummarySection } from '@/components/projects/detail/project-summary-section';
import { ExitRequestSection } from '@/components/projects/detail/exit-request-section';
import { ClosureStatusBanner } from '@/components/projects/closure-status-banner';
import { ReadOnlyProjectBanner } from '@/components/projects/read-only-project-banner';
import { ProjectObjectivesSection } from '@/components/projects/detail/project-objectives-section';
import { ProjectRoleManagementSection } from '@/components/projects/detail/project-role-management-section';
import { ProjectDetailsSection } from '@/components/projects/detail/project-details-section';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useProjectRoles } from '@/hooks/use-project-roles';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useCurrentExitRequest } from '@/hooks/use-exit-request';
import { useCloseReadiness, useClosureRevisions } from '@/hooks/use-closure';
import { countPassedChecks, TOTAL_CLOSURE_CHECKS } from '@/components/closure/closure-readiness-panel';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';

interface Props {
  id: number;
}

const MIS_PROYECTOS_HREF = '/dashboard/projects/mine';

// ─── Skeleton de carga ────────────────────────────────────────────────────────
function ProjectDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-6 pb-12">
      <Skeleton className="mb-5 h-4 w-56" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="w-full space-y-5 lg:flex-1">
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <div className="w-full space-y-4 lg:w-80">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// ─── Vista principal ──────────────────────────────────────────────────────────
function ProjectDetailView({ proyecto }: { proyecto: ProyectoDetalleDTO }) {
  const idProyecto = proyecto.idProyecto;
  const { members } = useProjectMembers(idProyecto);
  const { data: currentUser } = useCurrentUser();
  // Duplicado deliberado de isAdminUser(): las pruebas de esta página mockean
  // '@/hooks/use-current-user' devolviendo solo `useCurrentUser`, así que no
  // podemos depender de otro export de ese módulo aquí.
  const isAdmin = (currentUser?.roles ?? []).some((r) => r.toLowerCase() === 'administrador');
  // Liderazgo determinado exclusivamente por Proyecto.creadoPor.
  const isLeader = currentUser?.idUsuario === proyecto.creador.idUsuario;

  // F9 — único punto de entrada en la UI hacia /salida/preparacion.
  const { request: solicitudSalidaAbierta } = useCurrentExitRequest(idProyecto);

  // S7 (VIEW-01): el cierre ya no es una mutation directa. Es un ENLACE a la
  // preparación del cierre (VIEW-13) cuya habilitación decide el backend con
  // `CloseReadinessSummary.canSubmit` (16 blockers). Si el readiness falla,
  // el workspace se renderiza igual y la acción queda deshabilitada.
  const estadoProyecto = proyecto.estadoProyecto;
  const proyectoCerrado = estadoProyecto === 'CERRADO';
  const enSolicitudCierre = estadoProyecto === 'EN_SOLICITUD_CIERRE';
  const mostrarPrepararCierre = isLeader && estadoProyecto === 'EN_PROGRESO';
  const readinessQuery = useCloseReadiness(idProyecto, 'REQUEST', mostrarPrepararCierre);
  const revisionesQuery = useClosureRevisions(idProyecto, 1, isLeader && enSolicitudCierre);
  const ultimaRevision = revisionesQuery.data?.items[0] ?? null;

  const closureAction = mostrarPrepararCierre
    ? (() => {
        const href = `/dashboard/projects/${idProyecto}/cierre`;
        if (readinessQuery.isPending) {
          return { href, enabled: false, reason: 'Comprobando los requisitos del cierre…' };
        }
        if (readinessQuery.isError || !readinessQuery.data) {
          return { href, enabled: false, reason: 'No se pudo comprobar el estado del cierre. Actualiza la página e inténtalo de nuevo.' };
        }
        const readiness = readinessQuery.data;
        if (readiness.canSubmit) {
          return { href, enabled: true, reason: null };
        }
        const faltan = TOTAL_CLOSURE_CHECKS - countPassedChecks(readiness.blockers);
        return {
          href,
          enabled: false,
          reason: `Faltan ${faltan} de ${TOTAL_CLOSURE_CHECKS} ${faltan === 1 ? 'comprobación' : 'comprobaciones'} para preparar el cierre.`,
        };
      })()
    : undefined;

  // Compatibilidad de navegación (Sección 20): URLs antiguas ?tab= → workspace.
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const taskIdParam = searchParams.get('taskId');
  const kanbanBase = `/dashboard/projects/${idProyecto}/kanban`;
  const kanbanHref = useMemo(
    () =>
      taskIdParam && /^\d+$/.test(taskIdParam) ? `${kanbanBase}?taskId=${taskIdParam}` : kanbanBase,
    [kanbanBase, taskIdParam],
  );
  const debeRedirigir = tabParam === 'tablero' || tabParam === 'hitos';
  useEffect(() => {
    if (debeRedirigir) router.replace(kanbanHref);
  }, [debeRedirigir, kanbanHref, router]);

  const esParticipante =
    currentUser != null && members.some((m) => m.idUsuario === currentUser.idUsuario);
  const puedeVerKanban = isLeader || esParticipante;
  // S7: en CERRADO no hay ninguna escritura (roles, fechas, postulaciones).
  const puedeEscribir = isLeader && !proyectoCerrado;

  // Roles enriquecidos (stats + isMine/canLeave): el líder los ve siempre;
  // un participante activo también los necesita para "Mi rol"/"Salir de este
  // rol" en su propia tarjeta (el backend acepta ambos casos — 403 solo si
  // no es líder y no tiene ningún rol activo, caso que `esParticipante` ya
  // descarta aquí).
  const {
    roles: rolesAdmin,
    crearRol,
    editarRol,
    eliminarRol,
    asignarmeRol,
    salirDeRol,
  } = useProjectRoles(idProyecto, { enabled: (isLeader || esParticipante) && !proyectoCerrado });

  const [rolesSheetAbierto, setRolesSheetAbierto] = useState(false);
  const [rolesSheetIntent, setRolesSheetIntent] = useState<RolesSheetIntent>({ kind: 'list' });

  const abrirGestionRoles = () => {
    setRolesSheetIntent({ kind: 'list' });
    setRolesSheetAbierto(true);
  };
  const abrirCrearRol = () => {
    setRolesSheetIntent({ kind: 'create' });
    setRolesSheetAbierto(true);
  };
  const abrirEditarRol = (role: (typeof rolesAdmin)[number]) => {
    setRolesSheetIntent({ kind: 'edit', role });
    setRolesSheetAbierto(true);
  };

  // La sidebar del proyecto es la única navegación hacia esta página; "Editar
  // Roles" no tiene ruta propia (abre este mismo sheet), así que enlaza aquí
  // con ?openRoles=1 y este efecto lo traduce a abrir el sheet.
  const openRolesParam = searchParams.get('openRoles');
  useEffect(() => {
    if (openRolesParam !== '1' || !puedeEscribir) return;
    abrirGestionRoles();
    router.replace(`/dashboard/projects/${idProyecto}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRolesParam, puedeEscribir, idProyecto]);

  // Resumen del equipo (Sección 24), todo derivado de datos reales.
  const participantesConfirmados = new Set(members.map((m) => m.idUsuario)).size;
  const cuposTotales = rolesAdmin.reduce((sum, r) => sum + r.cupos, 0);
  const rolesDisponiblesCount = rolesAdmin.filter((r) => r.cuposDisponibles > 0).length;
  const misRoles = rolesAdmin.filter((r) => r.isMine);

  // Objetivos: texto real, separado por líneas (Sección 16).
  const objetivos = (proyecto.objetivosProyecto ?? '')
    .split('\n')
    .map((s) => s.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);

  if (debeRedirigir) {
    return <ProjectDetailSkeleton />;
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 pb-12 pt-6 md:px-8">
      <ProjectSummarySection
        proyecto={proyecto}
        isLeader={isLeader}
        isAdmin={isAdmin}
        puedeVerKanban={puedeVerKanban}
        closureAction={closureAction}
        readOnly={proyectoCerrado}
      >
        {proyectoCerrado && (
          <ReadOnlyProjectBanner fechaCierre={proyecto.fechaActualizacion} className="mb-5" />
        )}
        {enSolicitudCierre && (
          <ClosureStatusBanner
            idProyecto={idProyecto}
            estadoProyecto={estadoProyecto}
            revision={ultimaRevision}
            isLeader={isLeader}
            className="mb-5"
          />
        )}
        {solicitudSalidaAbierta && !proyectoCerrado && (
          <ExitRequestSection idProyecto={idProyecto} solicitud={solicitudSalidaAbierta} />
        )}
      </ProjectSummarySection>

      {/* La navegación entre secciones del proyecto (Editar Información,
          Revisiones Pasadas, Editar Roles, Miembros, Sprints, Tablero) vive
          ahora únicamente en la sidebar del workspace (ProjectSidebar). */}

      {/* Fila 2: objetivos/roles · detalles/resumen sticky. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch">
        {/* FILA 2 · COL 1 — Objetivos + Roles */}
        <div className="min-w-0 space-y-5">
          <ProjectObjectivesSection objetivos={objetivos} />

          <ProjectRoleManagementSection
            isLeader={puedeEscribir}
            proyecto={proyecto}
            rolesAdmin={rolesAdmin}
            asignarmeRol={asignarmeRol}
            salirDeRol={salirDeRol}
            crearRol={crearRol}
            editarRol={editarRol}
            eliminarRol={eliminarRol}
            abrirCrearRol={abrirCrearRol}
            abrirEditarRol={abrirEditarRol}
            rolesSheetAbierto={rolesSheetAbierto}
            setRolesSheetAbierto={setRolesSheetAbierto}
            rolesSheetIntent={rolesSheetIntent}
          />
        </div>

        <ProjectDetailsSection
          proyecto={proyecto}
          isLeader={puedeEscribir}
          misRoles={misRoles}
          participantesConfirmados={participantesConfirmados}
          rolesDisponiblesCount={rolesDisponiblesCount}
          cuposTotales={cuposTotales}
        />
      </div>
    </div>
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────
export default function ProjectDetailClient({ id }: Props) {
  const { data: proyecto, isLoading, error, refetch } = useProjectDetail(id);

  if (isLoading) {
    return <ProjectDetailSkeleton />;
  }

  if (error || !proyecto) {
    const status = (error as { statusCode?: number } | null)?.statusCode;
    const noEncontrado = status === 404;
    return (
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h2 className="text-lg font-bold text-on-surface">
            {noEncontrado ? 'Proyecto no encontrado' : 'No fue posible cargar la información del proyecto.'}
          </h2>
          <p className="mt-2 text-sm text-on-surface-variant">
            {noEncontrado
              ? 'El proyecto que buscas no existe o ya no está disponible.'
              : 'Ocurrió un problema al cargar el proyecto.'}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            {!noEncontrado && (
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Reintentar
              </Button>
            )}
            <Button asChild size="sm" className="bg-primary text-on-primary hover:bg-primary/90">
              <Link href={MIS_PROYECTOS_HREF}>Volver a Mis Proyectos</Link>
            </Button>
          </div>
        </div>
    );
  }

  return (
      <Suspense fallback={<ProjectDetailSkeleton />}>
        <ProjectDetailView proyecto={proyecto} />
      </Suspense>
  );
}
