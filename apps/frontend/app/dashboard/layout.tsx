'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import AdminLayout from '@/components/admin/AdminLayout';
import { useCurrentUser, isAdminUser } from '@/hooks/use-current-user';
import { useEsCoordinador } from '@/hooks/use-can';
import { ShellSkeleton } from '@/components/layout/shell-skeleton';

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

// Pantallas de administración que el coordinador académico también abre, con los datos de sus carreras:
// bandeja única, proyectos (y su detalle y revisión de cierre), calendario de sprints, horas, tendencias y
// entidades, más las revisiones de publicación. El resto de `/dashboard/admin/*` es solo de administración.
const COORDINADOR_ADMIN_SEGMENTS = ['bandeja', 'proyectos', 'sprints', 'horas', 'metricas', 'entidades'];
function isCoordinadorSharedRoute(pathname: string) {
  if (pathname === '/dashboard/projects/admin/reviews') return true;
  const [, , , seccion, ...resto] = pathname.split('/');
  if (pathname !== '/dashboard/admin' && !pathname.startsWith('/dashboard/admin/')) return false;
  if (seccion === 'proyectos') return resto.length === 0 || /^\d+(\/cierre)?$/.test(resto.join('/'));
  return COORDINADOR_ADMIN_SEGMENTS.includes(seccion) && resto.length === 0;
}

// Rutas de cualquier usuario que el coordinador ve con su shell (mensajes y calendario; perfil y cuenta, abajo).
function isCoordinadorOwnShellRoute(pathname: string) {
  return (
    pathname === '/dashboard/calendario' ||
    pathname === '/dashboard/mensajes' ||
    pathname.startsWith('/dashboard/mensajes/')
  );
}

// Rutas compartidas: el shell cambia según el rol del usuario actual.
const SHARED_ROLE_ROUTES = new Set(['/dashboard/perfil', '/dashboard/notificaciones', '/dashboard/configuracion', '/dashboard/ayuda']);

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
  const router = useRouter();
  const { data: user, isLoading } = useCurrentUser();
  const coordinador = useEsCoordinador();

  // El coordinador académico entra a su propio dashboard, no al de estudiante.
  useEffect(() => {
    if (coordinador && pathname === '/dashboard') router.replace('/dashboard/coordinador');
  }, [coordinador, pathname, router]);

  if (pathname === '/dashboard/coordinador' || pathname.startsWith('/dashboard/coordinador/')) {
    return <AdminLayout variant="coordinador">{children}</AdminLayout>;
  }

  if (isCoordinadorSharedRoute(pathname)) {
    if (isLoading) return <ShellSkeleton />;
    return coordinador ? <AdminLayout variant="coordinador">{children}</AdminLayout> : <AdminLayout>{children}</AdminLayout>;
  }

  if (coordinador && (isCoordinadorOwnShellRoute(pathname) || SHARED_ROLE_ROUTES.has(pathname))) {
    return <AdminLayout variant="coordinador">{children}</AdminLayout>;
  }

  if (isAdminOnlyRoute(pathname)) {
    return <AdminLayout>{children}</AdminLayout>;
  }

  if (SHARED_ROLE_ROUTES.has(pathname)) {
    if (isLoading) {
      return <ShellSkeleton />;
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
