import { BadgeCheck, Briefcase, Code2, GraduationCap } from 'lucide-react';
import { PageTitle } from '@/components/ui/page-title';
import { Tag } from '@/components/ui/tag';
import { getHabilidadBadgeStyle } from '@/lib/social/badge-colors';
import type { PortafolioPublico } from '@/lib/services/perfil-portafolio';

const NIVEL: Record<string, string> = { BASICO: 'Básico', INTERMEDIO: 'Intermedio', AVANZADO: 'Avanzado' };

/** MEJ-146: lo único que ve quien abre el enlace sin sesión. Solo pinta la lista blanca que entrega el backend. */
export function PortafolioPublicoVista({ portafolio }: { portafolio: PortafolioPublico }) {
  const { nombre, carrera, habilidades, proyectos } = portafolio;
  return (
    <main className="mx-auto max-w-content space-y-section px-stack py-section lg:px-section lg:py-page">
      <section className="card-base">
        <PageTitle className="type-display text-text-primary">{nombre}</PageTitle>
        {carrera && (
          <p className="type-body mt-tight flex items-center gap-tight text-text-secondary">
            <GraduationCap className="size-4 shrink-0" aria-hidden="true" />
            {carrera}
          </p>
        )}
      </section>

      <section className="card-base space-y-stack" aria-labelledby="portafolio-habilidades">
        <h2 id="portafolio-habilidades" className="type-subtitle flex items-center gap-tight text-text-primary">
          <Code2 className="size-4 text-primary" aria-hidden="true" />
          Habilidades
        </h2>
        {habilidades.length === 0 ? (
          <p className="type-body text-text-secondary">Sin habilidades registradas.</p>
        ) : (
          <ul className="flex flex-wrap gap-tight">
            {habilidades.map((h) => (
              <li key={h.nombre} className="flex items-center gap-tight">
                <span className={`pill font-semibold ${getHabilidadBadgeStyle(h.nombre)}`}>{h.nombre}</span>
                <Tag tone="subtle" size="sm">{NIVEL[h.nivel] ?? h.nivel}</Tag>
                {h.confirmaciones > 0 && (
                  <span className="type-meta flex items-center gap-micro">
                    <BadgeCheck className="size-3.5 text-primary" aria-hidden="true" />
                    {h.confirmaciones} {h.confirmaciones === 1 ? 'confirmación' : 'confirmaciones'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-base space-y-stack" aria-labelledby="portafolio-proyectos">
        <h2 id="portafolio-proyectos" className="type-subtitle flex items-center gap-tight text-text-primary">
          <Briefcase className="size-4 text-primary" aria-hidden="true" />
          Proyectos cerrados
        </h2>
        {proyectos.length === 0 ? (
          <p className="type-body text-text-secondary">Todavía no tiene proyectos cerrados.</p>
        ) : (
          <ul className="flex flex-col gap-tight">
            {proyectos.map((p, i) => (
              <li key={`${p.titulo}-${i}`} className="rounded-control border border-outline-variant p-tight">
                <p className="type-body break-words font-medium text-text-primary">{p.titulo}</p>
                <p className="type-meta">{p.rol}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
