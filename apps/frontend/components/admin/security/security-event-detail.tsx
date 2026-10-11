'use client';

import type { ReactNode, RefObject } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tag } from '@/components/ui/tag';
import {
  SECURITY_EVENT_LABEL,
  SECURITY_EVENT_TONE,
  accountLabel,
  formatSecurityEventDate,
  originLabel,
  securityEventDetailRows,
} from '@/lib/admin/security-events';
import type { SecurityEvent } from '@/lib/types/admin-security';

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="grid gap-tight border-b border-outline-variant/50 py-inline last:border-b-0 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-stack">
      <dt className="type-meta font-semibold">{etiqueta}</dt>
      <dd className="type-body min-w-0 break-words text-text-primary">{children}</dd>
    </div>
  );
}

/**
 * Detalle de un evento de seguridad (T-310). Muestra únicamente los campos del
 * contrato saneado, leídos por `lib/admin/security-events`: no hay JSON crudo
 * ni un volcado de claves. Escape, la X y «Cerrar» lo cierran, y el foco vuelve
 * al botón que lo abrió.
 *
 * El diálogo se abre desde una fila de la tabla, no desde un `DialogTrigger`:
 * Radix solo devuelve el foco a su propio trigger, así que aquí se devuelve a
 * mano a `returnFocusRef`.
 */
export function SecurityEventDetail({
  event,
  onClose,
  returnFocusRef,
}: {
  event: SecurityEvent | null;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const origen = event ? originLabel(event.origen) : null;
  const filas = event ? securityEventDetailRows(event) : [];

  return (
    <Dialog open={event !== null} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        onCloseAutoFocus={(cierre) => {
          cierre.preventDefault();
          returnFocusRef?.current?.focus();
        }}
      >
        {event && origen && (
          <>
            <DialogHeader className="pr-10 text-left">
              <DialogTitle>Detalle del evento de seguridad</DialogTitle>
              <DialogDescription>
                {SECURITY_EVENT_LABEL[event.tipo]} · {formatSecurityEventDate(event.fecha)} (hora de Guatemala)
              </DialogDescription>
            </DialogHeader>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Cerrar detalle" className="absolute right-4 top-4">
                <X aria-hidden="true" />
              </Button>
            </DialogClose>

            <dl>
              <Fila etiqueta="Tipo">
                <Tag tone={SECURITY_EVENT_TONE[event.tipo]} size="sm">
                  {SECURITY_EVENT_LABEL[event.tipo]}
                </Tag>
              </Fila>
              <Fila etiqueta="Fecha y hora">
                <time dateTime={event.fecha} className="tabular-nums">
                  {formatSecurityEventDate(event.fecha)}
                </time>
              </Fila>
              <Fila etiqueta="Evento n.º">
                <span className="tabular-nums">{event.id}</span>
              </Fila>
              <Fila etiqueta="Actor">{accountLabel(event.actor, 'Sin sesión: nadie había iniciado sesión')}</Fila>
              <Fila etiqueta="Cuenta afectada">{accountLabel(event.cuenta, 'Sin cuenta asociada')}</Fila>
              <Fila etiqueta="Origen">
                <span className="block font-semibold">{origen.etiqueta}</span>
                {origen.ip && <span className="block break-all tabular-nums">{origen.ip}</span>}
                {origen.ip && !origen.verificada && (
                  <span className="type-meta mt-tight block">
                    No es un origen confirmado: puede ser la dirección de un proxy o de la red interna.
                  </span>
                )}
              </Fila>
              {filas.map((fila) => (
                <Fila key={fila.etiqueta} etiqueta={fila.etiqueta}>
                  {fila.valor}
                </Fila>
              ))}
            </dl>
            {filas.length === 0 && <p className="type-meta">Este evento no registra información adicional.</p>}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" className="rounded-control">
                  Cerrar
                </Button>
              </DialogClose>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
