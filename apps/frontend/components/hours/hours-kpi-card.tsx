import type { LucideIcon } from 'lucide-react';

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
   * `en-linea`: icono de fondo grande, translúcido y difuminado, que ocupa
   * el alto de la tarjeta y asoma solo su mitad desde el borde izquierdo; el
   * texto, en tonos neutros, empieza después de esa mitad (Mis Horas).
   */
  variante?: 'caja' | 'en-linea';
}

/**
 * HU-158 (T-232): KPI de horas compartido por la vista del integrante y Mis
 * Horas. Extraído sin cambios de apariencia de `equipo/[idUsuario]`.
 */
export function HoursKpiCard({ icon: Icon, label, value, note, destacado = false, variante = 'caja' }: HoursKpiCardProps) {
  if (variante === 'en-linea') {
    return (
      <div
        role="group"
        aria-label={label}
        data-destacado={destacado || undefined}
        className="relative flex min-h-32 flex-col justify-center overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest py-5 pr-5 pl-24"
      >
        <Icon
          data-slot="kpi-icono-fondo"
          strokeWidth={1.5}
          className="pointer-events-none absolute inset-y-0 left-0 aspect-square h-full w-auto -translate-x-1/2 text-text-primary opacity-15 blur-[1px]"
          aria-hidden="true"
        />
        <p className="text-xs font-bold uppercase tracking-wide text-text-primary">{label}</p>
        <p className="mt-tight font-headline text-2xl font-extrabold text-text-primary">{value}</p>
        {note && <p className="type-meta mt-micro">{note}</p>}
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
