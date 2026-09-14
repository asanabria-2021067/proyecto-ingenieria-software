'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Briefcase,
  GraduationCap,
  Mail,
  Users,
} from 'lucide-react';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  estadoBadgeLabel,
  estadoBadgeStyle,
  getIniciales,
} from '@/components/projects/available-project-card';
import { useAccionesAmistad, usePerfilUsuario } from '@/hooks/use-social';
import { getHabilidadBadgeStyle, getSemestreBadgeStyle } from '@/lib/social/badge-colors';

function motivoAfinidad(mismaCarrera: boolean, amigosEnComun: number): string | null {
  if (amigosEnComun > 0) {
    return `${amigosEnComun} ${amigosEnComun === 1 ? 'amigo' : 'amigos'} en común`;
  }
  if (mismaCarrera) return 'De tu carrera';
  return null;
}

function PerfilSkeleton() {
  return (
    <SkeletonTheme baseColor="var(--color-surface-container)" highlightColor="var(--color-surface-container-high)">
      <div className="mx-auto max-w-content px-stack py-section lg:px-section lg:py-page">
        <Skeleton width={140} height={20} className="mb-section" />
        <div className="card-base flex flex-col items-center gap-tight py-section">
          <Skeleton circle width={80} height={80} />
          <Skeleton width={200} height={24} />
          <Skeleton width={140} height={16} />
        </div>
      </div>
    </SkeletonTheme>
  );
}

