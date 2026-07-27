'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertCircle, FolderPlus, Plus, Search, SearchX } from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import {
  AvailableProjectCard,
  AvailableProjectCardSkeleton,
} from '@/components/projects/available-project-card';
import { getMyProjects, deleteProject } from '@/lib/services/projects';
import { TIPO_LABEL } from '@/types';
import type { MiProyectoListItemDTO } from '@/lib/dto/project.dto';
import uvgSwal, { swalCustomClass } from '@/lib/swal';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptySteps,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ESTADO_LABEL: Record<string, string> = {
  BORRADOR: 'Borrador',
  EN_REVISION: 'En revisión',
  OBSERVADO: 'Observado',
  PUBLICADO: 'Publicado',
  EN_PROGRESO: 'En progreso',
  EN_SOLICITUD_CIERRE: 'En solicitud de cierre',
  CERRADO: 'Cerrado',
  CANCELADO: 'Cancelado',
};

/** Orden predeterminado del listado: primero lo que necesita atención, al final lo cerrado. */
const ESTADO_ORDEN: Record<string, number> = {
  BORRADOR: 0,
  EN_REVISION: 1,
  OBSERVADO: 2,
  PUBLICADO: 3,
  EN_PROGRESO: 4,
  EN_SOLICITUD_CIERRE: 5,
  CERRADO: 6,
  CANCELADO: 7,
};

const inputTriggerClass =
  'h-11.5 rounded-lg border-outline-variant bg-surface-container-lowest text-on-surface text-sm focus:ring-2 focus:ring-primary focus-visible:ring-primary/30';

