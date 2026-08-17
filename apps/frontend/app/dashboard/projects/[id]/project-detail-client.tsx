'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, History, Pencil, Settings2 } from 'lucide-react';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { type RolesSheetIntent } from '@/components/projects/project-roles-sheet';
import { ProjectSummarySection } from '@/components/projects/detail/project-summary-section';
import { ProjectClosureSection } from '@/components/projects/detail/project-closure-section';
import { ProjectObjectivesSection } from '@/components/projects/detail/project-objectives-section';
import { ProjectRoleManagementSection } from '@/components/projects/detail/project-role-management-section';
import { ProjectDetailsSection } from '@/components/projects/detail/project-details-section';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useProjectRoles } from '@/hooks/use-project-roles';
import { useProjectSprints } from '@/hooks/use-project-sprints';
import { useCurrentUser } from '@/hooks/use-current-user';
import { approveProjectClosure, rejectProjectClosure, requestProjectClosure } from '@/lib/services/projects';
import uvgSwal, { swalCustomClass } from '@/lib/swal';
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
const TAB_BASE =
  'relative flex shrink-0 items-center gap-1.5 border-b-2 px-1 pb-2.5 pt-1 text-[13px] font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/30';
const TAB_ACTIVE = `${TAB_BASE} border-primary text-on-surface`;
const TAB_INACTIVE = `${TAB_BASE} border-transparent text-tertiary hover:border-outline-variant hover:text-on-surface`;

