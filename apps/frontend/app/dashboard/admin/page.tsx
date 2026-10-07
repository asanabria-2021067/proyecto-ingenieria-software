'use client';

import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FolderKanban,
  Users,
  AlertCircle,
  Calendar,
  GraduationCap,
  Activity,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { AdminAttentionQueue } from '@/components/admin/dashboard/attention-queue';
import { AdminSprintPlanningWidget } from '@/components/admin/dashboard/sprint-planning-widget';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminMetricsSection } from '@/components/admin/AdminMetricsSection';
import {
  getAdminStats,
  type AdminStats,
  type AdminActividadRecienteItem,
  type AdminEstudianteEnRiesgo,
} from '@/lib/services/admin';

/** Mismo contenedor que el resto de bandejas administrativas (1400 px centrado). */
const PAGE_CLASS = 'mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Sin fecha';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'Hace un momento';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  return `Hace ${Math.floor(diff / 86400)} d`;
}

function estadoBadgeClasses(estado: string): string {
  const e = estado.toUpperCase();
  if (e.includes('ACTIVO') || e.includes('PUBLICADO')) {
    return 'pill-success';
  }
  if (e.includes('REVISION') || e.includes('REVISIÓN')) {
    return 'pill-warning';
  }
  return 'pill-neutral';
}

