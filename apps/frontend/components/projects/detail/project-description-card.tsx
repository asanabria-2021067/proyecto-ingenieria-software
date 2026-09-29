import { CheckCircle2, FileText, Target } from 'lucide-react';

interface ProjectDescriptionCardProps {
  /**
   * Descripción completa. `undefined` omite el bloque (tarjeta solo de
   * objetivos); `null` o vacía muestra «Sin descripción disponible.».
   */
  descripcion?: string | null;
  objetivos: string[];
}

/**
 * HU-154 (T-216): «Descripción / Objetivos» de la columna principal,
 * compartida por líder y participante. Los objetivos llegan ya separados
 * por parseObjetivos.
 */
export function ProjectDescriptionCard({ descripcion, objetivos }: ProjectDescriptionCardProps) {
  const conDescripcion = descripcion !== undefined;
  const TituloObjetivos = conDescripcion ? 'h3' : 'h2';

  return (
    <section aria-label={conDescripcion ? 'Descripción y objetivos' : 'Objetivos del proyecto'} className="card-base">
      {conDescripcion && (
        <>
          <h2 className="type-subtitle flex items-center gap-tight">
            <FileText className="size-4 text-text-secondary" aria-hidden="true" />
            Descripción del proyecto
          </h2>
          <p className="type-body mt-tight whitespace-pre-wrap text-text-secondary">
            {descripcion || 'Sin descripción disponible.'}
          </p>
          <hr className="my-stack border-outline-variant/60" />
        </>
      )}

      <TituloObjetivos className="type-meta mb-inline flex items-center gap-tight uppercase tracking-wide">
        <Target className="size-4" aria-hidden="true" />
        Objetivos del proyecto
      </TituloObjetivos>
      {objetivos.length === 0 ? (
        <p className="type-body rounded-control bg-surface-container-low px-stack py-inline text-text-secondary">
          No se han registrado objetivos para este proyecto.
        </p>
      ) : (
        <ul className="flex flex-col gap-tight">
          {objetivos.map((objetivo, i) => (
            <li key={i} className="flex items-start gap-tight">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="type-body text-text-secondary">{objetivo}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
