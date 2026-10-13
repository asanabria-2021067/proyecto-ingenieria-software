/**
 * Tarjeta contadora del dashboard: punto de color, etiqueta en versalitas y
 * número. Nació en «Mis Tareas» y la comparten el explorador de tareas y las
 * bandejas administrativas de solicitudes.
 *
 * El punto distingue la métrica sin otro icono; `tonoValor` colorea el número
 * solo cuando el valor pide atención (p. ej. vencidas).
 */
export function ResumenKpi({
  label,
  valor,
  punto,
  tonoValor = 'text-text-primary',
}: {
  label: string;
  valor: number;
  /** Clase de fondo del punto, p. ej. `bg-primary`. */
  punto: string;
  tonoValor?: string;
}) {
  return (
    <div role="group" aria-label={label} className="card-base px-card py-stack">
      <p className="flex items-center gap-tight text-xs font-semibold uppercase tracking-wide text-text-secondary">
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${punto}`} />
        {label}
      </p>
      <p className={`mt-tight font-headline text-3xl font-bold tabular-nums ${tonoValor}`}>{valor}</p>
    </div>
  );
}
