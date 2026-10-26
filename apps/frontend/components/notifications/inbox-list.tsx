'use client';

import { useCallback, type KeyboardEvent } from 'react';
import { AlertCircle, BellOff, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkeletonList } from '@/components/ui/skeleton';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { NotificationAvatar } from '@/components/notifications/notification-avatar';
import type { Notificacion } from '@/lib/services/notifications';
import {
  agruparPorDia,
  categoriaDeTipo,
  fechaCompacta,
  identidadDeAviso,
  origenDeAviso,
  proyectoDeAviso,
  tituloDeCategoria,
} from '@/lib/notifications/inbox-model';
import { cn } from '@/lib/utils';

interface InboxRowProps {
  notificacion: Notificacion;
  seleccionada: boolean;
  onSeleccionar: () => void;
  ahora: Date;
}

/**
 * Fila compacta (REGIÓN C, §4): avatar del emisor (identidadDeAviso), origen, título, vista previa
 * de dos líneas, chips de categoría y proyecto, fecha e indicador de no leída.
 * No leída = título en negrita, punto verde y fondo apenas teñido. Seleccionada
 * = salvia sutil con acento vertical a la izquierda, sin tocar los radios.
 */
export function InboxRow({ notificacion: n, seleccionada, onSeleccionar, ahora }: InboxRowProps) {
  const noLeida = n.leidaEn === null;
  const identidad = identidadDeAviso(n);
  const origen = origenDeAviso(n);
  const proyecto = proyectoDeAviso(n);
  const categoria = tituloDeCategoria(categoriaDeTipo(n.tipoNotificacion));
  const fecha = fechaCompacta(n.creadaEn, ahora);

  return (
    <li className="relative" data-notificacion={n.idNotificacion} data-leida={noLeida ? 'false' : 'true'}>
      <button
        type="button"
        onClick={onSeleccionar}
        aria-current={seleccionada ? 'true' : undefined}
        aria-label={`${noLeida ? 'No leída: ' : ''}${n.tituloNotificacion}${fecha ? `, ${fecha}` : ''}`}
        className={cn(
          'group/fila flex w-full items-start gap-inline border-l-2 px-inline py-inline text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40',
          seleccionada
            ? 'border-l-sage-nav-accent bg-sage-nav-active'
            : noLeida
              ? 'border-l-transparent bg-primary/5 hover:bg-primary/10'
              : 'border-l-transparent hover:bg-surface-container-low',
        )}
      >
        <span className="mt-0.5 shrink-0">
          <NotificationAvatar identidad={identidad} />
        </span>

        <span className="min-w-0 flex-1">
          {origen && (
            <span className={cn('type-meta block truncate text-[11px] uppercase tracking-wide', seleccionada ? 'text-sage-nav-ink-soft' : 'text-text-secondary')}>{origen}</span>
          )}
          <span className={cn('block truncate text-sm', seleccionada ? 'text-sage-nav-ink' : 'text-on-surface', noLeida ? 'font-bold' : 'font-medium')}>
            {n.tituloNotificacion}
          </span>
          {n.mensajeNotificacion && (
            <span className={cn('mt-0.5 line-clamp-2 text-xs leading-snug', seleccionada ? 'text-sage-nav-ink-soft' : noLeida ? 'text-on-surface-variant' : 'text-tertiary')}>
              {n.mensajeNotificacion}
            </span>
          )}
          <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
            <span className="pill pill-sm pill-neutral">{categoria}</span>
            {proyecto?.titulo && (
              <span className="pill pill-sm pill-sage max-w-44" title={proyecto.titulo}>
                <span className="truncate">{proyecto.titulo}</span>
              </span>
            )}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
          <time
            dateTime={n.creadaEn}
            className={cn('text-[11px] tabular-nums', seleccionada ? 'font-semibold text-sage-nav-ink-soft' : noLeida ? 'font-semibold text-primary' : 'text-text-secondary')}
          >
            {fecha}
          </time>
          {noLeida && <span aria-hidden="true" className="size-2 rounded-full bg-primary ring-2 ring-surface-container-lowest" />}
        </span>
      </button>
    </li>
  );
}

