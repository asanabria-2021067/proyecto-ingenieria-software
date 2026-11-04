'use client';

import { PageTitle } from '@/components/ui/page-title';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, Eye, XCircle, User, Sparkles } from 'lucide-react';
import { ESTADO_POSTULACION_STYLE, MOTIVO_RECHAZO_LABEL } from '@/components/projects/application-status.utils';
import { PostulacionRespuestas } from '@/components/projects/postulacion-respuestas';
import { RechazoPostulacionDialog } from '@/components/projects/rechazo-postulacion-dialog';
import { Tag } from '@/components/ui/tag';
import { apiFetch } from '@/lib/api/client';
import { getApiErrorStatus } from '@/components/projects/api-error';
import { useRequireCan } from '@/hooks/use-can';
import { projectAllPostulationsQueryKey } from '@/lib/query-keys/applications';
import { MotivoRechazo, PostulacionRecibida } from '@/types';
import { SkeletonList } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';


type ModalState = {
  open: boolean;
  postulacionId: number | null;
  comentario: string;
};

export default function PostulacionesProyectoPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  // MEJ-21: por fecha (como siempre) o por coincidencia de habilidades.
  const [orden, setOrden] = useState<'fecha' | 'coincidencia'>('fecha');

  const [modal, setModal] = useState<ModalState>({
    open: false,
    postulacionId: null,
    comentario: '',
  });
  const [rechazando, setRechazando] = useState<PostulacionRecibida | null>(null);

  const {
    data: postulaciones = [],
    isLoading,
    isError,
    error,
  } = useQuery<PostulacionRecibida[]>({
    queryKey: [...projectAllPostulationsQueryKey(id), orden],
    queryFn: () => apiFetch(orden === 'coincidencia' ? `/proyectos/${id}/postulaciones?orden=coincidencia` : `/proyectos/${id}/postulaciones`),
  });

  // MEJ-100: abrir la lista cuenta como que el líder vio la postulación (una sola vez por postulación).
  const vistas = useRef(new Set<number>());
  useEffect(() => {
    for (const p of postulaciones) {
      if (p.estadoPostulacion !== 'PENDIENTE' || vistas.current.has(p.idPostulacion)) continue;
      vistas.current.add(p.idPostulacion);
      apiFetch(`/postulaciones/${p.idPostulacion}`).catch(() => vistas.current.delete(p.idPostulacion));
    }
  }, [postulaciones]);

  const { denegado } = useRequireCan('proyecto.postulaciones.resolver', {
    esLider: getApiErrorStatus(error) !== 403,
    listo: !isLoading,
  });

  const { mutate: resolverPostulacion, isPending } = useMutation({
    mutationFn: ({
      postulacionId,
      estadoPostulacion,
      motivoRechazo,
      comentarioResolucion,
    }: {
      postulacionId: number;
      estadoPostulacion: 'ACEPTADA' | 'RECHAZADA';
      motivoRechazo?: MotivoRechazo;
      comentarioResolucion?: string;
    }) =>
      apiFetch(`/postulaciones/${postulacionId}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ estadoPostulacion, motivoRechazo, comentarioResolucion: comentarioResolucion || undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectAllPostulationsQueryKey(id) });
      cerrarModal();
      setRechazando(null);
    },
  });

  const { mutate: marcarEnRevision, isPending: marcando } = useMutation({
    mutationFn: (postulacionId: number) => apiFetch(`/postulaciones/${postulacionId}/en-revision`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectAllPostulationsQueryKey(id) }),
  });

  function abrirModal(postulacionId: number) {
    setModal({ open: true, postulacionId, comentario: '' });
  }

  function cerrarModal() {
    setModal({ open: false, postulacionId: null, comentario: '' });
  }

  function confirmar() {
    if (!modal.postulacionId) return;
    resolverPostulacion({
      postulacionId: modal.postulacionId,
      estadoPostulacion: 'ACEPTADA',
      comentarioResolucion: modal.comentario.trim() || undefined,
    });
  }

  if (denegado) return null;

  return (
    <>
      <div className="mx-auto max-w-[1400px] px-8 py-8">
        <Link
          href={`/dashboard/proyectos/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-tertiary hover:text-primary mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al proyecto
        </Link>

        <div className="mb-8">
          <PageTitle className="type-display mb-1">
            Postulaciones recibidas
          </PageTitle>
          <p className="text-tertiary text-sm">
            Revisa y gestiona las postulaciones a los roles de tu proyecto.
          </p>
        </div>

        {postulaciones.length > 1 && (
          <div role="group" aria-label="Ordenar postulaciones" className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-tertiary">Ordenar por</span>
            <Button type="button" size="sm" variant={orden === 'fecha' ? 'default' : 'outline'} aria-pressed={orden === 'fecha'} onClick={() => setOrden('fecha')}>
              Más recientes
            </Button>
            <Button type="button" size="sm" variant={orden === 'coincidencia' ? 'default' : 'outline'} aria-pressed={orden === 'coincidencia'} onClick={() => setOrden('coincidencia')}>
              <Sparkles aria-hidden="true" />
              Coincidencia de habilidades
            </Button>
          </div>
        )}

        {isLoading && (
          <SkeletonList label="Cargando postulaciones" count={3} lines={2} avatar="circle" trailing={1} />
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
            const config = ESTADO_POSTULACION_STYLE[p.estadoPostulacion];
            const Icon = config.icon;

            return (
              <div
                key={p.idPostulacion}
                className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6"
              >
                {/* Cabecera */}
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

                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {p.coincidencia && (
                      <Tag tone={p.coincidencia.porcentaje >= 50 ? 'lime' : 'neutral'} title={`Cumple ${p.coincidencia.cumplidos} de ${p.coincidencia.total} habilidades del rol`}>
                        <Sparkles aria-hidden="true" />
                        {p.coincidencia.porcentaje}% coincide
                      </Tag>
                    )}
                    <Tag tone={config.tone}>
                      <Icon aria-hidden="true" />
                      {config.label}
                    </Tag>
                  </div>
                </div>

                {/* Rol */}
                <div className="mb-3">
                  <p className="text-xs font-bold text-tertiary uppercase tracking-wide mb-1">
                    Rol solicitado
                  </p>
                  <p className="text-on-surface text-sm font-medium">{p.rolProyecto.nombreRol}</p>
                </div>

                {/* Justificación */}
                <div className="mb-4">
                  <p className="text-xs font-bold text-tertiary uppercase tracking-wide mb-1">
                    Justificación
                  </p>
                  <p className="text-on-surface text-sm leading-relaxed">{p.justificacion}</p>
                </div>

                {p.respuestas?.length ? (
                  <div className="mb-4">
                    <PostulacionRespuestas respuestas={p.respuestas} />
                  </div>
                ) : null}

                {p.motivoRechazo && (
                  <div className="bg-surface-container rounded-xl px-4 py-3 mb-4">
                    <p className="text-xs font-bold text-tertiary uppercase tracking-wide mb-0.5">
                      Motivo del rechazo
                    </p>
                    <p className="text-on-surface text-sm">{MOTIVO_RECHAZO_LABEL[p.motivoRechazo] ?? p.motivoRechazo}</p>
                  </div>
                )}

                {/* Comentario de resolución (solo si existe) */}
                {p.comentarioResolucion && (
                  <div className="bg-surface-container rounded-xl px-4 py-3 mb-4">
                    <p className="text-xs font-bold text-tertiary uppercase tracking-wide mb-0.5">
                      Comentario de resolución
                    </p>
                    <p className="text-on-surface text-sm">{p.comentarioResolucion}</p>
                  </div>
                )}

                {/* Footer: fecha + acciones */}
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
                    <div className="flex flex-wrap gap-2">
                      {!p.eventos?.some((e) => e.tipo === 'EN_REVISION') && (
                        <Button
                          variant="outline"
                          onClick={() => marcarEnRevision(p.idPostulacion)}
                          disabled={marcando}
                          className="h-auto gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold has-[>svg]:px-4"
                        >
                          <Eye className="w-4 h-4" aria-hidden="true" />
                          Marcar en revisión
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => setRechazando(p)}
                        className="h-auto gap-1.5 rounded-xl border-outline-variant bg-transparent px-4 py-2 text-sm font-semibold text-error shadow-none hover:bg-error-container hover:text-error has-[>svg]:px-4 dark:border-outline-variant dark:bg-transparent dark:hover:bg-error-container"
                      >
                        <XCircle className="w-4 h-4" />
                        Rechazar
                      </Button>
                      <Button
                        onClick={() => abrirModal(p.idPostulacion)}
                        className="h-auto gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary has-[>svg]:px-4 motion-glow-primary"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Aceptar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {rechazando && (
        <RechazoPostulacionDialog
          nombrePostulante={`${rechazando.postulante.nombre} ${rechazando.postulante.apellido}`}
          pendiente={isPending}
          onCerrar={() => setRechazando(null)}
          onConfirmar={(datos) =>
            resolverPostulacion({ postulacionId: rechazando.idPostulacion, estadoPostulacion: 'RECHAZADA', ...datos })
          }
        />
      )}

      {/* Aceptar, con comentario opcional */}
      {modal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={cerrarModal}
        >
          <div
            className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-7 w-full max-w-md mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-headline font-bold text-on-surface text-xl mb-2">Aceptar postulación</h2>

            <p className="text-tertiary text-sm mb-5">¿Confirmas que deseas aceptar esta postulación?</p>

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
              <Button
                variant="outline"
                onClick={cerrarModal}
                disabled={isPending}
                className="h-auto rounded-xl border-outline-variant bg-transparent px-5 py-2.5 text-sm font-semibold text-on-surface shadow-none hover:bg-surface-container hover:text-on-surface dark:border-outline-variant dark:bg-transparent dark:hover:bg-surface-container"
              >
                Cancelar
              </Button>

              <Button
                onClick={confirmar}
                disabled={isPending}
                className="h-auto rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary hover:bg-primary motion-glow-primary"
              >
                {isPending ? 'Guardando...' : 'Sí, aceptar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
