'use client';

import { Trophy } from 'lucide-react';
import { InsigniaCircular } from '@/components/insignias/insignia-circular';
import type { InsigniaDto } from '@/lib/types/insignias';

interface InsigniasVitrinaProps {
  insignias: InsigniaDto[];
  /** Perfil público: solo las obtenidas y sin progreso hacia el siguiente nivel. */
  publica?: boolean;
  isLoading?: boolean;
  isError?: boolean;
}

function Grilla({ items, publica }: { items: InsigniaDto[]; publica: boolean }) {
  return (
    <ul className="grid grid-cols-2 gap-tight sm:grid-cols-3 md:grid-cols-4">
      {items.map((i) => (
        <li key={i.clave}>
          <InsigniaCircular insignia={i} publica={publica} />
        </li>
      ))}
    </ul>
  );
}

export function InsigniasVitrina({ insignias, publica = false, isLoading = false, isError = false }: InsigniasVitrinaProps) {
  const obtenidas = insignias.filter((i) => i.nivel !== null);
  const bloqueadas = insignias.filter((i) => i.nivel === null);

  return (
    <section aria-labelledby="insignias-titulo" className="card-base space-y-stack" aria-busy={isLoading}>
      <h2 id="insignias-titulo" className="type-section flex items-center gap-tight text-text-primary">
        <Trophy className="size-5 text-primary" aria-hidden="true" />
        Insignias
      </h2>

      {isLoading ? (
        <p className="type-body text-text-secondary">Cargando insignias...</p>
      ) : isError ? (
        <p className="type-body text-text-secondary" role="alert">
          No se pudieron cargar las insignias.
        </p>
      ) : (
        <>
          {obtenidas.length > 0 ? (
            <Grilla items={obtenidas} publica={publica} />
          ) : (
            <p className="type-body text-text-secondary">
              {publica ? 'Todavía no tiene insignias.' : 'Todavía no tienes insignias. Completa tareas y proyectos para obtenerlas.'}
            </p>
          )}

          {!publica && bloqueadas.length > 0 && (
            <div className="space-y-tight">
              <h3 className="type-meta uppercase tracking-wide">Bloqueadas</h3>
              <Grilla items={bloqueadas} publica={false} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
