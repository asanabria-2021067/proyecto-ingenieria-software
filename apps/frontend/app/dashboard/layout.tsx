'use client';

import { usePathname } from 'next/navigation';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import AdminLayout from '@/components/admin/AdminLayout';
import { useCurrentUser, isAdminUser } from '@/hooks/use-current-user';

// Rutas huérfanas que nunca tuvieron shell (sidebar/header): no están
// enlazadas desde la navegación y usan su propio layout de página completa.
const NO_SHELL_ROUTES = new Set(['/dashboard/mis-proyectos', '/dashboard/projects']);

// Rutas exclusivas de administrador: siempre AdminLayout (que internamente
// bloquea el acceso a usuarios no administradores).
function isAdminOnlyRoute(pathname: string) {
  return (
    pathname === '/dashboard/admin' ||
    pathname.startsWith('/dashboard/admin/') ||
    pathname === '/dashboard/projects/admin' ||
    pathname.startsWith('/dashboard/projects/admin/')
  );
}

// Rutas compartidas: el shell cambia según el rol del usuario actual.
const SHARED_ROLE_ROUTES = new Set(['/dashboard/perfil', '/dashboard/notificaciones']);

// Rutas donde tanto estudiantes como administradores usan el shell de
// estudiante (DashboardLayout allowAdmin).
function isAllowAdminRoute(pathname: string) {
  return (
    pathname === '/dashboard/proyectos' ||
    /^\/dashboard\/proyectos\/[^/]+$/.test(pathname) ||
    /^\/dashboard\/projects\/\d+$/.test(pathname)
  );
}

export default function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const { data: user, isLoading } = useCurrentUser();

  if (NO_SHELL_ROUTES.has(pathname)) {
    return <>{children}</>;
  }

  if (isAdminOnlyRoute(pathname)) {
    return <AdminLayout>{children}</AdminLayout>;
  }

  if (SHARED_ROLE_ROUTES.has(pathname)) {
    if (isLoading) {
      return (
        <div className="h-screen bg-surface flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      );
    }
    return isAdminUser(user) ? (
      <AdminLayout>{children}</AdminLayout>
    ) : (
      <DashboardLayout>{children}</DashboardLayout>
    );
  }

  if (isAllowAdminRoute(pathname)) {
    return <DashboardLayout allowAdmin>{children}</DashboardLayout>;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