/** `EN_SOLICITUD_CIERRE` → `En solicitud cierre`: mismo estado, legible y con corte de línea. */
function estadoLegible(estado: string): string {
  const texto = estado.replaceAll('_', ' ').toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Encabezado de sección: la jerarquía del panel se lee por estos cuatro títulos. */
function DashboardSection({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="type-section mb-stack">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  subtexto,
  icon: Icon,
  iconBg = 'bg-primary/10',
  iconColor = 'text-primary',
}: {
  label: string;
  value: number;
  subtexto: string;
  icon: React.ElementType;
  iconBg?: string;
  iconColor?: string;
}) {
  return (
    <div role="group" aria-label={label} className="card-base flex flex-col gap-stack">
      <div className="flex items-start justify-between gap-inline">
        <div className="min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {label}
          </span>
          <p className="mt-micro font-headline text-4xl font-bold tracking-tight tabular-nums text-text-primary">
            {value}
          </p>
        </div>
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-control ${iconBg}`}>
          <Icon className={`size-5 ${iconColor}`} aria-hidden="true" />
        </div>
      </div>
      <p className="type-meta">{subtexto}</p>
    </div>
  );
}

// ─── Skeleton loaders ─────────────────────────────────────────────────────────

function AdminStatsSkeleton() {
  return (
    <div className={PAGE_CLASS} role="status" aria-label="Cargando el panel de administración">
      <section className="mb-section">
        <Skeleton className="mb-tight h-3 w-28 rounded" />
        <Skeleton className="h-10 w-72 max-w-full rounded" />
        <Skeleton className="mt-tight h-5 w-96 max-w-full rounded" />
      </section>

      <div className="flex flex-col gap-section">
        <div>
          <Skeleton className="mb-stack h-5 w-20 rounded" />
          <div className="grid grid-cols-1 gap-grid sm:grid-cols-2">
            <Skeleton className="h-36 rounded-card" />
            <Skeleton className="h-36 rounded-card" />
          </div>
        </div>

        <div>
          <Skeleton className="mb-stack h-5 w-28 rounded" />
          <div className="grid grid-cols-1 gap-grid lg:grid-cols-5 lg:items-start">
            <Skeleton className="h-72 rounded-card lg:col-span-3" />
            <Skeleton className="h-96 rounded-card lg:col-span-2" />
          </div>
        </div>

        <div>
          <Skeleton className="mb-stack h-5 w-32 rounded" />
          <div className="grid grid-cols-1 gap-grid lg:grid-cols-2">
            <Skeleton className="h-64 rounded-card" />
            <Skeleton className="h-64 rounded-card" />
          </div>
        </div>

        <div>
          <Skeleton className="mb-stack h-5 w-28 rounded" />
          <div className="grid grid-cols-1 gap-grid sm:grid-cols-2">
            <Skeleton className="h-36 rounded-card" />
            <Skeleton className="h-36 rounded-card" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Activity list ────────────────────────────────────────────────────────────

function ActividadRecienteCard({ items }: { items: AdminActividadRecienteItem[] }) {
  const tituloId = useId();
  return (
    <section aria-labelledby={tituloId} className="card-base flex h-full flex-col overflow-hidden p-0">
      <header className="flex items-center gap-inline border-b border-outline-variant/50 px-card py-stack">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-control bg-primary/10">
          <Activity className="size-5 text-primary" aria-hidden="true" />
        </div>
        <h3 id={tituloId} className="type-subtitle font-semibold">
          Actividad reciente
        </h3>
      </header>
      {items.length === 0 ? (
        <p className="type-body px-card py-stack text-text-secondary">No hay actividad reciente</p>
      ) : (
        <ul className="divide-y divide-outline-variant/50">
          {items.map((item) => (
            <li
              key={item.idProyecto}
              className="flex flex-wrap items-center gap-x-inline gap-y-tight px-card py-inline transition-colors hover:bg-surface-container-low"
            >
              <div className="min-w-0 flex-1 basis-full sm:basis-48">
                <p className="type-body line-clamp-1 font-semibold">{item.tituloProyecto}</p>
                <p className="type-meta mt-micro">{timeAgo(item.fechaActualizacion)}</p>
              </div>
              <span className={`pill shrink-0 ${estadoBadgeClasses(item.estadoProyecto)}`}>
                {estadoLegible(item.estadoProyecto)}
              </span>
              <Link
                href={`/dashboard/proyectos/${item.idProyecto}`}
                className="shrink-0 rounded-control bg-surface-container-high px-stack py-tight text-xs font-semibold text-on-surface outline-none transition-colors hover:bg-primary hover:text-on-primary focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Ver proyecto
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Risk students list ───────────────────────────────────────────────────────

function EstudiantesRiesgoCard({ items }: { items: AdminEstudianteEnRiesgo[] }) {
  const tituloId = useId();
  return (
    <section aria-labelledby={tituloId} className="card-base flex h-full flex-col overflow-hidden p-0">
      <header className="flex items-start gap-inline border-b border-outline-variant/50 px-card py-stack">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-control bg-status-error">
          <GraduationCap className="size-5 text-on-status-error" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 id={tituloId} className="type-subtitle font-semibold text-balance">
            Estudiantes en riesgo de horas
          </h3>
          <p className="type-meta">
            Estudiantes del semestre 7 en adelante con pocas horas acumuladas
          </p>
        </div>
      </header>
      {items.length === 0 ? (
        <p className="type-body px-card py-stack text-text-secondary">No hay estudiantes en riesgo</p>
      ) : (
        <>
          <div
            aria-hidden="true"
            className="flex items-center gap-inline border-b border-outline-variant/50 bg-surface-container-low px-card py-tight text-xs font-semibold text-text-secondary"
          >
            <span className="min-w-0 flex-1">Estudiante</span>
            <span className="w-14 shrink-0 text-center">Semestre</span>
            <span className="w-24 shrink-0 text-right">Horas</span>
          </div>
          <ul className="divide-y divide-outline-variant/50">
            {items.map((est) => (
              <li
                key={est.idUsuario}
                className="flex items-center gap-inline px-card py-inline transition-colors hover:bg-surface-container-low"
              >
                <p className="type-body min-w-0 flex-1 truncate font-medium">
                  {est.nombre} {est.apellido}
                </p>
                <span className="type-body w-14 shrink-0 text-center font-medium text-text-secondary">
                  {est.semestre !== null ? `S${est.semestre}` : '—'}
                </span>
                <span className="flex w-24 shrink-0 justify-end">
                  <span className="pill pill-error whitespace-nowrap tabular-nums">
                    {est.horasExtension} / {est.horasExtensionRequeridas} hrs
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-auto border-t border-outline-variant/50 px-card py-inline">
            <Link
              href="/dashboard/admin/usuarios?riesgo=horas"
              className="type-meta -my-tight inline-flex items-center gap-micro rounded-control py-tight font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Ver todos
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function AdminPanelContent({ stats }: { stats: AdminStats }) {
  return (
    <div className={PAGE_CLASS}>
      {/* Header */}
      <section className="mb-section">
        <span className="mb-tight block text-xs font-semibold uppercase tracking-widest text-primary">
          Administración
        </span>
        <h1 className="font-headline text-4xl font-black tracking-tight text-balance text-on-surface">
          Panel de Administración
        </h1>
        <p className="mt-tight max-w-2xl text-base text-tertiary">
          Resumen general de actividad, usuarios y proyectos en UVGenius.
        </p>
      </section>

      <div className="flex flex-col gap-section">
        {/* 1. Estado general */}
        <DashboardSection titulo="Global">
          <div className="grid grid-cols-1 gap-grid sm:grid-cols-2">
            <StatCard
              label="Proyectos Activos"
              value={stats.proyectosActivos}
              subtexto="Actualmente publicados o en progreso"
              icon={FolderKanban}
            />
            <StatCard
              label="Usuarios Activos"
              value={stats.usuariosActivos}
              subtexto="Cuentas activas en la plataforma"
              icon={Users}
            />
          </div>
        </DashboardSection>

        {/* 2. Operación: qué espera una decisión y qué Sprints deberían terminar pronto.
            El widget de Sprints consulta por su cuenta: si falla, el resto del panel sigue. */}
        <DashboardSection titulo="Operación">
          <div className="grid grid-cols-1 gap-grid lg:grid-cols-5 lg:items-start">
            <div className="min-w-0 lg:col-span-3">
              <AdminAttentionQueue
                enRevision={stats.enRevision}
                cierrePendiente={stats.cierrePendiente}
                usuariosBloqueados={stats.usuariosBloqueados}
              />
            </div>
            <div className="min-w-0 lg:col-span-2">
              <AdminSprintPlanningWidget />
            </div>
          </div>
        </DashboardSection>

        {/* 3. Seguimiento */}
        <DashboardSection titulo="Seguimiento">
          <div className="grid grid-cols-1 gap-grid lg:grid-cols-2 lg:items-stretch">
            <div className="min-w-0">
              <ActividadRecienteCard items={stats.actividadReciente} />
            </div>
            <div className="min-w-0">
              <EstudiantesRiesgoCard items={stats.estudiantesEnRiesgo} />
            </div>
          </div>
        </DashboardSection>

        {/* 4. Datos del período: históricos, al final para no competir con la operación. */}
        <DashboardSection titulo="Datos 2026">
          <div className="grid grid-cols-1 gap-grid sm:grid-cols-2">
            <StatCard
              label="Nuevos Inactivos"
              value={stats.nuevosInactivos2026}
              subtexto="Usuarios que pasaron a inactivo durante 2026"
              icon={AlertCircle}
              iconBg="bg-surface-container-high"
              iconColor="text-tertiary"
            />
            <StatCard
              label="Proyectos Cerrados"
              value={stats.proyectosCerrados2026}
              subtexto="Proyectos cerrados durante 2026"
              icon={Calendar}
              iconBg="bg-surface-container-high"
              iconColor="text-tertiary"
            />
          </div>
        </DashboardSection>

        {/* 5. Tendencias de uso (HU-178): históricas, después de la operación. */}
        <AdminMetricsSection />
      </div>
    </div>
  );
}

export default function AdminPanelPage() {
  const {
    data: stats,
    isLoading,
    isError,
  } = useQuery<AdminStats>({
    queryKey: ['adminStats'],
    queryFn: getAdminStats,
  });

  if (isLoading) {
    return <AdminStatsSkeleton />;
  }

  if (isError || !stats) {
    return (
      <div className={PAGE_CLASS}>
        <div role="alert" className="card-base text-center">
          <AlertCircle className="mx-auto mb-3 size-8 text-error" aria-hidden="true" />
          <p className="type-body font-medium">
            No se pudieron cargar las estadísticas administrativas.
          </p>
        </div>
      </div>
    );
  }

  return <AdminPanelContent stats={stats} />;
}
