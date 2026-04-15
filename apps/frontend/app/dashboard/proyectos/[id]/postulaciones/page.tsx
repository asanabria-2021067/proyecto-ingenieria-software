'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, XCircle, Clock, User } from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { apiFetch } from '@/lib/api/client';
import { EstadoPostulacion } from '@/types';

type PostulacionProyecto = {
  idPostulacion: number;
  justificacion: string;
  estadoPostulacion: EstadoPostulacion;
  fechaPostulacion: string;
  fechaResolucion?: string;
  comentarioResolucion?: string;
  postulante: {
    idUsuario: number;
    nombre: string;
    apellido: string;
    correo: string;
  };
  rolProyecto: {
    idRolProyecto: number;
    nombreRol: string;
  };
};

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

type ModalState = {
  open: boolean;
  postulacionId: number | null;
  accion: 'ACEPTADA' | 'RECHAZADA' | null;
  comentario: string;
};

export default function PostulacionesProyectoPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [modal, setModal] = useState<ModalState>({
    open: false,
    postulacionId: null,
    accion: null,
    comentario: '',
  });

  const { data: postulaciones = [], isLoading, isError } = useQuery<PostulacionProyecto[]>({
    queryKey: ['postulaciones-proyecto', id],
    queryFn: () => apiFetch(`/proyectos/${id}/postulaciones`),
  });

  const { mutate: resolverPostulacion, isPending } = useMutation({
    mutationFn: ({
      postulacionId,
      estadoPostulacion,
      comentarioResolucion,
    }: {
      postulacionId: number;
      estadoPostulacion: 'ACEPTADA' | 'RECHAZADA';
      comentarioResolucion?: string;
    }) =>
      apiFetch(`/postulaciones/${postulacionId}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ estadoPostulacion, comentarioResolucion: comentarioResolucion || undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['postulaciones-proyecto', id] });
      cerrarModal();
    },
  });

  function abrirModal(postulacionId: number, accion: 'ACEPTADA' | 'RECHAZADA') {
    setModal({ open: true, postulacionId, accion, comentario: '' });
  }

  function cerrarModal() {
    setModal({ open: false, postulacionId: null, accion: null, comentario: '' });
  }

  function confirmar() {
    if (!modal.postulacionId || !modal.accion) return;
    resolverPostulacion({
      postulacionId: modal.postulacionId,
      estadoPostulacion: modal.accion,
      comentarioResolucion: modal.comentario.trim() || undefined,
    });
  }

  return (
    <DashboardLayout>
      <div className="px-8 py-8 max-w-4xl mx-auto">
        <Link
          href={`/dashboard/proyectos/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-tertiary hover:text-primary mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al proyecto
        </Link>

        <div className="mb-8">
          <h1 className="font-headline font-extrabold text-3xl text-on-surface mb-1">
            Postulaciones recibidas
          </h1>
          <p className="text-tertiary text-sm">
            Revisa y gestiona las postulaciones a los roles de tu proyecto.
          </p>
        </div>

        {isLoading && (
          <div className="text-center py-16 text-tertiary text-sm">Cargando postulaciones...</div>
        )}
        {isError && (
          <div className="text-center py-16 text-error text-sm">
            No se pudieron cargar las postulaciones. Verifica que seas el creador del proyecto.
          </div>
        )}

        {!isLoading && !isError && postulaciones.length === 0 && (
          <div className="text-center py-16">
            <p className="text-tertiary text-sm">Aún no hay postulaciones para este proyecto.</p>
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
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-tertiary" />
                    </div>
                    <div>
                      <p className="font-headline font-bold text-on-surface text-base leading-tight">
                        {p.postulante.nombre} {p.postulante.apellido}
                      </p>
                      <p className="text-tertiary text-xs">{p.postulante.correo}</p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${config.className}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {config.label}
                  </span>
                </div>

                <div className="mb-3">
                  <p className="text-xs font-bold text-tertiary uppercase tracking-wide mb-1">
                    Rol solicitado
                  </p>
                  <p className="text-on-surface text-sm font-medium">{p.rolProyecto.nombreRol}</p>
                </div>

                <div className="mb-4">
                  <p className="text-xs font-bold text-tertiary uppercase tracking-wide mb-1">
                    Justificación
                  </p>
                  <p className="text-on-surface text-sm leading-relaxed">{p.justificacion}</p>
                </div>

                {p.comentarioResolucion && (
                  <div className="bg-surface-container rounded-xl px-4 py-3 mb-4">
                    <p className="text-xs font-bold text-tertiary uppercase tracking-wide mb-0.5">
                      Comentario de resolución
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

                  {p.estadoPostulacion === 'PENDIENTE' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => abrirModal(p.idPostulacion, 'RECHAZADA')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-outline-variant text-sm font-semibold text-error hover:bg-error-container transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        Rechazar
                      </button>
                      <button
                        onClick={() => abrirModal(p.idPostulacion, 'ACEPTADA')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Aceptar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {modal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={cerrarModal}
        >
          <div
            className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-7 w-full max-w-md mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-headline font-bold text-on-surface text-xl mb-2">
              {modal.accion === 'ACEPTADA' ? 'Aceptar postulación' : 'Rechazar postulación'}
            </h2>
            <p className="text-tertiary text-sm mb-5">
              {modal.accion === 'ACEPTADA'
                ? '¿Confirmas que deseas aceptar esta postulación?'
                : '¿Confirmas que deseas rechazar esta postulación?'}
            </p>

            <div className="mb-5">
              <label className="block text-xs font-bold text-tertiary uppercase tracking-wide mb-1.5">
                Comentario (opcional)
              </label>
              <textarea
                value={modal.comentario}
                onChange={(e) => setModal((prev) => ({ ...prev, comentario: e.target.value }))}
                placeholder="Puedes dejar un mensaje al postulante..."
                rows={3}
                maxLength={500}
                className="w-full rounded-xl border border-outline-variant bg-surface-container px-4 py-3 text-sm text-on-surface placeholder:text-tertiary resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-right text-xs text-tertiary mt-1">{modal.comentario.length}/500</p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={cerrarModal}
                disabled={isPending}
                className="px-5 py-2.5 rounded-xl border border-outline-variant text-sm font-semibold text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={isPending}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 ${
                  modal.accion === 'ACEPTADA'
                    ? 'bg-primary text-on-primary hover:shadow-md hover:scale-[1.02] active:scale-95'
                    : 'bg-error text-on-error hover:shadow-md hover:scale-[1.02] active:scale-95'
                }`}
              >
                {isPending ? 'Guardando...' : modal.accion === 'ACEPTADA' ? 'Sí, aceptar' : 'Sí, rechazar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
