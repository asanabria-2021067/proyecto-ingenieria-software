import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type DashboardSearchFieldProps = Omit<React.ComponentProps<'input'>, 'type'> & {
  /** Ancho/posición del campo en cada vista (p. ej. `flex-1`, `max-w-md`). */
  containerClassName?: string;
};

/**
 * Buscador principal de las vistas del dashboard (el «SearchInput» de
 * UVGenius). La referencia es el de «Proyectos Disponibles»: 46 px de alto,
 * borde tenue, radio lg, lupa de 16 px a la izquierda y anillo primario al
 * enfocar. Alto, borde, fondo, icono, padding, tipografía y estados son
 * siempre estos; cada vista decide solo el ancho y el comportamiento flex
 * (`containerClassName`), además de su placeholder, nombre accesible y lógica.
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
          'h-11.5 w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2.5 pl-10 pr-3.5 text-[14px] text-on-surface outline-none transition-[border-color,box-shadow] placeholder:text-outline hover:border-outline focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  );
}
