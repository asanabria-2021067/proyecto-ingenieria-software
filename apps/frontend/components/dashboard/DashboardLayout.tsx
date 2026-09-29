'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  FolderOpen,
  Briefcase,
  FileText,
  ListChecks,
  CalendarDays,
  Clock,
  RotateCcw,
  Users,
  Archive,
  Search as SearchIcon,
} from 'lucide-react';
import { useCurrentUser, isAdminUser } from '@/hooks/use-current-user';
import { useLogout } from '@/hooks/use-logout';
import { NotificationsBell } from '@/components/layout/notifications-bell';
import { GlobalSearchInput } from '@/components/layout/global-search-input';
import { UserMenu } from '@/components/dashboard/UserMenu';
import {
  SidebarNav,
  flattenNavEntries,
  type NavEntry,
} from '@/components/dashboard/SidebarNav';
import { useDashboardSidebarCollapsed } from '@/components/dashboard/use-dashboard-sidebar-collapsed';
import { useRealtimeNotifications } from '@/lib/hooks/useRealtimeNotifications';
import { getNotificationLink } from '@/lib/services/notifications';
import { ProjectFinalizationBannerHost } from '@/components/projects/project-finalization-banner-host';
import { toast } from 'sonner';
import logo from '@/public/logo.png';
import OnboardingTour from '@/components/dashboard/OnboardingTour';
import { ThemeToggle } from '@/components/theme-toggle';
import { FontScaleToggle } from '@/components/font-scale-toggle';

const navEntries: NavEntry[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    exact: true,
  },
  { href: '/dashboard/personas', label: 'Personas', icon: Users },
  {
    type: 'group',
    label: 'Proyectos',
    icon: Briefcase,
    items: [
      {
        href: '/dashboard/proyectos',
        label: 'Explorar Proyectos',
        icon: FolderOpen,
        // Solo la lista: las vistas de un proyecto (/dashboard/proyectos/:id/…)
        // tienen su propia sidebar y no son «Explorar».
        exact: true,
      },
      {
        href: '/dashboard/projects/mine',
        label: 'Mis Proyectos',
        icon: Briefcase,
      },
    ],
  },
  {
    type: 'group',
    label: 'Mi trabajo',
    icon: ListChecks,
    items: [
      { href: '/dashboard/mis-tareas', label: 'Mis Tareas', icon: ListChecks },
      { href: '/dashboard/mis-horas', label: 'Mis Horas', icon: Clock },
      {
        href: '/dashboard/calendario',
        label: 'Calendario',
        icon: CalendarDays,
      },
      {
        href: '/dashboard/mis-postulaciones',
        label: 'Mis Postulaciones',
        icon: FileText,
      },
      {
        href: '/dashboard/chats/archivados',
        label: 'Chats archivados',
        icon: Archive,
      },
    ],
  },
];

const navItemsMobile = flattenNavEntries(navEntries);

