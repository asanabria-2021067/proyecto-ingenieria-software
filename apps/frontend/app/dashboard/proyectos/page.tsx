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
  EmptySteps,
  EmptyTitle,
} from '@/components/ui/empty';
import { apiFetch } from '@/lib/api/client';
import { MODALIDAD_LABEL, ProyectoResumen, TIPO_LABEL } from '@/types';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, FolderOpen, MapPin, Search, SearchX, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

type OrganizacionFiltro = {
  idOrganizacion: number;
  nombreOrganizacion: string;
};

type ProyectoResumenConOrganizaciones = Omit<ProyectoResumen, 'organizaciones'> & {
  organizaciones?: {
    organizacion: Partial<OrganizacionFiltro>;
  }[];
  _count?: {
    roles?: number;
  };
};

const ESTADO_STYLES: Record<string, string> = {
  PUBLICADO: 'bg-[#006735] text-white',
  EN_PROGRESO: 'bg-[#416900] text-white',
  BORRADOR: 'bg-gray-100 text-gray-600',
  EN_REVISION: 'bg-blue-100 text-blue-700',
  OBSERVADO: 'bg-amber-100 text-amber-700',
  EN_SOLICITUD_CIERRE: 'bg-purple-100 text-purple-700',
  CERRADO: 'bg-gray-200 text-gray-500',
  CANCELADO: 'bg-red-100 text-red-700',
};

export default function ProyectosPage() {
  const [busqueda, setBusqueda] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [organizacionFiltro, setOrganizacionFiltro] = useState('');

  const {
    data: proyectos = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<ProyectoResumenConOrganizaciones[]>({
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

  return (
    <DashboardLayout>
      <div className="px-8 py-8 max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="font-headline font-extrabold text-3xl text-on-surface mb-1">
            Proyectos Disponibles
          </h1>
          <p className="text-tertiary text-sm">
            Explora las oportunidades publicadas y postúlate a los roles que más se ajusten a ti.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tertiary" />
            <input
              type="text"
              aria-label="Buscar proyectos por titulo o descripcion"
              placeholder="Buscar proyectos..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <Select
            value={tipoFiltro || '__ALL__'}
            onValueChange={(v) => setTipoFiltro(v === '__ALL__' ? '' : v)}
          >
            <SelectTrigger
              aria-label="Filtrar proyectos por tipo"
              className="py-2.5 h-auto rounded-xl border-outline-variant bg-surface-container-lowest text-on-surface text-sm focus:ring-2 focus:ring-primary focus-visible:ring-primary/30"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem
                value="__ALL__"
                className="focus:bg-primary focus:text-on-primary"
              >
                Todos los tipos
              </SelectItem>
              <SelectItem
                value="ACADEMICO_HORAS_BECA"
                className="focus:bg-primary focus:text-on-primary"
              >
                Horas Beca
              </SelectItem>
              <SelectItem
                value="ACADEMICO_EXPERIENCIA"
                className="focus:bg-primary focus:text-on-primary"
              >
                Experiencia
              </SelectItem>
              <SelectItem
                value="EXTRACURRICULAR_EXTENSION"
                className="focus:bg-primary focus:text-on-primary"
              >
                Extensión
              </SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={organizacionFiltro || '__ALL__'}
            onValueChange={(v) =>
              setOrganizacionFiltro(v === '__ALL__' ? '' : v)
            }
            disabled={isLoadingOrganizaciones || isErrorOrganizaciones}
          >
            <SelectTrigger
              aria-label="Filtrar proyectos por organizacion"
              className="py-2.5 h-auto rounded-xl border-outline-variant bg-surface-container-lowest text-on-surface text-sm focus:ring-2 focus:ring-primary focus-visible:ring-primary/30"
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
              <SelectItem
                value="__ALL__"
                className="focus:bg-primary focus:text-on-primary"
              >
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
          <div className="text-center py-16 text-tertiary text-sm" role="status">
            Cargando proyectos...
          </div>
        )}

        {isError && (
          <Empty tone="danger" className="surface-enter" role="alert">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No se pudieron cargar los proyectos</EmptyTitle>
              <EmptyDescription>
                Revisa tu conexion o intenta nuevamente para recuperar las oportunidades disponibles.
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
                {hasActiveFilters
                  ? 'No hay proyectos con esos filtros'
                  : 'Aun no hay proyectos publicados'}
              </EmptyTitle>
              <EmptyDescription>
                {hasActiveFilters
                  ? 'Ajusta la busqueda o limpia los filtros para volver a explorar todas las oportunidades.'
                  : 'Cuando una asociacion publique una oportunidad, aparecera aqui para que puedas postularte.'}
              </EmptyDescription>
            </EmptyHeader>
            <EmptySteps />
            {hasActiveFilters && (
              <EmptyContent>
                <button
                  type="button"
                  onClick={() => {
                    setBusqueda('');
                    setTipoFiltro('');
                    setOrganizacionFiltro('');
                  }}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
                >
                  Limpiar filtros
                </button>
              </EmptyContent>
            )}
          </Empty>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {filtrados.map((proyecto, index) => {
            const org = proyecto.organizaciones?.[0]?.organizacion.nombreOrganizacion;
            const rolesCount = proyecto.roles?.length ?? proyecto._count?.roles ?? 0;

            return (
              <div
                key={proyecto.idProyecto}
                className="surface-enter interactive-lift bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 flex flex-col gap-4 hover:shadow-md focus-within:ring-2 focus-within:ring-primary/30"
                style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-headline font-bold text-on-surface text-lg leading-tight">
                    {proyecto.tituloProyecto}
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold">
                      {TIPO_LABEL[proyecto.tipoProyecto]}
                    </span>
                    <span
                      className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${
                        ESTADO_STYLES[proyecto.estadoProyecto] ??
                        'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {proyecto.estadoProyecto}
                    </span>
                  </div>
                </div>

                {org && <p className="text-tertiary text-sm font-medium">{org}</p>}

                <p className="text-on-surface text-sm leading-relaxed line-clamp-2">
                  {proyecto.descripcionProyecto}
                </p>

                <div className="flex flex-wrap gap-2">
                  {(proyecto.intereses ?? []).slice(0, 3).map(({ interes }) => (
                    <span
                      key={interes.nombreInteres}
                      className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface text-xs"
                    >
                      {interes.nombreInteres}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-4 text-xs text-tertiary">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {MODALIDAD_LABEL[proyecto.modalidadProyecto]}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {rolesCount} {rolesCount === 1 ? 'rol' : 'roles'}
                  </span>
                </div>

                <Link
                  href={`/dashboard/proyectos/${proyecto.idProyecto}`}
                  className="mt-auto inline-flex items-center justify-center bg-primary text-on-primary px-5 py-2.5 rounded-xl text-sm font-bold hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all"
                >
                  Ver Proyecto
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
