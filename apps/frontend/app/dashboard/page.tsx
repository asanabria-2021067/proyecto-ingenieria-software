'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  GraduationCap,
  HeartHandshake,
  Zap,
  Clock,
  Eye,
  Calendar,
} from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import CompleteProfileDialog from '@/components/profile/CompleteProfileDialog';
import { useCurrentUser, isProfileIncomplete } from '@/hooks/use-current-user';
import { getDashboardStats, type DashboardStats } from '@/lib/services/users';
import { searchProjects } from '@/lib/services/projects';
import type { ProyectoListItemDTO } from '@/lib/dto/project.dto';

const tipoLabel: Record<string, string> = {
  ACADEMICO_HORAS_BECA: 'Hora Beca',
  ACADEMICO_EXPERIENCIA: 'Experiencia',
  EXTRACURRICULAR_EXTENSION: 'Extension',
};

const estadoColors: Record<string, string> = {
  PENDIENTE: 'bg-blue-100 text-blue-800',
  ACEPTADA: 'bg-green-100 text-green-800',
  RECHAZADA: 'bg-red-100 text-red-800',
};

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const [wizardDismissed, setWizardDismissed] = useState(false);
  const showWizard = useMemo(
    () => !wizardDismissed && !!user && isProfileIncomplete(user),
    [wizardDismissed, user],
  );

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
  });

  const { data: projects = [] } = useQuery<ProyectoListItemDTO[]>({
    queryKey: ['dashboard-projects'],
    queryFn: async () => {
      const p = await searchProjects('');
      return p.slice(0, 4);
    },
  });

  if (userLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  const horasBeca = stats?.horasBeca ?? 0;
  const horasBecaRequeridas = stats?.horasBecaRequeridas ?? null;
  const horasExtension = stats?.horasExtension ?? 0;
  const horasExtensionRequeridas = stats?.horasExtensionRequeridas ?? null;
  const proyectosActivos = stats?.proyectosActivos ?? 0;
  const requiereHorasBeca = horasBecaRequeridas !== null && horasBecaRequeridas > 0;
  const requiereHorasExtension =
    horasExtensionRequeridas !== null && horasExtensionRequeridas > 0;
  const progressBeca = requiereHorasBeca
    ? Math.min(100, Math.round((horasBeca / (horasBecaRequeridas as number)) * 100))
    : 0;
  const progressExtension = requiereHorasExtension
    ? Math.min(
        100,
        Math.round((horasExtension / (horasExtensionRequeridas as number)) * 100),
      )
    : 0;

  return (
    <DashboardLayout>
      <CompleteProfileDialog
        open={showWizard}
        onComplete={async () => {
          setWizardDismissed(true);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['currentUser'] }),
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
            queryClient.invalidateQueries({ queryKey: ['dashboard-projects'] }),
          ]);
        }}
      />

      <div className="px-8 pb-12 pt-8">
        {/* Welcome */}
        <section className="mb-12">
          <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-secondary">
            Bienvenido de vuelta
          </span>
          <h1 className="font-headline text-4xl font-black tracking-tighter text-on-surface md:text-5xl">
            Hola, {user?.nombre ?? ''}
          </h1>
          <p className="mt-2 max-w-2xl text-lg text-on-surface-variant">
            Tu progreso academico este semestre. Tienes {projects.length} proyectos disponibles.
          </p>
        </section>

        {/* Stats */}
        <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Horas Beca */}
          {requiereHorasBeca && (
            <div className="relative flex h-48 flex-col justify-between overflow-hidden rounded-xl bg-surface-container-lowest p-8">
              <div className="relative z-10">
                <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-tertiary">
                  Horas Beca Acumuladas
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black leading-none tracking-tighter text-primary">
                    {horasBeca}
                  </span>
                  <span className="text-lg font-bold text-primary-container">
                    / {horasBecaRequeridas}
                  </span>
                </div>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${progressBeca}%` }}
                />
              </div>
              <div className="absolute -bottom-4 -right-4 text-primary/5">
                <GraduationCap className="h-16 w-16" />
              </div>
            </div>
          )}

          {/* Horas Extension */}
          {requiereHorasExtension && (
            <div className="relative flex h-48 flex-col justify-between overflow-hidden rounded-xl bg-surface-container-lowest p-8">
              <div className="relative z-10">
                <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-tertiary">
                  Horas de Extension
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black leading-none tracking-tighter text-secondary">
                    {horasExtension}
                  </span>
                  <span className="text-lg font-bold text-secondary-container">
                    / {horasExtensionRequeridas}
                  </span>
                </div>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
                <div
                  className="h-full rounded-full bg-secondary"
                  style={{ width: `${progressExtension}%` }}
                />
              </div>
              <div className="absolute -bottom-4 -right-4 text-secondary/5">
                <HeartHandshake className="h-16 w-16" />
              </div>
            </div>
          )}

          {/* Proyectos Activos */}
          <div className="relative flex h-48 flex-col justify-between overflow-hidden rounded-xl bg-primary p-8 text-on-primary">
            <div className="relative z-10">
              <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-primary-container">
                Proyectos Activos
              </span>
              <span className="text-5xl font-black leading-none tracking-tighter">
                {String(proyectosActivos).padStart(2, '0')}
              </span>
            </div>
            <div className="relative z-10 flex gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
                <Calendar className="h-5 w-5 text-white" />
              </div>
            </div>
            <Zap className="absolute -bottom-4 -right-4 h-20 w-20 text-white/10" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="space-y-12 lg:col-span-8">
            {/* Recommended Projects */}
            <section>
              <div className="mb-6 flex items-end justify-between">
                <div>
                  <h2 className="font-headline text-2xl font-black tracking-tight">
                    Proyectos Disponibles
                  </h2>
                  <p className="text-sm text-on-surface-variant">
                    Proyectos publicados recientemente
                  </p>
                </div>
                <Link
                  href="/dashboard/proyectos"
                  className="text-sm font-bold text-primary hover:underline"
                >
                  Ver todos
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {projects.map((p) => (
                  <div
                    key={p.idProyecto}
                    className="group rounded-xl bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="mb-4 flex items-start justify-between">
                      <span className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-secondary-container text-on-secondary-container">
                        {tipoLabel[p.tipoProyecto] ?? p.tipoProyecto}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                        ID: {p.idProyecto}
                      </span>
                    </div>
                    <h3 className="mb-2 text-lg font-bold text-on-surface transition-colors group-hover:text-primary">
                      {p.tituloProyecto}
                    </h3>
                    <p className="mb-6 line-clamp-2 text-sm text-on-surface-variant">
                      {p.descripcionProyecto}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-medium text-on-surface-variant">
                        <Clock className="h-4 w-4" />
                        {p.modalidadProyecto}
                      </div>
                      <Link
                        href={`/dashboard/proyectos/${p.idProyecto}`}
                        className="rounded-xl bg-surface-container-high px-6 py-2 text-sm font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary"
                      >
                        Ver
                      </Link>
                    </div>
                  </div>
                ))}
                {projects.length === 0 && (
                  <p className="col-span-2 text-center text-sm text-tertiary py-8">
                    No hay proyectos disponibles aun
                  </p>
                )}
              </div>
            </section>

            {/* Applications Status */}
            <section>
              <h2 className="mb-6 font-headline text-2xl font-black tracking-tight">
                Estado de Aplicaciones
              </h2>
              <div className="overflow-hidden rounded-xl bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-surface-container-low">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                          Proyecto
                        </th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                          Fecha
                        </th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                          Estado
                        </th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                          Accion
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-container">
                      {stats?.postulacionesRecientes.map((a) => (
                        <tr key={a.idPostulacion}>
                          <td className="px-6 py-5">
                            <div className="text-sm font-bold text-on-surface">
                              {a.rolProyecto.proyecto.tituloProyecto}
                            </div>
                            <div className="text-xs text-on-surface-variant">
                              {tipoLabel[a.rolProyecto.proyecto.tipoProyecto] ?? a.rolProyecto.proyecto.tipoProyecto}
                            </div>
                          </td>
                          <td className="px-6 py-5 text-sm text-on-surface-variant">
                            {new Date(a.fechaPostulacion).toLocaleDateString('es-GT')}
                          </td>
                          <td className="px-6 py-5">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                                estadoColors[a.estadoPostulacion] ?? 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {a.estadoPostulacion}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <button className="text-primary">
                              <Eye className="h-5 w-5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(!stats || stats.postulacionesRecientes.length === 0) && (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-sm text-tertiary">
                            No tienes postulaciones aun
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column */}
          <div className="space-y-8 lg:col-span-4">
            {/* Quick info */}
            <div className="rounded-xl bg-surface-container-low p-6">
              <h3 className="font-headline text-lg font-black tracking-tight mb-4">Tu perfil</h3>
              {user?.perfil?.carrera && (
                <div className="mb-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-tertiary">Carrera</span>
                  <p className="text-sm font-medium text-on-surface">{user.perfil.carrera.nombreCarrera}</p>
                </div>
              )}
              {user?.perfil?.semestre && (
                <div className="mb-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-tertiary">Semestre</span>
                  <p className="text-sm font-medium text-on-surface">{user.perfil.semestre}</p>
                </div>
              )}
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-tertiary">Habilidades</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {user?.habilidades.map((h) => (
                    <span
                      key={h.idUsuarioHabilidad}
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                    >
                      {h.habilidad.nombreHabilidad}
                    </span>
                  ))}
                  {(!user?.habilidades || user.habilidades.length === 0) && (
                    <span className="text-xs text-tertiary">Sin habilidades registradas</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
