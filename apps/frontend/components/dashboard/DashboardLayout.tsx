'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  FolderOpen,
  Briefcase,
  FileText,
  ListChecks,
  RotateCcw,
  Users,
} from 'lucide-react';
import { useCurrentUser, isAdminUser } from '@/hooks/use-current-user';
import { useLogout } from '@/hooks/use-logout';
import { NotificationsBell } from '@/components/layout/notifications-bell';
import { UserMenu } from '@/components/dashboard/UserMenu';
import {
  SidebarNav,
  flattenNavEntries,
  type NavEntry,
} from '@/components/dashboard/SidebarNav';
import { useRealtimeNotifications } from '@/lib/hooks/useRealtimeNotifications';
import { getNotificationLink } from '@/lib/services/notifications';
import { ProjectFinalizationBannerHost } from '@/components/projects/project-finalization-banner-host';
import uvgSwal from '@/lib/swal';
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
      {
        href: '/dashboard/mis-postulaciones',
        label: 'Mis Postulaciones',
        icon: FileText,
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
    uvgSwal.fire({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 6000,
      timerProgressBar: true,
      icon: 'info',
      title: latestNotification.tituloNotificacion,
      text: latestNotification.mensajeNotificacion,
      didOpen: (popup) => {
        if (!href) return;
        popup.style.cursor = 'pointer';
        popup.addEventListener('click', () => {
          router.push(href);
          uvgSwal.close();
        });
      },
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
    <div className="fixed inset-0 flex items-start gap-3 overflow-hidden overscroll-none bg-page p-3 md:gap-4 md:p-4">
      <a href="#dashboard-main" className="skip-link">
        Saltar al contenido principal
      </a>

      {/* Sidebar - Desktop Only */}
      <aside className="hidden h-full w-[231px] shrink-0 flex-col overflow-y-auto overscroll-contain rounded-3xl border border-outline-variant bg-card shadow-card md:flex">
        <div className="flex items-center gap-inline border-b border-outline-variant px-card py-stack">
          <Image src={logo} alt="UVGENIUS" className="h-10 w-auto" />
          <span className="type-section text-text-primary">UVGenius</span>
        </div>

        <SidebarNav entries={navEntries} />

        <div className="border-t border-outline-variant px-inline py-stack">
          <UserMenu user={user} onLogout={handleLogout} variant="sidebar" />
        </div>
      </aside>

      {/* Main Content Area */}
      <main
        id="dashboard-main"
        tabIndex={-1}
        className="flex h-full min-w-0 flex-1 flex-col gap-3 overflow-hidden bg-page focus:outline-none md:gap-4"
      >
        {/* Top Header Bar */}
        <header className="z-30 flex h-16 shrink-0 items-center justify-between gap-inline rounded-3xl border border-outline-variant bg-card px-stack shadow-card md:px-section">
          <div className="flex items-center gap-inline">
            {/* Mobile-only logo */}
            <div className="flex items-center gap-tight md:hidden">
              <Image src={logo} alt="UVGENIUS" className="h-8 w-auto" />
              <span className="type-subtitle text-text-primary">UVGenius</span>
            </div>
            {/* Reemplaza al buscador del mockup: el control de tamaño de
                fuente ya existente ocupa el mismo lugar prominente. */}
            <div className="hidden md:block">
              <FontScaleToggle />
            </div>
          </div>
          <div className="flex items-center gap-tight">
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
