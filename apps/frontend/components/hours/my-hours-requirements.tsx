import { formatearHoras } from '@/lib/hours/format';
import type { MisHorasPorTipo } from '@/lib/services/users';
import type { TipoProyecto } from '@/types';

/** Orden fijo del bloque. */
const FILAS: Array<{ tipo: TipoProyecto; etiqueta: string }> = [
  { tipo: 'ACADEMICO_HORAS_BECA', etiqueta: 'Horas beca' },
  { tipo: 'EXTRACURRICULAR_EXTENSION', etiqueta: 'Horas de extensión' },
  { tipo: 'ACADEMICO_EXPERIENCIA', etiqueta: 'Experiencia' },
];

interface MyHoursRequirementsProps {
  porTipo: MisHorasPorTipo[];
}

/**
 * HU-158 (T-232): horas ACREDITADAS en total (histórico, todos los semestres) por tipo (R-11).
 * No se comparan con la meta: la meta es del semestre y se mide en «Horas de este semestre».
 */
export function MyHoursRequirements({ porTipo }: MyHoursRequirementsProps) {
  return (
    <section aria-labelledby="mis-horas-progreso-titulo" className="card-base flex flex-col gap-card">
      <div className="flex flex-col gap-micro">
        <h2 id="mis-horas-progreso-titulo" className="type-section">
          Acreditadas en total por tipo
        </h2>
        <p className="type-meta">
          Suma de todos tus semestres, al aprobarse el cierre de cada proyecto. Tu meta se mide por semestre en «Horas de
          este semestre».
        </p>
      </div>

      <ul className="flex flex-col gap-card">
        {FILAS.map(({ tipo, etiqueta }) => {
          const acreditadas = porTipo.find((fila) => fila.tipoProyecto === tipo)?.acreditadas ?? '0.00';
          const idEtiqueta = `mis-horas-meta-${tipo}`;

          return (
            <li
              key={tipo}
              aria-labelledby={idEtiqueta}
              className="flex flex-wrap items-baseline justify-between gap-x-inline gap-y-micro"
            >
              <p id={idEtiqueta} className="type-subtitle">
                {etiqueta}
              </p>
              <p className="type-body font-semibold">{formatearHoras(acreditadas)}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
