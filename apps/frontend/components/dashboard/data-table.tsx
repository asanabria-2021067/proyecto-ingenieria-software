import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Sistema visual de las tablas del dashboard. Mis Tareas define el aspecto:
 * tarjeta sin relleno, fila de encabezado con fondo gris azulado tenue,
 * rótulos pequeños en semibold SIN mayúsculas forzadas, separadores discretos
 * y un realce suave al pasar por la fila.
 *
 * Son clases, no un componente de tabla: Mis Tareas pinta una lista en rejilla
 * (`ul`/`li`) y las bandejas administrativas una `<table>`. Lo que comparten es
 * el aspecto; columnas, relleno, densidad y comportamiento son de cada vista.
 */

/** Tarjeta que envuelve la tabla o lista. */
export const DATA_TABLE_CARD = 'card-base overflow-hidden p-0';
/** Fila de encabezado: superficie tenue y borde inferior. */
export const DATA_TABLE_HEAD_ROW = 'border-b border-outline-variant/50 bg-surface-container-low';
/** Rótulo de columna: pequeño, semibold, en su caja normal. */
export const DATA_TABLE_HEAD_TEXT = 'text-xs font-semibold text-text-secondary';
/** Contenedor de filas cuando son hermanas directas (`ul`, `div`). */
export const DATA_TABLE_ROWS = 'divide-y divide-outline-variant/50';
/** Color del separador para filas de `<table>`, que traen su propio `border-b`. */
export const DATA_TABLE_ROW_BORDER = 'border-outline-variant/50';
/** Realce de una fila al pasar el cursor. */
export const DATA_TABLE_ROW_HOVER = 'transition-colors hover:bg-surface-container-low';

/**
 * Paginador de las tablas: «Anterior · Página X de N · Siguiente» en su propia
 * tarjeta. Es controlado: la vista decide de dónde sale la página y cómo cambia.
 */
export function DataTablePager({
  pagina,
  totalPaginas,
  onPagina,
  label,
  className,
}: {
  pagina: number;
  totalPaginas: number;
  onPagina: (pagina: number) => void;
  /** Nombre accesible de la navegación, p. ej. «Paginación de tareas». */
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn('card-base flex items-center justify-between gap-inline px-card py-inline', className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pagina <= 1}
        onClick={() => onPagina(Math.max(1, pagina - 1))}
        aria-label="Página anterior"
        className="rounded-control"
      >
        Anterior
      </Button>
      <span className="type-meta font-medium" aria-live="polite">
        Página {pagina} de {totalPaginas}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pagina >= totalPaginas}
        onClick={() => onPagina(Math.min(totalPaginas, pagina + 1))}
        aria-label="Página siguiente"
        className="rounded-control"
      >
        Siguiente
      </Button>
    </nav>
  );
}
