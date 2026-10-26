'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Command, CommandEmpty, CommandInput, CommandList } from '@/components/ui/command';

/**
 * Buscador en línea de los diálogos del calendario (invitados de un evento y
 * proyectos de una reunión de Administración): el campo ES el input de cmdk y
 * los resultados se despliegan debajo, dentro de la misma tarjeta y con su
 * propio scroll. Sustituye al Popover con un segundo buscador, que duplicaba
 * la barra y flotaba sobre el pie del diálogo.
 *
 * - La lista siempre está montada (oculta si está cerrada): cmdk apunta a ella
 *   desde el input con `aria-controls`, y sin ella axe marca una referencia rota.
 * - El foco se ve en todo el buscador (`focus-within`); el contorno global del
 *   input, fuera de las capas de Tailwind, se quita en línea para no dibujar un
 *   segundo recuadro dentro.
 * - Escape cierra los resultados. El diálogo que lo contiene debe ignorar su
 *   propio Escape cuando el foco está en `[data-inline-search]`
 *   (`esEscapeDeBuscadorEnLinea`), para no perder lo escrito.
 */
export function InlineCommandSearch({
  label,
  placeholder,
  open,
  onOpenChange,
  empty,
  children,
  footer,
  autoFocus,
  disabled,
  invalid,
  describedBy,
  className = '',
}: {
  /** Nombre accesible del campo (cmdk lo asocia con aria-labelledby). */
  label: string;
  placeholder: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Texto cuando no hay resultados. */
  empty: ReactNode;
  /** Los `CommandItem` de los resultados. */
  children: ReactNode;
  /** Contenido bajo la lista mientras está abierta (p. ej. «Reintentar»). */
  footer?: ReactNode;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}) {
  return (
    <Command
      label={label}
      data-inline-search=""
      className={`h-auto rounded-control border bg-surface-container-lowest text-on-surface motion-focus focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 [&_[data-slot=command-input-wrapper]]:h-10 [&_[data-slot=command-input-wrapper]]:border-b-0 ${
        invalid ? 'border-destructive' : 'border-outline-variant'
      } ${className}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault();
          onOpenChange(false);
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onOpenChange(false);
      }}
    >
      <CommandInput
        placeholder={placeholder}
        aria-describedby={describedBy}
        autoFocus={autoFocus}
        disabled={disabled}
        onFocus={() => onOpenChange(true)}
        onClick={() => onOpenChange(true)}
        className="h-10"
        style={{ outline: 'none' }}
      />
      <CommandList hidden={!open} className="max-h-60 border-t border-outline-variant/60">
        <CommandEmpty>{empty}</CommandEmpty>
        {children}
      </CommandList>
      {open && footer}
    </Command>
  );
}

/**
 * Si el buscador se cierra (Escape) y el foco quedó en el documento porque el
 * input desapareció, lo devuelve al botón que lo abre. Si el usuario se fue a
 * otro control, no se lo quita.
 */
export function useDevolverFocoAlCerrar(open: boolean, boton: RefObject<HTMLElement | null>) {
  const estabaAbierto = useRef(open);
  useEffect(() => {
    if (estabaAbierto.current && !open && (document.activeElement === document.body || document.activeElement === null)) {
      boton.current?.focus();
    }
    estabaAbierto.current = open;
  }, [open, boton]);
}

/** Para `onEscapeKeyDown` del diálogo: el Escape iba dirigido a un buscador en línea. */
export function esEscapeDeBuscadorEnLinea(e: KeyboardEvent): boolean {
  return Boolean((e.target as HTMLElement | null)?.closest?.('[data-inline-search]'));
}
