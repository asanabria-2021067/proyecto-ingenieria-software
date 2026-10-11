import { redirect } from 'next/navigation';

/**
 * GPI01-C03 (H-02): ruta heredada. La vista vigente de «Mis Proyectos» es
 * `/dashboard/projects/mine`; aquí solo se conserva el enlace antiguo. La
 * sesión ya la exige el middleware antes de llegar a esta página.
 */
export default function LegacyMyProjectsPage() {
  redirect('/dashboard/projects/mine');
}
