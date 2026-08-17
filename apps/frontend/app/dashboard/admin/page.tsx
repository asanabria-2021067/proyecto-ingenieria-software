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

function estadoBadgeStyle(estado: string): React.CSSProperties {
  const e = estado.toUpperCase();
  if (e.includes('ACTIVO') || e.includes('PUBLICADO')) {
    return { backgroundColor: '#E6F4EC', color: '#006735' };
  }
  if (e.includes('REVISION') || e.includes('REVISIÓN')) {
    return { backgroundColor: '#FEF3C7', color: '#92400E' };
  }
  if (e.includes('CIERRE') || e.includes('CERRADO')) {
    return { backgroundColor: '#F3F4F6', color: '#6B7280' };
  }
  return { backgroundColor: '#F3F4F6', color: '#374151' };
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

function ActionCard({
  label,
  value,
  subtexto,
  badgeLabel,
  badgeClasses,
  icon: Icon,
  cardBg,
  iconBg,
  iconColor,
  cardStyle,
  iconStyle,
  badgeStyle,
  labelStyle,
  valueStyle,
  subtextoStyle,
}: {
  label: string;
  value: number;
  subtexto: string;
  badgeLabel: string;
  badgeClasses: string;
  icon: React.ElementType;
  cardBg: string;
  iconBg: string;
  iconColor: string;
  cardStyle?: React.CSSProperties;
  iconStyle?: React.CSSProperties;
  badgeStyle?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
  valueStyle?: React.CSSProperties;
  subtextoStyle?: React.CSSProperties;
}) {
  return (
    <div className={`flex flex-col gap-4 rounded-xl border p-6 ${cardBg}`} style={cardStyle}>
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-tertiary" style={labelStyle}>
            {label}
          </span>
          <p className="mt-1 text-4xl font-black tracking-tighter text-on-surface" style={valueStyle}>
            {value}
          </p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`} style={iconStyle}>
          <Icon className={`h-5 w-5 ${iconColor}`} style={iconStyle ? { color: iconStyle.color } : undefined} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-tertiary" style={subtextoStyle}>{subtexto}</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${badgeClasses}`} style={badgeStyle}>
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
    <div
      className="flex h-full flex-col gap-4 rounded-xl border p-6"
      style={{ backgroundColor: '#FFFFFF', borderColor: '#C8D6C8' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: '#E6F4EC' }}
        >
          <Activity className="h-5 w-5" style={{ color: '#006735' }} />
        </div>
        <h3 className="font-headline text-base font-black tracking-tight" style={{ color: '#111827' }}>
          Actividad reciente
        </h3>
      </div>
      {items.length === 0 ? (
        <p className="text-sm" style={{ color: '#6B7280' }}>No hay actividad reciente</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: '#E5E7EB' }}>
          {items.map((item) => (
            <li key={item.idProyecto} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold line-clamp-1" style={{ color: '#111827' }}>
                  {item.tituloProyecto}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: '#6B7280' }}>
                  {timeAgo(item.fechaActualizacion)}
                </p>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                style={estadoBadgeStyle(item.estadoProyecto)}
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
    <div
      className="flex h-full flex-col gap-4 rounded-xl border p-6"
      style={{ backgroundColor: '#FFFFFF', borderColor: '#C8D6C8' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: '#FEE2E2' }}
        >
          <GraduationCap className="h-5 w-5" style={{ color: '#DC2626' }} />
        </div>
        <div>
          <h3 className="font-headline text-base font-black tracking-tight" style={{ color: '#111827' }}>
            Estudiantes en riesgo de horas
          </h3>
          <p className="text-xs" style={{ color: '#6B7280' }}>
            Estudiantes del semestre 7 en adelante con pocas horas acumuladas
          </p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-sm" style={{ color: '#6B7280' }}>No hay estudiantes en riesgo</p>
      ) : (
        <>
          <ul className="divide-y" style={{ borderColor: '#E5E7EB' }}>
            {items.map((est) => (
              <li key={est.idUsuario} className="flex items-center py-3 first:pt-0 last:pb-0">
                <p className="flex-1 text-sm font-medium" style={{ color: '#111827' }}>
                  {est.nombre} {est.apellido}
                </p>
                {est.semestre !== null && (
                  <span
                    className="w-16 text-center text-sm font-medium"
                    style={{ color: '#525252' }}
                  >
                    S{est.semestre}
                  </span>
                )}
                <span
                  className="ml-3 shrink-0 rounded-full px-3 py-0.5 text-xs font-bold"
                  style={{ backgroundColor: '#FEE2E2', color: '#DC2626' }}
                >
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
              badgeClasses=""
              icon={ClipboardList}
              cardBg="dark:bg-amber-900/10 dark:border-amber-900/30"
              iconBg="dark:bg-amber-900/40"
              iconColor="dark:text-amber-300"
              cardStyle={{ backgroundColor: '#FCF8F4', borderColor: '#E6D6C3' }}
              iconStyle={{ backgroundColor: '#F1E3D0', color: '#C07D2C' }}
              badgeStyle={{ backgroundColor: '#F1E3D0', color: '#C07D2C' }}
              labelStyle={{ color: '#6B6B6B' }}
              valueStyle={{ color: '#1A1C1E' }}
              subtextoStyle={{ color: '#6B6B6B' }}
            />
            <ActionCard
              label="Cierre Pendiente"
              value={stats.cierrePendiente}
              subtexto="Solicitudes de cierre por aprobar"
              badgeLabel="Acción requerida"
              badgeClasses=""
              icon={Clock}
              cardBg="dark:bg-amber-900/10 dark:border-amber-900/30"
              iconBg="dark:bg-amber-900/40"
              iconColor="dark:text-amber-300"
              cardStyle={{ backgroundColor: '#FCF8F4', borderColor: '#E6D6C3' }}
              iconStyle={{ backgroundColor: '#F1E3D0', color: '#C07D2C' }}
              badgeStyle={{ backgroundColor: '#F1E3D0', color: '#C07D2C' }}
              labelStyle={{ color: '#6B6B6B' }}
              valueStyle={{ color: '#1A1C1E' }}
              subtextoStyle={{ color: '#6B6B6B' }}
            />
            <ActionCard
              label="Bloqueados"
              value={stats.usuariosBloqueados}
              subtexto="Usuarios con acceso restringido"
              badgeLabel="Revisar"
              badgeClasses=""
              icon={AlertTriangle}
              cardBg=""
              iconBg=""
              iconColor=""
              cardStyle={{ backgroundColor: '#FCF3F4', borderColor: '#EACCD0' }}
              iconStyle={{ backgroundColor: '#F4DADC', color: '#CC292B' }}
              badgeStyle={{ backgroundColor: '#F4DADC', color: '#CC292B' }}
              labelStyle={{ color: '#6B6B6B' }}
              valueStyle={{ color: '#1A1C1E' }}
              subtextoStyle={{ color: '#6B6B6B' }}
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