export default function MyProjectsPage() {
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');

  const { data: proyectos = [], isLoading, isError, refetch } = useQuery<MiProyectoListItemDTO[]>({
    queryKey: ['mis-proyectos'],
    queryFn: () => getMyProjects(),
  });

  async function handleDelete(proyecto: MiProyectoListItemDTO) {
    const result = await uvgSwal.fire({
      icon: 'warning',
      title: 'Eliminar proyecto',
      html: `¿Estás seguro que deseas eliminar <strong>${proyecto.tituloProyecto}</strong>?<br/><br/>Esta acción no se puede deshacer.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      customClass: {
        ...swalCustomClass,
        confirmButton: 'rounded-xl bg-error px-5 py-2 text-xs font-bold text-on-error hover:bg-error/90 transition-all shadow-md mx-4',
      },
    });

    if (result.isConfirmed) {
      try {
        await deleteProject(proyecto.idProyecto);
        await queryClient.invalidateQueries({ queryKey: ['mis-proyectos'] });
        await uvgSwal.fire({
          icon: 'success',
          title: 'Proyecto eliminado',
          text: 'El proyecto ha sido eliminado correctamente',
          timer: 2000,
          showConfirmButton: false,
        });
      } catch (err) {
        uvgSwal.fire({
          icon: 'error',
          title: 'Error',
          text: err instanceof Error ? err.message : 'No se pudo eliminar el proyecto',
        });
      }
    }
  }

  const filtrados = proyectos
    .filter((p) => {
      const matchBusqueda =
        !busqueda ||
        p.tituloProyecto.toLowerCase().includes(busqueda.toLowerCase()) ||
        (p.descripcionProyecto ?? '').toLowerCase().includes(busqueda.toLowerCase());
      const matchTipo   = !tipoFiltro   || p.tipoProyecto   === tipoFiltro;
      const matchEstado = !estadoFiltro || p.estadoProyecto === estadoFiltro;
      return matchBusqueda && matchTipo && matchEstado;
    })
    .sort((a, b) => (ESTADO_ORDEN[a.estadoProyecto] ?? 99) - (ESTADO_ORDEN[b.estadoProyecto] ?? 99));
  const hasActiveFilters = Boolean(busqueda || tipoFiltro || estadoFiltro);

  const limpiarFiltros = () => {
    setBusqueda('');
    setTipoFiltro('');
    setEstadoFiltro('');
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl px-8 pt-7 pb-10">
        <div className="mb-4.5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] leading-8.5 font-bold text-on-surface">
              Mis Proyectos
            </h1>
            <p className="mt-1 text-[14px] font-normal text-tertiary">
              Gestiona tus proyectos, revisa su estado y sigue desarrollando tus ideas.
            </p>
          </div>
          <Link
            href="/dashboard/projects/mine/form"
            className="flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-on-primary transition-colors hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Nuevo Proyecto
          </Link>
        </div>

        {/* Buscador y filtros */}
        <div className="mb-4.5 flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
            <input
              type="text"
              aria-label="Buscar mis proyectos por titulo o descripcion"
              placeholder="Buscar proyectos..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="h-11.5 w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2.5 pl-10 pr-3.5 text-[14px] text-on-surface outline-none placeholder:text-outline focus:ring-2 focus:ring-primary"
            />
          </div>

          <Select value={tipoFiltro || '__ALL__'} onValueChange={(v) => setTipoFiltro(v === '__ALL__' ? '' : v)}>
            <SelectTrigger
              aria-label="Filtrar mis proyectos por tipo"
              className={`w-full sm:w-50 py-2.5 h-auto ${inputTriggerClass}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-9999">
              <SelectItem value="__ALL__" className="focus:bg-primary focus:text-on-primary">Todos los tipos</SelectItem>
              {Object.entries(TIPO_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value} className="focus:bg-primary focus:text-on-primary">{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={estadoFiltro || '__ALL__'} onValueChange={(v) => setEstadoFiltro(v === '__ALL__' ? '' : v)}>
            <SelectTrigger
              aria-label="Filtrar mis proyectos por estado"
              className={`w-full sm:w-60 py-2.5 h-auto ${inputTriggerClass}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-9999">
              <SelectItem value="__ALL__" className="focus:bg-primary focus:text-on-primary">Todos los estados</SelectItem>
              {Object.entries(ESTADO_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value} className="focus:bg-primary focus:text-on-primary">{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2" role="status" aria-label="Cargando proyectos">
            {Array.from({ length: 6 }).map((_, i) => (
              <AvailableProjectCardSkeleton key={i} />
            ))}
          </div>
        )}

        {!isLoading && isError && (
          <Empty tone="danger" className="surface-enter" role="alert">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No se pudieron cargar tus proyectos</EmptyTitle>
              <EmptyDescription>
                Intenta nuevamente para revisar el estado de tus propuestas y borradores.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <button
                type="button"
                onClick={() => refetch()}
                className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
              >
                Reintentar
              </button>
            </EmptyContent>
          </Empty>
        )}

        {!isLoading && !isError && proyectos.length === 0 && (
          <Empty className="surface-enter" aria-live="polite">
            <EmptyMedia variant="icon">
              <FolderPlus aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Aún no has creado proyectos.</EmptyTitle>
              <EmptyDescription>
                Crea una propuesta, define roles y enviala a revision para que otros estudiantes puedan sumarse.
              </EmptyDescription>
            </EmptyHeader>
            <EmptySteps />
            <EmptyContent>
              <Link
                href="/dashboard/projects/mine/form"
                className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
              >
                Crear nuevo proyecto
              </Link>
              <Link
                href="/dashboard/proyectos"
                className="inline-flex items-center justify-center rounded-xl border border-outline-variant bg-surface-container-lowest px-5 py-2.5 text-sm font-bold text-on-surface transition-all hover:bg-surface-container"
              >
                Explorar ideas
              </Link>
            </EmptyContent>
          </Empty>
        )}

        {!isLoading && !isError && proyectos.length > 0 && filtrados.length === 0 && (
          <Empty tone="muted" className="surface-enter" aria-live="polite">
            <EmptyMedia variant="icon">
              <SearchX aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Sin resultados</EmptyTitle>
              <EmptyDescription>
                No encontramos proyectos que coincidan con los filtros seleccionados.
              </EmptyDescription>
            </EmptyHeader>
            {hasActiveFilters && (
              <EmptyContent>
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
                >
                  Limpiar filtros
                </button>
              </EmptyContent>
            )}
          </Empty>
        )}

        {!isLoading && !isError && filtrados.length > 0 && (
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
            {filtrados.map((proyecto) => (
              <AvailableProjectCard
                key={proyecto.idProyecto}
                context="mine"
                proyecto={proyecto}
                onDelete={() => handleDelete(proyecto)}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
