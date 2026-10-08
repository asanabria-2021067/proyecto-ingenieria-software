import type { ReactNode } from 'react';
import { CheckCheck, type LucideIcon } from 'lucide-react';

/**
 * Primitivas visuales de las bandejas administrativas por etapas
 * («Solicitudes de publicación» y «Solicitudes de cierre»): indicador
 * superior, sección por etapa y tarjeta horizontal de una solicitud.
 *
 * Son solo presentación. Qué etapas existen, qué cuenta cada indicador y qué
 * acción admite cada solicitud lo decide cada bandeja con sus propias reglas.
 */

const KPI_TONE = {
  primary: 'bg-primary/10 text-primary',
  amber: 'bg-amber-500/10 text-amber-600',
  orange: 'bg-orange-500/10 text-orange-600',
  neutral: 'bg-surface-container-high text-on-surface-variant',
} as const;

/** Rejilla de indicadores: una columna en móvil, dos en tablet y todas en escritorio. */
export function RequestInboxKpis({ columns, children }: { columns: 3 | 4; children: ReactNode }) {
  return (
    <div className={`grid grid-cols-1 gap-4 ${columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
      {children}
    </div>
  );
}

export function RequestInboxKpi({
  icon: Icon,
  tone,
  label,
  value,
  description,
}: {
  icon: LucideIcon;
  tone: keyof typeof KPI_TONE;
  label: string;
  value: number;
  description: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-4 rounded-2xl border border-outline-variant bg-surface-container-low p-5"
    >
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${KPI_TONE[tone]}`}>
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-tertiary">{label}</p>
        <p className="text-3xl font-black tabular-nums tracking-tighter text-on-surface">{value}</p>
        <p className="text-xs text-tertiary">{description}</p>
      </div>
    </div>
  );
}

/** Sección de una etapa: título y, sin solicitudes, un vacío compacto en vez de la lista. */
export function RequestInboxSection({
  title,
  empty,
  isEmpty,
  children,
}: {
  title: string;
  empty: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-4 font-headline text-lg font-black tracking-tight text-on-surface">{title}</h2>
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-outline-variant bg-surface-container-lowest py-12 text-center">
          <CheckCheck className="mb-3 h-10 w-10 text-primary opacity-40" aria-hidden="true" />
          <p className="text-sm font-medium text-tertiary">{empty}</p>
        </div>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </section>
  );
}

const CARD_TONE = {
  default: 'border-outline-variant bg-surface-container-lowest',
  // Solicitud detenida a la espera del responsable.
  waiting: 'border-orange-200 bg-orange-50/50 dark:border-orange-500/20 dark:bg-orange-500/5',
} as const;

/** Tarjeta horizontal de una solicitud: contenido a la izquierda y acciones a la derecha (debajo en móvil). */
export function RequestInboxCard({
  tone = 'default',
  actions,
  children,
}: {
  tone?: keyof typeof CARD_TONE;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${CARD_TONE[tone]}`}
    >
      <div className="min-w-0">{children}</div>
      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>
    </div>
  );
}

/** Título de la solicitud dentro de su tarjeta. */
export function RequestInboxTitle({ children }: { children: ReactNode }) {
  return <p className="break-words font-headline text-base font-black text-on-surface">{children}</p>;
}

/** Línea secundaria de la tarjeta: responsable, envío, fechas. */
export function RequestInboxMeta({ children }: { children: ReactNode }) {
  return <p className="mt-0.5 text-xs text-tertiary">{children}</p>;
}

/** Clases de las acciones de una tarjeta, para botones y enlaces por igual. */
export const REQUEST_INBOX_ACTION = {
  primary:
    'inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-on-primary outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/40',
  attention:
    'inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white outline-none transition-colors hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-primary/40',
  outline:
    'inline-flex items-center gap-1.5 rounded-xl border border-outline-variant px-3 py-2 text-xs font-bold text-on-surface outline-none transition-colors hover:bg-surface-container-high focus-visible:ring-2 focus-visible:ring-primary/40',
} as const;
