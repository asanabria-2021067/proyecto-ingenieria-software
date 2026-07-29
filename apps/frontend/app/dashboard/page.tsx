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
  Building2,
  Users,
} from 'lucide-react';
import CompleteProfileDialog from '@/components/profile/CompleteProfileDialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptySteps,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { useCurrentUser, isProfileIncomplete } from '@/hooks/use-current-user';
import { getDashboardStats, type DashboardStats } from '@/lib/services/users';
import { searchProjects } from '@/lib/services/projects';
import type { ProyectoListItemDTO } from '@/lib/dto/project.dto';
import type { ProyectoResumen } from '@/types';
import { apiFetch } from '@/lib/api/client';
import {
  estadoBadgeLabel,
  estadoBadgeStyle,
  tipoBadgeLabel,
  tipoBadgeStyle,
} from '@/components/projects/available-project-card';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { useTheme } from 'next-themes';

const estadoColors: Record<string, string> = {
  PENDIENTE: 'bg-blue-100 text-blue-800',
  ACEPTADA: 'bg-green-100 text-green-800',
  RECHAZADA: 'bg-red-100 text-red-800',
};

function DashboardSkeleton() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const baseColor = isDark ? '#202020' : '#ebebeb';
  const highlightColor = isDark ? '#444' : '#f5f5f5';

  return (
    <SkeletonTheme baseColor={baseColor} highlightColor={highlightColor}>
      <div className="px-8 pb-12 pt-8">
        <section className="mb-12">
          <Skeleton width={150} height={16} className="mb-2" />
          <Skeleton width={300} height={48} />
          <Skeleton width={500} height={20} className="mt-2" />
        </section>

        <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          <Skeleton height={192} borderRadius={12} />
          <Skeleton height={192} borderRadius={12} />
          <Skeleton height={192} borderRadius={12} />
        </div>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Skeleton width={200} height={32} className="mb-8" />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
               <Skeleton height={200} borderRadius={12} />
               <Skeleton height={200} borderRadius={12} />
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

  const { data: projects = [], isLoading: projectsLoading } = useQuery<ProyectoListItemDTO[]>({
    queryKey: ['dashboard-projects'],
    queryFn: async () => {
      const p = await searchProjects('');
      return p.slice(0, 4);
    },
  });

  const { data: featured = [], isLoading: featuredLoading } = useQuery<ProyectoResumen[]>({
    queryKey: ['dashboard-featured'],
    queryFn: () => apiFetch('/proyectos/destacados'),
  });

  const isLoading = userLoading || statsLoading || projectsLoading || featuredLoading;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const horasBeca = stats?.horasBeca ?? 0;
  const horasBecaRequeridas = stats?.horasBecaRequeridas ?? null;
  const horasExtension = stats?.horasExtension ?? 0;
  const horasExtensionRequeridas = stats?.horasExtensionRequeridas ?? null;
  const proyectosActivos = stats?.proyectosActivos ?? 0;
  const requiereHorasBeca = horasBecaRequeridas !== null && horasBecaRequeridas > 0;
  const requiereHorasExtension =
    horasExtensionRequeridas !== null && horasExtensionRequeridas > 0;
  const progressBeca = requiereHorasBeca
    ? Math.min(100, Math.round((horasBeca / (horasBecaRequeridas as number)) * 100))
    : 0;
  const progressExtension = requiereHorasExtension
    ? Math.min(
        100,
        Math.round((horasExtension / (horasExtensionRequeridas as number)) * 100),
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

      <div className="px-8 pb-12 pt-8">
        {/* Welcome */}
        <section className="mb-12">
          <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-secondary">
            Bienvenido de vuelta
          </span>
          <h1 className="font-headline text-4xl font-black tracking-tighter text-on-surface md:text-5xl">
            Hola, {user?.nombre ?? ''}
          </h1>
          <p className="mt-2 max-w-2xl text-lg text-on-surface-variant">
            Tu progreso academico este semestre. Tienes {projects.length} proyectos disponibles.
          </p>
        </section>

        {/* Stats */}
        <div id="stats-container" className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Horas Beca */}
          {requiereHorasBeca && (
            <div className="relative flex h-48 flex-col justify-between overflow-hidden rounded-xl bg-surface-container-lowest p-8">
              <div className="relative z-10">
                <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-tertiary">
                  Horas Beca Acumuladas
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black leading-none tracking-tighter text-primary">
                    {horasBeca}
                  </span>
                  <span className="text-lg font-bold text-primary-container">
                    / {horasBecaRequeridas}
                  </span>
                </div>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${progressBeca}%` }}
                />
              </div>
              <div className="absolute -bottom-4 -right-4 text-primary/5">
                <GraduationCap className="h-16 w-16" />
              </div>
            </div>
          )}

          {/* Horas Extension */}
          {requiereHorasExtension && (
            <div className="relative flex h-48 flex-col justify-between overflow-hidden rounded-xl bg-surface-container-lowest p-8">
              <div className="relative z-10">
                <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-tertiary">
                  Horas de Extension
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black leading-none tracking-tighter text-secondary">
                    {horasExtension}
                  </span>
                  <span className="text-lg font-bold text-secondary-container">
                    / {horasExtensionRequeridas}
                  </span>
                </div>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
                <div
                  className="h-full rounded-full bg-secondary"
                  style={{ width: `${progressExtension}%` }}
                />
              </div>
              <div className="absolute -bottom-4 -right-4 text-secondary/5">
                <HeartHandshake className="h-16 w-16" />
              </div>
            </div>
          )}

          {/* Proyectos Activos */}
          <div className="relative flex h-48 flex-col justify-between overflow-hidden rounded-xl bg-primary p-8 text-on-primary">
            <div className="relative z-10">
              <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-primary-container">
                Proyectos Activos
              </span>
              <span className="text-5xl font-black leading-none tracking-tighter">
                {String(proyectosActivos).padStart(2, '0')}
              </span>
            </div>
            <div className="relative z-10 flex gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
                <Calendar className="h-5 w-5 text-white" />
              </div>
            </div>
            <Zap className="absolute -bottom-4 -right-4 h-20 w-20 text-white/10" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="space-y-12 lg:col-span-8">
            {/* Featured Projects */}
            {featured.length > 0 && (
              <section>
                <div className="mb-6 flex items-end justify-between">
                  <div>
                    <h2 className="font-headline text-2xl font-black tracking-tight">
                      Proyectos Destacados
                    </h2>
                    <p className="text-sm text-on-surface-variant">
                      Los proyectos más populares con más postulaciones
                    </p>
                  </div>
                  <Link
                    href="/dashboard/proyectos"
                    className="text-sm font-bold text-primary hover:underline"
                  >
                    Ver todos
                  </Link>
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {featured.slice(0, 4).map((p) => (
                    <div
                      key={p.idProyecto}
                      className="group rounded-xl bg-surface-container-lowest border border-outline-variant/30 p-6 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="mb-4 flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${tipoBadgeStyle(p.tipoProyecto)}`}>
                            {tipoBadgeLabel(p.tipoProyecto)}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${estadoBadgeStyle(p.estadoProyecto)}`}>
                            {estadoBadgeLabel(p.estadoProyecto)}
                          </span>
                        </div>
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                          ID: {p.idProyecto}
                        </span>
                      </div>
                      <h3 className="mb-2 text-lg font-bold text-on-surface transition-colors group-hover:text-primary">
                        {p.tituloProyecto}
                      </h3>
                      <p className="mb-6 line-clamp-2 text-sm text-on-surface-variant">
                        {p.descripcionProyecto}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-medium text-on-surface-variant">
                          <Clock className="h-4 w-4" />
                          {p.modalidadProyecto}
                        </div>
                        <Link
                          href={`/dashboard/projects/${p.idProyecto}`}
                          aria-label={`Ver ${p.tituloProyecto}`}
                          className="rounded-xl bg-surface-container-high px-6 py-2 text-sm font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary"
                        >
                          Ver
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recommended Projects */}
            <section>
              <div className="mb-6 flex items-end justify-between">
                <div>
                  <h2 className="font-headline text-2xl font-black tracking-tight">
                    Proyectos Disponibles
                  </h2>
                  <p className="text-sm text-on-surface-variant">
                    Proyectos publicados recientemente
                  </p>
                </div>
                <Link
                  href="/dashboard/proyectos"
                  className="text-sm font-bold text-primary hover:underline"
                >
                  Ver todos
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {projects.map((p) => (
                  <div
                    key={p.idProyecto}
                    className="group rounded-xl bg-surface-container-lowest border border-outline-variant/30 p-6 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="mb-4 flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${tipoBadgeStyle(p.tipoProyecto)}`}>
                          {tipoBadgeLabel(p.tipoProyecto)}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${estadoBadgeStyle(p.estadoProyecto)}`}>
                          {estadoBadgeLabel(p.estadoProyecto)}
                        </span>
                      </div>
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                        ID: {p.idProyecto}
                      </span>
                    </div>
                    <h3 className="mb-2 text-lg font-bold text-on-surface transition-colors group-hover:text-primary">
                      {p.tituloProyecto}
                    </h3>
                    <p className="mb-6 line-clamp-2 text-sm text-on-surface-variant">
                      {p.descripcionProyecto}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-medium text-on-surface-variant">
                        <Clock className="h-4 w-4" />
                        {p.modalidadProyecto}
                      </div>
                      <Link
                        href={`/dashboard/projects/${p.idProyecto}`}
                        aria-label={`Ver ${p.tituloProyecto}`}
                        className="rounded-xl bg-surface-container-high px-6 py-2 text-sm font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary"
                      >
                        Ver
                      </Link>
                    </div>
                  </div>
                ))}
                {projects.length === 0 && (
                  <div className="col-span-2">
                    <Empty tone="muted" className="surface-enter" aria-live="polite">
                      <EmptyMedia variant="compact">
                        <FolderOpen aria-hidden="true" className="h-6 w-6" />
                      </EmptyMedia>
                      <EmptyHeader>
                        <EmptyTitle className="text-lg">No hay proyectos disponibles</EmptyTitle>
                        <EmptyDescription>
                          Cuando se publiquen nuevas oportunidades, apareceran aqui para que puedas revisarlas rapido.
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
              <h2 className="mb-6 font-headline text-2xl font-black tracking-tight">
                Estado de Aplicaciones
              </h2>
              <div className="overflow-hidden rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-surface-container-low">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                          Proyecto
                        </th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                          Fecha
                        </th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                          Estado
                        </th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                          Accion
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-container">
                      {stats?.postulacionesRecientes.map((a) => (
                        <tr key={a.idPostulacion}>
                          <td className="px-6 py-5">
                            <div className="text-sm font-bold text-on-surface">
                              {a.rolProyecto.proyecto.tituloProyecto}
                            </div>
                            <div className="text-xs text-on-surface-variant">
                              {tipoBadgeLabel(a.rolProyecto.proyecto.tipoProyecto)}
                            </div>
                          </td>
                          <td className="px-6 py-5 text-sm text-on-surface-variant">
                            {new Date(a.fechaPostulacion).toLocaleDateString('es-GT')}
                          </td>
                          <td className="px-6 py-5">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                                estadoColors[a.estadoPostulacion] ?? 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {a.estadoPostulacion}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <Link
                              href="/dashboard/mis-postulaciones"
                              aria-label={`Ver postulacion para ${a.rolProyecto.proyecto.tituloProyecto}`}
                              className="inline-flex rounded-lg p-2 text-primary hover:bg-primary/10"
                            >
                              <Eye className="h-5 w-5" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                      {(!stats || stats.postulacionesRecientes.length === 0) && (
                        <tr>
                          <td colSpan={4} className="px-6 py-8">
                            <div className="flex flex-col items-center gap-2 text-center">
                              <ClipboardList aria-hidden="true" className="h-7 w-7 text-primary" />
                              <p className="text-sm font-semibold text-on-surface">
                                No tienes postulaciones aun
                              </p>
                              <Link
                                href="/dashboard/proyectos"
                                className="text-sm font-bold text-primary hover:underline"
                              >
                                Explorar proyectos
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column */}
          <div className="space-y-8 lg:col-span-4">
            {/* Quick info */}
            <div id="dashboard-profile-card" className="rounded-xl bg-surface-container-low p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-headline text-lg font-black tracking-tight">Tu perfil</h3>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event('start-onboarding-tour'))}
                  aria-label="Repetir tour de bienvenida"
                  className="text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  Repetir Tour 🔄
                </button>
              </div>
              {user?.perfil?.carrera && (
                <div className="mb-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-tertiary">Carrera</span>
                  <p className="text-sm font-medium text-on-surface">{user.perfil.carrera.nombreCarrera}</p>
                </div>
              )}
              {user?.perfil?.semestre && (
                <div className="mb-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-tertiary">Semestre</span>
                  <p className="text-sm font-medium text-on-surface">{user.perfil.semestre}</p>
                </div>
              )}
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-tertiary">Habilidades</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {user?.habilidades.map((h) => (
                    <span
                      key={h.idUsuarioHabilidad}
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                    >
                      {h.habilidad.nombreHabilidad}
                    </span>
                  ))}
                  {(!user?.habilidades || user.habilidades.length === 0) && (
                    <span className="text-xs text-tertiary">Sin habilidades registradas</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
