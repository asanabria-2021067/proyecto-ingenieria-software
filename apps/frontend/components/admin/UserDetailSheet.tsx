'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  Shield,
  UserCheck,
  UserX,
  ShieldOff,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserStatusBadge } from '@/components/admin/UserStatusBadge';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import uvgSwal from '@/lib/swal';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { estadoBadgeLabel, estadoBadgeStyle } from '@/components/projects/available-project-card';
import { adminProjectHref } from '@/lib/admin/sprint-calendar';
import { perfilUsuarioQueryKey } from '@/lib/query-keys/social';
import { getPerfilUsuario } from '@/lib/services/social';
import {
  getAdminUserDetail,
  updateAdminUserStatus,
  type AdminUserDetail,
  type AdminUserStatus,
} from '@/lib/services/admin';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserDetailSheetProps {
  userId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChanged?: () => void;
}

interface PendingAction {
  nuevoEstado: AdminUserStatus;
  title: string;
  description: string;
  actionLabel: string;
  variant: 'destructive' | 'warning' | 'default';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROL_LABELS: Record<string, string> = {
  estudiante: 'Estudiante',
  mentor: 'Mentor',
  lider_asociacion: 'Líder de asociación',
  coordinador_academico: 'Coordinador académico',
  administrador: 'Administrador',
};

function formatRol(rol: string): string {
  return ROL_LABELS[rol] ?? rol;
}

function formatFecha(dateStr: string | null): string {
  if (!dateStr) return 'Sin registro';
  try {
    return new Intl.DateTimeFormat('es-GT', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(dateStr));
  } catch {
    return 'Sin fecha';
  }
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Sin registro';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'Hace un momento';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  return `Hace ${Math.floor(diff / 86400)} d`;
}

const ESTADO_USUARIO_LABEL: Record<string, string> = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  BLOQUEADO: 'Bloqueado',
};

function getInitials(nombre: string, apellido: string): string {
  return ((nombre?.[0] ?? '') + (apellido?.[0] ?? '')).toUpperCase() || 'U';
}

function isAdminRole(roles: string[]): boolean {
  return roles.some((r) => r.toLowerCase() === 'administrador');
}

