'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Code2,
  Download,
  ExternalLink,
  GraduationCap,
  HeartHandshake,
  IdCard,
  Info,
  Link2,
  Sparkles,
  UserRound,
} from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCurrentUser } from '@/hooks/use-current-user';
import { getDashboardStats, type DashboardStats } from '@/lib/services/users';

function initials(nombre: string, apellido: string) {
  return `${nombre?.[0] ?? ''}${apellido?.[0] ?? ''}`.toUpperCase() || 'U';
}

function progreso(actual: number, requerido: number | null) {
  if (!requerido || requerido <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((actual / requerido) * 100)));
}

function nivelLabel(nivel: string) {
  if (nivel === 'AVANZADO') return 'Avanzado';
  if (nivel === 'INTERMEDIO') return 'Intermedio';
  return 'Basico';
}

function experienciaLabel(tipo: string) {
  if (tipo === 'PROYECTO_UNIVERSITARIO') return 'Proyecto universitario';
  if (tipo === 'INVESTIGACION') return 'Investigacion';
  if (tipo === 'VOLUNTARIADO') return 'Voluntariado';
  if (tipo === 'PASANTIA') return 'Pasantia';
  return 'Otro';
}

export default function PerfilPage() {
  const { data: user, isLoading } = useCurrentUser();
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    getDashboardStats().then(setStats).catch(() => {});
  }, []);

  const fullName = useMemo(() => {
    if (!user) return '';
    return `${user.nombre} ${user.apellido}`.trim();
  }, [user]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl px-8 py-8">
        <section className="mb-10 rounded-2xl bg-surface-container-low p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end">
            <div className="relative">
              {user?.fotoUrl ? (
                // external URL, keep native img for direct rendering
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.fotoUrl}
                  alt={fullName}
                  className="h-32 w-32 rounded-3xl object-cover border-4 border-surface-container-lowest shadow-sm"
                />
              ) : (
                <div className="h-32 w-32 rounded-3xl bg-primary-container text-on-primary-container flex items-center justify-center text-4xl font-black border-4 border-surface-container-lowest shadow-sm">
                  {user ? initials(user.nombre, user.apellido) : 'U'}
                </div>
              )}
            </div>

            <div className="flex-1">
              <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-on-surface">
                {fullName || 'Perfil de estudiante'}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-on-surface-variant">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-primary" />
                  <span>{user?.perfil?.carrera?.nombreCarrera || 'Carrera no registrada'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <IdCard className="h-4 w-4 text-primary" />
                  <span>Carne: {user?.perfil?.carne || 'No registrado'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <span>
                    {user?.perfil?.semestre
                      ? `${user.perfil.semestre}° semestre`
                      : 'Semestre no registrado'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 lg:col-span-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <article className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-outline">
                    Horas beca
                  </p>
                  <GraduationCap className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-3 flex items-end gap-3">
                  <span className="text-5xl font-black tracking-tighter text-primary">
                    {stats?.horasBeca ?? 0}
                  </span>
                  <span className="mb-1 text-outline">
                    / {stats?.horasBecaRequeridas ?? 'N/A'} hrs
                  </span>
                </div>
                <div className="mt-4 h-3 rounded-full bg-surface-container-high">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${progreso(stats?.horasBeca ?? 0, stats?.horasBecaRequeridas ?? null)}%`,
                    }}
                  />
                </div>
              </article>

              <article className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-outline">
                    Horas extension
                  </p>
                  <HeartHandshake className="h-5 w-5 text-secondary" />
                </div>
                <div className="mt-3 flex items-end gap-3">
                  <span className="text-5xl font-black tracking-tighter text-secondary">
                    {stats?.horasExtension ?? 0}
                  </span>
                  <span className="mb-1 text-outline">
                    / {stats?.horasExtensionRequeridas ?? 'N/A'} hrs
                  </span>
                </div>
                <div className="mt-4 h-3 rounded-full bg-surface-container-high">
                  <div
                    className="h-full rounded-full bg-secondary"
                    style={{
                      width: `${progreso(
                        stats?.horasExtension ?? 0,
                        stats?.horasExtensionRequeridas ?? null,
                      )}%`,
                    }}
                  />
                </div>
              </article>
            </div>

            <section className="rounded-2xl bg-surface-container-lowest p-8 shadow-sm">
              <h2 className="text-2xl font-black tracking-tight text-on-surface">
                Perfil academico
              </h2>
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-outline mb-3">
                    Biografia
                  </p>
                  <p className="w-[45ch] max-w-full whitespace-normal break-words text-sm leading-relaxed text-on-surface-variant">
                    {user?.perfil?.biografia || 'No has agregado biografia.'}
                  </p>

                  <div className="mt-6 flex flex-wrap gap-3">
                    {user?.perfil?.enlacePortafolio && (
                      <a
                        href={user.perfil.enlacePortafolio}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-surface-container px-3 py-2 text-xs font-bold text-on-surface hover:bg-primary hover:text-on-primary transition-colors"
                      >
                        <Link2 className="h-4 w-4" />
                        Portafolio
                      </a>
                    )}
                    {user?.perfil?.githubUrl && (
                      <a
                        href={user.perfil.githubUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-surface-container px-3 py-2 text-xs font-bold text-on-surface hover:bg-primary hover:text-on-primary transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                        GitHub
                      </a>
                    )}
                    {user?.perfil?.linkedinUrl && (
                      <a
                        href={user.perfil.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-surface-container px-3 py-2 text-xs font-bold text-on-surface hover:bg-primary hover:text-on-primary transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                        LinkedIn
                      </a>
                    )}
                    {user?.perfil?.urlCv && (
                      <a
                        href={user.perfil.urlCv}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-surface-container px-3 py-2 text-xs font-bold text-on-surface hover:bg-primary hover:text-on-primary transition-colors"
                      >
                        <Download className="h-4 w-4" />
                        CV
                      </a>
                    )}
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-outline mb-1">
                      Correo institucional
                    </p>
                    <p className="text-sm font-bold text-primary break-all">{user?.correo}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-outline mb-1">
                      Disponibilidad
                    </p>
                    <p className="text-sm font-medium text-on-surface">
                      {user?.perfil?.disponibilidadHorasSemana
                        ? `${user.perfil.disponibilidadHorasSemana} horas/semana`
                        : 'No registrada'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-outline mb-1">
                      Estado
                    </p>
                    <p className="text-sm font-medium text-on-surface">
                      {user?.estado || 'Sin estado'}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-surface-container-low p-8">
              <h2 className="text-2xl font-black tracking-tight">Habilidades validadas</h2>
              {user?.habilidades && user.habilidades.length > 0 ? (
                <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                  {user.habilidades.map((item) => (
                    <article
                      key={item.idUsuarioHabilidad}
                      className="rounded-xl bg-surface-container-lowest p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase text-outline">
                          {nivelLabel(item.nivelHabilidad)}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold leading-snug">
                        {item.habilidad.nombreHabilidad}
                      </h3>
                      <p className="mt-1 text-[11px] text-outline">
                        {item.habilidad.categoriaHabilidad || 'General'}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-tertiary">No tienes habilidades registradas.</p>
              )}
            </section>
          </div>

          <div className="col-span-12 lg:col-span-4 space-y-8">
            <section className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm">
              <h2 className="text-xl font-black flex items-center gap-2">
                <UserRound className="h-5 w-5 text-primary" />
                Intereses y cualidades
              </h2>
              <div className="mt-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-outline mb-2">
                  Intereses
                </p>
                <div className="flex flex-wrap gap-2">
                  {user?.intereses?.length ? (
                    user.intereses.map((item) => (
                      <span
                        key={item.idUsuarioInteres}
                        className="rounded-full bg-secondary-container px-3 py-1 text-xs font-bold text-on-secondary-container"
                      >
                        {item.interes.nombreInteres}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-tertiary">Sin intereses registrados</span>
                  )}
                </div>
              </div>
              <div className="mt-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-outline mb-2">
                  Cualidades
                </p>
                <div className="flex flex-wrap gap-2">
                  {user?.cualidades?.length ? (
                    user.cualidades.map((item) => (
                      <span
                        key={item.idUsuarioCualidad}
                        className="rounded-full bg-surface-container-high px-3 py-1 text-xs font-bold text-on-surface"
                      >
                        {item.cualidad.nombreCualidad}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-tertiary">Sin cualidades registradas</span>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-inverse-surface p-6 text-inverse-on-surface shadow-lg">
              <h2 className="text-xl font-black flex items-center gap-2">
                <Info className="h-5 w-5 text-primary-fixed" />
                Experiencias previas
              </h2>
              {user?.experiencias?.length ? (
                <div className="mt-5 space-y-4">
                  {user.experiencias.map((item) => (
                    <article
                      key={item.idExperiencia}
                      className="rounded-xl bg-white/10 px-3 py-3 backdrop-blur-sm"
                    >
                      <h3 className="text-sm font-bold">{item.tituloProyectoExperiencia}</h3>
                      <p className="text-xs text-inverse-on-surface/80 mt-1">
                        {experienciaLabel(item.tipoExperiencia)}
                        {item.rolDesempenado ? ` • ${item.rolDesempenado}` : ''}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-inverse-on-surface/80">
                  No tienes experiencias registradas.
                </p>
              )}
            </section>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
