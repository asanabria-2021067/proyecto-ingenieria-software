'use client';

import { useEffect, useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FolderKanban,
  FolderPlus,
  Users,
  UserPlus,
  AlertCircle,
  Calendar,
  Clock,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { IconoTipo } from '@/components/hours/my-hours-project-list';
import { GOLD_BADGE, estadoBadgeLabel, estadoBadgeStyle } from '@/components/projects/available-project-card';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { AdminAttentionQueue } from '@/components/admin/dashboard/attention-queue';
import { adminProjectHref } from '@/lib/admin/sprint-calendar';
import { AdminSprintPlanningWidget } from '@/components/admin/dashboard/sprint-planning-widget';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import {
  ADMIN_METRICS_ANCHOR,
  ADMIN_METRICS_ROUTE,
  ADMIN_PAGE,
  ADMIN_PAGE_LEAD,
  ADMIN_PAGE_TITLE,
} from '@/components/admin/admin-page';
import { formatearHoras } from '@/lib/hours/format';
import {
  getAdminMetricas,
  getAdminStats,
  type AdminMetricas,
  type AdminMetricasPunto,
  type AdminStats,
  type AdminActividadRecienteItem,
  type AdminEstudianteEnRiesgo,
} from '@/lib/services/admin';

/** Mismo contenedor que el resto de bandejas administrativas (1400 px centrado). */
const PAGE_CLASS = ADMIN_PAGE;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Sin fecha';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'Hace un momento';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  return `Hace ${Math.floor(diff / 86400)} d`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Encabezado de sección: la jerarquía del panel se lee por estos cuatro títulos. */
function DashboardSection({
  titulo,
  className,
  children,
}: {
  titulo: string;
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={className}>
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
  /** Un conteo, o un valor ya formateado con su unidad (p. ej. «4.5 h»). */
  value: number | string;
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

/**
 * Fila KPI del bloque «Global»: misma información que una `StatCard` (icono,
 * etiqueta, valor y subtexto) en una sola línea, para apilar los dos totales
 * en una tarjeta compacta en vez de dos tarjetas grandes lado a lado.
 */
function StatRow({
  label,
  value,
  subtexto,
  icon: Icon,
}: {
  label: string;
  value: number;
  subtexto: string;
  icon: React.ElementType;
}) {
  return (
    // T-317 (A11Y-03/A11Y-07): el `<li>` conserva su papel de elemento de lista; el grupo con
    // nombre va en su contenido. Con `role="group"` en el `<li>`, la lista dejaba de anunciarse.
    <li>
      <div role="group" aria-label={label} className="flex items-center gap-inline px-card py-stack">
        <Icon className="size-5 shrink-0 text-text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="type-body font-semibold">{label}</p>
          <p className="type-meta">{subtexto}</p>
        </div>
        <span className="shrink-0 font-headline text-3xl font-bold tracking-tight tabular-nums text-text-primary">
          {value}
        </span>
      </div>
    </li>
  );
}

/**
 * Rejilla del panel. Desde `xl` son dos columnas (~69 % / ~31 %): las
 * secciones fluyen a la izquierda y el resumen de Sprints ocupa la derecha a
 * todo lo alto. Por debajo (tablet y móvil) es una sola columna en orden de
 * documento. El corte es `xl` y no `lg` porque la sidebar del shell ya resta
 * 16rem: a 1024 px la columna derecha quedaría en ~210 px.
 * La columna derecha no baja de 21rem: es lo que necesita el pie del widget
 * para caber en una línea.
 */
const PANEL_GRID = 'grid grid-cols-1 gap-section xl:grid-cols-[minmax(0,2.2fr)_minmax(21rem,1fr)] xl:gap-x-grid';
const COL_PRINCIPAL = 'min-w-0 xl:col-start-1';
// Los márgenes negativos cancelan el `pt-8`/`pb-12` de la página para que la
// columna mida el scroll completo: sin ellos el widget arranca 32 px bajo el
// centro y se despega en los últimos 48 px.
const COL_SPRINTS = 'min-w-0 xl:col-start-2 xl:row-span-6 xl:row-start-1 xl:-mb-12 xl:-mt-8';
/**
 * El resumen de Sprints acompaña el scroll: una caja `sticky` del alto visible
 * (viewport menos la topbar de 4rem; el scroll es del contenedor del shell,
 * no de la ventana) que centra el widget con márgenes automáticos. Si el
 * widget no cabe (ventanas bajas), los márgenes colapsan y la caja hace
 * scroll propio en vez de recortarlo. Solo desde `xl`.
 */
const SPRINTS_STICKY = 'xl:sticky xl:top-0 xl:flex xl:h-[calc(100dvh-4rem)] xl:overflow-y-auto xl:py-tight';

// ─── Skeleton loaders ─────────────────────────────────────────────────────────

function AdminStatsSkeleton() {
  return (
    <SkeletonRegion className={PAGE_CLASS} label="Cargando el panel de administración">
      <div className={PANEL_GRID}>
        <div className={COL_PRINCIPAL}>
          <Skeleton className="mb-tight h-3 w-28 rounded" />
          <Skeleton className="h-10 w-72 max-w-full rounded" />
          <Skeleton className="mt-tight h-5 w-96 max-w-full rounded" />
        </div>

        <div className={COL_PRINCIPAL}>
          <Skeleton className="mb-stack h-5 w-20 rounded" />
          <Skeleton className="h-40 rounded-card" />
        </div>

        <div className={COL_PRINCIPAL}>
          <Skeleton className="mb-stack h-5 w-28 rounded" />
          <Skeleton className="h-72 rounded-card" />
        </div>

        <div className={COL_SPRINTS}>
          <Skeleton className="h-96 rounded-card xl:h-[36rem]" />
        </div>

        <div className={COL_PRINCIPAL}>
          <Skeleton className="mb-stack h-5 w-32 rounded" />
          <div className="flex flex-col gap-grid">
            <Skeleton className="h-64 rounded-card" />
            <Skeleton className="h-64 rounded-card" />
          </div>
        </div>

        <div className={COL_PRINCIPAL}>
          <Skeleton className="mb-stack h-5 w-28 rounded" />
          <div className="grid grid-cols-1 gap-grid sm:grid-cols-2">
            <Skeleton className="h-36 rounded-card" />
            <Skeleton className="h-36 rounded-card" />
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}

// ─── Activity list ────────────────────────────────────────────────────────────

// Anchos compartidos por el encabezado de columnas y las filas (desde `sm`;
// en móvil la fila se apila y el encabezado se oculta). Las tres tablas del
// panel usan 11rem y 7rem centradas para sus dos últimas columnas.
const ACT_COL_ESTADO = 'flex shrink-0 sm:w-44 sm:justify-center';
const ACT_COL_ACCION = 'shrink-0 text-center sm:w-28';
/** Misma etiqueta de estado que las tarjetas de «Proyectos»; el cierre solicitado va en verde bosque fijo. */
const ACT_ETIQUETA = 'pill';
const actEstadoStyle = (estado: string) => (estado === 'EN_SOLICITUD_CIERRE' ? GOLD_BADGE : estadoBadgeStyle(estado));

function ActividadRecienteCard({ items }: { items: AdminActividadRecienteItem[] }) {
  const tituloId = useId();
  return (
    <section aria-labelledby={tituloId} className="card-base flex h-full flex-col overflow-hidden p-0">
      <header className="border-b border-outline-variant/50 px-card py-stack">
        <h3 id={tituloId} className="type-subtitle text-lg font-semibold">
          Actividad reciente
        </h3>
      </header>
      {items.length === 0 ? (
        <p className="type-body px-card py-stack text-text-secondary">No hay actividad reciente</p>
      ) : (
        <>
          {/* Encabezado de columnas: solo visual, calca los anchos de cada fila. */}
          <div
            aria-hidden="true"
            className="type-meta hidden items-center gap-inline border-b border-outline-variant/50 bg-surface-container-low px-card py-tight font-medium sm:flex"
          >
            <span className="min-w-0 flex-1">Proyecto</span>
            <span className={ACT_COL_ESTADO}>Estado</span>
            <span className={ACT_COL_ACCION}>Acción</span>
          </div>
          <ul className="divide-y divide-outline-variant/50">
            {items.map((item) => (
              <li
                key={item.idProyecto}
                className="flex flex-wrap items-center gap-x-inline gap-y-tight px-card py-inline transition-colors hover:bg-surface-container-low"
              >
                <div className="flex min-w-0 flex-1 basis-full items-center gap-inline sm:basis-48">
                  <IconoTipo tipo={item.tipoProyecto} />
                  <div className="min-w-0">
                    <p className="type-body line-clamp-1 font-semibold">{item.tituloProyecto}</p>
                    <p className="type-meta mt-micro">{timeAgo(item.fechaActualizacion)}</p>
                  </div>
                </div>
                <div className={ACT_COL_ESTADO}>
                  <span className={`${ACT_ETIQUETA} ${actEstadoStyle(item.estadoProyecto)}`}>
                    {estadoBadgeLabel(item.estadoProyecto)}
                  </span>
                </div>
                <Button asChild size="sm" className={`${ACT_COL_ACCION} text-xs font-semibold`}>
                  <Link href={adminProjectHref(item.idProyecto)}>Ver proyecto</Link>
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// ─── Risk students list ───────────────────────────────────────────────────────
// Mismas dos columnas finales que el resto de tablas del panel; en móvil se
// estrechan para dejar sitio al nombre.
const RIESGO_COL_SEMESTRE = 'w-16 shrink-0 text-center sm:w-44';
const RIESGO_COL_HORAS = 'flex w-24 shrink-0 justify-center sm:w-28';

function EstudiantesRiesgoCard({ items }: { items: AdminEstudianteEnRiesgo[] }) {
  const tituloId = useId();
  return (
    <section aria-labelledby={tituloId} className="card-base flex h-full flex-col overflow-hidden p-0">
      <header className="border-b border-outline-variant/50 px-card py-stack">
        <h3 id={tituloId} className="type-subtitle text-lg font-semibold text-balance">
          Estudiantes en riesgo de horas
        </h3>
        <p className="type-meta">Estudiantes del semestre 7 en adelante con pocas horas acumuladas</p>
      </header>
      {items.length === 0 ? (
        <p className="type-body px-card py-stack text-text-secondary">No hay estudiantes en riesgo</p>
      ) : (
        <>
          <div
            aria-hidden="true"
            className="flex items-center gap-inline border-b border-outline-variant/50 bg-surface-container-low px-card py-tight type-meta font-medium"
          >
            <span className="min-w-0 flex-1">Estudiante</span>
            <span className={RIESGO_COL_SEMESTRE}>Semestre</span>
            <span className={RIESGO_COL_HORAS}>Horas</span>
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
                <span className={`type-body ${RIESGO_COL_SEMESTRE} font-medium text-text-secondary`}>
                  {est.semestre !== null ? `S${est.semestre}` : '—'}
                </span>
                <span className={RIESGO_COL_HORAS}>
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
              className="type-meta -my-tight inline-flex items-center gap-micro rounded-control py-tight font-semibold text-primary outline-none motion-link focus-visible:ring-2 focus-visible:ring-primary/40"
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

// ─── Resumen de tendencias ────────────────────────────────────────────────────

/** Las tres métricas del resumen. El histórico completo, con sus gráficas, vive en la página de Tendencias. */
const RESUMEN_TENDENCIAS: Array<{
  serie: Exclude<keyof AdminMetricasPunto, 'inicio'>;
  label: string;
  icon: React.ElementType;
  esHoras?: boolean;
}> = [
  { serie: 'usuariosNuevos', label: 'Usuarios nuevos', icon: UserPlus },
  { serie: 'proyectosCreados', label: 'Proyectos creados', icon: FolderPlus },
  { serie: 'horasConfirmadas', label: 'Horas confirmadas', icon: Clock, esHoras: true },
];

/**
 * Resumen de «Tendencias de uso» (HU-178): el valor de la semana en curso de
 * tres métricas, sin gráficas —y por tanto sin recharts—. Usa la misma
 * consulta que la página de Tendencias (`['adminMetricas', 'semana']`), así
 * que comparten caché. Consulta por su cuenta: si falla, el resto del panel sigue.
 */
function ResumenTendencias() {
  const { data, isLoading, isError } = useQuery<AdminMetricas>({
    queryKey: ['adminMetricas', 'semana'],
    queryFn: () => getAdminMetricas('semana'),
  });
  const valor = (n: number, esHoras?: boolean) => (esHoras ? formatearHoras(String(Math.round(n * 100) / 100)) : n);

  return (
    <>
      {isLoading ? (
        <SkeletonRegion className="grid grid-cols-1 gap-grid sm:grid-cols-3" label="Cargando las tendencias de uso">
          {RESUMEN_TENDENCIAS.map((m) => (
            <Skeleton key={m.serie} className="h-36 rounded-card" />
          ))}
        </SkeletonRegion>
      ) : isError || !data ? (
        <p role="alert" className="card-base type-body text-text-secondary">
          No se pudo cargar el resumen de tendencias.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-grid sm:grid-cols-3">
          {RESUMEN_TENDENCIAS.map((m) => {
            const actual = data.serie[data.serie.length - 1]?.[m.serie] ?? 0;
            const total = data.serie.reduce((suma, punto) => suma + punto[m.serie], 0);
            return (
              <StatCard
                key={m.serie}
                label={m.label}
                value={valor(actual, m.esHoras)}
                subtexto={`Esta semana, aún en curso · ${valor(total, m.esHoras)} en las últimas 8 semanas`}
                icon={m.icon}
                iconBg="bg-surface-container-high"
                iconColor="text-tertiary"
              />
            );
          })}
        </div>
      )}
      <Link
        href={ADMIN_METRICS_ROUTE}
        className="type-meta mt-stack inline-flex items-center gap-micro rounded-control py-tight font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        Ver tendencias de uso
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function AdminPanelContent({ stats }: { stats: AdminStats }) {
  // Compatibilidad con `/dashboard/admin#metricas`, el destino que tuvo «Tendencias de uso» en el
  // menú (T-321): al llegar desde otra vista el panel aún muestra su esqueleto y el ancla no existe
  // cuando el navegador intenta desplazarse. Se repite el desplazamiento al montar el contenido.
  useEffect(() => {
    if (window.location.hash === `#${ADMIN_METRICS_ANCHOR}`) {
      document.getElementById(ADMIN_METRICS_ANCHOR)?.scrollIntoView?.();
    }
  }, []);

  return (
    <div className={PAGE_CLASS}>
      <div className={PANEL_GRID}>
        {/* Encabezado: primera fila de la columna principal, para que la
            columna de Sprints arranque arriba y quede centrada desde el inicio. */}
        <header className={COL_PRINCIPAL}>
          <Breadcrumb className="mb-4">
            <BreadcrumbList className="text-sm">
              <BreadcrumbItem>
                <BreadcrumbPage className="font-medium text-on-surface">Dashboard</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className={ADMIN_PAGE_TITLE}>
            Panel de Administración
          </h1>
          <p className={ADMIN_PAGE_LEAD}>
            Resumen general de actividad, usuarios y proyectos en UVGenius.
          </p>
        </header>

        {/* 1. Estado general: dos totales apilados en una tarjeta compacta. */}
        <DashboardSection titulo="Global" className={COL_PRINCIPAL}>
          <ul className="card-base divide-y divide-outline-variant/50 overflow-hidden p-0">
            <StatRow
              label="Proyectos Activos"
              value={stats.proyectosActivos}
              subtexto="Actualmente publicados o en progreso"
              icon={FolderKanban}
            />
            <StatRow
              label="Usuarios Activos"
              value={stats.usuariosActivos}
              subtexto="Cuentas activas en la plataforma"
              icon={Users}
            />
          </ul>
        </DashboardSection>

        {/* 2. Operación: lo que espera una decisión. La cola termina donde
            termina su contenido; ya no comparte fila con el calendario. */}
        <DashboardSection titulo="Operación" className={COL_PRINCIPAL}>
          <AdminAttentionQueue
            enRevision={stats.enRevision}
            cierrePendiente={stats.cierrePendiente}
            usuariosBloqueados={stats.usuariosBloqueados}
          />
        </DashboardSection>

        {/* Planificación de Sprints. En el documento va tras Operación (ese es
            su orden en tablet y móvil); desde `xl` ocupa la columna derecha.
            Consulta por su cuenta: si falla, el resto del panel sigue. */}
        <aside aria-label="Planificación de Sprints" className={COL_SPRINTS}>
          <div className={SPRINTS_STICKY}>
            <div className="w-full xl:my-auto">
              <AdminSprintPlanningWidget />
            </div>
          </div>
        </aside>

        {/* 3. Seguimiento */}
        <DashboardSection titulo="Seguimiento" className={COL_PRINCIPAL}>
          {/* Apiladas: en la columna principal cada lista necesita el ancho
              completo para que sus filas se lean en una sola línea. */}
          <div className="flex flex-col gap-grid">
            <ActividadRecienteCard items={stats.actividadReciente} />
            <EstudiantesRiesgoCard items={stats.estudiantesEnRiesgo} />
          </div>
        </DashboardSection>

        {/* 4. Datos del período: históricos, al final para no competir con la operación. */}
        <DashboardSection titulo="Datos 2026" className={COL_PRINCIPAL}>
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

        {/* 5. Tendencias de uso (HU-178): solo un resumen; las gráficas están en su página.
            El `id` conserva el destino de los enlaces antiguos a `#metricas`, y `scroll-mt`
            deja aire arriba al llegar por ellos. */}
        <div id={ADMIN_METRICS_ANCHOR} className={`${COL_PRINCIPAL} scroll-mt-6`}>
          <DashboardSection titulo="Tendencias de uso">
            <ResumenTendencias />
          </DashboardSection>
        </div>
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
