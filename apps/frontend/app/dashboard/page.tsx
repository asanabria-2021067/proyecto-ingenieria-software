'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  GraduationCap,
  HeartHandshake,
  Zap,
  Clock,
  Calendar,
  ClipboardList,
  FolderOpen,
  Award,
  Info,
  NotebookPen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import CompleteProfileDialog from '@/components/profile/CompleteProfileDialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptySteps,
  EmptyTitle,
} from '@/components/ui/empty';
import { useCurrentUser, isProfileIncomplete } from '@/hooks/use-current-user';
import { getDashboardStats, type DashboardStats } from '@/lib/services/users';
import { searchProjects } from '@/lib/services/projects';
import type { ProyectoListItemDTO } from '@/lib/dto/project.dto';
import type { ProyectoResumen, TipoProyecto } from '@/types';
import { apiFetch } from '@/lib/api/client';
import {
  estadoBadgeLabel,
  tipoBadgeLabel,
  tipoBadgeStyle,
} from '@/components/projects/available-project-card';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { useFeedSocial } from '@/hooks/use-social';
import { SocialProjectCard } from '@/components/social/social-project-card';

/**
 * S7 (VIEW-08): las horas llegan como string decimal del backend; se formatean
 * SIN pasar por punto flotante. Devuelve `null` si el bloque no vino o es
 * inválido, para que la card lo muestre como «no disponible» sin romper nada.
 */
export function formatearHorasDashboard(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value)) return null;
  const [entera, decimal = ''] = value.split('.');
  const dec = decimal.replace(/0+$/, '');
  return dec.length > 0 ? `${entera}.${dec}` : entera;
}

function HorasKpiCard({
  id,
  titulo,
  valor,
  ayuda,
  icon: Icon,
}: {
  id: string;
  titulo: string;
  valor: string | null;
  ayuda: string;
  icon: typeof Award;
}) {
  return (
    <div
      id={id}
      role="group"
      aria-label={titulo}
      className="card-base relative flex min-h-40 flex-col justify-between overflow-hidden"
    >
      <div className="relative z-10 flex items-start justify-between gap-tight">
        <span className="type-meta flex items-center gap-tight uppercase tracking-wider">
          {titulo}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`Qué significa: ${titulo}`}
                className="rounded-pill text-text-secondary hover:text-text-primary"
              >
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{ayuda}</TooltipContent>
          </Tooltip>
        </span>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-container-high text-text-secondary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="relative z-10 mt-tight">
        {valor === null ? (
          <span className="type-subtitle block text-text-secondary">
            No disponible por ahora
          </span>
        ) : (
          <div className="flex items-baseline gap-1">
            <span className="type-section text-text-primary">{valor}</span>
            <span className="type-body font-medium text-text-secondary">h</span>
          </div>
        )}
      </div>
      <p className="type-meta relative z-10 mt-stack">{ayuda}</p>
      <div className="absolute -bottom-stack -right-stack text-text-secondary/10">
        <Icon className="h-16 w-16" />
      </div>
    </div>
  );
}

const TIPOS_ACREDITACION: TipoProyecto[] = [
  'ACADEMICO_HORAS_BECA',
  'ACADEMICO_EXPERIENCIA',
  'EXTRACURRICULAR_EXTENSION',
];

const estadoColors: Record<string, string> = {
  PENDIENTE: 'pill-warning',
  ACEPTADA: 'pill-success',
  RECHAZADA: 'pill-error',
};

function DashboardProjectCard({
  project,
}: {
  project: ProyectoListItemDTO | ProyectoResumen;
}) {
  return (
    <article className="card-base group flex min-h-52 flex-col">
      <div className="mb-stack flex items-start justify-between gap-tight">
        <div className="flex flex-wrap items-center gap-tight">
          <span className="pill pill-accent">
            {tipoBadgeLabel(project.tipoProyecto)}
          </span>
          <span className="pill pill-neutral">
            {estadoBadgeLabel(project.estadoProyecto)}
          </span>
        </div>
        <span className="type-meta shrink-0">ID: {project.idProyecto}</span>
      </div>
      <h3 className="type-subtitle mb-tight text-text-primary">
        {project.tituloProyecto}
      </h3>
      <p className="type-body mb-card line-clamp-2 text-text-secondary">
        {project.descripcionProyecto || 'Sin descripción disponible.'}
      </p>
      <div className="mt-auto flex items-center justify-between gap-stack">
        <span className="type-meta flex items-center gap-tight uppercase">
          <Clock className="size-4" aria-hidden="true" />
          {project.modalidadProyecto}
        </span>
        <Button asChild size="sm">
          <Link
            href={`/dashboard/proyectos/${project.idProyecto}`}
            aria-label={`Ver ${project.tituloProyecto}`}
          >
            Ver
          </Link>
        </Button>
      </div>
    </article>
  );
}

