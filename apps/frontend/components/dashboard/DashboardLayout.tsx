'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
  Compass,
  Network,
  Search as SearchIcon,
} from 'lucide-react';
import { useCurrentUser, isAdminUser } from '@/hooks/use-current-user';
import { useLogout } from '@/hooks/use-logout';
import { NotificationsBell } from '@/components/layout/notifications-bell';
import { GlobalSearchInput } from '@/components/layout/global-search-input';
import { UserMenu } from '@/components/dashboard/UserMenu';
import {
  DashboardSidebarCollapseButton,
  SidebarNav,
  flattenNavEntries,
  type NavEntry,
} from '@/components/dashboard/SidebarNav';
import { useDashboardSidebarCollapsed } from '@/components/dashboard/use-dashboard-sidebar-collapsed';
import { useRealtimeNotifications } from '@/lib/hooks/useRealtimeNotifications';
import { getNotificationLink } from '@/lib/services/notifications';
import { resolveCommentNotificationLink } from '@/components/notifications/comment-notification-link';
import { ProjectFinalizationBannerHost } from '@/components/projects/project-finalization-banner-host';
import { AnuncioBanner } from '@/components/anuncios/anuncio-banner';
import { ChatDockProvider } from '@/components/chat-dock/chat-dock-context';
import { ChatDock } from '@/components/chat-dock/chat-dock';
import { toast } from 'sonner';
import logo from '@/public/logo.png';
import { ThemeToggle } from '@/components/theme-toggle';
import { FontScaleToggle } from '@/components/font-scale-toggle';
import { ShellSkeleton } from '@/components/layout/shell-skeleton';

// T-293: la guía solo se muestra a quien entra por primera vez, pero react-joyride viajaba en el
// JS inicial de todas las rutas del estudiante. Se carga aparte; no pinta nada hasta arrancar.
const OnboardingTour = dynamic(() => import('@/components/dashboard/OnboardingTour'), { ssr: false });

const navEntries: NavEntry[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    type: 'group',
    label: 'Personas',
    icon: Users,
    // La barra inferior móvil no tiene sitio para tres destinos: conserva uno solo.
    mobile: { href: '/dashboard/personas', label: 'Personas', icon: Users },
    items: [
      // Sin `exact`: el perfil de una persona (/dashboard/personas/:id) sigue dentro del grupo.
      { href: '/dashboard/personas', label: 'Descubrir personas', icon: Compass },
      { href: '/dashboard/personas?seccion=amigos', label: 'Mis amigos', icon: Users },
      { href: '/dashboard/personas?seccion=amigos-de-amigos', label: 'Amigos de amigos', icon: Network },
    ],
  },
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

/** `useSearchParams` exige un límite de Suspense en el prerender: se aísla aquí (mismo patrón que AdminLayout). */
function DashboardSidebarNav({ idUsuario }: { idUsuario: number | null }) {
  const searchParams = useSearchParams();
  return <SidebarNav entries={navEntries} idUsuario={idUsuario} search={searchParams?.toString() ?? ''} />;
}

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

    // HU-200: una mención o un comentario nuevo enlazan al comentario desde el aviso en vivo.
    const href = getNotificationLink(latestNotification) ?? resolveCommentNotificationLink(latestNotification);
    toast(latestNotification.tituloNotificacion, {
      description: latestNotification.mensajeNotificacion,
      duration: 6000,
      action: href ? { label: 'Ver', onClick: () => router.push(href) } : undefined,
    });
  }, [latestNotification, queryClient, router]);

  if (isLoading || isError || (!allowAdmin && isAdminUser(user))) {
    return <ShellSkeleton />;
  }

  return (
    <ChatDockProvider>
    <div className="fixed inset-0 flex overflow-hidden overscroll-none bg-page">
      <a href="#dashboard-main" className="skip-link">
        Saltar al contenido principal
      </a>

      {/* Sidebar - Desktop Only. Misma barra que AdminLayout (`admin-sidebar`) con la paleta salvia del
          estudiante (`student-sidebar`): marca sobre tarjeta marfil, grupos desplegables y transición de ancho al plegarla.
          Conserva su ancho con escala de fuente (`sidebar-scale-lock*`). */}
      <aside
        data-slot="dashboard-sidebar"
        data-collapsed={sidebarCollapsed || undefined}
        className={`admin-sidebar student-sidebar ${sidebarCollapsed ? 'sidebar-scale-lock-collapsed' : 'sidebar-scale-lock'} hidden h-full shrink-0 flex-col overflow-y-auto overflow-x-hidden overscroll-contain transition-[width] duration-200 md:flex`}
      >
        {/* h-16 = alto de la topbar: el divisor de la marca continúa su borde inferior. */}
        <div
          className={`admin-sidebar-brand flex h-16 shrink-0 items-center gap-3 ${sidebarCollapsed ? 'justify-center px-2' : 'px-5'}`}
        >
          <span className="admin-brand-logo flex size-13 shrink-0 items-center justify-center rounded-lg border p-1.5">
            <Image src={logo} alt="UVGENIUS" className="h-full w-auto object-contain" />
          </span>
          {!sidebarCollapsed && (
            <>
              <span className="admin-sidebar-brand-name font-headline text-xl font-bold tracking-tight">UVGenius</span>
              <DashboardSidebarCollapseButton />
            </>
          )}
        </div>

        <Suspense fallback={<SidebarNav entries={navEntries} idUsuario={user?.idUsuario ?? null} />}>
          <DashboardSidebarNav idUsuario={user?.idUsuario ?? null} />
        </Suspense>

        {/* Único acceso a la cuenta en escritorio y tableta; en móvil está en la barra inferior. */}
        <div
          id="dashboard-account-menu"
          className={`admin-sidebar-footer py-4 ${sidebarCollapsed ? 'flex justify-center px-2' : 'px-3'}`}
        >
          <UserMenu user={user} onLogout={handleLogout} variant={sidebarCollapsed ? 'compact' : 'sidebar'} theme="admin" menuClassName="student-account-menu" />
        </div>
      </aside>

      {/* Main Content Area */}
      <main
        id="dashboard-main"
        tabIndex={-1}
        className="flex min-w-0 flex-1 flex-col overflow-hidden bg-page focus:outline-none"
      >
        {/* Top Header Bar */}
        {/* H-08: la columna central tiene un ancho MÁXIMO (16rem, 24rem desde lg) y puede
            encoger. Con `auto` el buscador exigía sus 16rem fijos y, a 768 px con la barra
            lateral abierta, empujaba fuera de la ventana los últimos controles de la derecha. */}
        <header className="z-30 flex h-16 shrink-0 items-center justify-between gap-inline border-b border-outline-variant bg-card px-stack md:grid md:grid-cols-[1fr_minmax(0,16rem)_1fr] md:px-section lg:grid-cols-[1fr_minmax(0,24rem)_1fr]">
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
          <div className="hidden min-w-0 md:block">
            <GlobalSearchInput className="w-full" />
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
              className="flex size-10 items-center justify-center rounded-md bg-muted text-text-secondary motion-icon hover:bg-surface-container-high hover:text-text-primary"
            >
              <RotateCcw className="size-5" aria-hidden="true" />
            </button>
            <div id="dashboard-theme-toggle">
              <ThemeToggle />
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
        <AnuncioBanner />

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
      <ChatDock />
    </div>
    </ChatDockProvider>
  );
}
