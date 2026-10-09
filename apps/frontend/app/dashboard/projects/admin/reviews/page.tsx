'use client';

import { useState, type ReactNode } from 'react';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, CheckCheck } from 'lucide-react';
import { ResumenKpi } from '@/components/dashboard/resumen-kpi';
import { IconoTipo } from '@/components/hours/my-hours-project-list';
import { tipoBadgeLabel, tipoBadgeStyle } from '@/components/projects/available-project-card';
import { formatInstanteGuatemala } from '@/lib/admin/sprint-calendar';
import type { TipoProyecto } from '@/types';
import {
  RequestInboxCard,
  RequestInboxKpis,
  RequestInboxSection,
} from '@/components/admin/request-inbox';
import { Button } from '@/components/ui/button';
import { ProjectReviewSheet } from '@/components/admin/ProjectReviewSheet';
import { ProjectFeedbackSheet } from '@/components/admin/ProjectFeedbackSheet';
import uvgSwal from '@/lib/swal';
import { getAdminReviewInbox, resolverRevision } from '@/lib/services/projects';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';

// Acciones de la tarjeta: el mismo botón compacto de «Ver proyecto» del panel
// (alto, radio y tipografía), sin icono y con el color semántico de cada acción.
const ACCION = 'text-xs font-semibold';
const ACCION_VERDE = 'bg-primary text-on-primary hover:bg-primary/90';
const ACCION_REVISION = 'bg-review text-on-review hover:bg-review-strong';

/**
 * Contenido de una tarjeta de solicitud: título, y debajo la categoría REAL del
 * proyecto (la misma etiqueta de «Mis Horas») junto al líder y el envío. El
 * estado de la revisión no se repite como etiqueta: ya lo dice la sección.
 */