export default function DashboardLayout({
  children,
  allowAdmin = false,
}: {
  children: React.ReactNode;
  allowAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = useCurrentUser();
  const { latestNotification, isConnected: notificationsConnected } =
    useRealtimeNotifications(!!user);
  const handleLogout = useLogout();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const { collapsed: sidebarCollapsed } = useDashboardSidebarCollapsed();

  useEffect(() => {
    if (!allowAdmin && !isLoading && isAdminUser(user)) {
      router.replace('/dashboard/admin');
    }
  }, [user, isLoading, router, allowAdmin]);

  // Sin sesión válida (cookie ausente o refresh_token ya expirado/revocado
  // tras el reintento silencioso en apiFetch): de vuelta al login en vez de
  // quedarse atascado en el spinner de isLoading.
  useEffect(() => {
    if (!isLoading && isError) {
      router.replace('/login');
    }
  }, [isLoading, isError, router]);

  useEffect(() => {
    if (!latestNotification) return;

    queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
    queryClient.invalidateQueries({ queryKey: ['notificaciones', 'conteo'] });

    const href = getNotificationLink(latestNotification);
    toast(latestNotification.tituloNotificacion, {
      description: latestNotification.mensajeNotificacion,
      duration: 6000,
      action: href ? { label: 'Ver', onClick: () => router.push(href) } : undefined,
    });
  }, [latestNotification, queryClient, router]);

  if (isLoading || isError || (!allowAdmin && isAdminUser(user))) {
    return (
      <div className="h-screen bg-surface flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex overflow-hidden overscroll-none bg-page">
      <a href="#dashboard-main" className="skip-link">
        Saltar al contenido principal
      </a>

      {/* Sidebar - Desktop Only */}
      <aside
        className={`${sidebarCollapsed ? 'sidebar-scale-lock-collapsed' : 'sidebar-scale-lock'} hidden h-full shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-outline-variant bg-card md:flex`}
      >
        <div
          className={`flex items-center gap-inline border-b border-outline-variant py-stack ${sidebarCollapsed ? 'justify-center px-tight' : 'px-card'}`}
        >
          <Image src={logo} alt="UVGENIUS" className="h-10 w-auto shrink-0" />
          {!sidebarCollapsed && <span className="type-section text-text-primary">UVGenius</span>}
        </div>

        <SidebarNav entries={navEntries} idUsuario={user?.idUsuario ?? null} />

        <div className={`border-t border-outline-variant py-stack ${sidebarCollapsed ? 'flex justify-center px-tight' : 'px-inline'}`}>
          <UserMenu user={user} onLogout={handleLogout} variant={sidebarCollapsed ? 'compact' : 'sidebar'} />
        </div>
      </aside>

      {/* Main Content Area */}
      <main
        id="dashboard-main"
        tabIndex={-1}
        className="flex min-w-0 flex-1 flex-col overflow-hidden bg-page focus:outline-none"
      >
        {/* Top Header Bar */}
        <header className="z-30 flex h-16 shrink-0 items-center justify-between gap-inline border-b border-outline-variant bg-card px-stack md:grid md:grid-cols-[1fr_auto_1fr] md:px-section">
          <div className="flex items-center gap-inline">
            {/* Mobile-only logo */}
            <div className="flex items-center gap-tight md:hidden">
              <Image src={logo} alt="UVGENIUS" className="h-8 w-auto" />
              <span className="type-subtitle text-text-primary">UVGenius</span>
            </div>
            <button
              type="button"
              onClick={() => setMobileSearchOpen((v) => !v)}
              aria-label="Buscar"
              aria-expanded={mobileSearchOpen}
              className="flex size-9 items-center justify-center rounded-control text-text-secondary hover:bg-surface-container-high hover:text-text-primary md:hidden"
            >
              <SearchIcon className="size-5" aria-hidden="true" />
            </button>
            <div className="hidden md:block">
              <FontScaleToggle />
            </div>
          </div>
          <div className="hidden md:block">
            <GlobalSearchInput className="w-64 lg:w-96" />
          </div>
          <div className="flex items-center gap-tight md:justify-self-end">
            {!!user && (
              <span
                role="status"
                title={
                  notificationsConnected
                    ? 'Notificaciones en vivo conectadas'
                    : 'Reconectando notificaciones en vivo…'
                }
                aria-label={
                  notificationsConnected
                    ? 'Notificaciones en vivo conectadas'
                    : 'Reconectando notificaciones en vivo'
                }
                className={`size-2 shrink-0 rounded-full ${
                  notificationsConnected
                    ? 'bg-status-success'
                    : 'animate-pulse bg-status-warning'
                }`}
              />
            )}
            <NotificationsBell onlyIcon />
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(new Event('start-onboarding-tour'))
              }
              aria-label="Repetir tour de bienvenida"
              className="flex size-10 items-center justify-center rounded-control bg-muted text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
            >
              <RotateCcw className="size-5" aria-hidden="true" />
            </button>
            <div id="dashboard-theme-toggle">
              <ThemeToggle />
            </div>
            <div
              id="dashboard-account-menu"
              className="hidden border-l border-outline-variant pl-tight lg:block"
            >
              <UserMenu user={user} onLogout={handleLogout} variant="compact" />
            </div>
          </div>
        </header>

        {mobileSearchOpen && (
          <div className="border-b border-outline-variant bg-card px-stack py-tight md:hidden">
            <GlobalSearchInput
              autoFocus
              onNavigate={() => setMobileSearchOpen(false)}
              className="w-full"
            />
          </div>
        )}

        {/* F6: franja global de bloqueo por finalización de Sprint — fuera del
            área con scroll para que no desaparezca al desplazar la página,
            en flujo normal (no fixed/overlay). Host único: decide por sí
            mismo si la ruta actual es project-scoped, sin duplicarse por
            página. */}
        <ProjectFinalizationBannerHost />

        {/* Scrollable page body */}
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain pb-20 md:pb-0">
          {children}
        </div>
      </main>

      {/* Bottom Navigation Bar - Mobile Only */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-outline-variant bg-card px-tight pb-safe shadow-card md:hidden">
        {navItemsMobile.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              id={`nav-item-mobile-${label.toLowerCase().replace(/\s+/g, '-')}`}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={`flex h-12 w-12 flex-col items-center justify-center rounded-control transition-all duration-200 ${
                active
                  ? 'bg-action text-on-action'
                  : 'text-text-secondary hover:bg-muted hover:text-text-primary'
              }`}
              title={label}
            >
              <Icon className="w-6 h-6 shrink-0" />
            </Link>
          );
        })}
        <UserMenu user={user} onLogout={handleLogout} variant="compact" />
      </nav>

      <OnboardingTour />
    </div>
  );
}
