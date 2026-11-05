'use client';

import Link from 'next/link';
import { Users } from 'lucide-react';
import { iniciales } from '@/components/calendar/invitados-field';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tag } from '@/components/ui/tag';
import { usePersonasParecidas } from '@/hooks/use-perfil-portafolio';

/** MEJ-152: personas que trabajaron en proyectos parecidos a los de esta persona (mismos intereses). No se muestra si no hay ninguna. */
export function PersonasParecidas({ idUsuario, propio = false }: { idUsuario: number; propio?: boolean }) {
  const { data } = usePersonasParecidas(idUsuario);
  if (!data || data.length === 0) return null;

  return (
    <section className="card-base space-y-stack" aria-labelledby={`parecidas-${idUsuario}`}>
      <div>
        <h2 id={`parecidas-${idUsuario}`} className="type-subtitle flex items-center gap-tight text-text-primary">
          <Users className="size-4 text-primary" aria-hidden="true" />
          Personas que trabajaron en proyectos parecidos
        </h2>
        <p className="type-meta mt-micro">
          {propio ? 'Parecidos a los tuyos' : 'Parecidos a los de esta persona'}, por intereses en común.
        </p>
      </div>
      <ul className="grid gap-tight sm:grid-cols-2">
        {data.map((p) => (
          <li key={p.idUsuario}>
            <Link
              href={`/dashboard/personas/${p.idUsuario}`}
              className="flex items-center gap-tight rounded-control border border-outline-variant p-tight motion-select hover:bg-surface-container"
            >
              <Avatar className="size-10 shrink-0">
                {p.fotoUrl && <AvatarImage src={p.fotoUrl} alt="" />}
                <AvatarFallback className="type-meta">{iniciales(p.nombre, p.apellido)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="type-body block truncate font-semibold text-text-primary">
                  {p.nombre} {p.apellido}
                </span>
                <span className="type-meta block truncate">{p.ejemploProyecto}</span>
              </span>
              <Tag tone="subtle" size="sm">
                {p.proyectosParecidos} {p.proyectosParecidos === 1 ? 'proyecto' : 'proyectos'}
              </Tag>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