interface InboxListProps {
  notificaciones: Notificacion[];
  seleccionadaId: number | null;
  onSeleccionar: (n: Notificacion) => void;
  isLoading: boolean;
  isError: boolean;
  onReintentar: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onCargarMas: () => void;
  /** Hay búsqueda o filtros que explican una lista vacía. */
  filtrada: boolean;
  onLimpiarFiltros: () => void;
  ahora?: Date;
}

/**
 * Lista paginada con cabeceras de día fijas (Hoy, Ayer, fecha). Las flechas
 * mueven la selección entre filas sin salir de la lista.
 */
export function InboxList({
  notificaciones,
  seleccionadaId,
  onSeleccionar,
  isLoading,
  isError,
  onReintentar,
  hasNextPage,
  isFetchingNextPage,
  onCargarMas,
  filtrada,
  onLimpiarFiltros,
  ahora = new Date(),
}: InboxListProps) {
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLUListElement>) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      if (notificaciones.length === 0) return;
      event.preventDefault();
      const indice = notificaciones.findIndex((n) => n.idNotificacion === seleccionadaId);
      const siguiente = event.key === 'ArrowDown' ? Math.min(indice + 1, notificaciones.length - 1) : Math.max(indice - 1, 0);
      const destino = notificaciones[siguiente];
      if (!destino || destino.idNotificacion === seleccionadaId) return;
      onSeleccionar(destino);
      event.currentTarget.querySelector<HTMLButtonElement>(`[data-notificacion="${destino.idNotificacion}"] button`)?.focus();
    },
    [notificaciones, seleccionadaId, onSeleccionar],
  );

  if (isLoading) {
    return (
      <div className="p-inline">
        <SkeletonList label="Cargando notificaciones" count={5} lines={2} avatar="square" />
      </div>
    );
  }

  if (isError) {
    return (
      <Empty tone="danger" size="compact" className="m-inline surface-enter" role="alert">
        <EmptyMedia variant="icon">
          <AlertCircle aria-hidden="true" className="size-6" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>No se pudieron cargar las notificaciones</EmptyTitle>
          <EmptyDescription>Intenta nuevamente para revisar tus avisos recientes.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" onClick={onReintentar}>Reintentar</Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (notificaciones.length === 0) {
    return (
      <Empty size="compact" className="m-inline surface-enter" aria-live="polite">
        <EmptyMedia variant="icon">
          {filtrada ? <SearchX aria-hidden="true" className="size-6" /> : <BellOff aria-hidden="true" className="size-6" />}
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>{filtrada ? 'Sin resultados' : 'Todo está al día'}</EmptyTitle>
          <EmptyDescription>
            {filtrada
              ? 'Ningún aviso coincide con la búsqueda o los filtros actuales.'
              : 'Las alertas de postulaciones, revisiones y avances aparecerán aquí cuando haya actividad nueva.'}
          </EmptyDescription>
        </EmptyHeader>
        {filtrada && (
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={onLimpiarFiltros}>Limpiar filtros</Button>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  const grupos = agruparPorDia(notificaciones, ahora);

  return (
    <div className="flex flex-col">
      {grupos.map((grupo) => (
        <section key={grupo.clave} aria-labelledby={`inbox-dia-${grupo.clave}`}>
          <h3
            id={`inbox-dia-${grupo.clave}`}
            className="sticky top-0 z-10 border-y border-outline-variant/40 bg-surface-container-low/95 px-inline py-1.5 text-[11px] font-bold uppercase tracking-wider text-text-secondary backdrop-blur-sm first:border-t-0"
          >
            {grupo.etiqueta}
          </h3>
          <ul className="divide-y divide-outline-variant/40" onKeyDown={onKeyDown}>
            {grupo.items.map((n) => (
              <InboxRow
                key={n.idNotificacion}
                notificacion={n}
                seleccionada={n.idNotificacion === seleccionadaId}
                onSeleccionar={() => onSeleccionar(n)}
                ahora={ahora}
              />
            ))}
          </ul>
        </section>
      ))}
      {hasNextPage && (
        <div className="flex justify-center border-t border-outline-variant/40 p-inline">
          <Button variant="outline" size="sm" onClick={onCargarMas} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
          </Button>
        </div>
      )}
    </div>
  );
}
