import type { ReactNode } from 'react';
import { CheckCheck } from 'lucide-react';

/**
 * Primitivas visuales de las bandejas administrativas por etapas
 * («Solicitudes de publicación» y «Solicitudes de cierre»): rejilla de
 * indicadores, sección por etapa y tarjeta horizontal de una solicitud.
 *
 * Son solo presentación. Qué etapas existen, qué cuenta cada indicador y qué
 * acción admite cada solicitud lo decide cada bandeja con sus propias reglas.
 */

/**
 * Rejilla de indicadores: una columna en móvil, dos en tablet y todas en
 * escritorio. Las tarjetas son las contadoras de «Mis Tareas» (`ResumenKpi`).
 */
export function RequestInboxKpis({ columns, children }: { columns: 3 | 4; children: ReactNode }) {
  return (
    <div className={`grid grid-cols-1 gap-stack ${columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
      {children}
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
        <div className="flex flex-col items-center justify-center rounded-card border border-outline-variant bg-surface-container-lowest py-12 text-center">
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
  // Solicitud detenida a la espera del responsable: el naranja va solo en un
  // borde tenue; la superficie queda neutra, como el resto de tarjetas.
  waiting: 'border-orange-200 bg-surface-container-lowest dark:border-orange-500/25',
  // Solicitud de publicación a la espera de correcciones: mismo criterio, en verde salvia.
  review: 'border-review-soft bg-surface-container-lowest dark:border-review-soft/40',
} as const;

/**
 * Tarjeta horizontal de una solicitud: icono del proyecto y contenido a la
 * izquierda, acciones a la derecha (debajo en móvil).
 */
export function RequestInboxCard({
  tone = 'default',
  icon,
  actions,
  children,
}: {
  tone?: keyof typeof CARD_TONE;
  /** Icono del tipo de proyecto, a la izquierda del título. */
  icon?: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      // En fila solo desde `lg`: con la sidebar abierta, a anchos de tablet el
      // contenido es demasiado estrecho para texto y acciones lado a lado.
      className={`flex flex-col gap-4 rounded-card border p-5 lg:flex-row lg:items-center lg:justify-between ${CARD_TONE[tone]}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0">{children}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:shrink-0">{actions}</div>
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
    'inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-2 text-xs font-bold text-on-primary outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/40',
  attention:
    'inline-flex items-center gap-1.5 rounded-control bg-amber-600 px-3 py-2 text-xs font-bold text-white outline-none transition-colors hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-primary/40',
  outline:
    'inline-flex items-center gap-1.5 rounded-control border border-outline-variant px-3 py-2 text-xs font-bold text-on-surface outline-none transition-colors hover:bg-surface-container-high focus-visible:ring-2 focus-visible:ring-primary/40',
} as const;
