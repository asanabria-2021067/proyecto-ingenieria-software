'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  GraduationCap,
  HeartHandshake,
  Zap,
  Clock,
  Eye,
  Calendar,
  ClipboardList,
  FolderOpen,
  Award,
  Info,
  NotebookPen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import type { ProyectoResumen } from '@/types';
import { apiFetch } from '@/lib/api/client';
import {
  estadoBadgeLabel,
  tipoBadgeLabel,
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
      <div className="relative z-10">
        <span className="type-meta mb-micro flex items-center gap-tight uppercase tracking-wider">
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
        <section className="mb-section">
          <span className="pill pill-accent mb-tight">
            Bienvenido de vuelta
          </span>
          <h1 className="type-display text-text-primary">
            Hola, {user?.nombre ?? ''}
          </h1>
          <p className="type-body mt-tight max-w-prose text-text-secondary">
            Tu progreso académico este semestre. Tienes {projects.length}{' '}
            proyectos disponibles.
          </p>
        </section>

        {/* Stats */}
        <div
          id="stats-container"
          className="mb-section grid grid-cols-1 gap-gap md:grid-cols-3"
        >
          {/* Horas Beca */}
          {requiereHorasBeca && (
            <div className="card-base relative flex min-h-40 flex-col justify-between overflow-hidden">
              <div className="relative z-10">
                <span className="type-meta mb-micro block uppercase tracking-wider">
                  Horas Beca Acumuladas
                </span>
                <div className="flex items-baseline gap-tight">
                  <span className="type-section text-text-primary">
                    {horasBeca}
                  </span>
                  <span className="type-body text-text-secondary">
                    / {horasBecaRequeridas}
                  </span>
                </div>
              </div>
              <div className="mt-stack h-2 w-full overflow-hidden rounded-pill bg-surface-container-highest">
                <div
                  className="h-full rounded-pill bg-accent"
                  style={{ width: `${progressBeca}%` }}
                />
              </div>
              <div className="absolute -bottom-stack -right-stack text-text-secondary/10">
                <GraduationCap className="h-16 w-16" />
              </div>
            </div>
          )}

          {/* Horas Extension */}
          {requiereHorasExtension && (
            <div className="card-base relative flex min-h-40 flex-col justify-between overflow-hidden">
              <div className="relative z-10">
                <span className="type-meta mb-micro block uppercase tracking-wider">
                  Horas de Extension
                </span>
                <div className="flex items-baseline gap-tight">
                  <span className="type-section text-text-primary">
                    {horasExtension}
                  </span>
                  <span className="type-body text-text-secondary">
                    / {horasExtensionRequeridas}
                  </span>
                </div>
              </div>
              <div className="mt-stack h-2 w-full overflow-hidden rounded-pill bg-surface-container-highest">
                <div
                  className="h-full rounded-pill bg-accent"
                  style={{ width: `${progressExtension}%` }}
                />
              </div>
              <div className="absolute -bottom-stack -right-stack text-text-secondary/10">
                <HeartHandshake className="h-16 w-16" />
              </div>
            </div>
          )}

          {/* Proyectos Activos */}
          <div className="card-base relative flex min-h-40 flex-col justify-between overflow-hidden">
            <div className="relative z-10">
              <span className="type-meta mb-micro block uppercase tracking-wider">
                Proyectos Activos
              </span>
              <span className="type-section text-text-primary">
                {String(proyectosActivos).padStart(2, '0')}
              </span>
            </div>
            <div className="relative z-10 flex gap-tight">
              <div className="flex h-10 w-10 items-center justify-center rounded-control bg-surface-container-high">
                <Zap className="h-5 w-5 text-text-secondary" />
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-control bg-surface-container-high">
                <Calendar className="h-5 w-5 text-text-secondary" />
              </div>
            </div>
            <Zap className="absolute -bottom-stack -right-stack h-20 w-20 text-text-secondary/10" />
          </div>

          {/* S7 VIEW-08: horas en proyectos abiertos vs. acreditadas (separadas) */}
          <HorasKpiCard
            id="stats-horas-abiertas"
            titulo="Horas registradas en proyectos abiertos"
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
            <h2 className="type-section mb-card">De personas que sigues</h2>
            <div className="grid grid-cols-1 gap-gap md:grid-cols-3">
              {proyectosDeSeguidos.map((p) => (
                <SocialProjectCard key={p.idProyecto} proyecto={p} />
              ))}
            </div>
          </section>
        )}

        <div className="layout-grid">
          <div className="layout-main space-y-section">
            {/* Featured Projects */}
            {featured.length > 0 && (
              <section>
                <div className="mb-card flex items-end justify-between gap-stack">
                  <div>
                    <h2 className="type-section">Proyectos Destacados</h2>
                    <p className="type-body text-text-secondary">
                      Los proyectos más populares con más postulaciones
                    </p>
                  </div>
                  <Link
                    href="/dashboard/proyectos"
                    className="type-body font-medium text-primary hover:underline"
                  >
                    Ver todos
                  </Link>
                </div>
                <div className="grid grid-cols-1 gap-gap md:grid-cols-2">
                  {featured.slice(0, 4).map((p) => (
                    <DashboardProjectCard key={p.idProyecto} project={p} />
                  ))}
                </div>
              </section>
            )}

            {/* Recommended Projects */}
            <section>
              <div className="mb-card flex items-end justify-between gap-stack">
                <div>
                  <h2 className="type-section">Proyectos Disponibles</h2>
                  <p className="type-body text-text-secondary">
                    Proyectos publicados recientemente
                  </p>
                </div>
                <Link
                  href="/dashboard/proyectos"
                  className="type-body font-medium text-primary hover:underline"
                >
                  Ver todos
                </Link>
              </div>
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
            </section>

            {/* Applications Status */}
            <section>
              <h2 className="type-section mb-card">Estado de Aplicaciones</h2>
              <div className="card-base overflow-hidden p-0">
                <Table>
                  <TableHeader className="bg-page">
                    <TableRow>
                      <TableHead className="px-card">Proyecto</TableHead>
                      <TableHead className="px-card">Fecha</TableHead>
                      <TableHead className="px-card">Estado</TableHead>
                      <TableHead className="px-card">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats?.postulacionesRecientes.map((a) => (
                      <TableRow key={a.idPostulacion}>
                        <TableCell className="px-card py-stack">
                          <div className="type-subtitle text-text-primary">
                            {a.rolProyecto.proyecto.tituloProyecto}
                          </div>
                          <div className="type-meta">
                            {tipoBadgeLabel(
                              a.rolProyecto.proyecto.tipoProyecto,
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="type-body px-card py-stack text-text-secondary">
                          {new Date(a.fechaPostulacion).toLocaleDateString(
                            'es-GT',
                          )}
                        </TableCell>
                        <TableCell className="px-card py-stack">
                          <span
                            className={`pill ${estadoColors[a.estadoPostulacion] ?? 'pill-neutral'}`}
                          >
                            {a.estadoPostulacion}
                          </span>
                        </TableCell>
                        <TableCell className="px-card py-stack">
                          <Link
                            href="/dashboard/mis-postulaciones"
                            aria-label={`Ver postulacion para ${a.rolProyecto.proyecto.tituloProyecto}`}
                            className="inline-flex rounded-control p-tight text-primary hover:bg-muted"
                          >
                            <Eye className="h-5 w-5" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!stats || stats.postulacionesRecientes.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={4} className="px-card py-section">
                          <div className="flex flex-col items-center gap-tight text-center">
                            <ClipboardList
                              aria-hidden="true"
                              className="h-7 w-7 text-primary"
                            />
                            <p className="type-body font-medium text-text-primary">
                              No tienes postulaciones aun
                            </p>
                            <Link
                              href="/dashboard/proyectos"
                              className="type-body font-medium text-primary hover:underline"
                            >
                              Explorar proyectos
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>

          {/* Right Column */}
          <aside className="layout-aside">
            {/* Quick info */}
            <div
              id="dashboard-profile-card"
              className="card-base lg:sticky lg:top-section"
            >
              <div className="mb-stack flex items-center justify-between gap-tight">
                <h2 className="type-section">Tu perfil</h2>
                <button
                  type="button"
                  onClick={() =>
                    window.dispatchEvent(new Event('start-onboarding-tour'))
                  }
                  aria-label="Repetir tour de bienvenida"
                  className="type-meta cursor-pointer font-medium text-primary hover:underline"
                >
                  Repetir Tour 🔄
                </button>
              </div>
              {user?.perfil?.carrera && (
                <div className="mb-inline">
                  <span className="type-meta uppercase tracking-wider">
                    Carrera
                  </span>
                  <p className="type-body text-text-primary">
                    {user.perfil.carrera.nombreCarrera}
                  </p>
                </div>
              )}
              {user?.perfil?.semestre && (
                <div className="mb-inline">
                  <span className="type-meta uppercase tracking-wider">
                    Semestre
                  </span>
                  <p className="type-body text-text-primary">
                    {user.perfil.semestre}
                  </p>
                </div>
              )}
              <div>
                <span className="type-meta uppercase tracking-wider">
                  Habilidades
                </span>
                <div className="mt-micro flex flex-wrap gap-micro">
                  {user?.habilidades.map((h) => (
                    <span
                      key={h.idUsuarioHabilidad}
                      className="pill pill-accent"
                    >
                      {h.habilidad.nombreHabilidad}
                    </span>
                  ))}
                  {(!user?.habilidades || user.habilidades.length === 0) && (
                    <span className="type-meta">
                      Sin habilidades registradas
                    </span>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
