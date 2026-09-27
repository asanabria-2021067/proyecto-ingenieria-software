'use client';

import { useQuery } from '@tanstack/react-query';
import {
  FolderKanban,
  Users,
  ClipboardList,
  Clock,
  AlertTriangle,
  AlertCircle,
  Calendar,
  GraduationCap,
  Activity,
} from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getAdminStats,
  type AdminStats,
  type AdminActividadRecienteItem,
  type AdminEstudianteEnRiesgo,
} from '@/lib/services/admin';

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
    return 'bg-status-success text-on-status-success';
  }
  if (e.includes('REVISION') || e.includes('REVISIÓN')) {
    return 'bg-status-warning text-on-status-warning';
  }
  return 'bg-surface-container-high text-text-secondary';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
    <div className="flex flex-col gap-4 rounded-xl bg-surface-container-lowest border border-outline-variant p-6">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-tertiary">
            {label}
          </span>
          <p className="mt-1 text-4xl font-black tracking-tighter text-on-surface">
            {value}
          </p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
      </div>
      <p className="text-xs text-tertiary">{subtexto}</p>
    </div>
  );
}

const ACTION_CARD_TONES = {
  warning: {
    card: 'border-outline-variant bg-status-warning/20',
    icon: 'bg-status-warning text-on-status-warning',
    badge: 'bg-status-warning text-on-status-warning',
  },
  error: {
    card: 'border-outline-variant bg-status-error/10',
    icon: 'bg-status-error text-on-status-error',
    badge: 'bg-status-error text-on-status-error',
  },
} as const;

function ActionCard({
  label,
  value,
  subtexto,
  badgeLabel,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  subtexto: string;
  badgeLabel: string;
  icon: React.ElementType;
  tone: keyof typeof ACTION_CARD_TONES;
}) {
  const tones = ACTION_CARD_TONES[tone];
  return (
    <div className={`flex flex-col gap-4 rounded-xl border p-6 ${tones.card}`}>
      <div className="flex items-start justify-between">
        <div>
          <span className="type-meta font-black uppercase tracking-widest text-text-secondary">
            {label}
          </span>
          <p className="mt-1 text-4xl font-black tracking-tighter text-text-primary">
            {value}
          </p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones.icon}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="type-meta text-text-secondary">{subtexto}</p>
        <span className={`rounded-full px-2 py-0.5 type-meta font-black uppercase ${tones.badge}`}>
          {badgeLabel}
        </span>
      </div>
    </div>
  );
}

// ─── Skeleton loaders ─────────────────────────────────────────────────────────

function AdminStatsSkeleton() {
  return (
      <div className="px-4 pb-12 pt-8 md:px-8">
        <section className="mb-10">
          <Skeleton className="mb-2 h-3 w-28 rounded" />
          <Skeleton className="h-10 w-72 rounded" />
          <Skeleton className="mt-2 h-5 w-96 rounded" />
        </section>

        <div className="mb-8">
          <Skeleton className="mb-4 h-5 w-20 rounded" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        </div>

        <div className="mb-8">
          <Skeleton className="mb-4 h-5 w-36 rounded" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        </div>

        <div className="mb-8">
          <Skeleton className="mb-4 h-5 w-28 rounded" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
  );
}

// ─── Activity list ────────────────────────────────────────────────────────────

