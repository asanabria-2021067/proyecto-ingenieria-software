'use client';

import Image from 'next/image';
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
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { UserStatusBadge } from '@/components/admin/UserStatusBadge';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import uvgSwal from '@/lib/swal';
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

function estadoBadgeClasses(estado: string): string {
  const e = estado.toUpperCase();
  if (['PUBLICADO', 'EN_PROGRESO', 'CERRADO'].some((s) => e.includes(s.replace('_', '')))) {
    if (e.includes('CERRADO')) return 'bg-surface-container-high text-tertiary';
    return 'bg-primary/10 text-primary';
  }
  if (
    ['EN_REVISION', 'OBSERVADO', 'EN_SOLICITUD_CIERRE'].some((s) =>
      e.replace(/_/g, '').includes(s.replace(/_/g, '')),
    )
  ) {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
  }
  if (['CANCELADO'].some((s) => e.includes(s))) {
    return 'bg-error-container text-error';
  }
  return 'bg-surface-container-high text-tertiary';
}

const ESTADO_LABELS: Record<string, string> = {
  EN_REVISION: 'En revisión',
  PUBLICADO: 'Publicado',
  OBSERVADO: 'Observado',
  EN_PROGRESO: 'En progreso',
  EN_SOLICITUD_CIERRE: 'Solicitud de cierre',
  CERRADO: 'Cerrado',
  BORRADOR: 'Borrador',
  CANCELADO: 'Cancelado',
};

function formatEstadoProyecto(estado: string): string {
  return ESTADO_LABELS[estado] ?? estado;
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
      <h4 className="mb-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
        {title}
      </h4>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-outline-variant/30 last:border-0">
      <span className="text-xs text-tertiary shrink-0">{label}</span>
      <span className="text-xs font-medium text-on-surface text-right">{value}</span>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-surface-container p-3 text-center">
      <span className="text-2xl font-black tracking-tighter text-on-surface">{value}</span>
      <span className="mt-0.5 text-[10px] font-medium text-tertiary leading-tight">{label}</span>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function DrawerSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col items-center gap-3 pb-4 border-b border-outline-variant">
        <Skeleton className="h-16 w-16 rounded-full bg-surface-container-high" />
        <Skeleton className="h-5 w-40 rounded bg-surface-container-high" />
        <Skeleton className="h-4 w-52 rounded bg-surface-container-high" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full bg-surface-container-high" />
          <Skeleton className="h-5 w-20 rounded-full bg-surface-container-high" />
        </div>
      </div>
      <Skeleton className="h-28 w-full rounded-xl bg-surface-container-high" />
      <Skeleton className="h-36 w-full rounded-xl bg-surface-container-high" />
      <Skeleton className="h-24 w-full rounded-xl bg-surface-container-high" />
    </div>
  );
}

// ─── Role-specific sections ───────────────────────────────────────────────────

