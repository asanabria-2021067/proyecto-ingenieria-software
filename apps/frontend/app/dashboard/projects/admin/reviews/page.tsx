'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, RefreshCw, CheckCircle2, Eye, SendHorizonal, GitPullRequest, XCircle, CheckCheck, MessageSquareWarning } from 'lucide-react';
import { ProjectReviewSheet } from '@/components/admin/ProjectReviewSheet';
import { ProjectFeedbackSheet } from '@/components/admin/ProjectFeedbackSheet';
import uvgSwal, { swalCustomClass } from '@/lib/swal';
import {
  approveProjectClosure,
  getAdminReviewInbox,
  rejectProjectClosure,
  resolverRevision,
} from '@/lib/services/projects';

export default function AdminReviewsInboxPage() {
  const queryClient = useQueryClient();
  const [reviewSheet, setReviewSheet] = useState<{ open: boolean; idProyecto: number | null }>({
    open: false,
    idProyecto: null,
  });
  const [feedbackSheet, setFeedbackSheet] = useState<{ open: boolean; idProyecto: number | null }>({
    open: false,
    idProyecto: null,
  });

  const { data: inbox, isLoading: loading, error } = useQuery({
    queryKey: ['adminReviewInbox'],
    queryFn: getAdminReviewInbox,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['adminReviewInbox'] });

  function openReviewSheet(idProyecto: number) {
    setReviewSheet({ open: true, idProyecto });
  }

  function openFeedbackSheet(idProyecto: number) {
    setFeedbackSheet({ open: true, idProyecto });
  }

  async function resolveApprove(idProyecto: number) {
    const { isConfirmed } = await uvgSwal.fire({
      icon: 'success',
      title: 'Aprobar proyecto',
      text: '¿Confirmas que el proyecto cumple con los requisitos?',
      showCancelButton: true,
      confirmButtonText: 'Aprobar',
      cancelButtonText: 'Cancelar',
    });
    if (!isConfirmed) return;
    await resolverRevision(idProyecto, { resultado: 'APROBADA' });
    await refresh();
  }

  async function resolveClosure(idProyecto: number, action: 'APPROVE' | 'REJECT') {
    const { isConfirmed } = await uvgSwal.fire({
      icon: action === 'APPROVE' ? 'question' : 'warning',
      title: action === 'APPROVE' ? '¿Aprobar cierre?' : '¿Rechazar cierre?',
      text: action === 'APPROVE'
        ? 'El proyecto será marcado como cerrado.'
        : 'La solicitud de cierre será rechazada.',
      showCancelButton: true,
      confirmButtonText: action === 'APPROVE' ? 'Sí, aprobar' : 'Sí, rechazar',
      cancelButtonText: 'Cancelar',
      ...(action === 'REJECT' && {
        customClass: {
          ...swalCustomClass,
          confirmButton: 'rounded-xl bg-error px-5 py-2 text-xs font-bold text-on-error hover:bg-error/90 transition-all shadow-md mx-4',
        },
      }),
    });
    if (!isConfirmed) return;
    if (action === 'APPROVE') {
      await approveProjectClosure(idProyecto);
    } else {
      await rejectProjectClosure(idProyecto);
    }
    await refresh();
  }

  const totalPendientes =
    (inbox?.revisionesPendientes.length ?? 0) + (inbox?.cierresPendientes.length ?? 0) + (inbox?.correccionesEnviadas.length ?? 0);

  return (
    <>
      <div className="px-4 pb-12 pt-8 md:px-8">
        {/* Header */}
        <section className="mb-10 flex items-start justify-between">
          <div>
            <span className="mb-2 block text-xs font-black uppercase tracking-widest text-primary">
              Administración
            </span>
            <h1 className="font-headline text-4xl font-black tracking-tighter text-on-surface md:text-5xl">
              Revisiones
            </h1>
            <p className="mt-2 max-w-2xl text-base text-tertiary">
              Bandeja de proyectos pendientes de revisión y solicitudes de cierre.
            </p>
          </div>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-surface-container-high px-4 py-2.5 text-sm font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </section>

        {error && (
          <div className="mb-6 rounded-2xl border border-error/30 bg-error/10 px-5 py-4 text-sm font-medium text-error">
            {error?.message ?? 'No se pudo cargar la bandeja'}
          </div>
        )}

        {loading && !inbox && (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}

        {!loading && inbox && (
          <div className="space-y-10">
            {/* Resumen */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex items-center gap-4 rounded-2xl border border-outline-variant bg-surface-container-low p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <ClipboardList className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-tertiary">En revisión</p>
                  <p className="text-3xl font-black tracking-tighter text-on-surface">
                    {inbox.revisionesPendientes.length}
                  </p>
                  <p className="text-xs text-tertiary">Proyectos pendientes de revisión</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-2xl border border-outline-variant bg-surface-container-low p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                  <GitPullRequest className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-tertiary">Cierre pendiente</p>
                  <p className="text-3xl font-black tracking-tighter text-on-surface">
                    {inbox.cierresPendientes.length}
                  </p>
                  <p className="text-xs text-tertiary">Solicitudes de cierre por aprobar</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-2xl border border-outline-variant bg-surface-container-low p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-500/10">
                  <MessageSquareWarning className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-tertiary">Correcciones enviadas</p>
                  <p className="text-3xl font-black tracking-tighter text-on-surface">
                    {inbox.correccionesEnviadas.length}
                  </p>
                  <p className="text-xs text-tertiary">Esperando corrección del estudiante</p>
                </div>
              </div>
            </div>

            {/* Revisiones pendientes */}
            <section>
              <h2 className="mb-4 font-headline text-lg font-black tracking-tight text-on-surface">
                Revisiones pendientes
              </h2>
              {inbox.revisionesPendientes.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-outline-variant bg-surface-container-lowest py-12 text-center">
                  <CheckCheck className="mb-3 h-10 w-10 text-primary opacity-40" />
                  <p className="text-sm font-medium text-tertiary">No hay revisiones pendientes</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {inbox.revisionesPendientes.map((r) => (
                    <div
                      key={r.idRevisionProyecto}
                      className="flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-headline text-base font-black text-on-surface">
                          {r.proyecto.tituloProyecto}
                        </p>
                        <p className="mt-0.5 text-xs text-tertiary">
                          {r.proyecto.creador.nombre} {r.proyecto.creador.apellido} · Envío #{r.numeroEnvio}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:shrink-0">
                        <button
                          onClick={() => void resolveApprove(r.idProyecto)}
                          className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-on-primary transition-colors hover:bg-primary/90"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Aprobar
                        </button>
                        <button
                          onClick={() => openReviewSheet(r.idProyecto)}
                          className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-amber-700"
                        >
                          <SendHorizonal className="h-3.5 w-3.5" />
                          Revisar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Correcciones enviadas */}
            <section>
              <h2 className="mb-4 font-headline text-lg font-black tracking-tight text-on-surface">
                Correcciones enviadas
              </h2>
              {inbox.correccionesEnviadas.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-outline-variant bg-surface-container-lowest py-12 text-center">
                  <CheckCheck className="mb-3 h-10 w-10 text-primary opacity-40" />
                  <p className="text-sm font-medium text-tertiary">No hay proyectos esperando corrección</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {inbox.correccionesEnviadas.map((p) => {
                    const revision = p.revisiones[0];
                    return (
                      <div
                        key={p.idProyecto}
                        className="flex flex-col gap-4 rounded-2xl border border-orange-200 bg-orange-50/50 dark:border-orange-500/20 dark:bg-orange-500/5 p-5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-headline text-base font-black text-on-surface">
                            {p.tituloProyecto}
                          </p>
                          <p className="mt-0.5 text-xs text-tertiary">
                            {p.creador.nombre} {p.creador.apellido}
                          </p>
                          {revision && (
                            <p className="mt-0.5 text-xs text-tertiary">
                              Envío #{revision.numeroEnvio}
                              {revision.revisadaEn && (
                                <> · Revisado el {new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(revision.revisadaEn))}</>
                              )}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => openFeedbackSheet(p.idProyecto)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-amber-700"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Ver retroalimentación
                          </button>
                          <span className="inline-flex items-center gap-1.5 rounded-xl border border-orange-300 bg-orange-100 px-3 py-2 text-xs font-bold text-on-surface dark:border-orange-500/30 dark:bg-orange-500/10">
                            <MessageSquareWarning className="h-3.5 w-3.5" />
                            Esperando corrección
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Solicitudes de cierre */}
            <section>
              <h2 className="mb-4 font-headline text-lg font-black tracking-tight text-on-surface">
                Solicitudes de cierre
              </h2>
              {inbox.cierresPendientes.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-outline-variant bg-surface-container-lowest py-12 text-center">
                  <CheckCheck className="mb-3 h-10 w-10 text-primary opacity-40" />
                  <p className="text-sm font-medium text-tertiary">No hay cierres pendientes</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {inbox.cierresPendientes.map((c) => (
                    <div
                      key={c.idProyecto}
                      className="flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <p className="font-headline text-base font-black text-on-surface">
                        {c.tituloProyecto}
                      </p>
                      <div className="flex flex-wrap gap-2 sm:shrink-0">
                        <button
                          onClick={() => void resolveClosure(c.idProyecto, 'APPROVE')}
                          className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-on-primary transition-colors hover:bg-primary/90"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Aprobar cierre
                        </button>
                        <button
                          onClick={() => void resolveClosure(c.idProyecto, 'REJECT')}
                          className="flex items-center gap-1.5 rounded-xl bg-error px-3 py-2 text-xs font-bold text-on-error transition-colors hover:bg-error/90"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Rechazar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {totalPendientes === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCheck className="mb-4 h-14 w-14 text-primary opacity-30" />
                <p className="font-headline text-lg font-black text-on-surface">Todo al día</p>
                <p className="mt-1 text-sm text-tertiary">No hay elementos pendientes en la bandeja.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <ProjectReviewSheet
        idProyecto={reviewSheet.idProyecto}
        open={reviewSheet.open}
        onOpenChange={(open) => setReviewSheet((s) => ({ ...s, open }))}
        onResolved={() => void refresh()}
      />

      <ProjectFeedbackSheet
        idProyecto={feedbackSheet.idProyecto}
        open={feedbackSheet.open}
        onOpenChange={(open) => setFeedbackSheet((s) => ({ ...s, open }))}
      />
    </>
  );
}
