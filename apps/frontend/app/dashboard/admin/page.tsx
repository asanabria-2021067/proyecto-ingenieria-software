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
import AdminLayout from '@/components/admin/AdminLayout';
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

function estadoProyectoClasses(estado: string): string {
  const e = estado.toUpperCase();
  if (e.includes('ACTIVO') || e.includes('PUBLICADO')) {
    return 'bg-primary/10 text-primary';
  }
  if (e.includes('REVISION') || e.includes('REVISIÓN')) {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
  }
  if (e.includes('CIERRE') || e.includes('CERRADO')) {
    return 'bg-surface-container-high text-tertiary';
  }
  return 'bg-surface-container-high text-on-surface';
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
}) {
  return (
    <div className={`flex flex-col gap-4 rounded-xl border p-6 ${cardBg}`}>
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
      <div className="flex items-center justify-between">
        <p className="text-xs text-tertiary">{subtexto}</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${badgeClasses}`}>
          {badgeLabel}
        </span>
      </div>
    </div>
  );
}

// ─── Skeleton loaders ─────────────────────────────────────────────────────────

function AdminStatsSkeleton() {
  return (
    <AdminLayout>
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
    </AdminLayout>
  );
}

// ─── Activity list ────────────────────────────────────────────────────────────

function ActividadRecienteCard({ items }: { items: AdminActividadRecienteItem[] }) {
  return (
    <div className="rounded-xl bg-surface-container-lowest border border-outline-variant p-6">
      <div className="mb-4 flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="font-headline text-base font-black tracking-tight text-on-surface">
          Actividad reciente
        </h3>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-tertiary">No hay actividad reciente.</p>
      ) : (
        <ul className="divide-y divide-outline-variant/40">
          {items.map((item) => (
            <li key={item.idProyecto} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-on-surface line-clamp-1 flex-1">
                  {item.tituloProyecto}
                </p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${estadoProyectoClasses(item.estadoProyecto)}`}
                >
                  {item.estadoProyecto}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-tertiary">
                {timeAgo(item.fechaActualizacion)}
              </p>
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
    <div className="rounded-xl bg-surface-container-lowest border border-outline-variant p-6">
      <div className="mb-1 flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-error" />
        <h3 className="font-headline text-base font-black tracking-tight text-on-surface">
          Estudiantes en riesgo de horas
        </h3>
      </div>
      <p className="mb-4 text-xs text-tertiary">
        Semestre ≥ 7 con pocas horas acumuladas
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-tertiary">No hay estudiantes en riesgo registrados.</p>
      ) : (
        <>
          <ul className="divide-y divide-outline-variant/40">
            {items.map((est) => (
              <li key={est.idUsuario} className="py-3 first:pt-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-on-surface">
                    {est.nombre} {est.apellido}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    {est.semestre !== null && (
                      <span className="text-[10px] font-black uppercase tracking-wider text-tertiary">
                        S{est.semestre}
                      </span>
                    )}
                    <span className="rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-black text-error">
                      {est.horasExtension} / {est.horasExtensionRequeridas} hrs
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 pt-3 border-t border-outline-variant/40">
            <Link
              href="/dashboard/admin/usuarios?riesgo=horas"
              className="text-sm font-bold text-primary hover:underline"
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
    <AdminLayout>
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
              badgeClasses="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
              icon={ClipboardList}
              cardBg="bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-900/30"
              iconBg="bg-amber-100 dark:bg-amber-900/40"
              iconColor="text-amber-700 dark:text-amber-300"
            />
            <ActionCard
              label="Cierre Pendiente"
              value={stats.cierrePendiente}
              subtexto="Solicitudes de cierre por aprobar"
              badgeLabel="Acción requerida"
              badgeClasses="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
              icon={Clock}
              cardBg="bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-900/30"
              iconBg="bg-amber-100 dark:bg-amber-900/40"
              iconColor="text-amber-700 dark:text-amber-300"
            />
            <ActionCard
              label="Bloqueados"
              value={stats.usuariosBloqueados}
              subtexto="Usuarios con acceso restringido"
              badgeLabel="Revisar"
              badgeClasses="bg-error-container text-error dark:bg-error/20 dark:text-error"
              icon={AlertTriangle}
              cardBg="bg-error-container/30 border-error/20 dark:bg-error/10 dark:border-error/20"
              iconBg="bg-error-container dark:bg-error/20"
              iconColor="text-error"
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ActividadRecienteCard items={stats.actividadReciente} />
            <EstudiantesRiesgoCard items={stats.estudiantesEnRiesgo} />
          </div>
        </section>
      </div>
    </AdminLayout>
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
      <AdminLayout>
        <div className="px-4 pt-8 md:px-8">
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-8 text-center">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-error" />
            <p className="text-sm font-medium text-on-surface">
              No se pudieron cargar las estadísticas administrativas.
            </p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return <AdminPanelContent stats={stats} />;
}
