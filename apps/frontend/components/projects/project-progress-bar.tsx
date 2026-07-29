import type { AvanceProyectoDTO } from '@/lib/dto/project.dto';

/**
 * Semáforo de color del design system: rojo (<34%), ámbar (34-66%), verde (>=67%).
 * Mismos umbrales que el medidor de fuerza de contraseña en /registro.
 */
function getSemaforo(porcentaje: number) {
  if (porcentaje < 34) {
    return { bar: 'bg-red-500 dark:bg-red-400', text: 'text-red-600 dark:text-red-400' };
  }
  if (porcentaje < 67) {
    return { bar: 'bg-amber-500 dark:bg-amber-400', text: 'text-amber-600 dark:text-amber-400' };
  }
  return { bar: 'bg-green-600 dark:bg-green-400', text: 'text-green-700 dark:text-green-400' };
}

interface AvanceRowProps {
  label: string;
  porcentaje: number;
  totalLabel?: string;
  compact: boolean;
  breakdown?: { label: string; value: number; dotClassName: string }[];
}

function AvanceRow({ label, porcentaje, totalLabel, compact, breakdown }: AvanceRowProps) {
  const semaforo = getSemaforo(porcentaje);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className={`text-xs font-bold ${semaforo.text}`}>
          {label}: {porcentaje}%
        </span>
        {!compact && totalLabel && (
          <span className="text-[11px] text-tertiary">{totalLabel}</span>
        )}
      </div>

      <div
        role="progressbar"
        aria-valuenow={porcentaje}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Porcentaje de avance por ${label.toLowerCase()}`}
        className="h-1.5 w-full rounded-full bg-surface-container-high overflow-hidden"
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${semaforo.bar}`}
          style={{ width: `${porcentaje}%` }}
        />
      </div>

      {!compact && breakdown && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-tertiary">
          {breakdown.map((b) => (
            <span key={b.label} className="flex items-center gap-1">
              <span className={`size-1.5 rounded-full ${b.dotClassName}`} />
              {b.label}: <span className="font-semibold text-on-surface">{b.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface ProjectProgressBarProps {
  avance: AvanceProyectoDTO;
  /** Vista compacta para tarjetas de listado: solo porcentaje + barra, sin desglose. */
  compact?: boolean;
  className?: string;
}

const DOT_PENDIENTE = 'bg-surface-container-highest border border-outline-variant';
const DOT_EN_PROGRESO = 'bg-amber-500 dark:bg-amber-400';
const DOT_HECHO = 'bg-green-600 dark:bg-green-400';

export function ProjectProgressBar({ avance, compact = false, className = '' }: ProjectProgressBarProps) {
  const { tareas, hitos } = avance;

  return (
    <div className={`space-y-2.5 ${className}`}>
      <AvanceRow
        label="Tareas"
        porcentaje={tareas.porcentaje}
        totalLabel={`${tareas.hecho}/${tareas.total} ${tareas.total === 1 ? 'tarea' : 'tareas'}`}
        compact={compact}
        breakdown={[
          { label: 'Por hacer', value: tareas.porHacer, dotClassName: DOT_PENDIENTE },
          { label: 'En progreso', value: tareas.enProgreso, dotClassName: DOT_EN_PROGRESO },
          { label: 'Hecho', value: tareas.hecho, dotClassName: DOT_HECHO },
        ]}
      />
      <AvanceRow
        label="Hitos"
        porcentaje={hitos.porcentaje}
        totalLabel={`${hitos.completado}/${hitos.total} ${hitos.total === 1 ? 'hito' : 'hitos'}`}
        compact={compact}
        breakdown={[
          { label: 'Pendiente', value: hitos.pendiente, dotClassName: DOT_PENDIENTE },
          { label: 'En progreso', value: hitos.enProgreso, dotClassName: DOT_EN_PROGRESO },
          { label: 'Completado', value: hitos.completado, dotClassName: DOT_HECHO },
        ]}
      />
    </div>
  );
}
