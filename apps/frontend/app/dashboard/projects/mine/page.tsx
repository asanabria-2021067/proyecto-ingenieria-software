'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertCircle, FolderPlus, MapPin, Pencil, Plus, Search, SearchX, Trash2 } from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { getMyProjects, deleteProject } from '@/lib/services/projects';
import { TIPO_LABEL, MODALIDAD_LABEL } from '@/types';
import type { MiProyectoListItemDTO } from '@/lib/dto/project.dto';
import uvgSwal from '@/lib/swal';
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
      confirmButtonColor: '#dc2626',
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
      } catch (error: any) {
        uvgSwal.fire({
          icon: 'error',
          title: 'Error',
          text: error.message || 'No se pudo eliminar el proyecto',
        });
      }
    }
  }

  const filtrados = proyectos.filter((p) => {
    const matchBusqueda =
      !busqueda ||
      p.tituloProyecto.toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.descripcionProyecto ?? '').toLowerCase().includes(busqueda.toLowerCase());
    const matchTipo   = !tipoFiltro   || p.tipoProyecto   === tipoFiltro;
    const matchEstado = !estadoFiltro || p.estadoProyecto === estadoFiltro;
    return matchBusqueda && matchTipo && matchEstado;
  });
  const hasActiveFilters = Boolean(busqueda || tipoFiltro || estadoFiltro);

  return (
    <DashboardLayout>
      <div className="px-8 py-8 max-w-6xl mx-auto">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-headline font-extrabold text-3xl text-on-surface mb-1">
              Mis Proyectos
            </h1>
            <p className="text-tertiary text-sm">
              Gestiona tus proyectos, revisa su estado y sigue desarrollando tus ideas.
            </p>
          </div>
          <Link
            href="/dashboard/projects/mine/form"
            className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 active:scale-95 transition-all duration-200 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Nuevo Proyecto
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tertiary" />
            <input
              type="text"
              aria-label="Buscar mis proyectos por titulo o descripcion"
              placeholder="Buscar proyectos..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface text-sm outline-none focus:ring-2 focus:ring-primary transition-all duration-200"
            />
          </div>
          <Select value={tipoFiltro || '__ALL__'} onValueChange={(v) => setTipoFiltro(v === '__ALL__' ? '' : v)}>
            <SelectTrigger
              aria-label="Filtrar mis proyectos por tipo"
              className="py-2.5 h-auto rounded-xl border-outline-variant bg-surface-container-lowest text-on-surface text-sm focus:ring-2 focus:ring-primary focus-visible:ring-primary/30"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-9999">
              <SelectItem value="__ALL__" className="focus:bg-primary focus:text-on-primary">Todos los tipos</SelectItem>
              <SelectItem value="ACADEMICO_HORAS_BECA" className="focus:bg-primary focus:text-on-primary">Horas Beca</SelectItem>
              <SelectItem value="ACADEMICO_EXPERIENCIA" className="focus:bg-primary focus:text-on-primary">Experiencia</SelectItem>
              <SelectItem value="EXTRACURRICULAR_EXTENSION" className="focus:bg-primary focus:text-on-primary">Extensión</SelectItem>
            </SelectContent>
          </Select>

          <Select value={estadoFiltro || '__ALL__'} onValueChange={(v) => setEstadoFiltro(v === '__ALL__' ? '' : v)}>
            <SelectTrigger
              aria-label="Filtrar mis proyectos por estado"
              className="py-2.5 h-auto rounded-xl border-outline-variant bg-surface-container-lowest text-on-surface text-sm focus:ring-2 focus:ring-primary focus-visible:ring-primary/30"
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
          <div className="text-center py-16 text-tertiary text-sm" role="status">Cargando proyectos...</div>
        )}
        {isError && (
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
              <EmptyTitle>Convierte una idea en proyecto</EmptyTitle>
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
                Crear proyecto
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
              <EmptyTitle>No hay proyectos con esos filtros</EmptyTitle>
              <EmptyDescription>
                Limpia los filtros para volver a ver todos tus proyectos y continuar gestionandolos.
              </EmptyDescription>
            </EmptyHeader>
            {hasActiveFilters && (
              <EmptyContent>
                <button
                  type="button"
                  onClick={() => {
                    setBusqueda('');
                    setTipoFiltro('');
                    setEstadoFiltro('');
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
          {filtrados.map((proyecto, index) => (
            <div
              key={proyecto.idProyecto}
              className="surface-enter interactive-lift bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 flex flex-col gap-4 hover:shadow-md focus-within:ring-2 focus-within:ring-primary/30"
              style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-headline font-bold text-on-surface text-lg leading-tight min-w-0">
                  {proyecto.tituloProyecto}
                </h2>
                <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0 max-w-[45%]">
                  <span className="px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold whitespace-nowrap">
                    {TIPO_LABEL[proyecto.tipoProyecto as keyof typeof TIPO_LABEL] ?? proyecto.tipoProyecto}
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                      ESTADO_STYLES[proyecto.estadoProyecto] ?? 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {ESTADO_LABEL[proyecto.estadoProyecto] ?? proyecto.estadoProyecto}
                  </span>
                </div>
              </div>

              <p className="text-on-surface text-sm leading-relaxed line-clamp-2">
                {proyecto.descripcionProyecto}
              </p>

              <div className="flex items-center gap-4 text-xs text-tertiary">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {MODALIDAD_LABEL[proyecto.modalidadProyecto as keyof typeof MODALIDAD_LABEL] ?? proyecto.modalidadProyecto}
                </span>
              </div>

              {proyecto.revisiones?.[0] && (
                <p className="text-xs text-tertiary">
                  Última revisión:{' '}
                  <span className="font-medium text-on-surface">
                    {proyecto.revisiones[0].estadoRevision}
                  </span>{' '}
                  · Envío #{proyecto.revisiones[0].numeroEnvio}
                </p>
              )}

              <div className="mt-auto flex items-center gap-2">
                {proyecto.estadoProyecto === 'BORRADOR' ? (
                  <>
                    <Link
                      href={`/dashboard/projects/mine/form?id=${proyecto.idProyecto}`}
                      className="flex-1 inline-flex items-center justify-center bg-primary text-on-primary px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 active:scale-95 transition-all duration-200"
                    >
                      Seguir editando Proyecto
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(proyecto)}
                      aria-label={`Eliminar proyecto ${proyecto.tituloProyecto}`}
                      className="inline-flex items-center justify-center bg-error text-on-error p-2.5 rounded-xl hover:bg-error/90 active:scale-95 transition-all duration-200"
                      title="Eliminar proyecto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                ) : proyecto.estadoProyecto === 'EN_REVISION' ? (
                  <Link
                    href={`/dashboard/projects/mine/${proyecto.idProyecto}`}
                    className="flex-1 inline-flex items-center justify-center bg-surface-container-high text-on-surface-variant px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-surface-container-highest transition-all duration-200"
                  >
                    Ver mi solicitud
                  </Link>
                ) : proyecto.estadoProyecto === 'OBSERVADO' ? (
                  <>
                    <Link
                      href={`/dashboard/projects/mine/${proyecto.idProyecto}?edit=true`}
                      className="flex-1 inline-flex items-center justify-center gap-2 bg-amber-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-amber-700 active:scale-95 transition-all duration-200"
                    >
                      <Pencil className="w-4 h-4" />
                      Editar
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(proyecto)}
                      aria-label={`Eliminar proyecto ${proyecto.tituloProyecto}`}
                      className="inline-flex items-center justify-center bg-error text-on-error p-2.5 rounded-xl hover:bg-error/90 active:scale-95 transition-all duration-200"
                      title="Eliminar proyecto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <Link
                    href={`/dashboard/projects/${proyecto.idProyecto}`}
                    className="flex-1 inline-flex items-center justify-center bg-primary text-on-primary px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 active:scale-95 transition-all duration-200"
                  >
                    Ver Proyecto
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