function ActividadRecienteCard({ items }: { items: AdminActividadRecienteItem[] }) {
  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-outline-variant bg-card p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-status-success">
          <Activity className="h-5 w-5 text-on-status-success" />
        </div>
        <h3 className="type-subtitle font-headline font-black tracking-tight text-text-primary">
          Actividad reciente
        </h3>
      </div>
      {items.length === 0 ? (
        <p className="type-body text-text-secondary">No hay actividad reciente</p>
      ) : (
        <ul className="divide-y divide-outline-variant">
          {items.map((item) => (
            <li key={item.idProyecto} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="type-body font-semibold line-clamp-1 text-text-primary">
                  {item.tituloProyecto}
                </p>
                <p className="type-meta mt-0.5 text-text-secondary">
                  {timeAgo(item.fechaActualizacion)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 type-meta font-bold uppercase ${estadoBadgeClasses(item.estadoProyecto)}`}
              >
                {item.estadoProyecto}
              </span>
              <Link
                href={`/dashboard/proyectos/${item.idProyecto}`}
                className="shrink-0 rounded-xl bg-surface-container-high px-4 py-1.5 text-xs font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary"
              >
                Ver proyecto
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Risk students list ───────────────────────────────────────────────────────

function EstudiantesRiesgoCard({ items }: { items: AdminEstudianteEnRiesgo[] }) {
  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-outline-variant bg-card p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-status-error">
          <GraduationCap className="h-5 w-5 text-on-status-error" />
        </div>
        <div>
          <h3 className="type-subtitle font-headline font-black tracking-tight text-text-primary">
            Estudiantes en riesgo de horas
          </h3>
          <p className="type-meta text-text-secondary">
            Estudiantes del semestre 7 en adelante con pocas horas acumuladas
          </p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="type-body text-text-secondary">No hay estudiantes en riesgo</p>
      ) : (
        <>
          <ul className="divide-y divide-outline-variant">
            {items.map((est) => (
              <li key={est.idUsuario} className="flex items-center py-3 first:pt-0 last:pb-0">
                <p className="type-body flex-1 font-medium text-text-primary">
                  {est.nombre} {est.apellido}
                </p>
                {est.semestre !== null && (
                  <span className="type-body w-16 text-center font-medium text-text-secondary">
                    S{est.semestre}
                  </span>
                )}
                <span className="ml-3 shrink-0 rounded-full bg-status-error px-3 py-0.5 type-meta font-bold text-on-status-error">
                  {est.horasExtension} / {est.horasExtensionRequeridas} hrs
                </span>
              </li>
            ))}
          </ul>
          <div className="pt-1">
            <Link
              href="/dashboard/admin/usuarios?riesgo=horas"
              className="font-label text-xs font-bold uppercase tracking-widest text-primary transition-all hover:underline"
            >
              Ver todos
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function AdminPanelContent({ stats }: { stats: AdminStats }) {
  return (
      <div className="px-4 pb-12 pt-8 md:px-8">
        {/* Header */}
        <section className="mb-10">
          <span className="mb-2 block text-xs font-black uppercase tracking-widest text-primary">
            Administración
          </span>
          <h1 className="font-headline text-4xl font-black tracking-tighter text-on-surface md:text-5xl">
            Panel de Administración
          </h1>
          <p className="mt-2 max-w-2xl text-base text-tertiary">
            Resumen general de actividad, usuarios y proyectos en UVGENIOS.
          </p>
        </section>

        {/* Sección 1: Global */}
        <section className="mb-10">
          <h2 className="mb-4 font-headline text-lg font-black tracking-tight text-on-surface">
            Global
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </section>

        {/* Sección 2: Requieren acción */}
        <section className="mb-10">
          <h2 className="mb-4 font-headline text-lg font-black tracking-tight text-on-surface">
            Requieren acción
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ActionCard
              label="En Revisión"
              value={stats.enRevision}
              subtexto="Proyectos pendientes de revisión"
              badgeLabel="Pendiente"
              icon={ClipboardList}
              tone="warning"
            />
            <Link
              href="/dashboard/admin/proyectos?grupo=cierres"
              aria-label="Ver solicitudes de cierre pendientes"
              className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <ActionCard
                label="Cierre Pendiente"
                value={stats.cierrePendiente}
                subtexto="Solicitudes de cierre por aprobar"
                badgeLabel="Acción requerida"
                icon={Clock}
                tone="warning"
              />
            </Link>
            <ActionCard
              label="Bloqueados"
              value={stats.usuariosBloqueados}
              subtexto="Usuarios con acceso restringido"
              badgeLabel="Revisar"
              icon={AlertTriangle}
              tone="error"
            />
          </div>
        </section>

        {/* Sección 3: Datos 2026 */}
        <section className="mb-10">
          <h2 className="mb-4 font-headline text-lg font-black tracking-tight text-on-surface">
            Datos 2026
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </section>

        {/* Sección 4: Actividad y alertas */}
        <section>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch">
            <ActividadRecienteCard items={stats.actividadReciente} />
            <EstudiantesRiesgoCard items={stats.estudiantesEnRiesgo} />
          </div>
        </section>
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
        <div className="px-4 pt-8 md:px-8">
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-8 text-center">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-error" />
            <p className="text-sm font-medium text-on-surface">
              No se pudieron cargar las estadísticas administrativas.
            </p>
          </div>
        </div>
    );
  }

  return <AdminPanelContent stats={stats} />;
}
