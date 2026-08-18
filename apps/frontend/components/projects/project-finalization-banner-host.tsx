'use client';

import { usePathname } from 'next/navigation';
import { FinalizationLockBanner } from '@/components/projects/finalization-lock-banner';

/**
 * Familias de ruta realmente project-scoped en este repositorio (ver
 * auditoría F6: `/dashboard/proyectos/[id]/...`, `/dashboard/projects/[id]/...`
 * y `/dashboard/projects/mine/[id]` — un tercer árbol real, distinto de
 * `/dashboard/projects/mine` a secas y de `/dashboard/projects/mine/form`,
 * que ambos deben seguir devolviendo `null`). El id es siempre el primer
 * segmento numérico inmediatamente después del prefijo — nunca se acepta
 * un segmento no numérico como `mine`/`admin`/`form` como si fuera un id.
 */
const PROJECT_SCOPED_PATTERNS = [
  /^\/dashboard\/proyectos\/(\d+)(?:\/|$)/,
  /^\/dashboard\/projects\/mine\/(\d+)(?:\/|$)/,
  /^\/dashboard\/projects\/(\d+)(?:\/|$)/,
];

/**
 * Helper puro y testeable, exportado para tests dedicados de scope sin
 * necesitar renderizar el host completo.
 */
export function resolveProjectScopedId(pathname: string): number | null {
  for (const pattern of PROJECT_SCOPED_PATTERNS) {
    const match = pathname.match(pattern);
    if (!match) continue;
    const id = Number(match[1]);
    if (Number.isInteger(id) && id > 0) return id;
  }
  return null;
}

/**
 * Host único de `FinalizationLockBanner` (F6) — montado una sola vez en
 * `DashboardLayout`, igual que `useRealtimeNotifications`, para no duplicar
 * el banner manualmente en cada página de proyecto (Kanban, Miembros, F3,
 * F4, F5, etc.). Fuera de una ruta project-scoped, `null`.
 */
export function ProjectFinalizationBannerHost() {
  const pathname = usePathname() ?? '';
  const idProyecto = resolveProjectScopedId(pathname);

  if (idProyecto === null) return null;

  return <FinalizationLockBanner idProyecto={idProyecto} />;
}
