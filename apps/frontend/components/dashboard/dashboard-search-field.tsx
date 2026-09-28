import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type DashboardSearchFieldProps = Omit<React.ComponentProps<'input'>, 'type'> & {
  /** Ancho/posición del campo en cada vista (p. ej. `flex-1`, `max-w-md`). */
  containerClassName?: string;
};

/**
 * Buscador de las vistas del dashboard. La referencia es el de «Proyectos
 * Disponibles»: 46 px de alto, borde tenue, radio lg, lupa a la izquierda y
 * anillo primario al enfocar. Cada vista pone su placeholder, su nombre
 * accesible y su lógica de búsqueda.
 */
export function DashboardSearchField({ className, containerClassName, ...props }: DashboardSearchFieldProps) {
  return (
    <div className={cn('relative', containerClassName)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-outline"
      />
      <input
        type="text"
        className={cn(
          'h-11.5 w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2.5 pl-10 pr-3.5 text-[14px] text-on-surface outline-none placeholder:text-outline focus:ring-2 focus:ring-primary',
          className,
        )}
        {...props}
      />
    </div>
  );
}
