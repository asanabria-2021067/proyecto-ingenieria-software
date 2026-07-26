'use client';

import DashboardLayout from '@/components/dashboard/DashboardLayout';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  AvailableProjectCard,
  AvailableProjectCardSkeleton,
  type ProyectoDisponibleResumen,
} from '@/components/projects/available-project-card';
import { apiFetch } from '@/lib/api/client';
import { TIPO_LABEL } from '@/types';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, FolderOpen, Search, SearchX } from 'lucide-react';
import { useState } from 'react';

type OrganizacionFiltro = {
  idOrganizacion: number;
  nombreOrganizacion: string;
};

const inputTriggerClass =
  'h-11.5 rounded-lg border-outline-variant bg-surface-container-lowest text-on-surface text-sm focus:ring-2 focus:ring-primary focus-visible:ring-primary/30';

export default function ProyectosPage() {
  const [busqueda, setBusqueda] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [organizacionFiltro, setOrganizacionFiltro] = useState('');

  const {
    data: proyectos = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<ProyectoDisponibleResumen[]>({
    queryKey: ['proyectos', organizacionFiltro],
    queryFn: () =>
      apiFetch(
        organizacionFiltro
          ? `/proyectos?organizacionId=${organizacionFiltro}`
          : '/proyectos',
      ),
  });

  const {
    data: organizaciones = [],
    isLoading: isLoadingOrganizaciones,
    isError: isErrorOrganizaciones,
  } = useQuery<OrganizacionFiltro[]>({
    queryKey: ['organizaciones'],
    queryFn: () => apiFetch('/organizaciones'),
  });

  const filtrados = proyectos.filter((p) => {
    const coincideBusqueda =
      !busqueda ||
      p.tituloProyecto.toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.descripcionProyecto ?? '').toLowerCase().includes(busqueda.toLowerCase());

    const coincideTipo = !tipoFiltro || p.tipoProyecto === tipoFiltro;

    return coincideBusqueda && coincideTipo;
  });
  const hasActiveFilters = Boolean(busqueda || tipoFiltro || organizacionFiltro);

  const limpiarFiltros = () => {
    setBusqueda('');
    setTipoFiltro('');
    setOrganizacionFiltro('');
  };

  return (
    <DashboardLayout allowAdmin>
      <div className="mx-auto max-w-7xl px-8 pt-7 pb-10">
        {/* Encabezado */}
        <div className="mb-4.5">
          <h1 className="text-[28px] leading-8.5 font-bold text-on-surface">
            Proyectos Disponibles
          </h1>
          <p className="mt-1 text-[14px] font-normal text-tertiary">
            Explora las oportunidades publicadas y postúlate a los roles que más se ajusten a ti.
          </p>
        </div>

        {/* Buscador y filtros */}
        <div className="mb-4.5 flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
            <input
              type="text"
              aria-label="Buscar proyectos por titulo o descripcion"
              placeholder="Buscar proyectos disponibles..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="h-11.5 w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2.5 pl-10 pr-3.5 text-[14px] text-on-surface outline-none placeholder:text-outline focus:ring-2 focus:ring-primary"
            />
          </div>

          <Select
            value={tipoFiltro || '__ALL__'}
            onValueChange={(v) => setTipoFiltro(v === '__ALL__' ? '' : v)}
          >
            <SelectTrigger
              aria-label="Filtrar proyectos por tipo"
              className={`w-full sm:w-50 py-2.5 h-auto ${inputTriggerClass}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value="__ALL__" className="focus:bg-primary focus:text-on-primary">
                Todos los tipos
              </SelectItem>
              {Object.entries(TIPO_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value} className="focus:bg-primary focus:text-on-primary">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={organizacionFiltro || '__ALL__'}
            onValueChange={(v) => setOrganizacionFiltro(v === '__ALL__' ? '' : v)}
            disabled={isLoadingOrganizaciones || isErrorOrganizaciones}
          >
            <SelectTrigger
              aria-label="Filtrar proyectos por organizacion"
              className={`w-full sm:w-60 py-2.5 h-auto ${inputTriggerClass}`}
            >
              <SelectValue
                placeholder={
                  isLoadingOrganizaciones
                    ? 'Cargando organizaciones...'
                    : isErrorOrganizaciones
                      ? 'Error al cargar organizaciones'
                      : 'Todas las organizaciones'
                }
              />
            </SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value="__ALL__" className="focus:bg-primary focus:text-on-primary">
                Todas las organizaciones
              </SelectItem>
              {organizaciones.map((organizacion) => (
                <SelectItem
                  key={organizacion.idOrganizacion}
                  value={String(organizacion.idOrganizacion)}
                  className="focus:bg-primary focus:text-on-primary"
                >
                  {organizacion.nombreOrganizacion}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isErrorOrganizaciones && (
          <div className="mb-6 text-error text-sm">
            No se pudieron cargar las organizaciones para filtrar.
          </div>
        )}

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
              <EmptyTitle>No fue posible cargar los proyectos.</EmptyTitle>
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

        {!isLoading && !isError && filtrados.length === 0 && (
          <Empty tone="muted" className="surface-enter" aria-live="polite">
            <EmptyMedia variant="icon">
              {hasActiveFilters ? (
                <SearchX aria-hidden="true" className="h-7 w-7" />
              ) : (
                <FolderOpen aria-hidden="true" className="h-7 w-7" />
              )}
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>
                {hasActiveFilters ? 'Sin resultados' : 'Todavía no hay proyectos disponibles.'}
              </EmptyTitle>
              {hasActiveFilters && (
                <EmptyDescription>
                  No encontramos proyectos que coincidan con los filtros seleccionados.
                </EmptyDescription>
              )}
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
              <AvailableProjectCard key={proyecto.idProyecto} proyecto={proyecto} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
