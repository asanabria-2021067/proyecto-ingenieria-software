'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  FolderOpen,
  FolderX,
  GraduationCap,
  MapPin,
  Users,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { Postulacion, Proyecto, MODALIDAD_LABEL, NIVEL_LABEL } from '@/types';
import {
  MODALIDAD_ICON,
  estadoBadgeLabel,
  estadoBadgeStyle,
  formatFechaCorta,
  getIniciales,
  tipoBadgeLabel,
  tipoBadgeStyle,
} from '@/components/projects/available-project-card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

const MODALIDAD_BADGE = 'bg-[#EEF1F5] text-[#48515C] dark:bg-surface-container-high dark:text-on-surface-variant';

const ESTADO_POSTULACION_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
};

function formatCupos(n: number): string {
  return n === 1 ? '1 cupo' : `${n} cupos`;
}

function CardShell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[10px] border border-[#D3DDD3] dark:border-outline-variant bg-white dark:bg-surface-container-lowest shadow-[0_1px_4px_rgba(24,28,32,0.05)] ${className}`}
    >
      {children}
    </div>
  );
}

export default function ProyectoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);

  const { data: proyecto, isLoading, isError, error, refetch } = useQuery<Proyecto>({
    queryKey: ['proyecto', id],
    queryFn: () => apiFetch(`/proyectos/${id}`),
    retry: false,
  });
  const isNotFound = isError && (error as { statusCode?: number } | null)?.statusCode === 404;

  const { data: misPostulaciones = [], isLoading: isLoadingPostulaciones } = useQuery<Postulacion[]>({
    queryKey: ['mis-postulaciones'],
    queryFn: () => apiFetch('/postulaciones/mis-postulaciones'),
  });

  const postulacionActiva =
    proyecto &&
    misPostulaciones.find(
      (p) => p.rolProyecto.proyecto.idProyecto === proyecto.idProyecto && p.estadoPostulacion !== 'RECHAZADA',
    );

  const totalRoles = proyecto?.roles.length ?? 0;
  const totalCupos = proyecto?.roles.reduce((sum, r) => sum + r.cupos, 0) ?? 0;
  const organizacion = proyecto?.organizaciones[0]?.organizacion.nombreOrganizacion;
  const objetivos = proyecto?.objetivosProyecto
    ? proyecto.objetivosProyecto.split('\n').map((l) => l.trim()).filter(Boolean)
    : [];
  const ModalidadIcon = proyecto ? (MODALIDAD_ICON[proyecto.modalidadProyecto] ?? MapPin) : MapPin;

  return (
      <div className="mx-auto max-w-[1400px] px-7 pt-6 pb-12">
        {/* Breadcrumb */}
        <nav aria-label="Ruta de navegación" className="mb-4.5 flex items-center gap-2 text-[13px]">
          <Link
            href="/dashboard/proyectos"
            className="flex items-center gap-1 text-[#626A73] dark:text-tertiary hover:text-primary transition-colors"
          >
            Proyectos disponibles
          </Link>
          {proyecto && (
            <>
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-[#626A73] dark:text-tertiary" />
              <span className="truncate text-on-surface font-medium">{proyecto.tituloProyecto}</span>
            </>
          )}
        </nav>

        {isLoading && <ProyectoDetalleSkeleton />}

        {!isLoading && isError && !isNotFound && (
          <Empty tone="danger" className="surface-enter" role="alert">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No fue posible cargar la información del proyecto.</EmptyTitle>
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

        {!isLoading && isNotFound && (
          <Empty tone="muted" className="surface-enter" role="status">
            <EmptyMedia variant="icon">
              <FolderX aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Proyecto no encontrado</EmptyTitle>
              <EmptyDescription>El proyecto que buscas no existe o ya no está disponible.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link
                href="/dashboard/proyectos"
                className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
              >
                Volver a proyectos
              </Link>
            </EmptyContent>
          </Empty>
        )}

        {proyecto && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
            {/* ── Columna principal ─────────────────────────────────── */}
            <div className="min-w-0 space-y-4">
              <CardShell className="p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex h-6.5 items-center rounded-full px-3 text-[12px] font-semibold whitespace-nowrap ${estadoBadgeStyle(proyecto.estadoProyecto)}`}
                  >
                    {estadoBadgeLabel(proyecto.estadoProyecto)}
                  </span>
                  <span
                    className={`inline-flex h-6.5 items-center rounded-full px-3 text-[12px] font-semibold whitespace-nowrap ${tipoBadgeStyle(proyecto.tipoProyecto)}`}
                  >
                    {tipoBadgeLabel(proyecto.tipoProyecto)}
                  </span>
                  <span
                    className={`inline-flex h-6.5 items-center gap-1 rounded-full px-3 text-[12px] font-semibold whitespace-nowrap ${MODALIDAD_BADGE}`}
                  >
                    <ModalidadIcon aria-hidden="true" className="h-3 w-3" />
                    {MODALIDAD_LABEL[proyecto.modalidadProyecto]}
                  </span>
                </div>

                <h1 className="mt-3.5 text-[26px] leading-8 font-bold text-on-surface line-clamp-2">
                  {proyecto.tituloProyecto}
                </h1>

                <p className="mt-2 text-[14px] leading-5.25 text-on-surface-variant line-clamp-3">
                  {proyecto.descripcionProyecto || 'Sin descripción disponible.'}
                </p>

                {proyecto.intereses.length > 0 && (
                  <div className="mt-4.5 flex flex-wrap gap-2">
                    {proyecto.intereses.map(({ interes }) => (
                      <span
                        key={interes.nombreInteres}
                        className="rounded-md bg-[#F0F2F5] dark:bg-surface-container-high px-2.5 py-1.5 text-[11px] font-medium text-[#4D5661] dark:text-on-surface-variant"
                      >
                        {interes.nombreInteres}
                      </span>
                    ))}
                  </div>
                )}
              </CardShell>

              {/* Descripción completa + Objetivos */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[58fr_42fr]">
                <CardShell className="p-5">
                  <h2 className="mb-3 text-[15px] font-bold text-[#20262D] dark:text-on-surface">
                    Descripción del proyecto
                  </h2>
                  <p className="whitespace-pre-wrap text-[13px] leading-4.75 text-[#505861] dark:text-on-surface-variant">
                    {proyecto.descripcionProyecto || 'Sin descripción disponible.'}
                  </p>
                </CardShell>

                <CardShell className="p-5">
                  <h2 className="mb-3 text-[15px] font-bold text-[#20262D] dark:text-on-surface">Objetivos</h2>
                  {objetivos.length > 0 ? (
                    <ul className="space-y-2.5">
                      {objetivos.map((objetivo, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2
                            aria-hidden="true"
                            className="mt-0.5 h-4 w-4 shrink-0 text-[#008542]"
                          />
                          <span className="text-[13px] leading-4.5 text-[#424A53] dark:text-on-surface-variant">
                            {objetivo}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] leading-4.5 text-on-surface-variant">
                      No se han registrado objetivos para este proyecto.
                    </p>
                  )}
                </CardShell>
              </div>

              {/* Roles */}
              <div>
                <h2 className="mt-4.5 mb-3 text-[17px] font-bold text-[#20262D] dark:text-on-surface">
                  Roles disponibles ({totalRoles})
                </h2>

                {!isLoadingPostulaciones && postulacionActiva && (
                  <CardShell className="mb-3.5 p-4">
                    <p className="text-sm font-semibold text-on-surface">
                      Ya registraste una postulación para este proyecto.
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      Rol: {postulacionActiva.rolProyecto.nombreRol} · Estado:{' '}
                      {ESTADO_POSTULACION_LABEL[postulacionActiva.estadoPostulacion] ??
                        postulacionActiva.estadoPostulacion}
                    </p>
                  </CardShell>
                )}

                {totalRoles === 0 ? (
                  <CardShell className="p-6 text-center">
                    <p className="text-sm text-on-surface-variant">
                      Actualmente este proyecto no tiene roles disponibles.
                    </p>
                  </CardShell>
                ) : (
                  <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                    {proyecto.roles.map((rol) => (
                      <CardShell key={rol.idRolProyecto} className="flex flex-col p-4.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="min-w-0 flex-1 text-[16px] font-bold leading-5.5 text-[#20262D] dark:text-on-surface line-clamp-2">
                            {rol.nombreRol}
                          </h3>
                          {rol.cupos > 0 && (
                            <span className="shrink-0 rounded-full bg-[#DCF6AE] dark:bg-[#1f3a0a] px-2.5 py-1 text-[11px] font-semibold text-[#397016] dark:text-[#b8f27a]">
                              Disponible
                            </span>
                          )}
                        </div>

                        <p className="mt-1.5 text-[12px] leading-4.25 text-[#565E67] dark:text-on-surface-variant line-clamp-2">
                          {rol.descripcionRolProyecto || 'Sin descripción disponible.'}
                        </p>

                        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] text-on-surface-variant">
                          {rol.carreraRequerida && (
                            <span className="flex items-center gap-1.5 min-w-0">
                              <GraduationCap aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{rol.carreraRequerida.nombreCarrera}</span>
                            </span>
                          )}
                          {rol.horasSemanalesEstimadas != null && (
                            <span className="flex items-center gap-1.5">
                              <Clock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                              {rol.horasSemanalesEstimadas} h/semana
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <Users aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                            {formatCupos(rol.cupos)}
                          </span>
                        </div>

                        {rol.requisitos.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {rol.requisitos.map((req) => (
                              <span
                                key={req.habilidad.nombreHabilidad}
                                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                                  req.obligatorio
                                    ? 'bg-primary-container text-on-primary-container'
                                    : 'bg-surface-container-high text-on-surface-variant'
                                }`}
                              >
                                {req.habilidad.nombreHabilidad} · {NIVEL_LABEL[req.nivelMinimo]}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mt-4 pt-3 border-t border-outline-variant/40">
                          {postulacionActiva ? (
                            <Link
                              href="/dashboard/mis-postulaciones"
                              aria-label={`Ver mi postulación para el rol ${rol.nombreRol}`}
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-outline-variant bg-white dark:bg-surface-container-lowest px-4 text-[12px] font-semibold text-on-surface transition-colors hover:bg-surface-container"
                            >
                              Ver mi postulación
                            </Link>
                          ) : (
                            <Link
                              href={`/dashboard/proyectos/${projectId}/postular/${rol.idRolProyecto}`}
                              aria-label={`Postularme al rol ${rol.nombreRol}`}
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#006735] px-4 text-[12px] font-semibold text-white transition-colors hover:bg-[#00582D]"
                            >
                              Postularme a este rol
                              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                            </Link>
                          )}
                        </div>
                      </CardShell>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Columna lateral ───────────────────────────────────── */}
            <div className="space-y-4 lg:sticky lg:top-25">
              {/* Responsable */}
              <CardShell className="p-5">
                <h2 className="mb-3 text-[14px] font-bold text-[#20262D] dark:text-on-surface">Responsable</h2>
                {proyecto.creador ? (
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#D7F2C3] dark:bg-[#1f3a0a] text-[15px] font-bold text-[#286327] dark:text-[#b8f27a]"
                      aria-hidden="true"
                    >
                      {getIniciales(proyecto.creador.nombre, proyecto.creador.apellido)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-on-surface">
                        {proyecto.creador.nombre} {proyecto.creador.apellido}
                      </p>
                      <p className="text-[12px] text-on-surface-variant">Responsable del proyecto</p>
                      {proyecto.creador.correo && (
                        <p className="truncate text-[12px] text-on-surface-variant">{proyecto.creador.correo}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-on-surface-variant">Responsable no disponible</p>
                )}
              </CardShell>

              {/* Detalles del proyecto */}
              <CardShell className="p-5">
                <h2 className="mb-3 text-[14px] font-bold text-[#20262D] dark:text-on-surface">
                  Detalles del proyecto
                </h2>
                <ul className="space-y-2.5">
                  {proyecto.fechaInicio && (
                    <DetalleRow icon={Calendar} label="Fecha de inicio" value={formatFechaCorta(proyecto.fechaInicio)} />
                  )}
                  {proyecto.fechaFinEstimada && (
                    <DetalleRow
                      icon={CalendarCheck}
                      label="Fecha final estimada"
                      value={formatFechaCorta(proyecto.fechaFinEstimada)}
                    />
                  )}
                  <DetalleRow
                    icon={(() => MODALIDAD_ICON[proyecto.modalidadProyecto] ?? MapPin)()}
                    label="Modalidad"
                    value={MODALIDAD_LABEL[proyecto.modalidadProyecto]}
                  />
                  {organizacion && <DetalleRow icon={Building2} label="Organización" value={organizacion} />}
                </ul>
              </CardShell>

              {/* Resumen de oportunidades */}
              <CardShell className="p-5">
                <h2 className="mb-3 text-[14px] font-bold text-[#20262D] dark:text-on-surface">
                  Resumen de oportunidades
                </h2>
                <ul className="space-y-2.5">
                  <DetalleRow icon={FolderOpen} label="Roles" value={totalRoles === 1 ? '1 rol' : `${totalRoles} roles`} />
                  <DetalleRow icon={Users} label="Cupos totales" value={formatCupos(totalCupos)} />
                </ul>
              </CardShell>
            </div>
          </div>
        )}
      </div>
  );
}

function DetalleRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 text-[12px]">
      <span className="flex items-center gap-2 text-on-surface-variant">
        <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
        {label}
      </span>
      <span className="truncate text-right font-medium text-on-surface">{value}</span>
    </li>
  );
}

function ProyectoDetalleSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="rounded-[10px] border border-outline-variant/40 bg-surface-container-lowest p-6">
          <div className="flex gap-2">
            <Skeleton className="h-6.5 w-20 rounded-full" />
            <Skeleton className="h-6.5 w-20 rounded-full" />
            <Skeleton className="h-6.5 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-4 h-7 w-3/4" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[58fr_42fr]">
          <Skeleton className="h-40 rounded-[10px]" />
          <Skeleton className="h-40 rounded-[10px]" />
        </div>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-[10px]" />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-[10px]" />
        ))}
      </div>
    </div>
  );
}
