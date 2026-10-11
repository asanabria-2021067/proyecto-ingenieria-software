'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { AlertCircle, SearchX } from 'lucide-react';
import { useAdminAppeal, useLeadershipCandidates } from '@/hooks/use-leadership';
import { acceptAppeal } from '@/lib/services/leadership';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { estadoBadgeLabel, estadoBadgeStyle } from '@/components/projects/available-project-card';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { REQUEST_INBOX_BUTTON, REQUEST_INBOX_BUTTON_GREEN } from '@/components/admin/request-inbox-details';
import { AppealDenyDialog } from '@/components/leadership/appeal-deny-dialog';
import { LeadershipChangeDialog } from '@/components/leadership/leadership-change-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  ESTADO_APELACION_BADGE,
  appealsInboxHref,
  formatearFechaApelacion,
  nombreCompleto,
  parseFiltroApelacion,
  proyectoAdmiteResolucion,
} from '@/lib/admin/appeals';
import { motivoInelegibilidadLabel, type TransferLeadershipInput, type UsuarioResumenDto } from '@/lib/types/leadership';
import { ADMIN_PAGE_NARROW } from '@/components/admin/admin-page';

function formatearDecimal(value: string): string {
  const [entera, decimal = ''] = value.split('.');
  const dec = decimal.replace(/0+$/, '');
  return dec.length > 0 ? `${entera}.${dec}` : entera;
}

