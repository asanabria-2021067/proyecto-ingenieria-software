'use client';

import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  Calendar,
  CalendarCheck2,
  CheckCircle2,
  History,
  Pencil,
  Plus,
  Settings2,
  Tag,
  Users,
} from 'lucide-react';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { RoleAdminCard } from '@/components/projects/role-admin-card';
import {
  ProjectRolesSheet,
  type RolesSheetIntent,
} from '@/components/projects/project-roles-sheet';
import {
  estadoBadgeLabel,
  estadoBadgeStyle,
  tipoBadgeLabel,
  tipoBadgeStyle,
} from '@/components/projects/available-project-card';
import { MODALIDAD_LABEL } from '@/types';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useProjectRoles } from '@/hooks/use-project-roles';
import { useCurrentUser } from '@/hooks/use-current-user';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';

interface Props {
  id: number;
}

const MIS_PROYECTOS_HREF = '/dashboard/projects/mine';

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function formatDate(date: string | null): string {
  if (!date) return 'Por definir';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 'No disponible.';
  return d.toLocaleDateString('es-GT', { year: 'numeric', month: 'short', day: 'numeric' });
}

const CARD ='rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm';

// ─── Skeleton de carga ────────────────────────────────────────────────────────
function ProjectDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-6 pb-12">
      <Skeleton className="mb-5 h-4 w-56" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="w-full space-y-5 lg:flex-1">
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <div className="w-full space-y-4 lg:w-80">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// ─── Vista principal ──────────────────────────────────────────────────────────
function ProjectDetailView({ proyecto }: { proyecto: ProyectoDetalleDTO }) {
  const idProyecto = proyecto.idProyecto;
  const organizacionPrincipal = proyecto.organizaciones[0] ?? null;
  const { members } = useProjectMembers(idProyecto);
  const { data: currentUser } = useCurrentUser();
  // Liderazgo determinado exclusivamente por Proyecto.creadoPor.
  const isLeader = currentUser?.idUsuario === proyecto.creador.idUsuario;

  // Compatibilidad de navegación (Sección 20): URLs antiguas ?tab= → workspace.
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const taskIdParam = searchParams.get('taskId');
  const kanbanBase = `/dashboard/projects/${idProyecto}/kanban`;
  const kanbanHref = useMemo(
    () =>
      taskIdParam && /^\d+$/.test(taskIdParam) ? `${kanbanBase}?taskId=${taskIdParam}` : kanbanBase,
    [kanbanBase, taskIdParam],
  );
  const debeRedirigir = tabParam === 'tablero' || tabParam === 'hitos';
  useEffect(() => {
    if (debeRedirigir) router.replace(kanbanHref);
  }, [debeRedirigir, kanbanHref, router]);

  const esParticipante =
    currentUser != null && members.some((m) => m.idUsuario === currentUser.idUsuario);
  const puedeVerKanban = isLeader || esParticipante;

  // Roles enriquecidos (stats + isMine/canLeave) solo para el líder.
  const {
    roles: rolesAdmin,
    crearRol,
    editarRol,
    eliminarRol,
    asignarmeRol,
    salirDeRol,
  } = useProjectRoles(idProyecto, { enabled: isLeader });

  const [rolesSheetAbierto, setRolesSheetAbierto] = useState(false);
  const [rolesSheetIntent, setRolesSheetIntent] = useState<RolesSheetIntent>({ kind: 'list' });

  const abrirGestionRoles = () => {
    setRolesSheetIntent({ kind: 'list' });
    setRolesSheetAbierto(true);
  };
  const abrirCrearRol = () => {
    setRolesSheetIntent({ kind: 'create' });
    setRolesSheetAbierto(true);
  };
  const abrirEditarRol = (role: (typeof rolesAdmin)[number]) => {
    setRolesSheetIntent({ kind: 'edit', role });
    setRolesSheetAbierto(true);
  };

  // Resumen del equipo (Sección 24), todo derivado de datos reales.
  const participantesConfirmados = new Set(members.map((m) => m.idUsuario)).size;
  const cuposTotales = rolesAdmin.reduce((sum, r) => sum + r.cupos, 0);
  const rolesDisponiblesCount = rolesAdmin.filter((r) => r.cuposDisponibles > 0).length;
  const misRoles = rolesAdmin.filter((r) => r.isMine);

  // Objetivos: texto real, separado por líneas (Sección 16).
  const objetivos = (proyecto.objetivosProyecto ?? '')
    .split('\n')
    .map((s) => s.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);

  if (debeRedirigir) {
    return <ProjectDetailSkeleton />;
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 pb-12 pt-6 md:px-8">
      {/* BREADCRUMB (Sección 8) */}
      <Breadcrumb className="mb-5">
        <BreadcrumbList className="text-[13px]">
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={MIS_PROYECTOS_HREF} className="text-tertiary transition-colors hover:text-on-surface">
                Mis proyectos
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-xs truncate font-medium text-on-surface">
              {proyecto.tituloProyecto}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Grilla 2×2: la fila 1 (tarjeta principal · Responsable) usa items-stretch
          para que ambas tarjetas queden a la misma altura, sin el escalón; la
          fila 2 lleva el resto (objetivos/roles · detalles/resumen sticky). */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch">
        {/* FILA 1 · COL 1 — Tarjeta principal (Sección 9-13) */}
        <div className={`${CARD} min-w-0`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-3">
                {/* Badges (Sección 10) */}
                <div className="flex flex-wrap items-center gap-2">
                  {isLeader && (
                    <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary">
                      Líder del proyecto
                    </span>
                  )}
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${estadoBadgeStyle(proyecto.estadoProyecto)}`}>
                    {estadoBadgeLabel(proyecto.estadoProyecto)}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${tipoBadgeStyle(proyecto.tipoProyecto)}`}>
                    {tipoBadgeLabel(proyecto.tipoProyecto)}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-outline-variant px-3 py-1 text-xs font-medium text-on-surface-variant">
                    {MODALIDAD_LABEL[proyecto.modalidadProyecto as keyof typeof MODALIDAD_LABEL] ?? proyecto.modalidadProyecto}
                  </span>
                </div>

                {/* Título + descripción (Sección 11) */}
                <h1 className="font-headline text-2xl font-black leading-tight text-on-surface md:text-[28px]">
                  {proyecto.tituloProyecto}
                </h1>
                <p className="max-w-2xl text-sm leading-relaxed text-on-surface-variant">
                  {proyecto.descripcionProyecto || 'Sin descripción disponible.'}
                </p>

                {/* Etiquetas temáticas reales (Sección 11) */}
                {proyecto.intereses.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {proyecto.intereses.map((pi) => (
                      <span
                        key={pi.idProyectoInteres}
                        className="inline-flex items-center gap-1 rounded-md bg-surface-container-high px-2 py-0.5 text-xs font-medium text-on-surface-variant"
                      >
                        <Tag className="size-3" aria-hidden="true" />
                        {pi.interes.nombreInteres}
                      </span>
                    ))}
                  </div>
                )}

                {/* Resumen del responsable en el encabezado (Sección 12) */}
                {isLeader && (
                  <div className="flex items-center gap-2 pt-1">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-primary/10 text-xs font-black text-primary">
                        {getInitials(proyecto.creador.nombre, proyecto.creador.apellido)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-on-surface-variant">
                      Eres el responsable del proyecto
                    </span>
                  </div>
                )}
              </div>

              {/* Acciones del líder (Sección 13) */}
              {isLeader ? (
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="gap-1.5 rounded-md border-outline-variant text-xs font-bold text-on-surface"
                  >
                    <Link href={`/dashboard/projects/mine/${idProyecto}?returnTo=/dashboard/projects/${idProyecto}`}>
                      <History className="size-3.5" aria-hidden="true" />
                      Revisiones previas
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="gap-1.5 rounded-md border-outline-variant text-xs font-bold text-on-surface"
                  >
                    <Link href={`/dashboard/projects/mine/form?id=${idProyecto}`}>
                      <Pencil className="size-3.5" aria-hidden="true" />
                      Editar información
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={abrirGestionRoles}
                    className="gap-1.5 rounded-md border-outline-variant text-xs font-bold text-on-surface"
                  >
                    <Settings2 className="size-3.5" aria-hidden="true" />
                    Editar roles
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    className="gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
                  >
                    <Link href={kanbanBase}>
                      Ver Kanban
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              ) : puedeVerKanban ? (
                <Button
                  asChild
                  size="sm"
                  className="shrink-0 gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
                >
                  <Link href={kanbanBase}>
                    Ver Kanban
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </Button>
              ) : (
                <Button className="shrink-0 rounded-md bg-primary px-5 text-sm font-bold text-on-primary hover:bg-primary/90">
                  Postularme
                </Button>
              )}
            </div>
          </div>

        {/* FILA 1 · COL 2 — Responsable del proyecto (se estira a la altura de la
            tarjeta principal, alineando ambos bordes inferiores) */}
        <div className={`${CARD} flex flex-col`}>
          <h2 className="mb-4 font-headline text-xs font-black uppercase tracking-widest text-tertiary">
            Responsable del proyecto
          </h2>
          <div className="flex items-center gap-3">
            <Avatar className="size-12">
              <AvatarFallback className="bg-primary/10 text-sm font-black text-primary">
                {getInitials(proyecto.creador.nombre, proyecto.creador.apellido)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-on-surface">
                {proyecto.creador.nombre} {proyecto.creador.apellido}
              </p>
              <p className="truncate text-xs text-on-surface-variant">{proyecto.creador.correo}</p>
            </div>
          </div>
        </div>

        {/* FILA 2 · COL 1 — Objetivos + Roles */}
        <div className="min-w-0 space-y-5">
          {/* OBJETIVOS (Sección 16) */}
          <div className={CARD}>
            <h2 className="mb-3 font-headline text-xs font-black uppercase tracking-widest text-tertiary">
              Objetivos del proyecto
            </h2>
            {objetivos.length === 0 ? (
              <p className="text-sm text-tertiary">
                No se han registrado objetivos para este proyecto.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {objetivos.map((obj, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="text-[13px] leading-relaxed text-on-surface-variant">{obj}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ROLES (Sección 17-20) */}
          {isLeader ? (
            <div className={CARD}>
              <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <h2 className="font-headline text-sm font-black text-on-surface">
                  Roles del proyecto ({rolesAdmin.length})
                </h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={abrirCrearRol}
                  className="gap-1.5 self-start rounded-md border-primary text-xs font-bold text-primary hover:bg-primary/10 sm:self-auto"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Agregar rol
                </Button>
              </div>
              {rolesAdmin.length === 0 ? (
                <p className="text-sm text-tertiary">No hay roles registrados.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
                  {rolesAdmin.map((role) => (
                    <RoleAdminCard
                      key={role.idRolProyecto}
                      role={role}
                      asignarmeRol={asignarmeRol}
                      salirDeRol={salirDeRol}
                      onEditar={() => abrirEditarRol(role)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            proyecto.roles.length > 0 && (
              <div className={CARD}>
                <h2 className="mb-4 font-headline text-xs font-black uppercase tracking-widest text-tertiary">
                  Roles disponibles
                </h2>
                <div className="space-y-5">
                  {proyecto.roles.map((rol) => (
                    <div key={rol.idRolProyecto} className="border-l-4 border-primary py-0.5 pl-5">
                      <div className="mb-2 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <h3 className="font-headline text-sm font-black text-on-surface">{rol.nombreRol}</h3>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 self-start rounded-md border-primary text-xs font-bold text-primary transition-all hover:bg-primary/10"
                        >
                          Postularme a este rol
                        </Button>
                      </div>
                      <div className="mb-3 flex items-center gap-1.5 text-xs text-tertiary">
                        <Users className="size-3.5" />
                        {rol.cupos} {rol.cupos === 1 ? 'cupo disponible' : 'cupos disponibles'}
                      </div>
                      {rol.descripcionRolProyecto && (
                        <p className="mb-3 text-xs leading-relaxed text-on-surface-variant">
                          {rol.descripcionRolProyecto}
                        </p>
                      )}
                      {rol.requisitos.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {rol.requisitos.map((req) => (
                            <span
                              key={req.idRequisitoHabilidad}
                              className="rounded-md bg-surface-container-low px-2.5 py-1 text-xs font-medium text-on-surface"
                            >
                              {req.habilidad.nombreHabilidad}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>

        {/* FILA 2 · COL 2 — Detalles + Resumen (Sección 21-24), sticky */}
        <div className="space-y-4 lg:sticky lg:top-22.5">
          {/* Detalles del proyecto */}
          <div className={CARD}>
            <h2 className="mb-4 font-headline text-xs font-black uppercase tracking-widest text-tertiary">
              Detalles del proyecto
            </h2>
            <dl className="space-y-3.5 text-sm">
              <DetalleFila label="Estado">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${estadoBadgeStyle(proyecto.estadoProyecto)}`}>
                  {estadoBadgeLabel(proyecto.estadoProyecto)}
                </span>
              </DetalleFila>
              <DetalleFila label="Tipo de proyecto">{tipoBadgeLabel(proyecto.tipoProyecto)}</DetalleFila>
              <DetalleFila label="Modalidad">
                {MODALIDAD_LABEL[proyecto.modalidadProyecto as keyof typeof MODALIDAD_LABEL] ?? proyecto.modalidadProyecto}
              </DetalleFila>
              {organizacionPrincipal && (
                <DetalleFila label="Organización">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="size-3.5 text-outline" aria-hidden="true" />
                    {organizacionPrincipal.organizacion.nombreOrganizacion}
                  </span>
                </DetalleFila>
              )}
              <DetalleFila label="Fecha de inicio">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-outline" aria-hidden="true" />
                  {formatDate(proyecto.fechaInicio)}
                </span>
              </DetalleFila>
              <DetalleFila label="Fecha final estimada">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarCheck2 className="size-3.5 text-outline" aria-hidden="true" />
                  {formatDate(proyecto.fechaFinEstimada)}
                </span>
              </DetalleFila>
            </dl>
          </div>

          {/* Resumen del equipo (Sección 24) — solo con datos enriquecidos del líder */}
          {isLeader && (
            <div className={CARD}>
              <h2 className="mb-4 font-headline text-xs font-black uppercase tracking-widest text-tertiary">
                Resumen del equipo
              </h2>
              <div className="space-y-3.5 text-sm">
                <div>
                  <p className="mb-1 text-xs text-tertiary">Mis roles</p>
                  {misRoles.length === 0 ? (
                    <p className="text-sm font-medium text-on-surface-variant">No asignado</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {misRoles.map((r) => (
                        <span
                          key={r.idRolProyecto}
                          className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
                        >
                          {r.nombreRol}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <ResumenFila label="Participantes confirmados" value={participantesConfirmados} />
                <ResumenFila label="Roles disponibles" value={rolesDisponiblesCount} />
                <ResumenFila label="Cupos totales" value={cuposTotales} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sheet de gestión de roles (solo líder) */}
      {isLeader && (
        <ProjectRolesSheet
          open={rolesSheetAbierto}
          onOpenChange={setRolesSheetAbierto}
          intent={rolesSheetIntent}
          roles={rolesAdmin}
          crearRol={crearRol}
          editarRol={editarRol}
          eliminarRol={eliminarRol}
        />
      )}
    </div>
  );
}

function DetalleFila({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-tertiary">{label}</dt>
      <dd className="text-right text-sm font-medium text-on-surface">{children}</dd>
    </div>
  );
}

function ResumenFila({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-tertiary">{label}</span>
      <span className="text-sm font-bold text-on-surface">{value}</span>
    </div>
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────
export default function ProjectDetailClient({ id }: Props) {
  const { data: proyecto, isLoading, error, refetch } = useProjectDetail(id);

  if (isLoading) {
    return (
      <DashboardLayout>
        <ProjectDetailSkeleton />
      </DashboardLayout>
    );
  }

  if (error || !proyecto) {
    const status = (error as { statusCode?: number } | null)?.statusCode;
    const noEncontrado = status === 404;
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h2 className="text-lg font-bold text-on-surface">
            {noEncontrado ? 'Proyecto no encontrado' : 'No fue posible cargar la información del proyecto.'}
          </h2>
          <p className="mt-2 text-sm text-on-surface-variant">
            {noEncontrado
              ? 'El proyecto que buscas no existe o ya no está disponible.'
              : 'Ocurrió un problema al cargar el proyecto.'}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            {!noEncontrado && (
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Reintentar
              </Button>
            )}
            <Button asChild size="sm" className="bg-primary text-on-primary hover:bg-primary/90">
              <Link href={MIS_PROYECTOS_HREF}>Volver a Mis Proyectos</Link>
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Suspense fallback={<ProjectDetailSkeleton />}>
        <ProjectDetailView proyecto={proyecto} />
      </Suspense>
    </DashboardLayout>
  );
}
