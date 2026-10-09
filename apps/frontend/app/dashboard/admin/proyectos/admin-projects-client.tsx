'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ChevronLeft, ChevronRight, FolderKanban } from 'lucide-react';
import { useAdminProjects } from '@/hooks/use-admin-projects';
import { ActiveProjectsBoard } from './active-projects-board';
import { ClosureRequestsInbox } from './closure-requests-inbox';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { estadoBadgeLabel, estadoBadgeStyle } from '@/components/projects/available-project-card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
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

/**
 * Etiqueta del contador de cada grupo. Activos pinta el suyo dentro de su
 * tablero, junto a los filtros; Cierres lo reparte en sus indicadores por etapa.
 */
const TOTAL_LABEL: Record<AdminProjectGroup, string> = {
  activos: 'Total de proyectos activos',
  cierres: 'Total de solicitudes de cierre',
  cerrados: 'Total de proyectos cerrados',
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
/**
 * Destino de «Abrir». Siempre abre ALGO de este proyecto: el cierre cuando la
 * acción sugerida es revisarlo, y su detalle en cualquier otro caso. Nunca
 * salta a otra bandeja — llevar «Abrir» a la lista de revisiones sacaba al
 * administrador del proyecto que acababa de elegir.
 */
export function accionHref(item: AdminProjectListItem): string {
  if (item.accion === 'REVISAR_CIERRE') return `/dashboard/admin/proyectos/${item.idProyecto}/cierre`;
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

  // Activos carga su lista completa dentro de `ActiveProjectsBoard`; aquí solo
  // se pagina para los demás grupos.
  const esActivos = grupo === 'activos';
  // Cierres es una bandeja por etapas: el backend la entrega completa y con
  // sus contadores globales, así que no se pagina ni lee `page`/`limit`.
  const esCierres = grupo === 'cierres';
  const { data, isPending, isError, error, refetch, isFetching, isPlaceholderData } = useAdminProjects(
    grupo,
    esCierres ? 1 : page,
    esCierres ? ADMIN_PROJECTS_DEFAULT_LIMIT : limit,
    !esActivos,
  );

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const inicio = total === 0 ? 0 : (page - 1) * limit + 1;
  const fin = Math.min(page * limit, total);

  const hrefPagina = (p: number) =>
    `${adminProjectsGroupHref(grupo)}&page=${p}${limit !== ADMIN_PROJECTS_DEFAULT_LIMIT ? `&limit=${limit}` : ''}`;

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

      {/* Total REAL del grupo (todas las páginas), con el patrón de Mis Tareas.
          Estas bandejas no tienen búsqueda ni filtros: no hay «encontrados». */}
      {!esActivos && !esCierres && !isError && data && (
        <p className="type-body mb-stack text-text-secondary" role="status">
          {TOTAL_LABEL[grupo]}: <span className="font-semibold tabular-nums text-text-primary">{data.total}</span>
        </p>
      )}

      {esActivos ? (
        <ActiveProjectsBoard />
      ) : esCierres && data && data.items.length > 0 && !isError ? (
        <div aria-busy={isFetching}>
          <ClosureRequestsInbox data={data} />
        </div>
      ) : (
        <div
          className="rounded-xl border border-outline-variant bg-surface-container-lowest"
          aria-busy={isPlaceholderData}
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
                    <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                      Proyecto
                    </TableHead>
                    <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                      Líder
                    </TableHead>
                    <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                      Usuarios activos
                    </TableHead>
                    <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                      Sprint ambiente
                    </TableHead>
                    <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                      Acción sugerida
                    </TableHead>
                    <TableHead className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-tertiary">
                      <span className="sr-only">Detalle</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.items.map((item) => (
                    <TableRow
                      key={item.idProyecto}
                      className="border-outline-variant/40 hover:bg-surface-container-low"
                    >
                      <TableCell className="px-4 py-3">
                        <Link
                          href={`/dashboard/admin/proyectos/${item.idProyecto}`}
                          className="text-sm font-semibold text-on-surface hover:text-primary hover:underline"
                        >
                          {item.tituloProyecto}
                        </Link>
                        <div className="mt-1">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${estadoBadgeStyle(item.estadoProyecto)}`}
                          >
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
                                <span className="font-semibold text-on-surface">
                                  Sprint {item.sprintAmbiente.numero}
                                </span>
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
      )}

      {!esActivos && !esCierres && !isPending && !isError && data && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-tertiary">
            Mostrando{' '}
            <span className="font-bold text-on-surface">
              {inicio}–{fin}
            </span>{' '}
            de <span className="font-bold text-on-surface">{total}</span> proyectos · {limit} por página
          </p>
          <nav aria-label="Paginación" className="flex items-center gap-1">
            <Button
              asChild
              variant="outline"
              size="icon-sm"
              disabled={page <= 1}
              aria-label="Página anterior"
              className="rounded-lg"
            >
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
