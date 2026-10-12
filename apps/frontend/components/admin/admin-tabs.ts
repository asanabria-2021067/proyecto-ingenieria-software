/**
 * Pestañas de las fichas administrativas (detalle de proyecto, revisión de
 * cierre). Mismo lenguaje que «Tablero / Hitos» del estudiante: la pestaña
 * activa se marca con una línea inferior verde institucional (`after:`), no
 * con un contorno. `border-0` anula el borde de 1 px del TabsTrigger base, que
 * era lo que `border-primary` pintaba como rectángulo.
 */
export const ADMIN_TAB_LIST =
  'h-auto w-full justify-start gap-0 overflow-x-auto rounded-none border-b border-outline-variant/50 bg-transparent p-0';

export const ADMIN_TAB_TRIGGER =
  'relative h-11 touch-manipulation rounded-none border-0 bg-transparent px-3 text-[13px] font-semibold text-text-secondary shadow-none transition-colors hover:bg-surface-container-low hover:text-text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 data-[state=active]:bg-transparent data-[state=active]:text-text-primary data-[state=active]:shadow-none data-[state=active]:[&_svg]:text-primary data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-text-primary';
