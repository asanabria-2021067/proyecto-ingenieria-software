import type { ReactNode } from 'react';
import type { TipoProyecto } from '@/types';
import { TipoBadge } from '@/components/projects/tipo-badge';

/**
 * Contenido de una tarjeta de solicitud en las bandejas administrativas:
 * título del proyecto (el mismo estilo de «Mis Horas») y, debajo, la categoría
 * REAL del proyecto con la etiqueta de las vistas de estudiante junto a la
 * línea de líder, envío y fechas. El estado de la solicitud no se repite como
 * etiqueta: ya lo dice la sección.
 */
export function RequestInboxDetails({ titulo, tipo, children }: { titulo: string; tipo: TipoProyecto; children: ReactNode }) {
  return (
    <>
      <p className="type-subtitle break-words font-semibold">{titulo}</p>
      <div className="mt-micro flex flex-wrap items-center gap-x-tight gap-y-micro">
        <TipoBadge tipo={tipo} />
        <p className="type-meta">{children}</p>
      </div>
    </>
  );
}

/**
 * Acciones de una tarjeta: el botón compacto del panel (`<Button size="sm">`),
 * sin icono. El verde institucional es para lo que pide una decisión; las
 * acciones de solo consulta van en verde salvia claro.
 */
export const REQUEST_INBOX_BUTTON = 'text-xs font-semibold';
export const REQUEST_INBOX_BUTTON_GREEN = 'motion-glow-primary bg-primary text-on-primary hover:bg-primary/90';
export const REQUEST_INBOX_BUTTON_CONSULT = 'bg-consult text-on-consult hover:bg-consult-strong';