function EstudianteContent({ user }: { user: AdminUserDetail }) {
  const perfil = user.perfilEstudiante;
  const actividad = user.actividadEstudiante;

  const horasExtReq = perfil?.horasExtensionRequeridas ?? 20;
  const horasExtAcum = actividad?.horasExtensionAcumuladas ?? 0;
  const progreso = Math.min(100, Math.round((horasExtAcum / horasExtReq) * 100));
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
    <div className="space-y-3">
      {enRiesgo && (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/30 dark:bg-amber-900/10">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Semestre {semestre} · {horasExtAcum} horas de extensión acumuladas. Estudiante en riesgo
            de no cumplir requisito de graduación.
          </p>
        </div>
      )}

      <Section title="Información académica">
        <InfoRow label="Carrera" value={perfil?.carrera ?? 'No registrada'} />
        <InfoRow label="Carné" value={perfil?.carne ?? 'No registrado'} />
        <InfoRow
          label="Semestre"
          value={semestre !== null ? `S${semestre}` : 'No registrado'}
        />
        <InfoRow
          label="Disponibilidad"
          value={
            perfil?.disponibilidadHorasSemana
              ? `${perfil.disponibilidadHorasSemana} horas/semana`
              : 'No registrada'
          }
        />
      </Section>

      <Section title="Progreso de horas">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="rounded-xl bg-surface-container p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-tertiary mb-1">
              Horas beca
            </p>
            <p className="text-2xl font-black text-on-surface">
              {actividad?.horasBecaAcumuladas ?? 0}
            </p>
            <p className="text-[10px] text-tertiary mt-0.5">
              Meta:{' '}
              {perfil?.horasBecaRequeridas ? `${perfil.horasBecaRequeridas} hrs` : 'No definida'}
            </p>
          </div>
          <div className="rounded-xl bg-surface-container p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-tertiary mb-1">
              Horas extensión
            </p>
            <p className="text-2xl font-black text-on-surface">
              {horasExtAcum}
            </p>
            <p className="text-[10px] text-tertiary mt-0.5">
              Meta: {horasExtReq} hrs
            </p>
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-tertiary">Horas extensión</span>
            <span className="text-[10px] font-bold text-on-surface">{progreso}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
            <div
              className="h-full rounded-full bg-primary transition-all"
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
    <div className="space-y-3">
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
          <p className="text-xs text-tertiary">No hay proyectos asociados.</p>
        ) : (
          <ul className="divide-y divide-outline-variant/30">
            {act.proyectosAsociados.map((p) => (
              <li key={p.idProyecto} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <span className="text-xs font-medium text-on-surface line-clamp-1 flex-1">
                  {p.tituloProyecto}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${estadoBadgeClasses(p.estadoProyecto)}`}
                >
                  {formatEstadoProyecto(p.estadoProyecto)}
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
    <div className="space-y-3">
      <Section title="Actividad como líder">
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Proyectos creados" value={act?.proyectosCreados ?? 0} />
          <MetricCard label="Proyectos activos" value={act?.proyectosActivos ?? 0} />
          <MetricCard label="Proyectos cerrados" value={act?.proyectosCerrados ?? 0} />
          <div className="flex flex-col items-center rounded-xl bg-surface-container p-3 text-center">
            <span
              className={`text-2xl font-black tracking-tighter ${
                (act?.postulacionesPendientes ?? 0) > 0
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-on-surface'
              }`}
            >
              {act?.postulacionesPendientes ?? 0}
            </span>
            <span className="mt-0.5 text-[10px] font-medium text-tertiary leading-tight">
              Postulaciones pendientes
            </span>
            {(act?.postulacionesPendientes ?? 0) > 0 && (
              <span className="mt-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                Requiere atención
              </span>
            )}
          </div>
        </div>
      </Section>

      <Section title="Proyectos recientes">
        {!act?.proyectosRecientes.length ? (
          <p className="text-xs text-tertiary">No hay proyectos recientes.</p>
        ) : (
          <ul className="divide-y divide-outline-variant/30">
            {act.proyectosRecientes.map((p) => (
              <li key={p.idProyecto} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-on-surface line-clamp-1 flex-1">
                    {p.tituloProyecto}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${estadoBadgeClasses(p.estadoProyecto)}`}
                  >
                    {formatEstadoProyecto(p.estadoProyecto)}
                  </span>
                </div>
                {p.postulacionesPendientes > 0 && (
                  <p className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                    {p.postulacionesPendientes} postulación(es) pendiente(s)
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="flex gap-2 rounded-xl border border-outline-variant bg-surface-container-low p-3">
        <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
        <p className="text-xs text-tertiary">
          Este usuario puede crear y administrar proyectos asociados a su organización.
        </p>
      </div>
    </div>
  );
}

function CoordinadorContent({ user }: { user: AdminUserDetail }) {
  const act = user.actividadCoordinador;

  return (
    <div className="space-y-3">
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
          <p className="text-xs text-tertiary">No hay proyectos recientes.</p>
        ) : (
          <ul className="divide-y divide-outline-variant/30">
            {act.proyectosRecientes.map((p) => (
              <li key={p.idProyecto} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <span className="text-xs font-medium text-on-surface line-clamp-1 flex-1">
                  {p.tituloProyecto}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${estadoBadgeClasses(p.estadoProyecto)}`}
                >
                  {formatEstadoProyecto(p.estadoProyecto)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="flex gap-2 rounded-xl border border-outline-variant bg-surface-container-low p-3">
        <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
        <p className="text-xs text-tertiary">
          Este usuario puede supervisar proyectos académicos y validar actividad relacionada.
        </p>
      </div>
    </div>
  );
}

function AdministradorContent({ user }: { user: AdminUserDetail }) {
  const act = user.actividadAdmin;

  return (
    <div className="space-y-3">
      <Section title="Permisos administrativos">
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
      </Section>

      <div className="flex gap-2 rounded-xl border border-outline-variant bg-surface-container-low p-3">
        <Shield className="h-4 w-4 shrink-0 text-tertiary mt-0.5" />
        <p className="text-xs text-tertiary">
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
    <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
      <h4 className="mb-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
        Acciones administrativas
      </h4>

      {user.estado === 'ACTIVO' && (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() =>
                onAction({
                  nuevoEstado: 'INACTIVO',
                  title: 'Desactivar usuario',
                  description: `¿Deseas desactivar a ${userName}? El usuario perderá acceso activo a la plataforma.`,
                  actionLabel: 'Desactivar',
                  variant: 'warning',
                })
              }
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface-container-high py-2 text-sm font-semibold text-on-surface transition-all hover:bg-primary hover:text-on-primary"
            >
              <UserX className="h-4 w-4" />
              Desactivar usuario
            </button>
            <button
              onClick={() =>
                onAction({
                  nuevoEstado: 'BLOQUEADO',
                  title: 'Bloquear usuario',
                  description: `¿Deseas bloquear a ${userName}? El usuario no podrá iniciar sesión.`,
                  actionLabel: 'Bloquear',
                  variant: 'destructive',
                })
              }
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-error-container py-2 text-sm font-semibold text-error hover:bg-error/20 transition-colors"
            >
              <ShieldOff className="h-4 w-4" />
              Bloquear usuario
            </button>
          </div>
          <p className="text-[10px] text-tertiary">
            Desactivar suspende temporalmente la cuenta. Bloquear restringe el acceso por decisión
            administrativa.
          </p>
        </div>
      )}

      {user.estado === 'INACTIVO' && (
        <div className="space-y-2">
          <button
            onClick={() =>
              onAction({
                nuevoEstado: 'ACTIVO',
                title: 'Activar usuario',
                description: `¿Deseas activar a ${userName}? Recuperará acceso a la plataforma.`,
                actionLabel: 'Activar',
                variant: 'default',
              })
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2 text-sm font-bold text-on-primary hover:bg-primary/90 transition-colors"
          >
            <UserCheck className="h-4 w-4" />
            Activar usuario
          </button>
        </div>
      )}

      {user.estado === 'BLOQUEADO' && (
        <div className="space-y-2">
          <button
            onClick={() =>
              onAction({
                nuevoEstado: 'ACTIVO',
                title: 'Desbloquear usuario',
                description: `¿Deseas desbloquear a ${userName}? Recuperará acceso normal.`,
                actionLabel: 'Desbloquear',
                variant: 'default',
              })
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2 text-sm font-bold text-on-primary hover:bg-primary/90 transition-colors"
          >
            <UserCheck className="h-4 w-4" />
            Desbloquear usuario
          </button>
        </div>
      )}
    </div>
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
        text: error.message || 'No se pudo actualizar el estado del usuario.',
      });
      setPendingAction(null);
    },
  });

  return (
    <>
      {/* Avatar & identity */}
      <div className="flex flex-col items-center gap-3 border-b border-outline-variant pb-5 text-center">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-outline-variant">
          {user.fotoUrl ? (
            <Image
              src={user.fotoUrl}
              alt=""
              width={64}
              height={64}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary-container text-lg font-black text-on-primary-container">
              {getInitials(user.nombre, user.apellido)}
            </div>
          )}
        </div>
        <div>
          <p className="font-headline text-lg font-black text-on-surface">
            {user.nombre} {user.apellido}
          </p>
          <p className="text-xs text-tertiary">{user.correo}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <UserStatusBadge estado={user.estado} />
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary">
            {formatRol(primaryRole)}
          </span>
        </div>
      </div>

      {/* Información básica */}
      <Section title="Información básica">
        <InfoRow label="Estado" value={<UserStatusBadge estado={user.estado} />} />
        <InfoRow label="Rol principal" value={formatRol(primaryRole)} />
        <InfoRow label="Fecha de registro" value={formatFecha(user.fechaCreacion)} />
        <InfoRow
          label="Último acceso"
          value={
            user.fechaUltimaSesion
              ? `${timeAgo(user.fechaUltimaSesion)} · ${formatFecha(user.fechaUltimaSesion)}`
              : 'Sin registro'
          }
        />
      </Section>

      {/* Role-specific content */}
      {primaryRole === 'administrador' && <AdministradorContent user={user} />}
      {primaryRole === 'coordinador_academico' && <CoordinadorContent user={user} />}
      {primaryRole === 'lider_asociacion' && <LiderContent user={user} />}
      {primaryRole === 'mentor' && <MentorContent user={user} />}
      {primaryRole === 'estudiante' && <EstudianteContent user={user} />}
      {!primaryRole && (
        <p className="text-xs text-tertiary">No hay datos disponibles para esta sección.</p>
      )}

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
        className="w-full sm:max-w-[460px] lg:max-w-[520px] bg-surface-container-lowest border-l border-outline-variant flex flex-col p-0 gap-0"
      >
        <SheetHeader className="border-b border-outline-variant px-5 py-4 shrink-0">
          <SheetTitle className="text-xs font-black uppercase tracking-widest text-tertiary">
            Detalle de usuario
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-4 p-5">
            {isLoading && <DrawerSkeleton />}

            {isError && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-outline-variant p-8 text-center">
                <AlertCircle className="h-6 w-6 text-error" />
                <p className="text-sm font-medium text-on-surface">
                  No se pudo cargar el detalle del usuario.
                </p>
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
