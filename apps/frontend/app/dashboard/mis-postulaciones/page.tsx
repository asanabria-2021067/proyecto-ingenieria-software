'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Clock, CheckCircle, XCircle, ChevronRight, Trash2 } from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { apiFetch } from '@/lib/api/client';
import { Postulacion, EstadoPostulacion } from '@/types';
import uvgSwal from '@/lib/swal';

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
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);

  const { data: postulaciones = [], isLoading, isError } = useQuery<Postulacion[]>({
    queryKey: ['mis-postulaciones'],
    queryFn: () => apiFetch('/postulaciones/mis-postulaciones'),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/postulaciones/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mis-postulaciones'] });
      uvgSwal.fire({
        icon: 'success',
        title: 'Postulación cancelada',
        text: 'Tu postulación fue cancelada exitosamente',
        timer: 2000,
      });
      setConfirmingDelete(null);
    },
    onError: (error: any) => {
      uvgSwal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'No se pudo cancelar la postulación',
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
    <DashboardLayout>
      <div className="px-8 py-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="font-headline font-extrabold text-3xl text-on-surface mb-1">
            Mis Postulaciones
          </h1>
          <p className="text-tertiary text-sm">
            Aquí puedes ver el estado de todas tus postulaciones enviadas.
          </p>
        </div>

        {isLoading && (
          <div className="text-center py-16 text-tertiary text-sm">
            Cargando tus postulaciones...
          </div>
        )}
        {isError && (
          <div className="text-center py-16 text-error text-sm">
            No se pudieron cargar tus postulaciones. Verifica que hayas iniciado sesión.
          </div>
        )}

        {!isLoading && !isError && postulaciones.length === 0 && (
          <div className="text-center py-16">
            <p className="text-tertiary text-sm mb-4">Aún no tienes postulaciones enviadas.</p>
            <Link
              href="/dashboard/proyectos"
              className="inline-flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-xl text-sm font-bold hover:shadow-md transition-all"
            >
              Explorar Proyectos
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        <div className="space-y-4">
          {postulaciones.map((p) => {
            const config = ESTADO_CONFIG[p.estadoPostulacion];
            const Icon = config.icon;
            return (
              <div
                key={p.idPostulacion}
                className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6"
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
                        onClick={() => handleCancelar(p.idPostulacion)}
                        disabled={deleteMutation.isPending}
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
    </DashboardLayout>
  );
}