function Persona({ rotulo, persona, children }: { rotulo: string; persona: UsuarioResumenDto; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-tight">
      <Avatar className="size-8 shrink-0">
        <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
          {`${persona.nombre.charAt(0)}${persona.apellido.charAt(0)}`.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="type-meta">{rotulo}</p>
        <p className="type-body break-words font-semibold text-text-primary">{nombreCompleto(persona)}</p>
        {children}
      </div>
    </div>
  );
}

function Dato({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="type-meta">{rotulo}</dt>
      <dd className="mt-micro type-body text-text-primary">{children}</dd>
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div className="flex flex-col gap-stack" role="status" aria-label="Cargando apelación">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-40 w-full rounded-card" />
      <Skeleton className="h-56 w-full rounded-card" />
    </div>
  );
}

/**
 * Vista administrativa de UNA apelación: información general, solicitud de
 * transferencia, validación del candidato y resolución.
 *
 * No hay un segundo motor: «Aceptar y transferir» abre el mismo diálogo de
 * «Cambiar liderazgo» (selector de candidatos elegibles, motivo y CAS del
 * líder esperado) enviando por el endpoint de aceptación, que resuelve la
 * apelación y transfiere en una sola transacción; «Denegar» usa su diálogo
 * de siempre. Una apelación ya resuelta se muestra en solo lectura.
 */
export default function AppealReviewClient() {
  const { apelacionId } = useParams<{ apelacionId: string }>();
  const idApelacion = Number(apelacionId);
  const searchParams = useSearchParams();
  // Pestaña y página de origen, para volver al mismo punto de la bandeja.
  const bandejaHref = appealsInboxHref(
    parseFiltroApelacion(searchParams.get('estado')),
    Math.max(1, Number(searchParams.get('page')) || 1),
  );

  const { data: apelacion, isPending, isError, error, refetch } = useAdminAppeal(idApelacion);
  const [aceptando, setAceptando] = useState(false);
  const [denegando, setDenegando] = useState(false);

  const pendiente = apelacion?.estadoApelacion === 'PENDIENTE';
  const estadoProyecto = apelacion?.proyecto?.estadoProyecto;
  // Sin el estado del proyecto no se bloquea nada aquí: decide el backend.
  const proyectoOperable = estadoProyecto === undefined || proyectoAdmiteResolucion(estadoProyecto);
  const resoluble = pendiente && proyectoOperable;

  // Los criterios de elegibilidad son los del flujo «Cambiar liderazgo»: mismo endpoint, sin copia local.
  const candidatos = useLeadershipCandidates(apelacion?.idProyecto ?? 0, resoluble);
  const propuesto =
    candidatos.data?.candidatos.find((c) => c.idUsuario === apelacion?.candidatoPropuesto.idUsuario) ?? null;
  const liderActual = candidatos.data?.contexto.liderActual ?? null;
  const otrosElegibles = (candidatos.data?.candidatos ?? []).filter(
    (c) => c.seleccionable && c.idUsuario !== apelacion?.candidatoPropuesto.idUsuario,
  ).length;

  const cabecera = (
    <AdminBreadcrumb seccion="Apelaciones" seccionHref={bandejaHref} pagina={`Apelación #${Number.isNaN(idApelacion) ? '—' : idApelacion}`} />
  );

  if (isPending) {
    return (
      <div className={`${ADMIN_PAGE_NARROW} pb-12 pt-8`}>
        {cabecera}
        <ReviewSkeleton />
      </div>
    );
  }

  if (isError || !apelacion) {
    const noExiste = getApiErrorStatus(error) === 404 || Number.isNaN(idApelacion);
    return (
      <div className={`${ADMIN_PAGE_NARROW} pb-12 pt-8`}>
        {cabecera}
        <Empty tone={noExiste ? 'default' : 'danger'} role="alert">
          <EmptyMedia variant="icon">
            {noExiste ? <SearchX aria-hidden="true" className="size-7" /> : <AlertCircle aria-hidden="true" className="size-7" />}
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{noExiste ? 'No encontramos esta apelación.' : getApiErrorMessage(error, 'admin')}</EmptyTitle>
            {noExiste && <EmptyDescription>Puede que el enlace sea incorrecto o que la apelación ya no exista.</EmptyDescription>}
          </EmptyHeader>
          <EmptyContent>
            {!noExiste && (
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Reintentar
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={bandejaHref}>Volver a Apelaciones</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const estado = ESTADO_APELACION_BADGE[apelacion.estadoApelacion] ?? { label: apelacion.estadoApelacion, className: 'pill-neutral' };
  const tituloProyecto = apelacion.proyecto?.tituloProyecto ?? `Proyecto #${apelacion.idProyecto}`;
  const designado = apelacion.liderDesignado ?? null;
  const designadoDistinto = designado != null && designado.idUsuario !== apelacion.candidatoPropuesto.idUsuario;

  const submitAceptar = (input: TransferLeadershipInput) => acceptAppeal(apelacion.idProyecto, apelacion.idApelacion, input);

  return (
    // pb-24: el final de la página queda libre bajo cualquier elemento flotante.
    <div className={`${ADMIN_PAGE_NARROW} pb-24 pt-8`}>
      {cabecera}

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-inline">
          <h1 className="type-display min-w-0 text-balance">{apelacion.asunto}</h1>
          <span className={`pill ${estado.className}`}>{estado.label}</span>
        </div>
        <p className="mt-tight text-base text-tertiary">
          {pendiente
            ? 'Revisa la solicitud y resuélvela. La apelación es una solicitud, no una designación.'
            : 'Apelación resuelta: se conserva como historial, en solo lectura.'}
        </p>
      </header>

      <div className="flex flex-col gap-stack">
        {/* A · Información general */}
        <section aria-labelledby="info-general" className="card-base">
          <h2 id="info-general" className="type-subtitle font-semibold text-text-primary">
            Información general
          </h2>
          <dl className="mt-stack grid grid-cols-1 gap-x-card gap-y-stack sm:grid-cols-2 lg:grid-cols-4">
            <Dato rotulo="Proyecto">
              <Link href={`/dashboard/admin/proyectos/${apelacion.idProyecto}`} className="font-semibold text-primary hover:underline">
                {tituloProyecto}
              </Link>
            </Dato>
            <Dato rotulo="Estado del proyecto">
              {estadoProyecto ? (
                <span className={`pill pill-sm ${estadoBadgeStyle(estadoProyecto)}`}>{estadoBadgeLabel(estadoProyecto)}</span>
              ) : (
                '—'
              )}
            </Dato>
            <Dato rotulo="Fecha de solicitud">
              <span className="tabular-nums">{formatearFechaApelacion(apelacion.creadaEn)}</span>
            </Dato>
            <Dato rotulo="Solicitante">{nombreCompleto(apelacion.liderSolicitante)}</Dato>
          </dl>
        </section>

        {/* B · Solicitud de transferencia */}
        <section aria-labelledby="solicitud" className="card-base">
          <h2 id="solicitud" className="type-subtitle font-semibold text-text-primary">
            Solicitud de transferencia
          </h2>
          <div className="mt-stack grid grid-cols-1 gap-stack sm:grid-cols-2">
            {/* El líder actual lo dice el servidor; una resuelta solo conoce a quien la solicitó. */}
            <Persona rotulo={liderActual ? 'Líder actual' : 'Líder solicitante'} persona={liderActual ?? apelacion.liderSolicitante} />
            <Persona rotulo="Candidato propuesto" persona={apelacion.candidatoPropuesto}>
              {propuesto && (
                <p className="type-meta mt-micro break-words">
                  {propuesto.rolesActivos.map((r) => r.nombreRol).join(', ') || 'Sin rol'} · {propuesto.tareasDistintas}{' '}
                  {propuesto.tareasDistintas === 1 ? 'tarea' : 'tareas'} · {formatearDecimal(propuesto.horasReportadas)} h reportadas
                </p>
              )}
            </Persona>
          </div>
          <div className="mt-stack border-t border-outline-variant/50 pt-stack">
            <p className="type-meta">Mensaje del solicitante</p>
            <p className="type-body mt-micro whitespace-pre-wrap break-words text-text-primary">{apelacion.mensaje}</p>
          </div>
        </section>

        {/* C · Validación y selección (solo mientras está pendiente) */}
        {pendiente && (
          <section aria-labelledby="validacion" className="card-base">
            <h2 id="validacion" className="type-subtitle font-semibold text-text-primary">
              Validación y selección
            </h2>
            {!proyectoOperable ? (
              <p role="status" className="type-body mt-tight text-text-secondary">
                El proyecto está «{estadoBadgeLabel(estadoProyecto ?? '')}»: las apelaciones solo se resuelven con el proyecto
                publicado o en progreso, así que no se evalúan candidatos ni se puede transferir el liderazgo.
              </p>
            ) : candidatos.isPending ? (
              <Skeleton className="mt-stack h-12 w-full rounded-control" />
            ) : candidatos.isError ? (
              <p role="alert" className="type-body mt-tight text-error">
                {getApiErrorMessage(candidatos.error, 'admin')}
              </p>
            ) : (
              <div className="mt-tight flex flex-col gap-tight">
                <div className="flex flex-wrap items-center gap-tight">
                  <span className="type-body text-text-primary">{nombreCompleto(apelacion.candidatoPropuesto)}</span>
                  {propuesto == null ? (
                    <span className="pill pill-sm pill-red">No es integrante elegible</span>
                  ) : propuesto.seleccionable ? (
                    <span className="pill pill-sm pill-green">Elegible</span>
                  ) : (
                    <span className="pill pill-sm pill-red">No elegible</span>
                  )}
                </div>
                {propuesto == null && (
                  <p className="type-meta">El candidato propuesto ya no figura entre los integrantes evaluables del proyecto.</p>
                )}
                {propuesto != null && !propuesto.seleccionable && (
                  <p className="type-meta text-error">
                    {propuesto.motivos.map(motivoInelegibilidadLabel).join('; ') || 'Sin motivo registrado'}
                  </p>
                )}
                <p className="type-meta">
                  Es una propuesta: al aceptar confirmas al nuevo líder y puedes designar a otro integrante elegible
                  {otrosElegibles === 0
                    ? '. Ahora mismo no hay otros integrantes elegibles.'
                    : otrosElegibles === 1
                      ? ' (hay 1 más).'
                      : ` (hay ${otrosElegibles} más).`}
                </p>
              </div>
            )}
          </section>
        )}

        {/* D · Resolución administrativa */}
        <section aria-labelledby="resolucion" className="card-base">
          <h2 id="resolucion" className="type-subtitle font-semibold text-text-primary">
            Resolución administrativa
          </h2>
          {pendiente ? (
            <div className="mt-tight flex flex-col gap-stack sm:flex-row sm:items-center sm:justify-between">
              <p className="type-body text-text-secondary">
                {resoluble
                  ? 'Denegar no cambia el liderazgo. Aceptar transfiere el liderazgo en la misma operación.'
                  : 'Esta apelación sigue pendiente, pero no puede resolverse mientras el proyecto no esté publicado o en progreso.'}
              </p>
              <div className="flex shrink-0 flex-col gap-tight sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!resoluble}
                  onClick={() => setDenegando(true)}
                  className={`${REQUEST_INBOX_BUTTON} border-error/40 text-error hover:bg-error/10 hover:text-error`}
                >
                  Denegar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!resoluble}
                  onClick={() => setAceptando(true)}
                  className={`${REQUEST_INBOX_BUTTON} ${REQUEST_INBOX_BUTTON_GREEN}`}
                >
                  Aceptar y transferir
                </Button>
              </div>
            </div>
          ) : (
            <dl className="mt-stack grid grid-cols-1 gap-x-card gap-y-stack sm:grid-cols-2 lg:grid-cols-4">
              <Dato rotulo="Resultado">
                <span className={`pill pill-sm ${estado.className}`}>{estado.label}</span>
              </Dato>
              <Dato rotulo="Fecha de resolución">
                <span className="tabular-nums">{formatearFechaApelacion(apelacion.resueltaEn)}</span>
              </Dato>
              <Dato rotulo="Administrador responsable">
                {apelacion.adminResolutor ? nombreCompleto(apelacion.adminResolutor) : 'Sin administrador registrado'}
              </Dato>
              {apelacion.estadoApelacion === 'ACEPTADA' && (
                <Dato rotulo="Nuevo líder designado">
                  {designado ? (
                    <>
                      <span className="font-semibold">{nombreCompleto(designado)}</span>
                      {designadoDistinto && <span className="type-meta block">Distinto del candidato propuesto.</span>}
                    </>
                  ) : (
                    'No disponible'
                  )}
                </Dato>
              )}
              {apelacion.mensajeResolucion && (
                <div className="min-w-0 sm:col-span-2 lg:col-span-4">
                  <dt className="type-meta">Mensaje de resolución</dt>
                  <dd className="mt-micro type-body whitespace-pre-wrap break-words text-text-secondary">{apelacion.mensajeResolucion}</dd>
                </div>
              )}
            </dl>
          )}
        </section>

        <div>
          <Button asChild variant="outline" size="sm" className="text-xs font-semibold">
            <Link href={bandejaHref}>Volver a Apelaciones</Link>
          </Button>
        </div>
      </div>

      {aceptando && (
        <LeadershipChangeDialog
          projectId={apelacion.idProyecto}
          open
          onOpenChange={(open) => {
            if (!open) setAceptando(false);
          }}
          presetCandidateId={apelacion.candidatoPropuesto.idUsuario}
          submit={submitAceptar}
          title="Aceptar apelación y transferir liderazgo"
          confirmLabel="Aceptar y transferir"
        />
      )}

      <AppealDenyDialog
        apelacion={denegando ? apelacion : null}
        open={denegando}
        onOpenChange={(open) => {
          if (!open) setDenegando(false);
        }}
      />
    </div>
  );
}