function DashboardSkeleton() {
  return (
    <SkeletonTheme
      baseColor="var(--color-surface-container)"
      highlightColor="var(--color-surface-container-high)"
    >
      <div className="mx-auto max-w-content px-stack py-section lg:px-section lg:py-page">
        <section className="mb-section">
          <Skeleton width={150} height={16} className="mb-2" />
          <Skeleton width={300} height={48} />
          <Skeleton width={500} height={20} className="mt-2" />
        </section>

        <div className="mb-section grid grid-cols-1 gap-grid md:grid-cols-3">
          <Skeleton height={192} borderRadius="var(--radius-card)" />
          <Skeleton height={192} borderRadius="var(--radius-card)" />
          <Skeleton height={192} borderRadius="var(--radius-card)" />
        </div>

        <div className="grid grid-cols-1 gap-grid lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Skeleton width={200} height={32} className="mb-section" />
            <div className="grid grid-cols-1 gap-gap md:grid-cols-2">
              <Skeleton height={200} borderRadius="var(--radius-card)" />
              <Skeleton height={200} borderRadius="var(--radius-card)" />
            </div>
          </div>
        </div>
      </div>
    </SkeletonTheme>
  );
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const [wizardDismissed, setWizardDismissed] = useState(false);
  const [projectTab, setProjectTab] = useState<'destacados' | 'disponibles'>(
    'destacados',
  );
  const showWizard = useMemo(
    () => !wizardDismissed && !!user && isProfileIncomplete(user),
    [wizardDismissed, user],
  );

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery<
    ProyectoListItemDTO[]
  >({
    queryKey: ['dashboard-projects'],
    queryFn: async () => {
      const p = await searchProjects('');
      return p.slice(0, 4);
    },
  });

  const { data: featured = [], isLoading: featuredLoading } = useQuery<
    ProyectoResumen[]
  >({
    queryKey: ['dashboard-featured'],
    queryFn: () => apiFetch('/proyectos/destacados'),
  });

  const { proyectosDeAmigos, proyectosDeSeguidos } = useFeedSocial();

  const isLoading =
    userLoading || statsLoading || projectsLoading || featuredLoading;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const horasBeca = stats?.horasBeca ?? 0;
  const horasBecaRequeridas = stats?.horasBecaRequeridas ?? null;
  const horasExtension = stats?.horasExtension ?? 0;
  const horasExtensionRequeridas = stats?.horasExtensionRequeridas ?? null;
  const proyectosActivos = stats?.proyectosActivos ?? 0;
  // VIEW-08: dos métricas SEPARADAS (nunca se suman): significan cosas distintas.
  const horasAbiertas = formatearHorasDashboard(
    stats?.horasRegistradasEnProyectosAbiertos,
  );
  const horasAcreditadas = formatearHorasDashboard(stats?.horasAcreditadas);
  const requiereHorasBeca =
    horasBecaRequeridas !== null && horasBecaRequeridas > 0;
  const requiereHorasExtension =
    horasExtensionRequeridas !== null && horasExtensionRequeridas > 0;
  const progressBeca = requiereHorasBeca
    ? Math.min(
        100,
        Math.round((horasBeca / (horasBecaRequeridas as number)) * 100),
      )
    : 0;
  const progressExtension = requiereHorasExtension
    ? Math.min(
        100,
        Math.round(
          (horasExtension / (horasExtensionRequeridas as number)) * 100,
        ),
      )
    : 0;

  return (
    <>
      <CompleteProfileDialog
        open={showWizard}
        onComplete={async () => {
          setWizardDismissed(true);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['currentUser'] }),
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
            queryClient.invalidateQueries({ queryKey: ['dashboard-projects'] }),
          ]);
        }}
      />

      <div className="mx-auto max-w-content px-stack py-section lg:px-section lg:py-page">
        {/* Welcome */}
        <section className="relative mb-section overflow-hidden rounded-card bg-primary p-card text-on-primary shadow-card">
          <div className="absolute -right-10 -bottom-10 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
          <div className="relative z-10 max-w-prose">
            <span className="pill mb-tight bg-white/15 text-on-primary">
              Bienvenido de vuelta
            </span>
            <h1 className="type-display text-on-primary">
              ¡Hola, {user?.nombre ?? ''}! 👋
            </h1>
            <p className="type-body mt-tight text-on-primary/80">
              Tu progreso académico este semestre. Tienes {projects.length}{' '}
              proyectos disponibles listos para postularte hoy.
            </p>
          </div>
        </section>

        {/* Stats */}
        <div
          id="stats-container"
          className="mb-section grid grid-cols-1 gap-gap md:grid-cols-3"
        >
          {/* Horas Beca */}
          {requiereHorasBeca && (
            <div className="card-base relative flex min-h-40 flex-col justify-between overflow-hidden">
              <div className="relative z-10 flex items-start justify-between gap-tight">
                <span className="type-meta uppercase tracking-wider">
                  Horas Beca Acumuladas
                </span>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary-container/15 text-primary">
                  <GraduationCap className="h-4 w-4" />
                </div>
              </div>
              <div className="relative z-10 mt-tight flex items-baseline gap-tight">
                <span className="type-section text-text-primary">
                  {horasBeca}
                </span>
                <span className="type-body text-text-secondary">
                  / {horasBecaRequeridas}
                </span>
              </div>
              <div className="relative z-10 mt-stack h-2 w-full overflow-hidden rounded-pill bg-surface-container-highest">
                <div
                  className="h-full rounded-pill bg-accent"
                  style={{ width: `${progressBeca}%` }}
                />
              </div>
              <GraduationCap className="absolute -bottom-stack -right-stack h-20 w-20 text-text-secondary/10" />
            </div>
          )}

          {/* Horas Extension */}
          {requiereHorasExtension && (
            <div className="card-base relative flex min-h-40 flex-col justify-between overflow-hidden">
              <div className="relative z-10 flex items-start justify-between gap-tight">
                <span className="type-meta uppercase tracking-wider">
                  Horas de Extension
                </span>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-secondary-container/40 text-secondary">
                  <HeartHandshake className="h-4 w-4" />
                </div>
              </div>
              <div className="relative z-10 mt-tight flex items-baseline gap-tight">
                <span className="type-section text-text-primary">
                  {horasExtension}
                </span>
                <span className="type-body text-text-secondary">
                  / {horasExtensionRequeridas}
                </span>
              </div>
              <div className="relative z-10 mt-stack h-2 w-full overflow-hidden rounded-pill bg-surface-container-highest">
                <div
                  className="h-full rounded-pill bg-accent"
                  style={{ width: `${progressExtension}%` }}
                />
              </div>
              <HeartHandshake className="absolute -bottom-stack -right-stack h-20 w-20 text-text-secondary/10" />
            </div>
          )}

          {/* Proyectos Activos */}
          <div className="card-base relative flex min-h-40 flex-col justify-between overflow-hidden">
            <div className="relative z-10 flex items-start justify-between gap-tight">
              <span className="type-meta uppercase tracking-wider">
                Proyectos Activos
              </span>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-container-high text-text-secondary">
                <Zap className="h-4 w-4" />
              </div>
            </div>
            <div className="relative z-10 mt-tight">
              <span className="type-section text-text-primary">
                {String(proyectosActivos).padStart(2, '0')}
              </span>
            </div>
            <div className="relative z-10 mt-stack flex items-center gap-tight type-meta">
              <Calendar className="h-3.5 w-3.5" />
              <span>En curso actual</span>
            </div>
            <Zap className="absolute -bottom-stack -right-stack h-20 w-20 text-text-secondary/10" />
          </div>

          {/* S7 VIEW-08: horas en proyectos abiertos vs. acreditadas (separadas) */}
          <HorasKpiCard
            id="stats-horas-abiertas"
            titulo="Horas Registradas"
            valor={horasAbiertas}
            ayuda="Horas que registraste en proyectos aún no cerrados. Pueden cambiar hasta que el proyecto se cierre."
            icon={NotebookPen}
          />
          <HorasKpiCard
            id="stats-horas-acreditadas"
            titulo="Horas acreditadas"
            valor={horasAcreditadas}
            ayuda="Horas aprobadas por administración al cerrar tus proyectos. Ya no cambian."
            icon={Award}
          />
        </div>

        {proyectosDeAmigos.length > 0 && (
          <section className="mb-section">
            <h2 className="type-section mb-card">Proyectos de tus amigos</h2>
            <div className="grid grid-cols-1 gap-gap md:grid-cols-3">
              {proyectosDeAmigos.map((p) => (
                <SocialProjectCard key={p.idProyecto} proyecto={p} />
              ))}
            </div>
          </section>
        )}

        {proyectosDeSeguidos.length > 0 && (
          <section className="mb-section">
            <div className="mb-card flex flex-wrap items-center justify-between gap-stack">
              <div className="flex items-center gap-tight">
                <h2 className="type-section">De personas que sigues</h2>
                <span className="pill pill-neutral">Actividad reciente</span>
              </div>
              <Link
                href="/dashboard/personas"
                className="type-body font-medium text-primary hover:underline"
              >
                Ver red
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-gap md:grid-cols-3">
              {proyectosDeSeguidos.map((p) => (
                <SocialProjectCard key={p.idProyecto} proyecto={p} />
              ))}
            </div>
          </section>
        )}

        <div className="layout-grid">
          <div className="layout-main space-y-section">
            {/* Projects: Destacados / Disponibles */}
            <section id="proyectos-catalogo">
              <div className="mb-card flex flex-wrap items-center justify-between gap-stack">
                <div>
                  <h2 className="type-section">Proyectos</h2>
                  <p className="type-body text-text-secondary">
                    Explora convocatorias académicas y de extensión disponibles
                  </p>
                </div>
                <div className="flex items-center gap-tight">
                  <div className="flex items-center gap-tight rounded-pill bg-surface-container p-micro">
                    <button
                      type="button"
                      onClick={() => setProjectTab('destacados')}
                      className={`type-meta flex items-center gap-tight rounded-pill px-inline py-micro font-semibold transition-colors ${
                        projectTab === 'destacados'
                          ? 'bg-primary text-on-primary'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      Destacados
                      <span
                        className={`rounded-pill px-tight text-[10px] font-bold ${
                          projectTab === 'destacados'
                            ? 'bg-white/20'
                            : 'bg-surface-container-high'
                        }`}
                      >
                        {featured.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProjectTab('disponibles')}
                      className={`type-meta flex items-center gap-tight rounded-pill px-inline py-micro font-semibold transition-colors ${
                        projectTab === 'disponibles'
                          ? 'bg-primary text-on-primary'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      Disponibles
                      <span
                        className={`rounded-pill px-tight text-[10px] font-bold ${
                          projectTab === 'disponibles'
                            ? 'bg-white/20'
                            : 'bg-surface-container-high'
                        }`}
                      >
                        {projects.length}
                      </span>
                    </button>
                  </div>
                  <Link
                    href="/dashboard/proyectos"
                    className="type-body font-medium text-primary hover:underline"
                  >
                    Ver todos
                  </Link>
                </div>
              </div>

              {projectTab === 'destacados' ? (
                <div className="grid grid-cols-1 gap-gap md:grid-cols-2">
                  {featured.slice(0, 4).map((p) => (
                    <DashboardProjectCard key={p.idProyecto} project={p} />
                  ))}
                  {featured.length === 0 && (
                    <div className="col-span-2">
                      <Empty
                        tone="muted"
                        className="surface-enter"
                        aria-live="polite"
                      >
                        <EmptyMedia variant="compact">
                          <FolderOpen aria-hidden="true" className="h-6 w-6" />
                        </EmptyMedia>
                        <EmptyHeader>
                          <EmptyTitle className="type-subtitle">
                            No hay proyectos destacados
                          </EmptyTitle>
                          <EmptyDescription>
                            Aun no hay proyectos con suficientes postulaciones
                            para destacar.
                          </EmptyDescription>
                        </EmptyHeader>
                        <EmptySteps />
                      </Empty>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-gap md:grid-cols-2">
                  {projects.map((p) => (
                    <DashboardProjectCard key={p.idProyecto} project={p} />
                  ))}
                  {projects.length === 0 && (
                    <div className="col-span-2">
                      <Empty
                        tone="muted"
                        className="surface-enter"
                        aria-live="polite"
                      >
                        <EmptyMedia variant="compact">
                          <FolderOpen aria-hidden="true" className="h-6 w-6" />
                        </EmptyMedia>
                        <EmptyHeader>
                          <EmptyTitle className="type-subtitle">
                            No hay proyectos disponibles
                          </EmptyTitle>
                          <EmptyDescription>
                            Cuando se publiquen nuevas oportunidades, apareceran
                            aqui para que puedas revisarlas rapido.
                          </EmptyDescription>
                        </EmptyHeader>
                        <EmptySteps />
                      </Empty>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Right Column */}
          <aside className="layout-aside space-y-gap">
            {/* Tipos de Acreditacion */}
            <div className="card-base">
              <h4 className="type-subtitle mb-stack text-text-primary">
                Tipos de Acreditación
              </h4>
              <ul className="space-y-tight">
                {TIPOS_ACREDITACION.map((tipo) => (
                  <li
                    key={tipo}
                    className="flex items-center justify-between rounded-control p-tight hover:bg-surface-container transition-colors"
                  >
                    <span className={`pill ${tipoBadgeStyle(tipo)}`}>
                      {tipoBadgeLabel(tipo)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Mis Postulaciones (micro) */}
            <div className="card-base space-y-stack">
              <div className="flex items-center justify-between gap-tight border-b border-outline-variant pb-stack">
                <div className="flex items-center gap-tight">
                  <span
                    className="h-2.5 w-2.5 rounded-pill bg-primary"
                    aria-hidden="true"
                  />
                  <h4 className="type-subtitle text-text-primary">
                    Mis Postulaciones
                  </h4>
                </div>
                <span className="pill pill-neutral">
                  {stats?.postulacionesRecientes.filter(
                    (a) => a.estadoPostulacion === 'PENDIENTE',
                  ).length ?? 0}{' '}
                  activas
                </span>
              </div>

              {stats && stats.postulacionesRecientes.length > 0 ? (
                <>
                  <ul className="space-y-tight">
                    {stats.postulacionesRecientes.slice(0, 3).map((a) => (
                      <li key={a.idPostulacion}>
                        <Link
                          href="/dashboard/mis-postulaciones"
                          className="flex items-center justify-between gap-tight rounded-control p-tight hover:bg-surface-container transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="type-body truncate font-medium text-text-primary">
                              {a.rolProyecto.proyecto.tituloProyecto}
                            </p>
                            <p className="type-meta">
                              {new Date(a.fechaPostulacion).toLocaleDateString(
                                'es-GT',
                              )}
                            </p>
                          </div>
                          <span
                            className={`pill shrink-0 ${estadoColors[a.estadoPostulacion] ?? 'pill-neutral'}`}
                          >
                            {a.estadoPostulacion}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/dashboard/mis-postulaciones"
                    className="type-body block text-center font-medium text-primary hover:underline"
                  >
                    Ver todas
                  </Link>
                </>
              ) : (
                <div className="flex flex-col items-center gap-tight rounded-control border border-dashed border-outline-variant p-card text-center">
                  <ClipboardList
                    aria-hidden="true"
                    className="h-8 w-8 text-primary"
                  />
                  <p className="type-body font-medium text-text-primary">
                    Sin postulaciones activas
                  </p>
                  <p className="type-meta max-w-[210px]">
                    Explora proyectos y postula para cumplir tus horas del
                    semestre.
                  </p>
                  <Link
                    href="#proyectos-catalogo"
                    className="pill pill-accent mt-tight font-semibold"
                  >
                    Explorar Proyectos
                  </Link>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
