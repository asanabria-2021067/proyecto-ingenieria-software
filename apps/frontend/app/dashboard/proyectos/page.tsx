'use client';

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
  PROJECT_CARD_GRID,
  type ProyectoDisponibleResumen,
} from '@/components/projects/available-project-card';
import { apiFetch } from '@/lib/api/client';
import { TIPO_LABEL } from '@/types';
import type { TipoProyecto } from '@/types';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Bookmark, FolderOpen, SearchX } from 'lucide-react';
import { useState } from 'react';
import { dashboardPage } from '@/components/layout/dashboard-page';
import { DashboardSearchField, DASHBOARD_FILTER_TRIGGER_CLASS } from '@/components/dashboard/dashboard-search-field';

type OrganizacionFiltro = {
  idOrganizacion: number;
  nombreOrganizacion: string;
};

export default function ProyectosPage() {
  const [busqueda, setBusqueda] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [organizacionFiltro, setOrganizacionFiltro] = useState('');
  const [soloGuardados, setSoloGuardados] = useState(false);

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

  const filtrados = proyectos
    .filter((p) => {
      const coincideBusqueda =
        !busqueda ||
        p.tituloProyecto.toLowerCase().includes(busqueda.toLowerCase()) ||
        (p.descripcionProyecto ?? '').toLowerCase().includes(busqueda.toLowerCase());

      const coincideTipo = !tipoFiltro || p.tipoProyecto === tipoFiltro;
      const coincideGuardado = !soloGuardados || p.guardado;

      return coincideBusqueda && coincideTipo && coincideGuardado;
    })
    // S7 (VIEW-09): los cerrados no aceptan postulaciones; van al final y solo se consultan.
    .sort((a, b) => Number(a.estadoProyecto === 'CERRADO') - Number(b.estadoProyecto === 'CERRADO'));
  const cerrados = filtrados.filter((p) => p.estadoProyecto === 'CERRADO').length;
  const hasActiveFilters = Boolean(busqueda || tipoFiltro || organizacionFiltro || soloGuardados);
  const activos = proyectos.filter((p) => p.estadoProyecto !== 'CERRADO').length;
  const totalGuardados = proyectos.filter((p) => p.guardado).length;
  const conteoPorTipo = proyectos.reduce<Partial<Record<TipoProyecto, number>>>((acc, p) => {
    const tipo = p.tipoProyecto as TipoProyecto;
    acc[tipo] = (acc[tipo] ?? 0) + 1;
    return acc;
  }, {});

  const limpiarFiltros = () => {
    setBusqueda('');
    setTipoFiltro('');
    setOrganizacionFiltro('');
    setSoloGuardados(false);
  };

  return (
      <div className={dashboardPage('pt-7 pb-10')}>
        {/* Encabezado */}
        <div className="mb-section flex flex-col gap-stack lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-tight">
              <h1 className="type-display">Proyectos Disponibles</h1>
              {!isLoading && !isError && (
                <span className="pill pill-accent inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  {activos === 1 ? '1 proyecto activo' : `${activos} proyectos activos`}
                </span>
              )}
            </div>
            <p className="type-body mt-tight text-text-secondary">
              Explora las oportunidades publicadas y postúlate a los roles que más se ajusten a ti.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSoloGuardados((v) => !v)}
            aria-pressed={soloGuardados}
            className={`inline-flex shrink-0 items-center gap-2 self-start rounded-control border px-4 py-2.5 text-sm font-semibold transition-colors lg:self-center ${
              soloGuardados
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-outline-variant bg-card text-text-primary hover:bg-surface-container'
            }`}
          >
            <Bookmark className={`h-4 w-4 ${soloGuardados ? 'fill-current' : ''}`} aria-hidden="true" />
            Guardados
            <span className="rounded-full bg-surface-container-highest px-2 py-0.5 text-xs text-text-secondary">
              {totalGuardados}
            </span>
          </button>
        </div>

        {/* Buscador y filtros */}
        <div className="card-base mb-section space-y-stack">
          <div className="flex flex-col gap-stack sm:flex-row">
            <DashboardSearchField
              containerClassName="flex-1"
              aria-label="Buscar proyectos por titulo o descripcion"
              placeholder="Buscar proyectos disponibles..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />

            <Select
              value={tipoFiltro || '__ALL__'}
              onValueChange={(v) => setTipoFiltro(v === '__ALL__' ? '' : v)}
            >
              <SelectTrigger
                aria-label="Filtrar proyectos por tipo"
                className={`w-full sm:w-50 ${DASHBOARD_FILTER_TRIGGER_CLASS}`}
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
                className={`w-full sm:w-60 ${DASHBOARD_FILTER_TRIGGER_CLASS}`}
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

          {/* Chips rapidos por tipo de proyecto (mismo conteo que el Select de arriba, solo mas rapido de tocar). */}
          {!isLoading && !isError && proyectos.length > 0 && (
            <div className="flex items-center gap-tight overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => setTipoFiltro('')}
                aria-pressed={tipoFiltro === ''}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  tipoFiltro === '' ? 'bg-primary text-on-primary' : 'bg-surface-container text-text-secondary hover:bg-surface-container-high'
                }`}
              >
                Todos <span className="opacity-80">{proyectos.length}</span>
              </button>
              {(Object.entries(TIPO_LABEL) as [TipoProyecto, string][])
                .filter(([tipo]) => conteoPorTipo[tipo])
                .map(([tipo, label]) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => setTipoFiltro((actual) => (actual === tipo ? '' : tipo))}
                    aria-pressed={tipoFiltro === tipo}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      tipoFiltro === tipo ? 'bg-primary text-on-primary' : 'bg-surface-container text-text-secondary hover:bg-surface-container-high'
                    }`}
                  >
                    {label} <span className="opacity-80">{conteoPorTipo[tipo]}</span>
                  </button>
                ))}
            </div>
          )}
        </div>

        {isErrorOrganizaciones && (
          <div className="mb-stack type-meta text-error">
            No se pudieron cargar las organizaciones para filtrar.
          </div>
        )}

        {isLoading && (
          <div className={PROJECT_CARD_GRID} role="status" aria-label="Cargando proyectos">
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

        {!isLoading && !isError && filtrados.length > 0 && cerrados > 0 && (
          <p className="type-meta mb-stack" role="note">
            {cerrados === 1 ? '1 proyecto cerrado' : `${cerrados} proyectos cerrados`}: ya no aceptan postulaciones y se muestran solo para consulta.
          </p>
        )}

        {!isLoading && !isError && filtrados.length > 0 && (
          <div className={PROJECT_CARD_GRID}>
            {filtrados.map((proyecto) => (
              <AvailableProjectCard key={proyecto.idProyecto} proyecto={proyecto} />
            ))}
          </div>
        )}
      </div>
  );
}
