'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Archive,
  CalendarRange,
  Clock,
  FileSearch,
  FolderKanban,
  FolderOpen,
  Gavel,
  KeyRound,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  UserCheck,
  Users,
  RotateCcw,
  Tags,
} from 'lucide-react';
import { useCurrentUser } from '@/hooks/use-current-user';
import { avisarSinPermiso, useCan, RUTA_SIN_PERMISO } from '@/hooks/use-can';
import { useLogout } from '@/hooks/use-logout';
import { useCuentasPendientes } from '@/hooks/use-cuentas-pendientes';
import { NotificationsBell } from '@/components/layout/notifications-bell';
import { UserMenu } from '@/components/dashboard/UserMenu';
import {
  DashboardSidebarCollapseButton,
  SidebarNav,
  type NavEntry,
  type NavLeaf,
} from '@/components/dashboard/SidebarNav';
import { useAdminSidebarCollapsed } from '@/components/dashboard/use-dashboard-sidebar-collapsed';
import { ThemeToggle } from '@/components/theme-toggle';
import logo from '@/public/logo.png';

export const ADMIN_CUENTAS_PENDIENTES_HREF = '/dashboard/admin/cuentas-pendientes';

/**
 * S7 (VIEW-12, F011). Los cuatro grupos de «Proyectos» son EXACTAMENTE los del
 * backend (`GET /admin/proyectos?grupo=activos|revision|cierres|cerrados`); no
 * existe un quinto. «Solicitudes de publicación» conserva su ruta: es la bandeja de
 * revisiones de PUBLICACIÓN (V5 §31.2), un flujo distinto del cierre.
 * «Calendario de Sprints» cierra el grupo como vista de supervisión, no como
 * un grupo más de la bandeja.
 */
export const adminNavEntries: NavEntry[] = [
  { href: '/dashboard/admin', label: 'Panel Admin', icon: LayoutDashboard, exact: true },
  {
    type: 'group',
    label: 'Proyectos',
    icon: FolderKanban,
    items: [
      { href: '/dashboard/admin/proyectos?grupo=activos', label: 'Activos', icon: FolderOpen },
      // La revisión de publicación es su propio flujo, no un grupo de la
      // bandeja: se enlaza aquí para que los cuatro destinos de Proyectos
      // sigan juntos, y no se repite abajo como entrada suelta.
      { href: '/dashboard/projects/admin/reviews', label: 'Solicitudes de publicación', icon: FileSearch },
      { href: '/dashboard/admin/proyectos?grupo=cierres', label: 'Solicitudes de cierre', icon: Clock },
      { href: '/dashboard/admin/proyectos?grupo=cerrados', label: 'Cerrados', icon: Archive },
      // No es un grupo de la bandeja: es la supervisión temporal de los Sprints
      // operables de los proyectos activos (mismo icono que su widget del panel).
      { href: '/dashboard/admin/sprints', label: 'Calendario de Sprints', icon: CalendarRange },
    ],
  },
  {
    type: 'group',
    label: 'Gobernanza',
    icon: ShieldCheck,
    items: [{ href: '/dashboard/admin/apelaciones', label: 'Apelaciones', icon: Gavel }],
  },
  {
    type: 'group',
    label: 'Administración',
    icon: Settings2,
    items: [
      { href: '/dashboard/admin/usuarios', label: 'Gestión de Usuarios', icon: Users },
      { href: ADMIN_CUENTAS_PENDIENTES_HREF, label: 'Cuentas pendientes', icon: UserCheck },
      { href: '/dashboard/admin/solicitudes-recuperacion', label: 'Recuperación de contraseña', icon: KeyRound },
      // TEMPORAL: inventario de etiquetas para revisión de diseño; quitar junto con su página.
      { href: '/dashboard/admin/etiquetas', label: 'Etiquetas (temporal)', icon: Tags },
    ],
  },
];

/**
 * Barra inferior móvil: `flattenNavEntries` produciría 9 destinos y la
 * saturaría. Lista CURADA de 5 (Panel · Proyectos · Apelaciones · Usuarios ·
 * Perfil, este último vía `UserMenu`); el resto queda accesible desde la
 * sidebar de escritorio.
 */
