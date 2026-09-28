import Link from 'next/link';
import { Progress } from '@/components/ui/progress';
import { formatearHoras } from '@/lib/hours/format';
import type { MisHorasPorTipo, MisHorasView } from '@/lib/services/users';
import type { TipoProyecto } from '@/types';

type Meta = keyof MisHorasView['requisitos'];

/** Orden fijo del bloque; Experiencia no tiene meta en el perfil. */
const FILAS: Array<{ tipo: TipoProyecto; etiqueta: string; meta: Meta | null }> = [
  { tipo: 'ACADEMICO_HORAS_BECA', etiqueta: 'Horas beca', meta: 'horasBecaRequeridas' },
  { tipo: 'EXTRACURRICULAR_EXTENSION', etiqueta: 'Horas de extensión', meta: 'horasExtensionRequeridas' },
  { tipo: 'ACADEMICO_EXPERIENCIA', etiqueta: 'Experiencia', meta: null },
];

/**
 * Porcentaje de PRESENTACIÓN de la barra (R-10): el único cálculo que hace el
 * cliente. No es contabilidad: las horas acreditadas ya vienen del backend.
 */
export function porcentajeDeMeta(acreditadas: string, requeridas: number): number {
  return Math.min(100, Math.floor((Number(acreditadas) / requeridas) * 100));
}

interface MyHoursRequirementsProps {
  requisitos: MisHorasView['requisitos'];
  porTipo: MisHorasPorTipo[];
}

/**
 * HU-158 (T-232): progreso hacia las metas de horas del perfil. Solo cuentan
 * las horas ACREDITADAS de cada tipo (R-11); registradas y propuestas no
 * acercan la meta hasta que un administrador las aprueba.
 */
export function MyHoursRequirements({ requisitos, porTipo }: MyHoursRequirementsProps) {
  return (
    <section aria-labelledby="mis-horas-progreso-titulo" className="card-base flex flex-col gap-stack">
      <div className="flex flex-col gap-micro">
        <h2 id="mis-horas-progreso-titulo" className="type-section">
          Progreso de acreditación
        </h2>
        <p className="type-meta">Solo cuentan las horas acreditadas al aprobarse el cierre de cada proyecto.</p>
      </div>

      <ul className="flex flex-col gap-stack">
        {FILAS.map(({ tipo, etiqueta, meta }) => {
          const acreditadas = porTipo.find((fila) => fila.tipoProyecto === tipo)?.acreditadas ?? '0.00';
          const requeridas = meta ? requisitos[meta] : null;
          const conMeta = requeridas !== null && requeridas > 0;
          const porcentaje = conMeta ? porcentajeDeMeta(acreditadas, requeridas) : null;
          const idEtiqueta = `mis-horas-meta-${tipo}`;

          return (
            <li key={tipo} aria-labelledby={idEtiqueta} className="flex flex-col gap-tight">
              <div className="flex flex-wrap items-baseline justify-between gap-x-inline gap-y-micro">
                <p id={idEtiqueta} className="type-subtitle">
                  {etiqueta}
                </p>
                <p className="type-body">
                  <span className="font-semibold">{formatearHoras(acreditadas)}</span>
                  {conMeta && <span className="text-text-secondary"> de {requeridas} h</span>}
                </p>
              </div>

              {porcentaje !== null ? (
                <div className="flex items-center gap-inline">
                  <Progress
                    value={porcentaje}
                    aria-label={`Progreso de ${etiqueta.toLowerCase()}`}
                    aria-valuenow={porcentaje}
                    className="flex-1"
                  />
                  <span className="type-meta w-12 shrink-0 text-right tabular-nums">{porcentaje} %</span>
                  {porcentaje === 100 && <span className="pill pill-success shrink-0">Meta cumplida</span>}
                </div>
              ) : (
                <p className="type-meta">
                  Sin meta configurada
                  {meta && (
                    <>
                      {' · '}
                      <Link href="/dashboard/perfil" className="font-medium text-primary underline-offset-4 hover:underline">
                        Configúrala en tu perfil
                      </Link>
                    </>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
