'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Bell,
  User,
  LogOut,
  ShieldAlert,
} from 'lucide-react';
import { useCurrentUser, isAdminUser } from '@/hooks/use-current-user';
import { NotificationsBell } from '@/components/layout/notifications-bell';
import { TokenRefreshManager } from '@/components/TokenRefreshManager';
import { ThemeToggle } from '@/components/theme-toggle';
import { clearTokens } from '@/lib/utils/token';
import uvgSwal from '@/lib/swal';
import logo from '@/public/logo.png';

const adminNavItems = [
  { href: '/dashboard/admin', label: 'Panel Admin', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/admin/usuarios', label: 'Gestión de Usuarios', icon: Users },
  { href: '/dashboard/projects/admin/reviews', label: 'Revisiones', icon: ClipboardList },
  { href: '/dashboard/notificaciones', label: 'Notificaciones', icon: Bell },
  { href: '/dashboard/perfil', label: 'Perfil', icon: User },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useCurrentUser();

  const handleLogout = async () => {
    const result = await uvgSwal.fire({
      icon: 'question',
      title: 'Cerrar sesion',
      text: 'Tu sesion actual se cerrara en este dispositivo.',
      showCancelButton: true,
      confirmButtonText: 'Si, cerrar sesion',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#006735',
    });
    if (!result.isConfirmed) return;
    clearTokens();
    queryClient.clear();
    router.replace('/login');
  };

  if (isLoading) {
    return (
      <div className="h-screen bg-surface flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAdminUser(user)) {
    return (
      <div className="h-screen bg-surface flex flex-col items-center justify-center gap-4 text-center px-6">
        <ShieldAlert className="w-12 h-12 text-error" />
        <h2 className="font-headline text-2xl font-black text-on-surface">Acceso restringido</h2>
        <p className="text-sm text-tertiary max-w-xs">
          No tienes permisos para acceder a esta sección.
        </p>
        <Link
          href="/dashboard"
          className="rounded-xl bg-primary text-on-primary px-6 py-2.5 text-sm font-bold transition-colors hover:bg-primary/90"
        >
          Volver al Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="h-screen bg-surface flex overflow-hidden">
      <TokenRefreshManager />

      {/* Sidebar - Desktop Only */}
      <aside className="hidden md:flex w-64 h-screen bg-surface-container-low border-r border-outline-variant flex-col shrink-0 overflow-y-auto">
        <div className="px-6 py-5 border-b border-outline-variant flex items-center gap-3">
          <Image src={logo} alt="UVGENIUS" className="h-10 w-auto" />
          <span className="font-headline font-extrabold text-xl text-primary">UVGenius</span>
        </div>

        <div className="px-3 pt-3 pb-1">
          <span className="px-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
            Administración
          </span>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1">
          {adminNavItems.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
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
          <div className="flex items-center gap-3 px-3 py-2">
            {user?.fotoUrl ? (
              <Image
                src={user.fotoUrl}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-cover border border-outline-variant/30"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-primary-container flex items-center justify-center text-xs font-bold text-on-primary-container">
                {user ? `${user.nombre[0]}${user.apellido[0]}` : 'A'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-on-surface truncate">
                {user ? `${user.nombre} ${user.apellido}` : 'Admin UVG'}
              </p>
              <p className="text-xs text-tertiary truncate">
                {user?.correo ?? 'admin@uvg.edu.gt'}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex cursor-pointer items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-tertiary hover:bg-primary hover:text-on-primary w-full outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            Cerrar sesion
          </button>
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
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="md:hidden flex h-10 w-10 items-center justify-center rounded-xl text-error hover:bg-error/10 transition-colors cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5 shrink-0" />
            </button>
          </div>
        </header>

        {/* Scrollable page body */}
        <div className="flex-1 overflow-auto pb-20 md:pb-0">
          {children}
        </div>
      </main>

      {/* Bottom Navigation - Mobile Only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-container-low border-t border-outline-variant flex items-center justify-around z-40 pb-safe shadow-lg px-2">
        {adminNavItems.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
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
          onClick={handleLogout}
          className="flex flex-col items-center justify-center w-12 h-12 rounded-xl text-error hover:bg-error/10 transition-all duration-200 cursor-pointer"
          title="Cerrar sesión"
        >
          <LogOut className="w-6 h-6 shrink-0" />
        </button>
      </nav>
    </div>
  );
}
