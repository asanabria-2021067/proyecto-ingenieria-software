'use client';

import Link from 'next/link';
import { Calendar, MapPin, Users } from 'lucide-react';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { TopNav } from '@/components/layout/top-nav';
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
    case 'PUBLICADO':   return 'bg-[#006735] text-white';
    case 'EN_PROGRESO': return 'bg-[#416900] text-white';
    case 'EN_REVISION': return 'bg-blue-100 text-blue-700';
    case 'OBSERVADO':   return 'bg-amber-100 text-amber-700';
    case 'EN_SOLICITUD_CIERRE': return 'bg-purple-100 text-purple-700';
    case 'BORRADOR':    return 'bg-gray-100 text-gray-600';
    case 'CERRADO':     return 'bg-gray-200 text-gray-500';
    case 'CANCELADO':   return 'bg-red-100 text-red-700';
    default:            return 'bg-gray-100 text-gray-700';
  }
}

// ─── Skeleton de carga ────────────────────────────────────────────────────────
function ProjectDetailSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <Skeleton className="h-5 w-56" />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="flex gap-6">
        <div className="flex-1 space-y-5">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
        <div className="w-72 space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

// ─── Vista principal ──────────────────────────────────────────────────────────
function ProjectDetailView({ proyecto }: { proyecto: ProyectoDetalleDTO }) {
  const totalCupos = proyecto.roles.reduce((sum, r) => sum + r.cupos, 0);
  const organizacionPrincipal = proyecto.organizaciones[0] ?? null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">

      {/* BREADCRUMB */}
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link
                href="/dashboard/projects"
                className="text-gray-500 hover:text-gray-900 text-sm"
              >
                Proyectos
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="text-gray-900 text-sm font-medium truncate max-w-xs">
              {proyecto.tituloProyecto}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* PROJECT HEADER */}
      <div className="bg-white rounded-2xl px-8 py-6 mb-6 flex items-start justify-between gap-4 shadow-sm">
        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap gap-2">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${estadoBadgeStyle(proyecto.estadoProyecto)}`}
            >
              {proyecto.estadoProyecto}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
              {proyecto.tipoProyecto}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border border-gray-300 text-gray-700">
              {proyecto.modalidadProyecto}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 leading-tight">
            {proyecto.tituloProyecto}
          </h1>
        </div>
        <Button className="shrink-0 bg-[#006735] hover:bg-[#005229] text-white rounded-xl px-6">
          ▶ Postularme
        </Button>
      </div>

      {/* MAIN LAYOUT */}
      <div className="flex gap-6 items-start">

        {/* LEFT COLUMN */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* DESCRIPCIÓN */}
          {proyecto.descripcionProyecto && (
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
                Descripción del Proyecto
              </h2>
              <p className="text-gray-800 leading-relaxed text-sm">
                {proyecto.descripcionProyecto}
              </p>
            </div>
          )}

          {/* ÁREAS DE INTERÉS */}
          {proyecto.intereses.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
                Áreas de Interés
              </h2>
              <div className="flex flex-wrap gap-2">
                {proyecto.intereses.map((pi) => (
                  <span
                    key={pi.idProyectoInteres}
                    className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-800 text-sm font-medium"
                  >
                    {pi.interes.nombreInteres}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ROLES DISPONIBLES */}
          {proyecto.roles.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                  Roles Disponibles
                </h2>
                <span className="text-xs text-[#006735] font-semibold">
                  {totalCupos}{' '}
                  {totalCupos === 1 ? 'Vacante activa' : 'Vacantes activas'}
                </span>
              </div>
              <div className="space-y-6">
                {proyecto.roles.map((rol) => (
                  <div
                    key={rol.idRolProyecto}
                    className="border-l-4 border-[#008345] pl-5"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-semibold text-gray-900 text-sm">
                        {rol.nombreRol}
                      </h3>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 rounded-lg border-[#006735] text-[#006735] hover:bg-green-50 text-xs"
                      >
                        Postularme a este rol
                      </Button>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
                      <Users className="size-3.5" />
                      {rol.cupos}{' '}
                      {rol.cupos === 1 ? 'cupo disponible' : 'cupos disponibles'}
                    </div>
                    {rol.descripcionRolProyecto && (
                      <p className="text-xs text-gray-600 mb-3 leading-relaxed">
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
                            <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-800 text-xs font-medium">
                              {req.habilidad.nombreHabilidad}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-600">
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
          />

        </div>

        {/* RIGHT COLUMN */}
        <div className="w-72 flex-shrink-0 space-y-4">

          {/* RESPONSABLE */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
              Responsable
            </h2>
            <div className="flex items-center gap-3">
              <Avatar className="size-11">
                <AvatarFallback className="bg-green-100 text-[#006735] font-bold text-sm">
                  {getInitials(proyecto.creador.nombre, proyecto.creador.apellido)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 text-sm">
                  {proyecto.creador.nombre} {proyecto.creador.apellido}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {proyecto.creador.correo}
                </p>
              </div>
            </div>
          </div>

          {/* ORGANIZACIÓN */}
          {organizacionPrincipal && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
                Organización
              </h2>
              <p className="font-semibold text-gray-900 text-sm mb-3">
                {organizacionPrincipal.organizacion.nombreOrganizacion}
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                  {organizacionPrincipal.organizacion.tipoOrganizacion}
                </span>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#006735] text-white">
                  {organizacionPrincipal.rolOrganizacion}
                </span>
              </div>
            </div>
          )}

          {/* DETALLES DEL PROYECTO */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
              Detalles del Proyecto
            </h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Calendar className="size-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Start Date</p>
                  <p className="text-sm text-gray-900 font-medium">
                    {formatDate(proyecto.fechaInicio)}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="size-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">End Date</p>
                  <p className="text-sm text-gray-900 font-medium">
                    {formatDate(proyecto.fechaFinEstimada)}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="size-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Modalidad</p>
                  <p className="text-sm text-gray-900 font-medium">
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopNav />
        <ProjectDetailSkeleton />
      </div>
    );
  }

  if (error || !proyecto) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopNav />
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <p className="text-red-600 font-medium">
            No se pudo cargar el proyecto. Intenta nuevamente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      <ProjectDetailView proyecto={proyecto} />
    </div>
  );
}
