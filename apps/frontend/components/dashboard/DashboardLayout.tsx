'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, FolderOpen, Briefcase, FileText, User, LogOut } from 'lucide-react';
import { useCurrentUser } from '@/hooks/use-current-user';
import { NotificationsBell } from '@/components/layout/notifications-bell';
import uvgSwal from '@/lib/swal';
import logo from '@/public/logo.png';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/proyectos', label: 'Explorar Proyectos', icon: FolderOpen },
  { href: '/dashboard/projects/mine', label: 'Mis Proyectos', icon: Briefcase },
  { href: '/dashboard/mis-postulaciones', label: 'Mis Postulaciones', icon: FileText },
  { href: '/dashboard/perfil', label: 'Perfil', icon: User },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();

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

    localStorage.removeItem('token');
    queryClient.clear();
    router.replace('/login');
  };

  return (
    <div className="h-screen bg-surface flex overflow-hidden">
      <aside className="w-64 h-screen bg-surface-container-low border-r border-outline-variant flex flex-col shrink-0 overflow-y-auto">
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

        <div className="px-3 py-2 border-t border-outline-variant">
          <NotificationsBell />
        </div>

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
            onClick={handleLogout}
            className="flex cursor-pointer items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-tertiary hover:bg-primary hover:text-on-primary w-full outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            Cerrar sesion
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-surface">
        {children}
      </main>
    </div>
  );
}
