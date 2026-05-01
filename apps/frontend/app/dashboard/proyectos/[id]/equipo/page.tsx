'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Users, GraduationCap, Wrench, ShieldAlert } from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { getEquipoProyecto, getMyProjectById } from '@/lib/services/projects';
import { getUserIdFromToken } from '@/lib/api/client';
import type { MiembroEquipoDTO } from '@/lib/dto/project.dto';

const nivelColor: Record<string, string> = {
  BASICO: 'bg-blue-100 text-blue-700',
  INTERMEDIO: 'bg-yellow-100 text-yellow-700',
  AVANZADO: 'bg-green-100 text-green-700',
};

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-3 h-5 w-1/3 rounded bg-surface-container-high" />
      <div className="mb-2 h-4 w-1/2 rounded bg-surface-container" />
      <div className="mt-4 flex flex-wrap gap-2">
        <div className="h-5 w-16 rounded-full bg-surface-container-high" />
        <div className="h-5 w-20 rounded-full bg-surface-container-high" />
      </div>
    </div>
  );
}

function MiembroCard({ miembro }: { miembro: MiembroEquipoDTO }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-white p-6 shadow-sm">
      {/* Avatar + nombre */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-black text-primary">
          {miembro.nombre[0]}{miembro.apellido[0]}
        </div>
        <div>
          <p className="font-bold text-on-surface">
            {miembro.nombre} {miembro.apellido}
          </p>
          <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-secondary">
            {miembro.rol.nombreRol}
          </span>
        </div>
      </div>

      {/* Carrera */}
      {miembro.carrera && (
        <div className="flex items-start gap-2 text-sm text-on-surface-variant">
          <GraduationCap className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {miembro.carrera.nombreCarrera}
            {miembro.carrera.facultad && (
              <span className="text-xs text-tertiary"> — {miembro.carrera.facultad}</span>
            )}
          </span>
        </div>
      )}

      {/* Habilidades */}
      {miembro.habilidades.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-tertiary">
            <Wrench className="h-3 w-3" />
            Habilidades
          </div>
          <div className="flex flex-wrap gap-1.5">
            {miembro.habilidades.map((h, i) => (
              <span
                key={i}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  nivelColor[h.nivelHabilidad] ?? 'bg-gray-100 text-gray-700'
                }`}
                title={h.nivelHabilidad}
              >
                {h.nombreHabilidad}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EquipoProyectoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const proyectoId = parseInt(id, 10);
  const currentUserId = getUserIdFromToken();

  // Carga el proyecto para verificar que el usuario es el líder
  const {
    data: proyecto,
    isLoading: loadingProyecto,
    isError: errorProyecto,
  } = useQuery({
    queryKey: ['proyecto-owner', proyectoId],
    queryFn: () => getMyProjectById(proyectoId),
    retry: false,
  });

  // Solo carga el equipo si el usuario es el líder (getMyProjectById ya lo valida en el backend)
  const {
    data: equipo = [],
    isLoading: loadingEquipo,
    isError: errorEquipo,
  } = useQuery<MiembroEquipoDTO[]>({
    queryKey: ['equipo-proyecto', proyectoId],
    queryFn: () => getEquipoProyecto(proyectoId),
    enabled: !!proyecto,
    retry: false,
  });

  // Validación adicional en frontend: el usuario autenticado debe ser el creador
  const esLider = proyecto ? proyecto.creadoPor === currentUserId : false;

  const isLoading = loadingProyecto || loadingEquipo;

  // Acceso denegado si el proyecto cargó pero el usuario no es líder
  if (!loadingProyecto && (errorProyecto || (proyecto && !esLider))) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <ShieldAlert className="h-12 w-12 text-red-400" />
          <h2 className="text-xl font-bold text-on-surface">Acceso restringido</h2>
          <p className="max-w-sm text-center text-sm text-on-surface-variant">
            Solo el líder del proyecto puede ver el equipo.
          </p>
          <Link
            href={`/dashboard/proyectos/${proyectoId}`}
            className="rounded-xl bg-primary px-6 py-2 text-sm font-bold text-on-primary"
          >
            Volver al proyecto
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="px-8 pb-12 pt-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/dashboard/proyectos/${proyectoId}`}
            className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al proyecto
          </Link>

          <div className="flex items-center gap-3">
            <Users className="h-7 w-7 text-primary" />
            <div>
              <h1 className="font-headline text-3xl font-black tracking-tight text-on-surface">
                Equipo del Proyecto
              </h1>
              {proyecto && (
                <p className="text-sm text-on-surface-variant">{proyecto.tituloProyecto}</p>
              )}
            </div>
          </div>
        </div>

        {/* Resumen */}
        {!isLoading && (
          <div className="mb-8 rounded-xl bg-surface-container-low px-6 py-4">
            <span className="text-sm font-medium text-on-surface-variant">
              {equipo.length === 0
                ? 'Aún no hay miembros aceptados en este proyecto.'
                : `${equipo.length} ${equipo.length === 1 ? 'colaborador aceptado' : 'colaboradores aceptados'}`}
            </span>
          </div>
        )}

        {/* Tarjetas del equipo */}
        {errorEquipo && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            No se pudo cargar el equipo. Intenta recargar la página.
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
            : equipo.map((m) => <MiembroCard key={m.idPostulacion} miembro={m} />)}
        </div>

        {!isLoading && !errorEquipo && equipo.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Users className="h-10 w-10 text-tertiary" />
            <p className="text-sm text-on-surface-variant">
              Aún no hay postulaciones aceptadas para este proyecto.
            </p>
            <Link
              href={`/dashboard/proyectos/${proyectoId}/postulaciones`}
              className="text-sm font-bold text-primary hover:underline"
            >
              Ver postulaciones pendientes
            </Link>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
