'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Kanban, Users, Rocket, Pencil, History, Settings2, BarChart3 } from 'lucide-react';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectMembers } from '@/hooks/use-project-members';
import { ProjectChatPanel } from '@/components/projects/project-chat-panel';

interface ProjectSidebarProps {
  idProyecto: number;
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

export function ProjectSidebar({ idProyecto }: ProjectSidebarProps) {
  const pathname = usePathname() ?? '';
  const { data: currentUser } = useCurrentUser();
  const { data: proyecto } = useProjectDetail(idProyecto);
  const { members } = useProjectMembers(idProyecto);

  const isLeader = !!currentUser && !!proyecto && currentUser.idUsuario === proyecto.creador.idUsuario;
  const esParticipante = !!currentUser && members.some((m) => m.idUsuario === currentUser.idUsuario);
  const puedeChatear = isLeader || esParticipante;

  const navItems: NavItem[] = [
    {
      href: isLeader ? `/dashboard/projects/${idProyecto}` : `/dashboard/proyectos/${idProyecto}`,
      label: 'Resumen',
      icon: LayoutDashboard,
    },
  ];
  if (isLeader) {
    navItems.push(
      { href: `/dashboard/projects/mine/form?id=${idProyecto}`, label: 'Editar Información', icon: Pencil },
      {
        href: `/dashboard/projects/mine/${idProyecto}?returnTo=/dashboard/projects/${idProyecto}`,
        label: 'Revisiones Pasadas',
        icon: History,
      },
      { href: `/dashboard/projects/${idProyecto}?openRoles=1`, label: 'Editar Roles', icon: Settings2 },
    );
  }
  if (puedeChatear) {
    navItems.push({ href: `/dashboard/projects/${idProyecto}/kanban`, label: 'Tablero', icon: Kanban });
  }
  if (isLeader) {
    navItems.push(
      { href: `/dashboard/proyectos/${idProyecto}/miembros`, label: 'Miembros', icon: Users },
      { href: `/dashboard/proyectos/${idProyecto}/sprints`, label: 'Sprints', icon: Rocket },
    );
  }
  // HU-143: a diferencia de Sprints/Bitácora (arriba, exclusivos del líder),
  // la analítica es explícitamente "líder o integrante" — mismo criterio de
  // acceso que ya usa el backend (assertCanListSprintAnalytics).
  if (isLeader || esParticipante) {
    navItems.push({
      href: `/dashboard/proyectos/${idProyecto}/sprints/analytics`,
      label: 'Analítica',
      icon: BarChart3,
    });
  }

  // Varios NavItem pueden anidar la misma ruta (p. ej. Resumen en
  // `/projects/:id` y Tablero en `/projects/:id/kanban`): un match por
  // prefijo ingenuo marcaría ambos como activos a la vez. Nos quedamos solo
  // con el href más específico (el más largo) que calce con la ruta actual.
  const activeHref = navItems
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .reduce<string | null>((mejor, item) => (mejor === null || item.href.length > mejor.length ? item.href : mejor), null);

  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-outline-variant bg-surface-container-low md:flex">
      <div className="border-b border-outline-variant px-4 py-4">
        <p className="truncate text-sm font-bold text-on-surface">
          {proyecto?.tituloProyecto ?? 'Proyecto'}
        </p>
        {isLeader && (
          <span className="mt-0.5 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            Líder
          </span>
        )}
      </div>

      <nav className="flex flex-col gap-0.5 p-2.5">
        {navItems.map((item) => {
          const active = item.href === activeHref;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <ProjectChatPanel
        idProyecto={idProyecto}
        habilitado={puedeChatear}
        currentUserId={currentUser?.idUsuario ?? null}
        members={members}
      />
    </aside>
  );
}