function DetalleSolicitud({ titulo, tipo, children }: { titulo: string; tipo: TipoProyecto; children: ReactNode }) {
  return (
    <>
      {/* Mismo título de proyecto que «Mis Horas». */}
      <p className="type-subtitle break-words font-semibold">{titulo}</p>
      <div className="mt-micro flex flex-wrap items-center gap-x-tight gap-y-micro">
        <span className={`pill ${tipoBadgeStyle(tipo)}`}>{tipoBadgeLabel(tipo)}</span>
        <p className="type-meta">{children}</p>
      </div>
    </>
  );
}

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
    try {
      await resolverRevision(idProyecto, { resultado: 'APROBADA' });
      await refresh();
    } catch (err) {
      // 409: otro administrador ya resolvió o el proyecto cambió de estado →
      // invalidar y recargar la bandeja; nunca reintentar a ciegas.
      await refresh();
      void uvgSwal.fire({
        icon: getApiErrorStatus(err) === 409 ? 'info' : 'error',
        title: getApiErrorStatus(err) === 409 ? 'La revisión ya fue resuelta' : 'No se pudo aprobar',
        text: getApiErrorMessage(err, 'admin'),
      });
    }
  }

  // S7 (V5 §31.2): esta bandeja es SOLO de publicación. Los cierres se
  // consultan y resuelven en «Solicitudes de cierre»
  // (`/dashboard/admin/proyectos?grupo=cierres`); aquí no se muestran, aunque
  // el endpoint siga devolviendo `cierresPendientes`.
  //
  // Una revisión PENDIENTE con `numeroEnvio > 1` solo puede existir tras un
  // reenvío desde OBSERVADO: el estudiante ya corrigió y espera una NUEVA
  // revisión. Un proyecto OBSERVADO, en cambio, espera al estudiante.
  const pendientes = inbox?.revisionesPendientes ?? [];
  const primerEnvio = pendientes.filter((r) => r.numeroEnvio <= 1);
  const reenviadas = pendientes.filter((r) => r.numeroEnvio > 1);
  const enEsperaDeCorrecciones = inbox?.correccionesEnviadas ?? [];

  const totalPendientes = pendientes.length + enEsperaDeCorrecciones.length;

  const filaRevision = (r: (typeof pendientes)[number]) => (
    <RequestInboxCard
      key={r.idRevisionProyecto}
      icon={<IconoTipo tipo={r.proyecto.tipoProyecto} />}
      actions={
        <>
          <Button type="button" size="sm" onClick={() => void resolveApprove(r.idProyecto)} className={`${ACCION} ${ACCION_VERDE}`}>
            Aprobar
          </Button>
          <Button type="button" size="sm" onClick={() => openReviewSheet(r.idProyecto)} className={`${ACCION} ${ACCION_REVISION}`}>
            Revisar
          </Button>
        </>
      }
    >
      <DetalleSolicitud titulo={r.proyecto.tituloProyecto} tipo={r.proyecto.tipoProyecto}>
        Líder: {r.proyecto.creador.nombre} {r.proyecto.creador.apellido} · Envío #{r.numeroEnvio}
        {r.enviadaEn && <> · Recibida el {formatInstanteGuatemala(r.enviadaEn)}</>}
      </DetalleSolicitud>
    </RequestInboxCard>
  );

  return (
    <>
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
        <AdminBreadcrumb seccion="Proyectos" seccionHref="/dashboard/admin/proyectos?grupo=activos" pagina="Solicitudes de publicación" />
        {/* Header */}
        <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="type-display text-balance">
              Solicitudes de publicación
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-tertiary">
              Evalúa los proyectos enviados por estudiantes, aprueba su publicación o solicita correcciones.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="flex shrink-0 items-center gap-2 self-start rounded-xl bg-surface-container-high px-4 py-2.5 text-sm font-bold text-on-surface outline-none transition-colors hover:bg-primary hover:text-on-primary focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
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
            {/* Resumen: solo publicación. */}
            <RequestInboxKpis columns={3}>
              <ResumenKpi label="Pendientes de revisión" valor={primerEnvio.length} punto="bg-outline" />
              <ResumenKpi label="Reenviadas para revisión" valor={reenviadas.length} punto="bg-status-warning" />
              <ResumenKpi label="En espera de correcciones" valor={enEsperaDeCorrecciones.length} punto="bg-review-soft" />
            </RequestInboxKpis>

            {/* Primer envío: nadie lo ha revisado todavía. */}
            <RequestInboxSection
              title="Pendientes de revisión"
              empty="No hay solicitudes pendientes de revisión"
              isEmpty={primerEnvio.length === 0}
            >
              {primerEnvio.map(filaRevision)}
            </RequestInboxSection>

            {/* El estudiante ya corrigió: esperan una nueva revisión administrativa. */}
            <RequestInboxSection
              title="Reenviadas para revisión"
              empty="No hay solicitudes reenviadas"
              isEmpty={reenviadas.length === 0}
            >
              {reenviadas.map(filaRevision)}
            </RequestInboxSection>

            {/* Observadas: el administrador pidió cambios y el estudiante aún no reenvía. */}
            <RequestInboxSection
              title="En espera de correcciones"
              empty="No hay solicitudes en espera de correcciones"
              isEmpty={enEsperaDeCorrecciones.length === 0}
            >
              {enEsperaDeCorrecciones.map((p) => {
                const revision = p.revisiones[0];
                return (
                  <RequestInboxCard
                    key={p.idProyecto}
                    icon={<IconoTipo tipo={p.tipoProyecto} />}
                    tone="review"
                    actions={
                      <>
                        <Button type="button" size="sm" onClick={() => openFeedbackSheet(p.idProyecto)} className={`${ACCION} ${ACCION_REVISION}`}>
                          Ver retroalimentación
                        </Button>
                      </>
                    }
                  >
                    <DetalleSolicitud titulo={p.tituloProyecto} tipo={p.tipoProyecto}>
                      Líder: {p.creador.nombre} {p.creador.apellido}
                      {revision && <> · Envío #{revision.numeroEnvio}</>}
                      {revision?.revisadaEn && <> · Revisado el {formatInstanteGuatemala(revision.revisadaEn)}</>}
                    </DetalleSolicitud>
                  </RequestInboxCard>
                );
              })}
            </RequestInboxSection>

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
