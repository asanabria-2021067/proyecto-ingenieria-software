'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, FolderOpen, Briefcase, FileText, Bell, User, LogOut } from 'lucide-react';
import { useCurrentUser, isAdminUser } from '@/hooks/use-current-user';
import { NotificationsBell } from '@/components/layout/notifications-bell';
import { TokenRefreshManager } from '@/components/TokenRefreshManager';
import { clearTokens, getAccessToken } from '@/lib/utils/token';
import { useRealtimeNotifications } from '@/lib/hooks/useRealtimeNotifications';
import { getNotificationLink } from '@/lib/services/notifications';
import uvgSwal from '@/lib/swal';
import logo from '@/public/logo.png';
import OnboardingTour from '@/components/dashboard/OnboardingTour';
import { ThemeToggle } from '@/components/theme-toggle';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/proyectos', label: 'Explorar Proyectos', icon: FolderOpen },
  { href: '/dashboard/projects/mine', label: 'Mis Proyectos', icon: Briefcase },
  { href: '/dashboard/mis-postulaciones', label: 'Mis Postulaciones', icon: FileText },
  { href: '/dashboard/notificaciones', label: 'Notificaciones', icon: Bell },
  { href: '/dashboard/perfil', label: 'Perfil', icon: User },
];

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
  const { data: user, isLoading } = useCurrentUser();
  const { latestNotification } = useRealtimeNotifications(getAccessToken());

  useEffect(() => {
    if (!allowAdmin && !isLoading && isAdminUser(user)) {
      router.replace('/dashboard/admin');
    }
  }, [user, isLoading, router, allowAdmin]);

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

  if (isLoading || (!allowAdmin && isAdminUser(user))) {
    return (
      <div className="h-screen bg-surface flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const handleLogout = async () => {
    const result = await uvgSwal.fire({
      icon: 'question',
      title: 'Cerrar sesion',
      text: 'Tu sesion actual se cerrara en este dispositivo.',
      showCancelButton: true,
      confirmButtonText: 'Si, cerrar sesion',
      cancelButtonText: 'Cancelar',
    });

    if (!result.isConfirmed) return;

    clearTokens();
    queryClient.clear();
    router.replace('/login');
  };

  return (
    <div className="fixed inset-0 flex overflow-hidden overscroll-none bg-surface">
      <a href="#dashboard-main" className="skip-link">
        Saltar al contenido principal
      </a>
      <TokenRefreshManager />
      
      {/* Sidebar - Desktop Only */}
      <aside className="hidden h-full w-64 shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-outline-variant bg-surface-container-low md:flex">
        <div className="px-6 py-5 border-b border-outline-variant flex items-center gap-3">
          <Image src={logo} alt="UVGENIUS" className="h-10 w-auto" />
          <span className="font-headline font-extrabold text-xl text-primary">UVGenius</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                id={`nav-item-${label.toLowerCase().replace(/\s+/g, '-')}`}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/30 ${
                  active
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-outline-variant space-y-3">
          {user && (
            <div className="flex items-center gap-3 px-3 py-2">
              {user.fotoUrl ? (
                <Image
                  src={user.fotoUrl}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full object-cover border border-outline-variant/30"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-primary-container flex items-center justify-center text-xs font-bold text-on-primary-container">
                  {user.nombre[0]}{user.apellido[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-on-surface truncate">
                  {user.nombre} {user.apellido}
                </p>
                <p className="text-xs text-tertiary truncate">{user.correo}</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="flex cursor-pointer items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-tertiary hover:bg-primary hover:text-on-primary w-full outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            Cerrar sesion
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main
        id="dashboard-main"
        tabIndex={-1}
        className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface focus:outline-none"
      >
        {/* Top Header Bar */}
        <header className="h-16 border-b border-outline-variant px-4 md:px-8 flex items-center justify-between shrink-0 bg-surface-container-low z-30">
          <div className="flex items-center gap-3">
            {/* Mobile-only logo */}
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
            <div id="dashboard-theme-toggle">
              <ThemeToggle />
            </div>
            {/* Mobile-only logout button */}
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Cerrar sesion"
              className="md:hidden flex h-10 w-10 items-center justify-center rounded-xl text-error hover:bg-error/10 transition-colors cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5 shrink-0" />
            </button>
          </div>
        </header>

        {/* Scrollable page body */}
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain pb-20 md:pb-0">
          {children}
        </div>
      </main>

      {/* Bottom Navigation Bar - Mobile Only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-container-low border-t border-outline-variant flex items-center justify-around z-40 pb-safe shadow-lg px-2">
        {navItems.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              id={`nav-item-mobile-${label.toLowerCase().replace(/\s+/g, '-')}`}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-200 ${
                active ? 'text-primary bg-primary/10' : 'text-outline hover:text-on-surface'
              }`}
              title={label}
            >
              <Icon className="w-6 h-6 shrink-0" />
            </Link>
          );
        })}
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Cerrar sesion"
          className="flex flex-col items-center justify-center w-12 h-12 rounded-xl text-error hover:bg-error/10 transition-all duration-200 cursor-pointer"
          title="Cerrar sesión"
        >
          <LogOut className="w-6 h-6 shrink-0" />
        </button>
      </nav>

      <OnboardingTour />
    </div>
  );
}
