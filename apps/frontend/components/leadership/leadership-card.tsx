'use client';

import { type ReactNode, useState } from 'react';
import { ChevronDown, Crown, History } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { LeadershipContextDto, LeadershipHistoryItemDto } from '@/lib/types/leadership';

export interface LeadershipCardProps {
  context: LeadershipContextDto | null | undefined;
  history: LeadershipHistoryItemDto[] | null | undefined;
  isLoading?: boolean;
  isError?: boolean;
  /** Fecha desde la que lidera (último cambio registrado o inicio del proyecto). */
  liderDesde?: string | null;
  /**
   * Slot de acción a la derecha. VIEW-06 (líder): «Apelar cambio de
   * liderazgo» (F009). VIEW-16 (admin): «Cambiar liderazgo» (F014). Un
   * miembro no recibe ninguna acción. Transferir es EXCLUSIVO del admin.
   */
  action?: ReactNode;
  /** Modo lectura (VIEW-16): sin slot de acción ni advertencias de líder. */
  readOnly?: boolean;
  className?: string;
}

const ORIGEN_LABEL: Record<string, string> = {
  SOLICITUD_LIDER: 'Apelación del líder',
  CAMBIO_ADMINISTRATIVO: 'Cambio administrativo',
};

export function origenLabel(origen: string): string {
  return ORIGEN_LABEL[origen] ?? origen;
}

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function formatearFecha(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
}

const CARD = 'rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm';

/**
 * VIEW-06 (F008), reutilizada por VIEW-16 (F013) — card «Liderazgo»: líder
 * actual, «Líder desde», slot de acción y «Historial de liderazgo» plegable
 * con Fecha · Líder anterior · Nuevo líder · Origen · Motivo, todo del backend.
 */
export function LeadershipCard({
  context,
  history,
  isLoading = false,
  isError = false,
  liderDesde,
  action,
  readOnly = false,
  className = '',
}: LeadershipCardProps) {
  const [historialAbierto, setHistorialAbierto] = useState(false);

  if (isLoading) {
    return (
      <section className={`${CARD} ${className}`} aria-busy="true" aria-label="Cargando liderazgo">
        <Skeleton className="h-5 w-32" />
        <div className="mt-4 flex items-center gap-3">
          <Skeleton className="size-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
      </section>
    );
  }

  if (isError || !context) {
    // 403 → la card se oculta sin romper la página (F008 §Errores).
    return null;
  }

  const items = history ?? [];
  const ultimoCambio = items.length > 0 ? items[items.length - 1] : null;
  const desde = formatearFecha(liderDesde ?? ultimoCambio?.registradoEn ?? null);

  return (
    <section className={`${CARD} ${className}`} aria-labelledby="leadership-card-title">
      <h2 id="leadership-card-title" className="flex items-center gap-2 text-base font-bold text-on-surface">
        <Crown className="size-4 text-primary" aria-hidden="true" />
        Liderazgo
      </h2>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="size-14">
            <AvatarFallback className="bg-primary text-base font-bold text-on-primary">
              {getInitials(context.liderActual.nombre, context.liderActual.apellido)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-base font-bold text-on-surface">
              {context.liderActual.nombre} {context.liderActual.apellido}
            </p>
            <p className="text-sm text-on-surface-variant">Líder actual del proyecto</p>
            {desde && <p className="text-xs text-tertiary">Líder desde {desde}</p>}
          </div>
        </div>
        {!readOnly && action && <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">{action}</div>}
      </div>

      <Collapsible open={historialAbierto} onOpenChange={setHistorialAbierto} className="mt-4">
        <CollapsibleTrigger
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          aria-controls="leadership-history-table"
        >
          <ChevronDown
            className={`size-4 transition-transform motion-reduce:transition-none ${historialAbierto ? 'rotate-0' : '-rotate-90'}`}
            aria-hidden="true"
          />
          <History className="size-4" aria-hidden="true" />
          Historial de liderazgo
        </CollapsibleTrigger>
        <CollapsibleContent id="leadership-history-table" className="mt-3">
          {items.length === 0 ? (
            <p className="text-sm italic text-tertiary">Sin cambios de liderazgo registrados.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-outline-variant/40">
              <Table>
                <TableHeader>
                  <TableRow className="border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-low">
                    <TableHead className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-tertiary">Fecha</TableHead>
                    <TableHead className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-tertiary">Líder anterior</TableHead>
                    <TableHead className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-tertiary">Nuevo líder</TableHead>
                    <TableHead className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-tertiary">Origen</TableHead>
                    <TableHead className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-tertiary">Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...items].reverse().map((item) => (
                    <TableRow key={item.idHistorialLiderazgo} className="border-outline-variant/40">
                      <TableCell className="whitespace-nowrap px-3 py-2 text-xs text-on-surface-variant">
                        {formatearFecha(item.registradoEn) ?? '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-2 text-xs text-on-surface">
                        {item.liderAnterior.nombre} {item.liderAnterior.apellido}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-2 text-xs text-on-surface">
                        {item.liderNuevo.nombre} {item.liderNuevo.apellido}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-2 text-xs text-on-surface-variant">
                        {origenLabel(item.origen)}
                      </TableCell>
                      <TableCell className="min-w-[200px] px-3 py-2 text-xs text-on-surface-variant">{item.motivo}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
