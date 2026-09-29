'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertCircle, CheckCircle, ChevronRight, ClipboardList, Clock, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { deletePostulacion } from '@/lib/services/applications';
import { Postulacion, EstadoPostulacion } from '@/types';
import uvgSwal from '@/lib/swal';
import { getApiErrorMessage } from '@/components/projects/api-error';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptySteps,
  EmptyTitle,
} from '@/components/ui/empty';
import { dashboardPage } from '@/components/layout/dashboard-page';
import { DashboardSearchField, DASHBOARD_FILTER_TRIGGER_CLASS } from '@/components/dashboard/dashboard-search-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ESTADO_CONFIG: Record<
  EstadoPostulacion,
  { label: string; icon: React.ElementType; className: string }
> = {
  PENDIENTE: {
    label: 'Pendiente',
    icon: Clock,
    className: 'bg-surface-container text-tertiary',
  },
  ACEPTADA: {
    label: 'Aceptada',
    icon: CheckCircle,
    className: 'bg-secondary-container text-on-secondary-container',
  },
  RECHAZADA: {
    label: 'Rechazada',
    icon: XCircle,
    className: 'bg-error-container text-error',
  },
};

export default function MisPostulacionesPage() {
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoPostulacion | ''>('');

  const { data: postulaciones = [], isLoading, isError, refetch } = useQuery<Postulacion[]>({
    queryKey: ['mis-postulaciones'],
    queryFn: () => apiFetch('/postulaciones/mis-postulaciones'),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const conteoPorEstado = postulaciones.reduce<Record<EstadoPostulacion, number>>(
    (acc, p) => {
      acc[p.estadoPostulacion] = (acc[p.estadoPostulacion] ?? 0) + 1;
      return acc;
    },
    { PENDIENTE: 0, ACEPTADA: 0, RECHAZADA: 0 },
  );

  const filtradas = postulaciones.filter((p) => {
    const texto = busqueda.trim().toLowerCase();
    const coincideTexto =
      !texto ||
      p.rolProyecto.nombreRol.toLowerCase().includes(texto) ||
      p.rolProyecto.proyecto.tituloProyecto.toLowerCase().includes(texto);
    const coincideEstado = !estadoFiltro || p.estadoPostulacion === estadoFiltro;
    return coincideTexto && coincideEstado;
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePostulacion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mis-postulaciones'] });
      uvgSwal.fire({
        icon: 'success',
        title: 'Postulación cancelada',
        text: 'Tu postulación fue cancelada exitosamente',
        timer: 2000,
      });
    },
    onError: (error: any) => {
      uvgSwal.fire({
        icon: 'error',
        title: 'Error',
        text: getApiErrorMessage(error, 'general', 'No se pudo cancelar la postulación'),
      });
    },
  });

  const handleCancelar = (id: number) => {
    uvgSwal
      .fire({
        icon: 'warning',
        title: '¿Cancelar postulación?',
        text: 'Esta acción no se puede deshacer',
        showCancelButton: true,
        confirmButtonText: 'Sí, cancelar',
        cancelButtonText: 'No',
      })
      .then((result) => {
        if (result.isConfirmed) {
          deleteMutation.mutate(id);
        }
      });
  };

  return (
      <div className={dashboardPage('py-8')}>
        <div className="mb-6 flex flex-col gap-stack lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-headline font-extrabold text-3xl text-on-surface mb-1">
              Mis Postulaciones
            </h1>
            <p className="text-tertiary text-sm">
              Aquí puedes ver el estado de todas tus postulaciones enviadas.
            </p>
          </div>
          <Link
            href="/dashboard/proyectos"
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-control border border-outline-variant bg-card px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-container lg:self-center"
          >
            Explorar proyectos
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>

        {!isLoading && !isError && postulaciones.length > 0 && (
          <div className="mb-section grid grid-cols-2 gap-tight sm:grid-cols-4">
            <div className="card-base">
              <p className="type-meta text-text-secondary">Total enviadas</p>
              <p className="type-display mt-tight">{postulaciones.length}</p>
            </div>
            <div className="card-base">
              <p className="type-meta text-text-secondary">Pendientes</p>
              <p className="type-display mt-tight text-tertiary">{conteoPorEstado.PENDIENTE}</p>
            </div>
            <div className="card-base">
              <p className="type-meta text-text-secondary">Aceptadas</p>
              <p className="type-display mt-tight text-primary">{conteoPorEstado.ACEPTADA}</p>
            </div>
            <div className="card-base">
              <p className="type-meta text-text-secondary">Rechazadas</p>
              <p className="type-display mt-tight text-error">{conteoPorEstado.RECHAZADA}</p>
            </div>
          </div>
        )}

        {!isLoading && !isError && postulaciones.length > 0 && (
          <div className="mb-section flex flex-col gap-stack sm:flex-row">
            <DashboardSearchField
              containerClassName="flex-1"
              aria-label="Buscar postulaciones por rol o proyecto"
              placeholder="Buscar por rol o proyecto..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <Select
              value={estadoFiltro || '__ALL__'}
              onValueChange={(v) => setEstadoFiltro(v === '__ALL__' ? '' : (v as EstadoPostulacion))}
            >
              <SelectTrigger
                aria-label="Filtrar postulaciones por estado"
                className={`w-full sm:w-50 ${DASHBOARD_FILTER_TRIGGER_CLASS}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-50">
                <SelectItem value="__ALL__" className="focus:bg-primary focus:text-on-primary">
                  Todos los estados
                </SelectItem>
                <SelectItem value="PENDIENTE" className="focus:bg-primary focus:text-on-primary">
                  Pendiente
                </SelectItem>
                <SelectItem value="ACEPTADA" className="focus:bg-primary focus:text-on-primary">
                  Aceptada
                </SelectItem>
                <SelectItem value="RECHAZADA" className="focus:bg-primary focus:text-on-primary">
                  Rechazada
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-16 text-tertiary text-sm" role="status">
            Cargando tus postulaciones...
          </div>
        )}
        {isError && (
          <Empty tone="danger" className="surface-enter" role="alert">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No se pudieron cargar tus postulaciones</EmptyTitle>
              <EmptyDescription>
                Verifica que tu sesion siga activa o intenta actualizar la lista.
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

        {!isLoading && !isError && postulaciones.length === 0 && (
          <Empty className="surface-enter" aria-live="polite">
            <EmptyMedia variant="icon">
              <ClipboardList aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Encuentra tu siguiente colaboracion</EmptyTitle>
              <EmptyDescription>
                Cuando envies una postulacion, aqui veras el rol, el estado y la respuesta del equipo.
              </EmptyDescription>
            </EmptyHeader>
            <EmptySteps />
            <EmptyContent>
              <Link
                href="/dashboard/proyectos"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:shadow-md"
              >
                Explorar proyectos
                <ChevronRight aria-hidden="true" className="w-4 h-4" />
              </Link>
            </EmptyContent>
          </Empty>
        )}

        {!isLoading && !isError && postulaciones.length > 0 && filtradas.length === 0 && (
          <Empty tone="muted" className="surface-enter" aria-live="polite">
            <EmptyMedia variant="icon">
              <ClipboardList aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Sin resultados</EmptyTitle>
              <EmptyDescription>
                No encontramos postulaciones que coincidan con los filtros seleccionados.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <button
                type="button"
                onClick={() => {
                  setBusqueda('');
                  setEstadoFiltro('');
                }}
                className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
              >
                Limpiar filtros
              </button>
            </EmptyContent>
          </Empty>
        )}

        <div className="space-y-4">
          {filtradas.map((p, index) => {
            const config = ESTADO_CONFIG[p.estadoPostulacion];
            const Icon = config.icon;
            return (
              <div
                key={p.idPostulacion}
                className="surface-enter interactive-lift bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 hover:shadow-md focus-within:ring-2 focus-within:ring-primary/30"
                style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <h2 className="font-headline font-bold text-on-surface text-lg leading-tight">
                      {p.rolProyecto.nombreRol}
                    </h2>
                    <p className="text-tertiary text-sm mt-0.5">
                      {p.rolProyecto.proyecto.tituloProyecto}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${config.className}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {config.label}
                  </span>
                </div>

                <p className="text-on-surface text-sm leading-relaxed line-clamp-2 mb-3">
                  {p.justificacion}
                </p>

                {p.comentarioResolucion && (
                  <div className="bg-surface-container rounded-xl px-4 py-3 mb-3">
                    <p className="text-xs font-bold text-tertiary uppercase tracking-wide mb-0.5">
                      Comentario del equipo
                    </p>
                    <p className="text-on-surface text-sm">{p.comentarioResolucion}</p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs text-tertiary">
                    Enviada el{' '}
                    {new Date(p.fechaPostulacion).toLocaleDateString('es-GT', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                  <div className="flex items-center gap-2">
                    {p.estadoPostulacion === 'PENDIENTE' && (
                      <button
                        type="button"
                        onClick={() => handleCancelar(p.idPostulacion)}
                        disabled={deleteMutation.isPending}
                        aria-label={`Cancelar postulacion a ${p.rolProyecto.nombreRol}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-error/10 text-error text-xs font-semibold hover:bg-error/20 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Cancelar
                      </button>
                    )}
                    <Link
                      href={`/dashboard/proyectos/${p.rolProyecto.proyecto.idProyecto}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      Ver proyecto
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
  );
}
