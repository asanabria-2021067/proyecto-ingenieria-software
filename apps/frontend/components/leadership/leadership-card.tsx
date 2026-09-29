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
  /**
   * Historial plegable dentro de la tarjeta (por defecto, VIEW-16). La vista
   * de Liderazgo lo muestra aparte, como sección propia, y lo desactiva.
   */
  showHistory?: boolean;
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

const CARD = 'card-base';

/** Formato de tabla de Mis Tareas: franja guía gris verdosa, divisores tenues, hover suave. */
const FILA_GUIA = 'border-outline-variant/50 bg-surface-container-low hover:bg-surface-container-low';
const CELDA_GUIA = 'h-auto whitespace-nowrap py-tight text-xs font-semibold text-text-secondary first:pl-card last:pr-card';
const FILA = 'border-outline-variant/50 hover:bg-surface-container-low';
const CELDA = 'first:pl-card last:pr-card';

/**
 * Historial de liderazgo (más reciente primero): Fecha · Líder anterior ·
 * Nuevo líder · Origen · Motivo, todo del backend. Solo la tabla: cada
 * contenedor (tarjeta propia o plegable) decide su marco.
 */
export function LeadershipHistoryTable({ items }: { items: LeadershipHistoryItemDto[] }) {
  return (
    <Table aria-label="Historial de liderazgo">
      <TableHeader>
        <TableRow className={FILA_GUIA}>
          <TableHead className={CELDA_GUIA}>Fecha</TableHead>
          <TableHead className={CELDA_GUIA}>Líder anterior</TableHead>
          <TableHead className={CELDA_GUIA}>Nuevo líder</TableHead>
          <TableHead className={CELDA_GUIA}>Origen</TableHead>
          <TableHead className={CELDA_GUIA}>Motivo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...items].reverse().map((item) => (
          <TableRow key={item.idHistorialLiderazgo} className={FILA}>
            <TableCell className={`type-meta whitespace-nowrap tabular-nums text-text-secondary ${CELDA}`}>
              {formatearFecha(item.registradoEn) ?? '—'}
            </TableCell>
            <TableCell className={`whitespace-nowrap text-sm text-text-primary ${CELDA}`}>
              {item.liderAnterior.nombre} {item.liderAnterior.apellido}
            </TableCell>
            <TableCell className={`whitespace-nowrap text-sm font-semibold text-text-primary ${CELDA}`}>
              {item.liderNuevo.nombre} {item.liderNuevo.apellido}
            </TableCell>
            <TableCell className={CELDA}>
              <span className="pill pill-neutral">{origenLabel(item.origen)}</span>
            </TableCell>
            <TableCell className={`type-meta min-w-50 whitespace-normal text-text-secondary ${CELDA}`}>{item.motivo}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

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
  showHistory = true,
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
      <h2 id="leadership-card-title" className="flex items-center gap-tight type-subtitle font-semibold text-text-primary">
        <Crown className="size-5 shrink-0 text-text-primary" aria-hidden="true" />
        Liderazgo
      </h2>

      <div className="mt-card flex flex-col gap-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-stack">
          <Avatar className="size-16 shrink-0">
            <AvatarFallback className="bg-primary text-lg font-bold text-on-primary">
              {getInitials(context.liderActual.nombre, context.liderActual.apellido)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="type-section truncate text-text-primary">
              {context.liderActual.nombre} {context.liderActual.apellido}
            </p>
            <p className="type-body text-text-secondary">Líder actual del proyecto</p>
            {desde && <p className="type-meta mt-micro">Líder desde {desde}</p>}
          </div>
        </div>
        {!readOnly && action && (
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">{action}</div>
        )}
      </div>

      {showHistory && (
        <Collapsible open={historialAbierto} onOpenChange={setHistorialAbierto} className="mt-card">
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
              <div className="overflow-hidden rounded-control border border-outline-variant/50">
                <LeadershipHistoryTable items={items} />
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}
    </section>
  );
}
