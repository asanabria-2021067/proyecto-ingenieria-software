'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, FolderKanban } from 'lucide-react';
import { useAdminProjects } from '@/hooks/use-admin-projects';
import { ActiveProjectsBoard } from './active-projects-board';
import { ClosureRequestsInbox } from './closure-requests-inbox';
import { ClosedProjectsBoard } from './closed-projects-board';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  ADMIN_PROJECT_GROUP_LABEL,
  ADMIN_PROJECTS_DEFAULT_LIMIT,
  adminProjectsGroupHref,
  isAdminProjectGroup,
  type AdminProjectGroup,
} from '@/lib/types/admin-projects';

const EMPTY_LABEL: Record<AdminProjectGroup, string> = {
  activos: 'No hay proyectos activos.',
  cierres: 'No hay solicitudes de cierre pendientes.',
  cerrados: 'No hay proyectos cerrados.',
};

/** Qué supervisa cada grupo. Activos se centra en equipos y planificación de Sprints. */
const DESCRIPCION_GRUPO: Record<AdminProjectGroup, string> = {
  activos:
    'Supervisa proyectos publicados o en progreso, sus equipos y la planificación temporal de sus Sprints. El administrador consulta y supervisa; no opera dentro del Sprint del equipo.',
  cierres: 'Evalúa las solicitudes de cierre de proyectos, verifica sus requisitos y gestiona su resolución.',
  cerrados:
    'Bandeja administrativa por grupo. El administrador consulta y decide sobre cierres; nunca opera dentro del Sprint de un equipo.',
};

export default function AdminProjectsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const grupoParam = searchParams.get('grupo');
  const grupoValido = isAdminProjectGroup(grupoParam);
  const grupo: AdminProjectGroup = grupoValido ? grupoParam : 'activos';
  // 400 (grupo inválido) se evita en origen: un grupo desconocido en la URL
  // redirige a `activos` (el backend rechazaría cualquier otro).
  useEffect(() => {
    if (!grupoValido) router.replace(adminProjectsGroupHref('activos'));
  }, [grupoValido, router]);

  // Activos y Cerrados cargan su lista completa dentro de su tablero. Cierres
  // es una bandeja por etapas que el backend entrega completa y con sus
  // contadores globales: es el único grupo que consulta desde aquí, sin paginar.
  const esActivos = grupo === 'activos';
  const esCerrados = grupo === 'cerrados';
  const esCierres = grupo === 'cierres';
  const { data, isPending, isError, error, refetch, isFetching } = useAdminProjects(
    grupo,
    1,
    ADMIN_PROJECTS_DEFAULT_LIMIT,
    esCierres,
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <AdminBreadcrumb
        seccion="Proyectos"
        seccionHref={adminProjectsGroupHref('activos')}
        pagina={ADMIN_PROJECT_GROUP_LABEL[grupo]}
      />

      {/* El grupo activo se elige en la sidebar administrativa: la página no
          repite esa navegación, solo declara en qué grupo está parada. */}
      <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {/* Título limpio: el total del grupo va justo antes de la tabla, no como badge aquí. */}
          <h1 className="type-display text-balance">{ADMIN_PROJECT_GROUP_LABEL[grupo]}</h1>
          <p className="mt-tight max-w-2xl text-base text-tertiary">{DESCRIPCION_GRUPO[grupo]}</p>
        </div>
      </section>

      {esActivos ? (
        <ActiveProjectsBoard />
      ) : esCerrados ? (
        <ClosedProjectsBoard />
      ) : esCierres && data && data.items.length > 0 && !isError ? (
        <div aria-busy={isFetching}>
          <ClosureRequestsInbox data={data} />
        </div>
      ) : (
        <div
          className="rounded-xl border border-outline-variant bg-surface-container-lowest"
        >
          {isError ? (
            <Empty tone="danger" role="alert" className="border-0 shadow-none">
              <EmptyMedia variant="icon">
                <AlertCircle aria-hidden="true" className="h-7 w-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>{getApiErrorMessage(error, 'admin')}</EmptyTitle>
              </EmptyHeader>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="text-xs font-semibold"
              >
                Reintentar
              </Button>
            </Empty>
          ) : isPending ? (
            <div className="space-y-2 p-4" aria-label="Cargando proyectos">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <Empty tone="muted" role="status" className="border-0 shadow-none">
              <EmptyMedia variant="icon">
                <FolderKanban aria-hidden="true" className="h-7 w-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>{EMPTY_LABEL[grupo]}</EmptyTitle>
                <EmptyDescription>Cuando un proyecto entre en este grupo, aparecerá aquí.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      )}
    </div>
  );
}