export const adminNavItemsMobile: NavLeaf[] = [
  { href: '/dashboard/admin', label: 'Panel Admin', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/admin/proyectos', label: 'Proyectos', icon: FolderKanban },
  { href: '/dashboard/admin/apelaciones', label: 'Apelaciones', icon: Gavel },
  { href: '/dashboard/admin/usuarios', label: 'Gestión de Usuarios', icon: Users },
];

/** `useSearchParams` exige un límite de Suspense en el prerender: se aísla aquí. */
function AdminSidebarNav({ entries }: { entries: NavEntry[] }) {
  const searchParams = useSearchParams();
  return <SidebarNav entries={entries} theme="admin" search={searchParams?.toString() ?? ''} />;
}

function withCuentasPendientes(entries: NavEntry[], total: number): NavEntry[] {
  if (total <= 0) return entries;
  return entries.map((entry) =>
    entry.type === 'group'
      ? {
          ...entry,
          items: entry.items.map((item) =>
            item.href === ADMIN_CUENTAS_PENDIENTES_HREF ? { ...item, badge: total } : item,
          ),
        }
      : entry,
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: user, isLoading, isError } = useCurrentUser();
  const handleLogout = useLogout();
  const { collapsed } = useAdminSidebarCollapsed();

  const esAdmin = useCan('admin.panel');
  const { data: cuentasPendientes } = useCuentasPendientes(esAdmin);
  const totalPendientes = cuentasPendientes?.total ?? 0;
  const navEntries = useMemo(
    () => withCuentasPendientes(adminNavEntries, totalPendientes),
    [totalPendientes],
  );

  // «Actualizar» de la barra superior: invalida las consultas y React Query
  // vuelve a pedir las que la vista actual tiene montadas.
  const queryClient = useQueryClient();
  const [actualizando, setActualizando] = useState(false);
  const actualizar = async () => {
    setActualizando(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      setActualizando(false);
    }
  };

  useEffect(() => {
    if (isLoading) return;
    if (isError) {
      router.replace('/login');
    } else if (!esAdmin) {
      // HU-178 (T-302): quien no es administrador vuelve a su dashboard.
      avisarSinPermiso();
      router.replace(RUTA_SIN_PERMISO);
    }
  }, [isLoading, isError, esAdmin, router]);

  if (isLoading || isError || !esAdmin) {
    return (
      <div className="h-screen bg-surface flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-surface flex overflow-hidden">
      {/* Sidebar - Desktop Only */}
      <aside
        data-slot="admin-sidebar"
        data-collapsed={collapsed || undefined}
        className={`admin-sidebar hidden md:flex ${collapsed ? 'w-[72px]' : 'w-64'} h-screen flex-col shrink-0 overflow-y-auto overflow-x-hidden transition-[width] duration-200`}
      >
        {/* h-16 = alto de la topbar: el divisor de la marca continúa su borde inferior. */}
        <div
          data-slot="admin-sidebar-brand"
          className={`admin-sidebar-brand flex h-16 shrink-0 items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-5'}`}
        >
          {/* El escudo oficial sobre una tarjeta marfil: sus detalles dorados y
              oscuros no contrastan con el verde bosque ni con el grafito. 52 px
              y no más: la marca mide lo mismo que la topbar (h-16). */}
          <span
            data-slot="admin-brand-logo"
            className="admin-brand-logo flex size-13 shrink-0 items-center justify-center rounded-lg border p-1.5"
          >
            <Image src={logo} alt="UVGENIUS" className="h-full w-auto object-contain" />
          </span>
          {!collapsed && (
            <>
              <span className="admin-sidebar-brand-name font-headline text-xl font-bold tracking-tight">UVGenius</span>
              <DashboardSidebarCollapseButton theme="admin" />
            </>
          )}
        </div>

        {!collapsed && (
          <p
            data-slot="admin-nav-section-label"
            className="admin-nav-section-label px-6 pt-6 text-[11px] font-semibold uppercase tracking-wider"
          >
            Administración
          </p>
        )}

        <Suspense fallback={<SidebarNav entries={navEntries} theme="admin" />}>
          <AdminSidebarNav entries={navEntries} />
        </Suspense>

        <div
          data-slot="admin-sidebar-footer"
          className={`admin-sidebar-footer py-4 ${collapsed ? 'flex justify-center px-2' : 'px-3'}`}
        >
          <UserMenu user={user} onLogout={handleLogout} variant={collapsed ? 'compact' : 'sidebar'} theme="admin" />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-surface">
        {/* Top Header Bar */}
        <header className="h-16 border-b border-outline-variant px-4 md:px-8 flex items-center justify-between shrink-0 bg-surface-container-low z-30">
          <div className="flex items-center gap-3">
            <div className="md:hidden flex items-center gap-2">
              <Image src={logo} alt="UVGENIUS" className="h-8 w-auto" />
              <span className="font-headline font-black text-base text-primary">UVGenius</span>
            </div>
            <span className="hidden md:inline font-headline font-bold text-sm text-tertiary">
              Universidad del Valle de Guatemala
            </span>
          </div>
          <div className="flex items-center gap-3">
            <NotificationsBell onlyIcon />
            {/* Mismo botón de icono de la barra del estudiante. Vuelve a pedir
                los datos de la vista actual: sustituye a los «Actualizar»
                que cada página administrativa llevaba en su encabezado. */}
            <button
              type="button"
              onClick={actualizar}
              disabled={actualizando}
              aria-label="Actualizar"
              title="Actualizar"
              className="flex size-10 items-center justify-center rounded-control bg-muted text-text-secondary outline-none transition-colors hover:bg-surface-container-high hover:text-text-primary focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60"
            >
              <RotateCcw
                className={`size-5 ${actualizando ? 'motion-safe:animate-spin [animation-direction:reverse]' : ''}`}
                aria-hidden="true"
              />
            </button>
            <ThemeToggle />
          </div>
        </header>

        {/* Scrollable page body */}
        <div className="flex-1 overflow-auto pb-20 md:pb-0">
          {children}
        </div>
      </main>

      {/* Bottom Navigation - Mobile Only */}
      <nav
        aria-label="Navegación administrativa móvil"
        className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-container-low border-t border-outline-variant flex items-center justify-around z-40 pb-safe shadow-lg px-2"
      >
        {adminNavItemsMobile.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-200 ${
                active ? 'text-primary bg-primary/10' : 'text-outline hover:text-on-surface'
              }`}
              title={label}
            >
              <Icon className="w-6 h-6 shrink-0" />
            </Link>
          );
        })}
        <UserMenu user={user} onLogout={handleLogout} variant="compact" theme="admin" />
      </nav>
    </div>
  );
}
