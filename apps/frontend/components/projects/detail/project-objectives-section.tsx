import { CheckCircle2 } from 'lucide-react';

const CARD = 'rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm';

interface ProjectObjectivesSectionProps {
  objetivos: string[];
}

export function ProjectObjectivesSection({ objetivos }: ProjectObjectivesSectionProps) {
  return (
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
  );
}
