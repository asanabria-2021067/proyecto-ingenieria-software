'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  ShieldAlert,
  KeyRound,
} from 'lucide-react';
import { useCurrentUser, isAdminUser } from '@/hooks/use-current-user';
import { useLogout } from '@/hooks/use-logout';
import { NotificationsBell } from '@/components/layout/notifications-bell';
import { UserMenu } from '@/components/dashboard/UserMenu';
import { SidebarNav, flattenNavEntries, type NavEntry } from '@/components/dashboard/SidebarNav';
import { TokenRefreshManager } from '@/components/TokenRefreshManager';
import { ThemeToggle } from '@/components/theme-toggle';
import logo from '@/public/logo.png';

const adminNavEntries: NavEntry[] = [
  { href: '/dashboard/admin', label: 'Panel Admin', icon: LayoutDashboard, exact: true },
  {
    type: 'group',
    label: 'Administración',
    icon: Users,
    items: [
      { href: '/dashboard/admin/usuarios', label: 'Gestión de Usuarios', icon: Users },
      { href: '/dashboard/admin/solicitudes-recuperacion', label: 'Recuperación de contraseña', icon: KeyRound },
    ],
  },
  { href: '/dashboard/projects/admin/reviews', label: 'Revisiones', icon: ClipboardList },
];

const adminNavItemsMobile = flattenNavEntries(adminNavEntries);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: user, isLoading } = useCurrentUser();
  const handleLogout = useLogout();

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
      <aside
        className="hidden md:flex w-64 h-screen flex-col shrink-0 overflow-y-auto"
        style={{ backgroundColor: 'var(--admin-bg)', borderRight: '1px solid var(--admin-border)' }}
      >
        <div className="px-6 py-5 flex items-center gap-3" style={{ borderBottom: '1px solid var(--admin-border)' }}>
          <Image src={logo} alt="UVGENIUS" className="h-10 w-auto" />
          <span className="font-headline font-extrabold text-xl" style={{ color: 'var(--admin-text)' }}>UVGenius</span>
        </div>

        <div className="px-3 pt-3 pb-1">
          <span className="px-3 text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--admin-text-muted)' }}>
            Administración
          </span>
        </div>

        <SidebarNav entries={adminNavEntries} theme="admin" />

        <div className="px-3 py-4" style={{ borderTop: '1px solid var(--admin-border)' }}>
          <UserMenu user={user} onLogout={handleLogout} variant="sidebar" theme="admin" />
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
          </div>
        </header>

        {/* Scrollable page body */}
        <div className="flex-1 overflow-auto pb-20 md:pb-0">
          {children}
        </div>
      </main>

      {/* Bottom Navigation - Mobile Only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-container-low border-t border-outline-variant flex items-center justify-around z-40 pb-safe shadow-lg px-2">
        {adminNavItemsMobile.map(({ href, label, icon: Icon, exact }) => {
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
        <UserMenu user={user} onLogout={handleLogout} variant="compact" theme="admin" />
      </nav>
    </div>
  );
}
