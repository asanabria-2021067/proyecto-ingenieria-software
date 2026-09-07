'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ChevronLeft, ChevronRight, FolderKanban } from 'lucide-react';
import { useAdminProjects } from '@/hooks/use-admin-projects';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { estadoBadgeLabel, estadoBadgeStyle } from '@/components/projects/available-project-card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  ADMIN_PROJECT_GROUP_LABEL,
  ADMIN_PROJECTS_DEFAULT_LIMIT,
  ADMIN_PROJECTS_MAX_LIMIT,
  adminProjectsGroupHref,
  isAdminProjectGroup,
  type AdminProjectGroup,
  type AdminProjectListItem,
} from '@/lib/types/admin-projects';

const ACCION_LABEL: Record<string, string> = {
  MONITOREAR: 'Monitorear',
  REVISAR_PUBLICACION: 'Revisar publicación',
  REVISAR_CIERRE: 'Revisar cierre',
  CONSULTAR_HISTORICO: 'Consultar histórico',
};

const EMPTY_LABEL: Record<AdminProjectGroup, string> = {
  activos: 'No hay proyectos activos.',
  revision: 'No hay proyectos en revisión.',
  cierres: 'No hay solicitudes de cierre pendientes.',
  cerrados: 'No hay proyectos cerrados.',
};

const SPRINT_ESTADO_LABEL: Record<string, string> = {
  ACTIVO: 'Activo',
  EN_FINALIZACION: 'En finalización',
  CERRADO: 'Cerrado',
};

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

/** Destino sugerido por `accion`: navegación, nunca una autoridad de escritura. */
export function accionHref(item: AdminProjectListItem): string {
  if (item.accion === 'REVISAR_CIERRE') return `/dashboard/admin/proyectos/${item.idProyecto}/cierre`;
  if (item.accion === 'REVISAR_PUBLICACION') return '/dashboard/projects/admin/reviews';
  return `/dashboard/admin/proyectos/${item.idProyecto}`;
}

function parsePage(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function parseLimit(value: string | null): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return ADMIN_PROJECTS_DEFAULT_LIMIT;
  return Math.min(n, ADMIN_PROJECTS_MAX_LIMIT);
}