function getPrimaryRole(roles: string[]): string {
  const priority = [
    'administrador',
    'coordinador_academico',
    'lider_asociacion',
    'mentor',
    'estudiante',
  ];
  return priority.find((r) => roles.includes(r)) ?? roles[0] ?? '';
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

/**
 * Encabezado de sección del drawer: el título centrado en una caja pequeña,
 * con una línea de 1 px a cada lado. Va ENCIMA de la tarjeta, no dentro. Es un
 * rótulo, no un control: sin sombra, sin hover y sin forma de píldora.
 */
function DrawerSectionHeading({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-inline">
      <span aria-hidden="true" className="h-px flex-1 bg-outline-variant/60" />
      <h3 className="rounded-md border border-outline-variant/60 bg-surface-container-lowest px-inline py-micro text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </h3>
      <span aria-hidden="true" className="h-px flex-1 bg-outline-variant/60" />
    </div>
  );
}

/**
 * Sección del drawer: encabezado centrado y, debajo, su tarjeta blanca (la
 * misma del perfil del estudiante). `aside` va dentro de la tarjeta, arriba a
 * la derecha (p. ej. el contador de colaboraciones).
 */
function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-inline">
      <DrawerSectionHeading title={title} />
      <div className="card-base p-stack">
        {aside && <div className="mb-inline flex justify-end">{aside}</div>}
        {children}
      </div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-stack border-b border-outline-variant/40 py-tight first:pt-0 last:border-0 last:pb-0">
      <dt className="type-meta shrink-0">{label}</dt>
      <dd className="type-body min-w-0 break-words text-right font-medium text-text-primary">{value}</dd>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center rounded-control bg-surface-container p-inline text-center">
      <span className="font-headline text-2xl font-bold tabular-nums text-text-primary">{value}</span>
      <span className="type-meta mt-micro leading-tight">{label}</span>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function DrawerSkeleton() {
  return (
    <div className="space-y-stack" role="status" aria-label="Cargando el detalle del usuario">
      <div className="flex flex-col items-center gap-tight pb-tight">
        <Skeleton className="size-20 rounded-full" />
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-52" />
        <Skeleton className="h-5 w-16 rounded-pill" />
      </div>
      <Skeleton className="h-40 w-full rounded-card" />
      <Skeleton className="h-36 w-full rounded-card" />
      <Skeleton className="h-28 w-full rounded-card" />
    </div>
  );
}

// ─── Role-specific sections ───────────────────────────────────────────────────

function EstudianteContent({ user }: { user: AdminUserDetail }) {
  const perfil = user.perfilEstudiante;
  const actividad = user.actividadEstudiante;

  const horasExtReq = perfil?.horasExtensionRequeridas ?? 100;
  const horasExtAcum = actividad?.horasExtensionAcumuladas ?? 0;
  const progreso = horasExtReq > 0 ? Math.min(100, Math.round((horasExtAcum / horasExtReq) * 100)) : 0;
  const semestre = perfil?.semestre ?? null;
  const enRiesgo =
    semestre !== null &&
    semestre >= 7 &&
    horasExtAcum < horasExtReq;

  const totalPostulaciones =
    (actividad?.postulaciones.pendientes ?? 0) +
    (actividad?.postulaciones.aceptadas ?? 0) +
    (actividad?.postulaciones.rechazadas ?? 0);

  return (
    <div className="space-y-card">
      {enRiesgo && (
        <div className="flex gap-tight rounded-control border border-attention/30 bg-attention/10 p-inline">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-attention-strong dark:text-attention" aria-hidden="true" />
          <p className="type-meta text-text-primary">
            Semestre {semestre} · {horasExtAcum} horas de extensión acumuladas. Estudiante en riesgo
            de no cumplir requisito de graduación.
          </p>
        </div>
      )}

      <Section title="Progreso de horas">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="rounded-control bg-surface-container p-inline">
            <p className="type-meta mb-micro uppercase tracking-wide">
              Horas beca
            </p>
            <p className="font-headline text-2xl font-bold tabular-nums text-text-primary">
              {actividad?.horasBecaAcumuladas ?? 0}
            </p>
            <p className="type-meta mt-micro">
              Meta:{' '}
              {perfil?.horasBecaRequeridas ? `${perfil.horasBecaRequeridas} hrs` : 'No definida'}
            </p>
          </div>
          <div className="rounded-control bg-surface-container p-inline">
            <p className="type-meta mb-micro uppercase tracking-wide">
              Horas extensión
            </p>
            <p className="font-headline text-2xl font-bold tabular-nums text-text-primary">
              {horasExtAcum}
            </p>
            <p className="type-meta mt-micro">
              Meta: {horasExtReq} hrs
            </p>
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="type-meta">Horas extensión</span>
            <span className="type-meta font-semibold tabular-nums text-text-primary">{progreso}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Progreso de horas de extensión"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progreso}
            className="h-2 w-full overflow-hidden rounded-pill bg-surface-container-high"
          >
            <div
              className="h-full rounded-pill bg-primary"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
      </Section>

      <Section title="Actividad en plataforma">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <MetricCard label="Participaciones activas" value={actividad?.participacionesActivas ?? 0} />
          <MetricCard label="Postulaciones enviadas" value={totalPostulaciones} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MetricCard label="Pendientes" value={actividad?.postulaciones.pendientes ?? 0} />
          <MetricCard label="Aceptadas" value={actividad?.postulaciones.aceptadas ?? 0} />
          <MetricCard label="Rechazadas" value={actividad?.postulaciones.rechazadas ?? 0} />
        </div>
      </Section>
    </div>
  );
}

function MentorContent({ user }: { user: AdminUserDetail }) {
  const act = user.actividadMentor;

  return (
    <div className="space-y-card">
      <Section title="Actividad como mentor">
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Proyectos donde participa" value={act?.proyectosDondeParticipa ?? 0} />
          <MetricCard label="Estudiantes mentorizados" value={act?.estudiantesMentorizados ?? 0} />
          <MetricCard label="Proyectos activos" value={act?.proyectosActivos ?? 0} />
          <MetricCard label="Proyectos cerrados" value={act?.proyectosCerrados ?? 0} />
        </div>
      </Section>

      <Section title="Proyectos asociados">
        {!act?.proyectosAsociados.length ? (
          <p className="type-body text-text-secondary">No hay proyectos asociados.</p>
        ) : (
          <ul className="divide-y divide-outline-variant/40">
            {act.proyectosAsociados.map((p) => (
              <li key={p.idProyecto} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <span className="type-body line-clamp-1 flex-1 font-medium text-text-primary">
                  {p.tituloProyecto}
                </span>
                <span
                  className={`pill shrink-0 ${estadoBadgeStyle(p.estadoProyecto)}`}
                >
                  {estadoBadgeLabel(p.estadoProyecto)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function LiderContent({ user }: { user: AdminUserDetail }) {
  const act = user.actividadLider;

  return (
    <div className="space-y-card">
      <Section title="Actividad como líder">
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Proyectos creados" value={act?.proyectosCreados ?? 0} />
          <MetricCard label="Proyectos activos" value={act?.proyectosActivos ?? 0} />
          <MetricCard label="Proyectos cerrados" value={act?.proyectosCerrados ?? 0} />
          <div className="flex flex-col items-center rounded-control bg-surface-container p-inline text-center">
            <span
              className={`text-2xl font-black tracking-tighter ${
                (act?.postulacionesPendientes ?? 0) > 0
                  ? 'text-attention-strong dark:text-attention'
                  : 'text-on-surface'
              }`}
            >
              {act?.postulacionesPendientes ?? 0}
            </span>
            <span className="type-meta mt-micro leading-tight">
              Postulaciones pendientes
            </span>
            {(act?.postulacionesPendientes ?? 0) > 0 && (
              <span className="pill pill-amber mt-micro">
                Requiere atención
              </span>
            )}
          </div>
        </div>
      </Section>

      <Section title="Proyectos recientes">
        {!act?.proyectosRecientes.length ? (
          <p className="type-body text-text-secondary">No hay proyectos recientes.</p>
        ) : (
          <ul className="divide-y divide-outline-variant/40">
            {act.proyectosRecientes.map((p) => (
              <li key={p.idProyecto} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="type-body line-clamp-1 flex-1 font-medium text-text-primary">
                    {p.tituloProyecto}
                  </span>
                  <span
                    className={`pill shrink-0 ${estadoBadgeStyle(p.estadoProyecto)}`}
                  >
                    {estadoBadgeLabel(p.estadoProyecto)}
                  </span>
                </div>
                {p.postulacionesPendientes > 0 && (
                  <p className="type-meta mt-micro text-attention-strong dark:text-attention">
                    {p.postulacionesPendientes} postulación(es) pendiente(s)
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="flex gap-tight rounded-control bg-surface-container-low p-inline">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="type-meta">
          Este usuario puede crear y administrar proyectos asociados a su organización.
        </p>
      </div>
    </div>
  );
}

function CoordinadorContent({ user }: { user: AdminUserDetail }) {
  const act = user.actividadCoordinador;

  return (
    <div className="space-y-card">
      <Section title="Actividad como coordinador">
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Proyectos supervisados" value={act?.proyectosSupervisados ?? 0} />
          <MetricCard label="Proyectos activos" value={act?.proyectosActivos ?? 0} />
          <MetricCard label="Proyectos cerrados" value={act?.proyectosCerrados ?? 0} />
          <MetricCard label="Estudiantes vinculados" value={act?.estudiantesVinculados ?? 0} />
        </div>
      </Section>

      <Section title="Proyectos recientes">
        {!act?.proyectosRecientes.length ? (
          <p className="type-body text-text-secondary">No hay proyectos recientes.</p>
        ) : (
          <ul className="divide-y divide-outline-variant/40">
            {act.proyectosRecientes.map((p) => (
              <li key={p.idProyecto} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <span className="type-body line-clamp-1 flex-1 font-medium text-text-primary">
                  {p.tituloProyecto}
                </span>
                <span
                  className={`pill shrink-0 ${estadoBadgeStyle(p.estadoProyecto)}`}
                >
                  {estadoBadgeLabel(p.estadoProyecto)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="flex gap-tight rounded-control bg-surface-container-low p-inline">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="type-meta">
          Este usuario puede supervisar proyectos académicos y validar actividad relacionada.
        </p>
      </div>
    </div>
  );
}

function AdministradorContent({ user }: { user: AdminUserDetail }) {
  const act = user.actividadAdmin;

  return (
    <div className="space-y-card">
      <Section title="Permisos administrativos">
        <dl>
        <InfoRow
          label="Puede gestionar usuarios"
          value={
            <span className={act?.puedeGestionarUsuarios ? 'text-primary font-bold' : 'text-tertiary'}>
              {act?.puedeGestionarUsuarios ? 'Sí' : 'No'}
            </span>
          }
        />
        <InfoRow
          label="Puede revisar proyectos"
          value={
            <span className={act?.puedeRevisarProyectos ? 'text-primary font-bold' : 'text-tertiary'}>
              {act?.puedeRevisarProyectos ? 'Sí' : 'No'}
            </span>
          }
        />
      </dl>
      </Section>

      <div className="flex gap-tight rounded-control bg-surface-container-low p-inline">
        <Shield className="mt-0.5 size-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <p className="type-meta">
          Las cuentas administradoras no pueden ser desactivadas ni bloqueadas desde esta vista.
        </p>
      </div>
    </div>
  );
}

// ─── Admin actions card ───────────────────────────────────────────────────────

function AdminActions({
  user,
  onAction,
}: {
  user: AdminUserDetail;
  onAction: (action: PendingAction) => void;
}) {
  if (isAdminRole(user.roles)) return null;

  const userName = `${user.nombre} ${user.apellido}`;

  return (
    <Section title="Acciones administrativas">
      {user.estado === 'ACTIVO' && (
        <>
          <div className="grid grid-cols-1 gap-tight sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onAction({
                  nuevoEstado: 'INACTIVO',
                  title: 'Desactivar usuario',
                  description: `¿Deseas desactivar a ${userName}? El usuario perderá acceso activo a la plataforma.`,
                  actionLabel: 'Desactivar',
                  variant: 'warning',
                })
              }
            >
              <UserX aria-hidden="true" />
              Desactivar usuario
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-error/40 text-error hover:bg-error/10 hover:text-error"
              onClick={() =>
                onAction({
                  nuevoEstado: 'BLOQUEADO',
                  title: 'Bloquear usuario',
                  description: `¿Deseas bloquear a ${userName}? El usuario no podrá iniciar sesión.`,
                  actionLabel: 'Bloquear',
                  variant: 'destructive',
                })
              }
            >
              <ShieldOff aria-hidden="true" />
              Bloquear usuario
            </Button>
          </div>
          <p className="type-meta mt-inline">
            Desactivar suspende temporalmente la cuenta. Bloquear restringe el acceso por decisión
            administrativa.
          </p>
        </>
      )}

      {user.estado === 'INACTIVO' && (
        <Button
          type="button"
          className="w-full"
          onClick={() =>
            onAction({
              nuevoEstado: 'ACTIVO',
              title: 'Activar usuario',
              description: `¿Deseas activar a ${userName}? Recuperará acceso a la plataforma.`,
              actionLabel: 'Activar',
              variant: 'default',
            })
          }
        >
          <UserCheck aria-hidden="true" />
          Activar usuario
        </Button>
      )}

      {user.estado === 'BLOQUEADO' && (
        <Button
          type="button"
          className="w-full"
          onClick={() =>
            onAction({
              nuevoEstado: 'ACTIVO',
              title: 'Desbloquear usuario',
              description: `¿Deseas desbloquear a ${userName}? Recuperará acceso normal.`,
              actionLabel: 'Desbloquear',
              variant: 'default',
            })
          }
        >
          <UserCheck aria-hidden="true" />
          Desbloquear usuario
        </Button>
      )}
    </Section>
  );
}

// ─── Proyectos activos ────────────────────────────────────────────────────────

/** Estados que UVGenius trata como proyecto activo (los mismos de la bandeja de Proyectos Activos). */
const ESTADOS_PROYECTO_ACTIVO = new Set(['PUBLICADO', 'EN_PROGRESO']);

/**
 * Participaciones activas del usuario en proyectos activos, con la misma
 * tarjeta del perfil del estudiante.
 *
 * El detalle administrativo (`GET /admin/usuarios/:id`) solo trae el CONTEO de
 * participaciones; la lista con proyecto, rol y estado sale del perfil público
 * (`GET /social/usuarios/:id`), que cualquier usuario autenticado puede leer:
 * el administrador no gana aquí ningún acceso. De esa respuesta solo se usan
 * los proyectos; nada social (amistades, seguimiento) se muestra.
 */
function ProyectosActivos({ idUsuario }: { idUsuario: number }) {
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: perfilUsuarioQueryKey(idUsuario),
    queryFn: () => getPerfilUsuario(idUsuario),
    select: (perfil) => perfil.proyectosActivos.filter((p) => ESTADOS_PROYECTO_ACTIVO.has(p.estadoProyecto)),
  });

  return (
    <Section
      title="Proyectos activos"
      aside={
        data && (
          <span className="pill pill-neutral tabular-nums">
            {data.length} {data.length === 1 ? 'colaboración' : 'colaboraciones'}
          </span>
        )
      }
    >
      {isPending ? (
        <div className="flex flex-col gap-tight" role="status" aria-label="Cargando proyectos activos">
          <Skeleton className="h-14 w-full rounded-control" />
          <Skeleton className="h-14 w-full rounded-control" />
        </div>
      ) : isError || !data ? (
        <div className="flex flex-wrap items-center justify-between gap-tight" role="alert">
          <p className="type-body text-text-secondary">No se pudieron cargar los proyectos de este usuario.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            Reintentar
          </Button>
        </div>
      ) : data.length === 0 ? (
        <p className="type-body text-text-secondary">Este usuario no participa actualmente en proyectos activos.</p>
      ) : (
        // Alto acotado: con muchos proyectos la lista se desplaza por dentro y
        // las acciones administrativas siguen a un scroll corto de distancia.
        <ul className="flex max-h-72 flex-col gap-tight overflow-y-auto overscroll-contain">
          {data.map((p) => (
            <li key={`${p.idProyecto}-${p.rolNombre}`}>
              <Link
                href={adminProjectHref(p.idProyecto)}
                className="flex items-center justify-between gap-tight rounded-control border border-outline-variant p-tight transition-colors hover:bg-surface-container"
              >
                <div className="min-w-0">
                  <p className="type-body truncate font-medium text-text-primary">{p.tituloProyecto}</p>
                  <p className="type-meta truncate">{p.rolNombre}</p>
                </div>
                <span className={`pill shrink-0 ${estadoBadgeStyle(p.estadoProyecto)}`}>
                  {estadoBadgeLabel(p.estadoProyecto)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ─── Detail content ───────────────────────────────────────────────────────────

function DetailContent({
  user,
  onStatusChanged,
}: {
  user: AdminUserDetail;
  onStatusChanged?: () => void;
}) {
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const primaryRole = getPrimaryRole(user.roles);
  const perfil = user.perfilEstudiante;

  const statusMutation = useMutation({
    mutationFn: (nuevoEstado: AdminUserStatus) =>
      updateAdminUserStatus(user.idUsuario, nuevoEstado),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['adminUserDetail', user.idUsuario] });
      uvgSwal.fire({
        icon: 'success',
        title: 'Estado actualizado',
        text: 'El estado del usuario fue actualizado correctamente.',
        timer: 2000,
        showConfirmButton: false,
      });
      setPendingAction(null);
      onStatusChanged?.();
    },
    onError: (error: Error) => {
      uvgSwal.fire({
        icon: 'error',
        title: 'Error',
        text: getApiErrorMessage(error, 'admin', 'No se pudo actualizar el estado del usuario.'),
      });
      setPendingAction(null);
    },
  });

  return (
    <>
      {/* Identidad: avatar, nombre y correo como en el perfil del estudiante, con un único badge de estado. */}
      <header className="flex flex-col items-center gap-tight pb-tight text-center">
        <Avatar className="size-20">
          {user.fotoUrl && <AvatarImage src={user.fotoUrl} alt="" />}
          <AvatarFallback className="type-section text-text-secondary">
            {getInitials(user.nombre, user.apellido)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 max-w-full">
          <h2 className="type-section break-words text-text-primary">
            {user.nombre} {user.apellido}
          </h2>
          <p className="type-body break-all text-text-secondary">{user.correo}</p>
        </div>
        <UserStatusBadge estado={user.estado} />
      </header>

      <Section title="Información institucional">
        <dl>
          <InfoRow label="Estado" value={ESTADO_USUARIO_LABEL[user.estado] ?? user.estado} />
          <InfoRow label="Rol principal" value={primaryRole ? formatRol(primaryRole) : 'Sin rol asignado'} />
          {/* Datos académicos: solo las filas que el backend trae con valor. */}
          {perfil?.carrera && <InfoRow label="Carrera" value={perfil.carrera} />}
          {perfil?.carne && <InfoRow label="Carné" value={perfil.carne} />}
          {perfil?.semestre != null && <InfoRow label="Semestre" value={`Semestre ${perfil.semestre}`} />}
          {perfil?.disponibilidadHorasSemana ? (
            <InfoRow label="Disponibilidad" value={`${perfil.disponibilidadHorasSemana} horas/semana`} />
          ) : null}
          <InfoRow label="Fecha de registro" value={formatFecha(user.fechaCreacion)} />
          <InfoRow
            label="Último acceso"
            value={
              user.fechaUltimaSesion
                ? `${timeAgo(user.fechaUltimaSesion)} · ${formatFecha(user.fechaUltimaSesion)}`
                : 'Sin registro'
            }
          />
        </dl>
      </Section>

      <ProyectosActivos idUsuario={user.idUsuario} />

      {/* Role-specific content */}
      {primaryRole === 'administrador' && <AdministradorContent user={user} />}
      {primaryRole === 'coordinador_academico' && <CoordinadorContent user={user} />}
      {primaryRole === 'lider_asociacion' && <LiderContent user={user} />}
      {primaryRole === 'mentor' && <MentorContent user={user} />}
      {primaryRole === 'estudiante' && <EstudianteContent user={user} />}

      {/* Admin actions */}
      <AdminActions user={user} onAction={setPendingAction} />

      {/* Confirm dialog */}
      {pendingAction && (
        <ConfirmActionDialog
          open={true}
          title={pendingAction.title}
          description={pendingAction.description}
          actionLabel={pendingAction.actionLabel}
          variant={pendingAction.variant}
          isPending={statusMutation.isPending}
          onConfirm={() => statusMutation.mutate(pendingAction.nuevoEstado)}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UserDetailSheet({
  userId,
  open,
  onOpenChange,
  onStatusChanged,
}: UserDetailSheetProps) {
  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['adminUserDetail', userId],
    queryFn: () => getAdminUserDetail(userId!),
    enabled: open && !!userId,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-outline-variant bg-surface p-0 sm:max-w-[460px] lg:max-w-[520px]"
      >
        <SheetHeader className="shrink-0 border-b border-outline-variant bg-surface-container-lowest px-stack py-stack">
          <SheetTitle className="type-meta font-semibold uppercase tracking-wide">Detalle de usuario</SheetTitle>
          <SheetDescription className="sr-only">
            Datos de la cuenta, proyectos en los que participa y acciones disponibles para el usuario seleccionado.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="space-y-card p-stack">
            {isLoading && <DrawerSkeleton />}

            {isError && (
              <div role="alert" className="card-base flex flex-col items-center gap-tight text-center">
                <AlertCircle className="size-6 text-error" aria-hidden="true" />
                <p className="type-body font-medium">No se pudo cargar el detalle del usuario.</p>
              </div>
            )}

            {!isLoading && !isError && user && (
              <DetailContent user={user} onStatusChanged={onStatusChanged} />
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
