'use client';

import { TriangleAlert } from 'lucide-react';
import { useProjectSprints } from '@/hooks/use-project-sprints';

interface FinalizationLockBannerProps {
  idProyecto: number;
}

/**
 * F6: franja global (no local a una sola página) que comunica que el
 * proyecto está temporalmente bloqueado porque su Sprint está
 * `EN_FINALIZACION`. Deriva su visibilidad exclusivamente de
 * `useProjectSprints` (F1) — la misma fuente de verdad que ya usa F2/F3 —
 * nunca de un booleano local alimentado solo por Socket.IO: así el banner
 * es correcto tras reload, al entrar tarde, o tras una reconexión, sin
 * haber presenciado ningún evento realtime. El propio hook realtime
 * (`useRealtimeNotifications`, montado una única vez en `DashboardLayout`)
 * invalida `project-sprints` al recibir `SPRINT_FINALIZATION_STARTED`/
 * `SPRINT_CLOSED`; este componente no abre socket ni escucha eventos.
 */
export function FinalizationLockBanner({ idProyecto }: FinalizationLockBannerProps) {
  const { sprints, isLoading, isError } = useProjectSprints(idProyecto);

  if (isLoading || isError) return null;

  const hayFinalizando = sprints.some((sprint) => sprint.estado === 'EN_FINALIZACION');
  if (!hayFinalizando) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-900/10 md:px-8"
    >
      <TriangleAlert
        className="size-5 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden="true"
      />
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
        Este proyecto está temporalmente bloqueado: se está finalizando el Sprint actual.
      </p>
    </div>
  );
}