function ProjectDetailView({ proyecto }: { proyecto: ProyectoDetalleDTO }) {
  const idProyecto = proyecto.idProyecto;
  const { members } = useProjectMembers(idProyecto);
  const { data: currentUser } = useCurrentUser();
  // Duplicado deliberado de isAdminUser(): las pruebas de esta página mockean
  // '@/hooks/use-current-user' devolviendo solo `useCurrentUser`, así que no
  // podemos depender de otro export de ese módulo aquí.
  const isAdmin = (currentUser?.roles ?? []).some((r) => r.toLowerCase() === 'administrador');
  const queryClient = useQueryClient();
  // Liderazgo determinado exclusivamente por Proyecto.creadoPor.
  const isLeader = currentUser?.idUsuario === proyecto.creador.idUsuario;

  const enSolicitudCierre = proyecto.estadoProyecto === 'EN_SOLICITUD_CIERRE';
  const [resolviendoCierre, setResolviendoCierre] = useState(false);

  // F16 — único disparador de "Solicitar cierre del proyecto" (A11:
  // ProjectsService.requestClose). Solo el líder, y solo cuando el proyecto
  // está EN_PROGRESO: es la única precondición de estado que A11 exige antes
  // de evaluar el Sprint operable, así que fuera de EN_PROGRESO el control ni
  // se muestra (mismo criterio que `enSolicitudCierre &&` para el aviso de
  // aprobación pendiente).
  const mostrarSolicitarCierre = isLeader && proyecto.estadoProyecto === 'EN_PROGRESO';
  const { sprints } = useProjectSprints(idProyecto);
  // A11 (`assertNoOperableSprint`): solo ACTIVO/EN_FINALIZACION bloquean;
  // CERRADO y la ausencia de Sprint nunca bloquean por esta razón. El índice
  // parcial `sprint_operable_unique` garantiza que a lo sumo un Sprint del
  // proyecto está en uno de estos dos estados a la vez.
  const cierreBloqueadoPorSprint = sprints.some(
    (s) => s.estado === 'ACTIVO' || s.estado === 'EN_FINALIZACION',
  );
  const [solicitandoCierre, setSolicitandoCierre] = useState(false);

  const solicitarCierre = async () => {
    const { isConfirmed } = await uvgSwal.fire({
      icon: 'question',
      title: '¿Solicitar cierre del proyecto?',
      text: 'Un administrador deberá aprobar la solicitud para finalizar el proyecto.',
      showCancelButton: true,
      confirmButtonText: 'Sí, solicitar',
      cancelButtonText: 'Cancelar',
    });
    if (!isConfirmed) return;
    setSolicitandoCierre(true);
    try {
      await requestProjectClosure(idProyecto);
      await queryClient.invalidateQueries({ queryKey: ['project', idProyecto] });
      await uvgSwal.fire({
        icon: 'success',
        title: 'Solicitud enviada',
        text: 'Un administrador revisará tu solicitud de cierre.',
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err: unknown) {
      await uvgSwal.fire({
        icon: 'error',
        title: 'No se pudo solicitar el cierre',
        text: err instanceof Error ? err.message : 'Ocurrió un error al solicitar el cierre del proyecto.',
      });
    } finally {
      setSolicitandoCierre(false);
    }
  };

  const resolverCierre = async (accion: 'APROBAR' | 'RECHAZAR') => {
    const { isConfirmed } = await uvgSwal.fire({
      icon: accion === 'APROBAR' ? 'question' : 'warning',
      title: accion === 'APROBAR' ? '¿Aprobar cierre?' : '¿Rechazar cierre?',
      text:
        accion === 'APROBAR'
          ? 'El proyecto será marcado como cerrado.'
          : 'El proyecto volverá al estado En progreso.',
      showCancelButton: true,
      confirmButtonText: accion === 'APROBAR' ? 'Sí, aprobar' : 'Sí, rechazar',
      cancelButtonText: 'Cancelar',
      ...(accion === 'RECHAZAR' && {
        customClass: {
          ...swalCustomClass,
          confirmButton:
            'rounded-xl bg-error px-5 py-2 text-xs font-bold text-on-error hover:bg-error/90 transition-all shadow-md mx-4',
        },
      }),
    });
    if (!isConfirmed) return;
    setResolviendoCierre(true);
    try {
      if (accion === 'APROBAR') {
        await approveProjectClosure(idProyecto);
      } else {
        await rejectProjectClosure(idProyecto);
      }
      await queryClient.invalidateQueries({ queryKey: ['project', idProyecto] });
    } finally {
      setResolviendoCierre(false);
    }
  };

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

  // Roles enriquecidos (stats + isMine/canLeave) solo para el líder.
  const {
    roles: rolesAdmin,
    crearRol,
    editarRol,
    eliminarRol,
    asignarmeRol,
    salirDeRol,
  } = useProjectRoles(idProyecto, { enabled: isLeader });

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
        mostrarSolicitarCierre={mostrarSolicitarCierre}
        solicitandoCierre={solicitandoCierre}
        cierreBloqueadoPorSprint={cierreBloqueadoPorSprint}
        onSolicitarCierre={() => void solicitarCierre()}
      >
        {enSolicitudCierre && (
          <ProjectClosureSection
            proyecto={proyecto}
            isLeader={isLeader}
            isAdmin={isAdmin}
            resolviendoCierre={resolviendoCierre}
            resolverCierre={resolverCierre}
          />
        )}
      </ProjectSummarySection>

      {/* Barra de navegación estilo Jira: "Resumen" es la página actual (siempre
          activa); el resto son los mismos enlaces/acciones de antes, solo con
          apariencia de tab en vez de botones sueltos. */}
      {(isLeader || puedeVerKanban) && (
        <div className="my-5 flex items-center gap-5 overflow-x-auto border-b border-outline-variant/50">
          <span className={TAB_ACTIVE} aria-current="page">
            Resumen
          </span>
          {isLeader && (
            <Link
              href={`/dashboard/projects/mine/${idProyecto}?returnTo=/dashboard/projects/${idProyecto}`}
              className={TAB_INACTIVE}
            >
              <History className="size-3.5" aria-hidden="true" />
              Revisiones previas
            </Link>
          )}
          {isLeader && (
            <Link href={`/dashboard/projects/mine/form?id=${idProyecto}`} className={TAB_INACTIVE}>
              <Pencil className="size-3.5" aria-hidden="true" />
              Editar información
            </Link>
          )}
          {isLeader && (
            <button type="button" onClick={abrirGestionRoles} className={TAB_INACTIVE}>
              <Settings2 className="size-3.5" aria-hidden="true" />
              Editar roles
            </button>
          )}
          <Link href={kanbanBase} className={TAB_INACTIVE}>
            Tablero
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* Fila 2: objetivos/roles · detalles/resumen sticky. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch">
        {/* FILA 2 · COL 1 — Objetivos + Roles */}
        <div className="min-w-0 space-y-5">
          <ProjectObjectivesSection objetivos={objetivos} />

          <ProjectRoleManagementSection
            isLeader={isLeader}
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
          isLeader={isLeader}
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
