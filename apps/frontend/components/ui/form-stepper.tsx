import { cn } from '@/lib/utils';

interface FormStepperProps {
  /** Nombre de cada paso, en orden. */
  pasos: string[];
  /** Índice (desde 0) del paso activo. */
  actual: number;
  /** Si se pasa, los segmentos son botones que llevan a ese paso. */
  onSeleccionar?: (indice: number) => void;
  className?: string;
}

/** Barra de progreso por pasos del asistente «Completa tu perfil», reutilizable. */
export function FormStepper({ pasos, actual, onSeleccionar, className }: FormStepperProps) {
  return (
    <ol aria-label="Progreso del formulario" className={cn('flex gap-2', className)}>
      {pasos.map((nombre, i) => {
        const segmento = cn(
          'block h-1.5 w-full rounded-full transition-colors duration-200',
          i <= actual ? 'bg-primary' : 'bg-surface-container-highest',
        );
        const etiqueta = `Paso ${i + 1} de ${pasos.length}: ${nombre}`;
        return (
          <li
            key={nombre}
            className="flex-1"
            aria-current={onSeleccionar || i !== actual ? undefined : 'step'}
            aria-label={onSeleccionar ? undefined : etiqueta}
          >
            {onSeleccionar ? (
              <button
                type="button"
                aria-label={etiqueta}
                aria-current={i === actual ? 'step' : undefined}
                onClick={() => onSeleccionar(i)}
                className="block w-full cursor-pointer py-1 outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className={segmento} />
              </button>
            ) : (
              <span className={segmento} aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
