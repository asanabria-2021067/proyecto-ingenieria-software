import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface HoursKpiCardProps {
  icon: LucideIcon;
  /** También es el nombre accesible del grupo. */
  label: string;
  /** Valor ya formateado (p. ej. «12.5 h»): la tarjeta no calcula. */
  value: string;
  /** Aclaración bajo el valor, p. ej. horas legacy mostradas aparte. */
  note?: string;
  /** Resalta la cifra principal (horas acreditadas). */
  destacado?: boolean;
  /**
   * `caja` (por defecto): icono en una caja de color a la izquierda.
   * `en-linea`: icono neutro al par de la etiqueta, sin fondo, y todo el
   * texto en tonos neutros (Mis Horas).
   */
  variante?: 'caja' | 'en-linea';
  /** Solo `en-linea`: mientras carga, un esqueleto ocupa el lugar de la cifra. */
  isLoading?: boolean;
  /** Solo `en-linea`: `atencion` pinta en naranja la cifra (no la tarjeta). */
  tono?: 'neutro' | 'atencion';
}

/**
 * HU-158 (T-232): KPI compartido por la vista del integrante y Mis Horas.
 * Extraído sin cambios de apariencia de `equipo/[idUsuario]`. La variante
 * `en-linea` es también la de las métricas de Miembros, Postulaciones
 * pendientes y Solicitudes de salida.
 */
export function HoursKpiCard({
  icon: Icon,
  label,
  value,
  note,
  destacado = false,
  variante = 'caja',
  isLoading = false,
  tono = 'neutro',
}: HoursKpiCardProps) {
  if (variante === 'en-linea') {
    return (
      <div
        role="group"
        aria-label={label}
        data-destacado={destacado || undefined}
        className="card-base"
      >
        <p className="flex items-center gap-tight text-xs font-semibold uppercase tracking-wide text-text-primary">
          <Icon className="size-5 shrink-0 text-text-primary" aria-hidden="true" />
          {label}
        </p>
        {/* Cifra y nota alineadas con el texto de la etiqueta, no con el
            icono: pl-7 = icono (size-5) + gap-tight. */}
        <div className="pl-7">
          {isLoading ? (
            <Skeleton data-slot="kpi-cargando" className="mt-tight h-9 w-16" />
          ) : (
            <p
              className={`mt-tight font-headline text-3xl font-bold ${
                tono === 'atencion' ? 'text-attention-strong' : 'text-text-primary'
              }`}
            >
              {value}
            </p>
          )}
          {note && <p className="type-meta mt-micro">{note}</p>}
        </div>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={label}
      data-destacado={destacado || undefined}
      className="flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5"
    >
      <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${destacado ? 'bg-primary/15' : 'bg-primary/10'}`}>
        <Icon className="size-5 text-primary" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-tertiary">{label}</p>
        <p className="font-headline text-2xl font-extrabold text-on-surface">{value}</p>
        {note && <p className="type-meta mt-micro">{note}</p>}
      </div>
    </div>
  );
}
