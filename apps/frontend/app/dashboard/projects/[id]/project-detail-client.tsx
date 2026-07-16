'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Calendar, MapPin, Users } from 'lucide-react';
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
import { HitosSection } from '@/components/projects/hitos-section';
import { ProjectProgressBar } from '@/components/projects/project-progress-bar';
import { useProjectAvance } from '@/hooks/use-project-avance';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';

interface Props {
  id: number;
}

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function formatDate(date: string | null): string {
  if (!date) return 'Por definir';
  return new Date(date).toLocaleDateString('es-GT', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function estadoBadgeStyle(estado: string): string {
  switch (estado.toUpperCase()) {
    case 'PUBLICADO':   return 'bg-primary text-on-primary';
    case 'EN_PROGRESO': return 'bg-secondary text-on-secondary';
    case 'EN_REVISION': return 'bg-blue-500/10 text-blue-500 border border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300';
    case 'OBSERVADO':   return 'bg-amber-500/10 text-amber-500 border border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300';
    case 'EN_SOLICITUD_CIERRE': return 'bg-purple-500/10 text-purple-500 border border-purple-500/20 dark:bg-purple-500/20 dark:text-purple-300';
    case 'BORRADOR':    return 'bg-surface-container-high text-on-surface-variant border border-outline-variant/30';
    case 'CERRADO':     return 'bg-surface-container-highest text-tertiary border border-outline-variant/30';
    case 'CANCELADO':   return 'bg-red-500/10 text-red-500 border border-red-500/20 dark:bg-red-500/20 dark:text-red-300';
    default:            return 'bg-surface-container-high text-on-surface-variant';
  }
}

// ─── Skeleton de carga ────────────────────────────────────────────────────────
function ProjectDetailSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <Skeleton className="h-5 w-56" />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 space-y-5">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
        <div className="w-full lg:w-72 space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

// ─── Vista principal ──────────────────────────────────────────────────────────
function ProjectDetailView({
  proyecto,
  tareaInicialId,
}: {
  proyecto: ProyectoDetalleDTO;
  tareaInicialId: number | null;
}) {
  const totalCupos = proyecto.roles.reduce((sum, r) => sum + r.cupos, 0);
  const organizacionPrincipal = proyecto.organizaciones[0] ?? null;
  const { data: avance, isSuccess: puedeVerAvance } = useProjectAvance(proyecto.idProyecto);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 pb-20 md:pb-6">

      {/* BREADCRUMB */}
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link
                href="/dashboard/proyectos"
                className="text-tertiary hover:text-on-surface text-sm transition-colors"
              >
                Proyectos
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="text-on-surface text-sm font-medium truncate max-w-xs">
              {proyecto.tituloProyecto}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* PROJECT HEADER */}
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 md:p-8 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-sm">
        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap gap-2">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${estadoBadgeStyle(proyecto.estadoProyecto)}`}
            >
              {proyecto.estadoProyecto}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-surface-container-high text-on-surface-variant border border-outline-variant/10">
              {proyecto.tipoProyecto}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border border-outline-variant text-on-surface-variant">
              {proyecto.modalidadProyecto}
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-on-surface leading-tight font-headline">
            {proyecto.tituloProyecto}
          </h1>
          {puedeVerAvance && avance && (
            <ProjectProgressBar avance={avance} className="max-w-md pt-1" />
          )}
        </div>
        <Button className="shrink-0 bg-primary hover:bg-primary/90 text-on-primary rounded-xl px-6 h-12 font-bold transition-all shadow-sm">
          ▶ Postularme
        </Button>
      </div>

      {/* MAIN LAYOUT */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* LEFT COLUMN */}
        <div className="w-full lg:flex-1 min-w-0 space-y-6">

          {/* DESCRIPCIÓN */}
          {proyecto.descripcionProyecto && (
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 shadow-sm">
              <h2 className="text-xs font-black uppercase tracking-widest text-tertiary mb-3 font-headline">
                Descripción del Proyecto
              </h2>
              <p className="text-on-surface-variant leading-relaxed text-sm">
                {proyecto.descripcionProyecto}
              </p>
            </div>
          )}

          {/* ÁREAS DE INTERÉS */}
          {proyecto.intereses.length > 0 && (
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 shadow-sm">
              <h2 className="text-xs font-black uppercase tracking-widest text-tertiary mb-3 font-headline">
                Áreas de Interés
              </h2>
              <div className="flex flex-wrap gap-2">
                {proyecto.intereses.map((pi) => (
                  <span
                    key={pi.idProyectoInteres}
                    className="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface-variant text-sm font-medium"
                  >
                    {pi.interes.nombreInteres}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ROLES DISPONIBLES */}
          {proyecto.roles.length > 0 && (
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
                <h2 className="text-xs font-black uppercase tracking-widest text-tertiary font-headline">
                  Roles Disponibles
                </h2>
                <span className="text-xs text-primary font-black uppercase tracking-wider">
                  {totalCupos}{' '}
                  {totalCupos === 1 ? 'Vacante activa' : 'Vacantes activas'}
                </span>
              </div>
              <div className="space-y-6">
                {proyecto.roles.map((rol) => (
                  <div
                    key={rol.idRolProyecto}
                    className="border-l-4 border-primary pl-5 py-0.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-2">
                      <h3 className="font-black text-on-surface text-sm font-headline">
                        {rol.nombreRol}
                      </h3>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 rounded-lg border-primary text-primary hover:bg-primary/10 text-xs font-bold transition-all self-start"
                      >
                        Postularme a este rol
                      </Button>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-tertiary mb-3">
                      <Users className="size-3.5" />
                      {rol.cupos}{' '}
                      {rol.cupos === 1 ? 'cupo disponible' : 'cupos disponibles'}
                    </div>
                    {rol.descripcionRolProyecto && (
                      <p className="text-xs text-on-surface-variant mb-3 leading-relaxed">
                        {rol.descripcionRolProyecto}
                      </p>
                    )}
                    {rol.requisitos.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {rol.requisitos.map((req) => (
                          <div
                            key={req.idRequisitoHabilidad}
                            className="flex items-center gap-1.5"
                          >
                            <span className="px-2.5 py-1 rounded-lg bg-surface-container-low text-on-surface text-xs font-medium">
                              {req.habilidad.nombreHabilidad}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-surface-container-high text-tertiary">
                              {req.nivelMinimo}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HITOS Y TAREAS */}
          <HitosSection
            hitos={proyecto.hitos}
            tareas={proyecto.tareas ?? []}
            idProyecto={proyecto.idProyecto}
            tareaInicialId={tareaInicialId}
          />

        </div>

        {/* RIGHT COLUMN */}
        <div className="w-full lg:w-72 flex-shrink-0 space-y-6">

          {/* RESPONSABLE */}
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-widest text-tertiary mb-4 font-headline">
              Responsable
            </h2>
            <div className="flex items-center gap-3">
              <Avatar className="size-11">
                <AvatarFallback className="bg-primary/10 text-primary font-black text-sm">
                  {getInitials(proyecto.creador.nombre, proyecto.creador.apellido)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-bold text-on-surface text-sm truncate">
                  {proyecto.creador.nombre} {proyecto.creador.apellido}
                </p>
                <p className="text-xs text-on-surface-variant truncate">
                  {proyecto.creador.correo}
                </p>
              </div>
            </div>
          </div>

          {/* ORGANIZACIÓN */}
          {organizacionPrincipal && (
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 shadow-sm">
              <h2 className="text-xs font-black uppercase tracking-widest text-tertiary mb-4 font-headline">
                Organización
              </h2>
              <p className="font-bold text-on-surface text-sm mb-3">
                {organizacionPrincipal.organizacion.nombreOrganizacion}
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-surface-container-low text-on-surface">
                  {organizacionPrincipal.organizacion.tipoOrganizacion}
                </span>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-primary text-on-primary">
                  {organizacionPrincipal.rolOrganizacion}
                </span>
              </div>
            </div>
          )}

          {/* DETALLES DEL PROYECTO */}
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-widest text-tertiary mb-4 font-headline">
              Detalles del Proyecto
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Calendar className="size-4 text-outline mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-tertiary uppercase tracking-wide">Fecha de Inicio</p>
                  <p className="text-sm text-on-surface font-medium">
                    {formatDate(proyecto.fechaInicio)}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="size-4 text-outline mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-tertiary uppercase tracking-wide">Fin Estimado</p>
                  <p className="text-sm text-on-surface font-medium">
                    {formatDate(proyecto.fechaFinEstimada)}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="size-4 text-outline mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-tertiary uppercase tracking-wide">Modalidad</p>
                  <p className="text-sm text-on-surface font-medium">
                    {proyecto.modalidadProyecto}
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────
export default function ProjectDetailClient({ id }: Props) {
  const { data: proyecto, isLoading, error } = useProjectDetail(id);
  const searchParams = useSearchParams();
  const tareaParam = searchParams.get('tarea');
  const tareaInicialId = tareaParam ? Number(tareaParam) : null;

  if (isLoading) {
    return (
      <DashboardLayout>
        <ProjectDetailSkeleton />
      </DashboardLayout>
    );
  }

  if (error || !proyecto) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <p className="text-red-600 font-medium">
            No se pudo cargar el proyecto. Intenta nuevamente.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <ProjectDetailView proyecto={proyecto} tareaInicialId={tareaInicialId} />
    </DashboardLayout>
  );
}
