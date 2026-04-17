'use client';

import * as React from 'react';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Clock, CheckCircle, XCircle, User } from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { apiFetch } from '@/lib/api/client';
import { EstadoPostulacion, PostulacionRecibida } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';


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

type AccionPendiente = {
  idPostulacion: number;
  nombrePostulante: string;
  accion: 'ACEPTADA' | 'RECHAZADA';
};

export default function PostulacionesProyectoPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [accionPendiente, setAccionPendiente] = useState<AccionPendiente | null>(null);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);

  const {
    data: postulaciones = [],
    isLoading,
    isError,
  } = useQuery<PostulacionRecibida[]>({
    queryKey: ['postulaciones-proyecto', id],
    queryFn: () => apiFetch(`/proyectos/${id}/postulaciones`),
  });

  const mutation = useMutation({
    mutationFn: ({ idPostulacion, estadoPostulacion }: { idPostulacion: number; estadoPostulacion: 'ACEPTADA' | 'RECHAZADA' }) =>
      apiFetch(`/postulaciones/${idPostulacion}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ estadoPostulacion }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['postulaciones-proyecto', id] });
      setAccionPendiente(null);
      setErrorMensaje(null);
    },
    onError: (err: Error) => {
      setErrorMensaje(err.message || 'No se pudo procesar la acción.');
    },
  });

  const confirmarAccion = () => {
    if (!accionPendiente) return;
    mutation.mutate({
      idPostulacion: accionPendiente.idPostulacion,
      estadoPostulacion: accionPendiente.accion,
    });
  };

  const pendientes = postulaciones.filter((p) => p.estadoPostulacion === 'PENDIENTE');
  const resueltas = postulaciones.filter((p) => p.estadoPostulacion !== 'PENDIENTE');

  return (
    <DashboardLayout>
      <div className="px-8 py-8 max-w-4xl mx-auto">
        {/* Cabecera */}
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
            Revisa y gestiona las solicitudes de colaboradores para tu proyecto.
          </p>
        </div>

        {isLoading && (
          <div className="text-center py-16 text-tertiary text-sm">
            Cargando postulaciones...
          </div>
        )}
        {isError && (
          <div className="text-center py-16 text-error text-sm">
            No se pudieron cargar las postulaciones. Verifica que seas el creador del proyecto.
          </div>
        )}

        {!isLoading && !isError && postulaciones.length === 0 && (
          <div className="text-center py-16">
            <p className="text-tertiary text-sm">Este proyecto aún no tiene postulaciones.</p>
          </div>
        )}

        {/* Pendientes */}
        {pendientes.length > 0 && (
          <section className="mb-8">
            <h2 className="font-headline font-bold text-on-surface text-lg mb-4">
              Pendientes ({pendientes.length})
            </h2>
            <div className="space-y-4">
              {pendientes.map((p) => (
                <PostulacionCard
                  key={p.idPostulacion}
                  postulacion={p}
                  onAceptar={() =>
                    setAccionPendiente({
                      idPostulacion: p.idPostulacion,
                      nombrePostulante: `${p.postulante.nombre} ${p.postulante.apellido}`,
                      accion: 'ACEPTADA',
                    })
                  }
                  onRechazar={() =>
                    setAccionPendiente({
                      idPostulacion: p.idPostulacion,
                      nombrePostulante: `${p.postulante.nombre} ${p.postulante.apellido}`,
                      accion: 'RECHAZADA',
                    })
                  }
                />
              ))}
            </div>
          </section>
        )}

        {/* Resueltas */}
        {resueltas.length > 0 && (
          <section>
            <h2 className="font-headline font-bold text-on-surface text-lg mb-4">
              Resueltas ({resueltas.length})
            </h2>
            <div className="space-y-4">
              {resueltas.map((p) => (
                <PostulacionCard key={p.idPostulacion} postulacion={p} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Modal de confirmación */}
      <Dialog
        open={!!accionPendiente}
        onOpenChange={(open) => {
          if (!open) {
            setAccionPendiente(null);
            setErrorMensaje(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {accionPendiente?.accion === 'ACEPTADA' ? 'Aceptar postulación' : 'Rechazar postulación'}
            </DialogTitle>
            <DialogDescription>
              {accionPendiente?.accion === 'ACEPTADA'
                ? `¿Confirmas que quieres aceptar la postulación de ${accionPendiente?.nombrePostulante}?`
                : `¿Confirmas que quieres rechazar la postulación de ${accionPendiente?.nombrePostulante}?`}
            </DialogDescription>
          </DialogHeader>

          {errorMensaje && (
            <p className="text-error text-sm px-1">{errorMensaje}</p>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setAccionPendiente(null);
                setErrorMensaje(null);
              }}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant={accionPendiente?.accion === 'ACEPTADA' ? 'default' : 'destructive'}
              onClick={confirmarAccion}
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? 'Procesando...'
                : accionPendiente?.accion === 'ACEPTADA'
                ? 'Sí, aceptar'
                : 'Sí, rechazar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

// Componente de tarjeta de postulación
function PostulacionCard({
  postulacion,
  onAceptar,
  onRechazar,
}: {
  postulacion: PostulacionRecibida;
  onAceptar?: () => void;
  onRechazar?: () => void;
}) {
  const config = ESTADO_CONFIG[postulacion.estadoPostulacion];
  const Icon = config.icon;
  const esPendiente = postulacion.estadoPostulacion === 'PENDIENTE';

  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6">
      {/* Cabecera de la tarjeta */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-tertiary" />
          </div>
          <div>
            <p className="font-bold text-on-surface text-sm leading-tight">
              {postulacion.postulante.nombre} {postulacion.postulante.apellido}
            </p>
            <p className="text-tertiary text-xs">{postulacion.postulante.correo}</p>
          </div>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${config.className}`}
        >
          <Icon className="w-3.5 h-3.5" />
          {config.label}
        </span>
      </div>

      {/* Rol */}
      <p className="text-xs text-tertiary mb-2">
        Rol solicitado:{' '}
        <span className="font-semibold text-on-surface">{postulacion.rolProyecto.nombreRol}</span>
      </p>

      {/* Justificación */}
      <div className="bg-surface-container rounded-xl px-4 py-3 mb-3">
        <p className="text-xs font-bold text-tertiary uppercase tracking-wide mb-1">
          Justificación
        </p>
        <p className="text-on-surface text-sm leading-relaxed">{postulacion.justificacion}</p>
      </div>

      {/* Comentario de resolución */}
      {postulacion.comentarioResolucion && (
        <div className="bg-surface-container rounded-xl px-4 py-3 mb-3">
          <p className="text-xs font-bold text-tertiary uppercase tracking-wide mb-1">
            Comentario de resolución
          </p>
          <p className="text-on-surface text-sm">{postulacion.comentarioResolucion}</p>
        </div>
      )}

      {/* Footer: fecha + acciones */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-tertiary">
          {new Date(postulacion.fechaPostulacion).toLocaleDateString('es-GT', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </span>

        {esPendiente && onAceptar && onRechazar && (
          <div className="flex gap-2">
            <button
              onClick={onRechazar}
              className="px-4 py-1.5 rounded-xl border border-error text-error text-xs font-bold hover:bg-error-container transition-colors"
            >
              Rechazar
            </button>
            <button
              onClick={onAceptar}
              className="px-4 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-bold hover:shadow-md transition-all"
            >
              Aceptar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