export default function PerfilPersonaPage() {
  const params = useParams<{ id: string }>();
  const idUsuario = Number(params.id);
  const { perfil, isLoading, isError } = usePerfilUsuario(idUsuario);
  const { amistad, seguimiento } = useAccionesAmistad(
    perfil ?? { idUsuario, esAmigo: false, solicitudPendiente: null, loSigo: false },
  );

  if (isLoading) {
    return <PerfilSkeleton />;
  }

  if (isError || !perfil) {
    return (
      <div className="mx-auto max-w-content px-stack py-section lg:px-section lg:py-page">
        <Link
          href="/dashboard/personas"
          className="type-body mb-section inline-flex items-center gap-tight font-medium text-primary hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a Personas
        </Link>
        <Empty tone="danger" aria-live="polite">
          <EmptyMedia variant="compact">
            <Users aria-hidden="true" className="size-6" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle className="type-subtitle">No pudimos cargar este perfil</EmptyTitle>
            <EmptyDescription>Puede que el usuario ya no exista o que no tengas acceso.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const nombreCompleto = `${perfil.nombre} ${perfil.apellido}`;
  const motivo = motivoAfinidad(perfil.mismaCarrera, perfil.amigosEnComun.length);

  return (
    <div className="mx-auto max-w-content px-stack py-section lg:px-section lg:py-page">
      <Link
        href="/dashboard/personas"
        className="type-body mb-section inline-flex items-center gap-tight font-medium text-primary hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a Personas
      </Link>

      <div className="layout-grid">
        <div className="layout-main space-y-section">
          {/* Encabezado */}
          <section className="card-base flex flex-col items-center gap-tight py-section text-center">
            <Avatar className="size-20">
              {perfil.fotoUrl && <AvatarImage src={perfil.fotoUrl} alt="" />}
              <AvatarFallback className="type-display text-text-secondary">
                {getIniciales(perfil.nombre, perfil.apellido)}
              </AvatarFallback>
            </Avatar>
            <h1 className="type-display text-text-primary">{nombreCompleto}</h1>
            {perfil.carrera && <p className="type-body text-text-secondary">{perfil.carrera}</p>}

            <div className="flex flex-wrap items-center justify-center gap-tight">
              {perfil.semestre != null && (
                <span className={`pill font-semibold ${getSemestreBadgeStyle(perfil.semestre)}`}>
                  Semestre {perfil.semestre}
                </span>
              )}
              {motivo && <span className="pill pill-accent">{motivo}</span>}
            </div>

            <div className="mt-stack grid w-full max-w-sm grid-cols-2 gap-tight">
              <Button variant={amistad.variant} disabled={amistad.disabled} onClick={amistad.onClick}>
                {amistad.label}
              </Button>
              <Button variant="outline" disabled={seguimiento.disabled} onClick={seguimiento.onClick}>
                {seguimiento.label}
              </Button>
            </div>
          </section>

          {(perfil.habilidades.length > 0 || perfil.intereses.length > 0) && (
            <section className="card-base space-y-stack">
              {perfil.habilidades.length > 0 && (
                <div>
                  <h2 className="type-meta uppercase tracking-wide">Habilidades</h2>
                  <div className="mt-tight flex flex-wrap gap-tight">
                    {perfil.habilidades.map((h) => (
                      <span key={h} className={`pill font-semibold ${getHabilidadBadgeStyle(h)}`}>
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {perfil.intereses.length > 0 && (
                <div>
                  <h2 className="type-meta uppercase tracking-wide">Intereses</h2>
                  <div className="mt-tight flex flex-wrap gap-tight">
                    {perfil.intereses.map((i) => (
                      <span key={i} className={`pill font-semibold ${getHabilidadBadgeStyle(i)}`}>
                        {i}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Proyectos activos */}
          <section className="card-base">
            <div className="mb-stack flex items-center justify-between gap-tight">
              <h2 className="type-subtitle flex items-center gap-tight text-text-primary">
                <Briefcase className="size-4 text-text-secondary" aria-hidden="true" />
                Proyectos activos
              </h2>
              <span className="type-meta">
                {perfil.proyectosActivos.length}{' '}
                {perfil.proyectosActivos.length === 1 ? 'colaboración' : 'colaboraciones'}
              </span>
            </div>
            {perfil.proyectosActivos.length === 0 ? (
              <p className="type-body text-text-secondary">Sin proyectos activos por ahora.</p>
            ) : (
              <ul className="flex flex-col gap-tight">
                {perfil.proyectosActivos.map((p) => (
                  <li key={p.idProyecto}>
                    <Link
                      href={`/dashboard/proyectos/${p.idProyecto}`}
                      className="flex items-center justify-between gap-tight rounded-control border border-outline-variant p-tight transition-colors hover:bg-surface-container"
                    >
                      <div className="min-w-0">
                        <p className="type-body truncate font-medium text-text-primary">{p.tituloProyecto}</p>
                        <p className="type-meta">{p.rolNombre}</p>
                      </div>
                      <span className={`pill shrink-0 ${estadoBadgeStyle(p.estadoProyecto)}`}>
                        {estadoBadgeLabel(p.estadoProyecto)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right Column */}
        <aside className="layout-aside space-y-gap">
          <div className="card-base">
            <h2 className="type-subtitle mb-stack flex items-center gap-tight text-text-primary">
              <Users className="size-4 text-text-secondary" aria-hidden="true" />
              Amigos en común
              {perfil.amigosEnComun.length > 0 && (
                <span className="pill pill-neutral">{perfil.amigosEnComun.length}</span>
              )}
            </h2>
            {perfil.amigosEnComun.length === 0 ? (
              <p className="type-meta">Todavía no tienen amigos en común.</p>
            ) : (
              <ul className="flex flex-col gap-tight">
                {perfil.amigosEnComun.map((amigo) => (
                  <li key={amigo.idUsuario}>
                    <Link
                      href={`/dashboard/personas/${amigo.idUsuario}`}
                      className="flex items-center gap-tight rounded-control p-tight transition-colors hover:bg-surface-container"
                    >
                      <Avatar className="size-9">
                        {amigo.fotoUrl && <AvatarImage src={amigo.fotoUrl} alt="" />}
                        <AvatarFallback className="type-meta text-text-secondary">
                          {getIniciales(amigo.nombre, amigo.apellido)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="type-body text-text-primary">
                        {amigo.nombre} {amigo.apellido}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card-base space-y-tight">
            <h2 className="type-meta uppercase tracking-wide">Contacto</h2>
            <p className="type-body flex items-center gap-tight text-text-primary">
              <Mail className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
              <span className="truncate">{perfil.correo}</span>
            </p>
            {perfil.carrera && (
              <p className="type-body flex items-center gap-tight text-text-primary">
                <GraduationCap className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
                <span className="truncate">{perfil.carrera}</span>
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
