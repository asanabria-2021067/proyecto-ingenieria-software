'use client';

import Link from 'next/link';
import { Lightbulb } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { getIniciales } from '@/components/projects/available-project-card';
import { useSugerenciasInvitado } from '@/hooks/use-descubrimiento';

/**
 * MEJ-62: al definir un rol, sugiere a quién invitar según las habilidades pedidas y la carrera.
 * Cada sugerencia lleva a su perfil, donde está «Invitar a un rol» (el rol debe existir ya en el
 * proyecto). Sin habilidades ni carrera elegidas no se muestra nada.
 */
export function SugerenciasInvitado({
  habilidades,
  idCarrera,
  idProyecto,
}: {
  habilidades: number[];
  idCarrera: number | null;
  idProyecto?: number;
}) {
  const { data = [], isLoading, isError } = useSugerenciasInvitado({ habilidades, idCarrera, idProyecto });
  if (habilidades.length === 0 && !idCarrera) return null;

  return (
    <div className="rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-3" aria-live="polite">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-tertiary">
        <Lightbulb aria-hidden="true" className="size-3.5" />
        Sugerencias para invitar
      </p>
      {isLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : isError ? (
        <p className="text-xs text-on-surface-variant">No se pudieron cargar las sugerencias.</p>
      ) : data.length === 0 ? (
        <p className="text-xs text-on-surface-variant">Aún no hay estudiantes que coincidan con estas habilidades.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {data.map((s) => (
            <li key={s.idUsuario} className="flex items-center gap-2">
              <Avatar className="size-8 shrink-0">
                {s.fotoUrl && <AvatarImage src={s.fotoUrl} alt="" />}
                <AvatarFallback className="text-[10px] font-bold">{getIniciales(s.nombre, s.apellido)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <Link href={`/dashboard/personas/${s.idUsuario}`} target="_blank" rel="noreferrer" className="block truncate text-sm font-semibold text-primary hover:underline">
                  {s.nombre} {s.apellido}
                </Link>
                <p className="truncate text-xs text-on-surface-variant">{s.carrera ?? 'Sin carrera'}</p>
              </div>
              <Tag tone={s.porcentaje >= 50 ? 'lime' : 'neutral'} size="sm" title={s.habilidadesEnComun.join(', ') || undefined}>
                {s.porcentaje}%
              </Tag>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