export default function AdminProjectsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const grupoParam = searchParams.get('grupo');
  const grupoValido = isAdminProjectGroup(grupoParam);
  const grupo: AdminProjectGroup = grupoValido ? grupoParam : 'activos';
  const page = parsePage(searchParams.get('page'));
  const limit = parseLimit(searchParams.get('limit'));

  // 400 (grupo inválido) se evita en origen: un grupo desconocido en la URL
  // redirige a `activos` (el backend rechazaría cualquier otro).
  useEffect(() => {
    if (!grupoValido) router.replace(adminProjectsGroupHref('activos'));
  }, [grupoValido, router]);

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useAdminProjects(grupo, page, limit);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const inicio = total === 0 ? 0 : (page - 1) * limit + 1;
  const fin = Math.min(page * limit, total);

  const hrefPagina = (p: number) => `${adminProjectsGroupHref(grupo)}&page=${p}${limit !== ADMIN_PROJECTS_DEFAULT_LIMIT ? `&limit=${limit}` : ''}`;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <Breadcrumb className="mb-4">
        <BreadcrumbList className="text-[13px]">
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard/admin" className="text-tertiary hover:text-on-surface">
                Proyectos
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-medium text-on-surface">{ADMIN_PROJECT_GROUP_LABEL[grupo]}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* El grupo activo se elige en la sidebar administrativa: la página no
          repite esa navegación, solo declara en qué grupo está parada. */}
      <section className="mb-6">
        <span className="mb-2 block text-xs font-black uppercase tracking-widest text-primary">Administración</span>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-headline text-3xl font-black tracking-tighter text-on-surface md:text-4xl">
            {ADMIN_PROJECT_GROUP_LABEL[grupo]}
          </h1>
          {data && (
            <span className="rounded-full bg-surface-container-high px-2.5 py-1 text-sm font-semibold text-on-surface-variant">
              {data.total} {data.total === 1 ? 'proyecto' : 'proyectos'}
            </span>
          )}
        </div>
        <p className="mt-2 max-w-2xl text-sm text-tertiary">
          Bandeja administrativa por grupo. El administrador consulta y decide sobre cierres; nunca opera dentro del
          Sprint de un equipo.
        </p>
      </section>

      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest" aria-busy={isPlaceholderData}>
        {isError ? (
          <Empty tone="danger" role="alert" className="border-0 shadow-none">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{getApiErrorMessage(error, 'admin')}</EmptyTitle>
            </EmptyHeader>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()} className="text-xs font-semibold">
              Reintentar
            </Button>
          </Empty>
        ) : isPending ? (
          <div className="space-y-2 p-4" aria-label="Cargando proyectos">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : data && data.items.length === 0 ? (
          <Empty tone="muted" role="status" className="border-0 shadow-none">
            <EmptyMedia variant="icon">
              <FolderKanban aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{EMPTY_LABEL[grupo]}</EmptyTitle>
              <EmptyDescription>Cuando un proyecto entre en este grupo, aparecerá aquí.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-low">
                  <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Proyecto</TableHead>
                  <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Líder</TableHead>
                  <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Usuarios activos</TableHead>
                  <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Sprint ambiente</TableHead>
                  <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">Acción sugerida</TableHead>
                  <TableHead className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-tertiary">
                    <span className="sr-only">Detalle</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.map((item) => (
                  <TableRow key={item.idProyecto} className="border-outline-variant/40 hover:bg-surface-container-low">
                    <TableCell className="px-4 py-3">
                      <Link
                        href={`/dashboard/admin/proyectos/${item.idProyecto}`}
                        className="text-sm font-semibold text-on-surface hover:text-primary hover:underline"
                      >
                        {item.tituloProyecto}
                      </Link>
                      <div className="mt-1">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${estadoBadgeStyle(item.estadoProyecto)}`}>
                          {estadoBadgeLabel(item.estadoProyecto)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-sm text-on-surface">
                        <Avatar className="size-7">
                          <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                            {getInitials(item.lider.nombre, item.lider.apellido)}
                          </AvatarFallback>
                        </Avatar>
                        {item.lider.nombre} {item.lider.apellido}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-on-surface">{item.usuariosActivos}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-on-surface-variant">
                      {item.sprintAmbiente ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span tabIndex={0} className="inline-flex items-center gap-1.5 rounded-md">
                              <span className="font-semibold text-on-surface">Sprint {item.sprintAmbiente.numero}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {SPRINT_ESTADO_LABEL[item.sprintAmbiente.estado] ?? item.sprintAmbiente.estado}
                              </Badge>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>El administrador no opera dentro del Sprint de un equipo.</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span aria-label="Sin Sprint operable">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge className="border-transparent bg-primary/10 text-[11px] font-semibold text-primary">
                        {ACCION_LABEL[item.accion] ?? item.accion}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <Link
                        href={accionHref(item)}
                        aria-label={`Abrir ${item.tituloProyecto}`}
                        className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold text-primary hover:underline"
                      >
                        Abrir
                        <ChevronRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {!isPending && !isError && data && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-tertiary">
            Mostrando <span className="font-bold text-on-surface">{inicio}–{fin}</span> de{' '}
            <span className="font-bold text-on-surface">{total}</span> proyectos · {limit} por página
          </p>
          <nav aria-label="Paginación" className="flex items-center gap-1">
            <Button asChild variant="outline" size="icon-sm" disabled={page <= 1} aria-label="Página anterior" className="rounded-lg">
              {page <= 1 ? (
                <span aria-disabled="true" className="opacity-40">
                  <ChevronLeft className="size-4" />
                </span>
              ) : (
                <Link href={hrefPagina(page - 1)}>
                  <ChevronLeft className="size-4" />
                </Link>
              )}
            </Button>
            <span className="px-2 text-xs text-on-surface-variant" aria-live="polite">
              Página {page} de {totalPages}
            </span>
            <Button asChild variant="outline" size="icon-sm" aria-label="Página siguiente" className="rounded-lg">
              {page >= totalPages ? (
                <span aria-disabled="true" className="opacity-40">
                  <ChevronRight className="size-4" />
                </span>
              ) : (
                <Link href={hrefPagina(page + 1)}>
                  <ChevronRight className="size-4" />
                </Link>
              )}
            </Button>
          </nav>
        </div>
      )}
    </div>
  );
}
