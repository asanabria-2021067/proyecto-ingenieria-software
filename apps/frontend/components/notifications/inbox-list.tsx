'use client';

import { useCallback, type KeyboardEvent } from 'react';
import { AlertCircle, BellOff, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkeletonList } from '@/components/ui/skeleton';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { NotificationAvatar } from '@/components/notifications/notification-avatar';
import { DATA_TABLE_HEAD_ROW, DATA_TABLE_HEAD_TEXT, DATA_TABLE_ROW_HOVER, DATA_TABLE_ROWS } from '@/components/dashboard/data-table';
import type { Notificacion } from '@/lib/services/notifications';
import {
  agruparPorDia,
  categoriaDeTipo,
  fechaCompacta,
  identidadDeAviso,
  origenDeAviso,
  proyectoDeAviso,
  segmentosDeMensaje,
  tituloDeCategoria,
} from '@/lib/notifications/inbox-model';
import { cn } from '@/lib/utils';

/**
 * Superficies de la fila, sobre el blanco de la tarjeta (como las filas de Mis Tareas) y nunca sobre el
 * fondo azulado de la página: la no leída lleva un tinte verde casi imperceptible y la seleccionada, uno
 * suave con indicador lateral. Mezclas de los mismos tokens, así siguen al tema claro y oscuro.
 */
const FONDO_NO_LEIDA = 'bg-[color-mix(in_srgb,var(--color-primary)_3%,var(--color-surface-container-lowest))]';
const FONDO_SELECCIONADA = 'bg-[color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface-container-lowest))]';

/**
 * Barra izquierda, como en Outlook, dibujada con una sombra interior para que cambiar su grosor no mueva
 * el contenido (y conviva con el anillo de foco, que es otra sombra). Verde = no leída: suavizado de 3 px,
 * y seleccionada y no leída, una sola barra verde plena de 5 px. Seleccionada y leída: barra neutra
 * (outline), para que la selección no se confunda con un aviso pendiente.
 */
const BARRA_NO_LEIDA = 'shadow-[inset_3px_0_0_color-mix(in_srgb,var(--color-primary)_55%,transparent)]';
const BARRA_SELECCIONADA_LEIDA = 'shadow-[inset_3px_0_0_var(--color-outline)]';
const BARRA_SELECCIONADA_NO_LEIDA = 'shadow-[inset_5px_0_0_var(--color-primary)]';

/**
 * Lo citado en el mensaje (la tarea, el rol, el proyecto…). Sin leer, en verde de acento como TEXTO
 * (sin fondo ni subrayado; primary: 7:1 en claro, verde brillante en oscuro). Leído, vuelve al tono
 * neutro de la descripción.
 */
export function MensajeConCitas({ texto, noLeida }: { texto: string; noLeida: boolean }) {
  return segmentosDeMensaje(texto).map((segmento, i) =>
    segmento.destacado ? (
      <span key={i} data-cita="" className={noLeida ? 'font-semibold text-primary' : 'font-medium'}>
        {segmento.texto}
      </span>
    ) : (
      segmento.texto
    ),
  );
}

interface InboxRowProps {
  notificacion: Notificacion;
  seleccionada: boolean;
  onSeleccionar: () => void;
  ahora: Date;
}

/**
 * Fila compacta (REGIÓN C, §4): avatar del emisor (identidadDeAviso), origen, título, vista previa
 * de dos líneas, chips de categoría y proyecto, fecha e indicador de no leída.
 * Lógica de Outlook. No leída = barra verde a la izquierda, título en negrita
 * con alto contraste, lo citado en verde, punto verde y un tinte casi
 * imperceptible. Leída = atenuada: fondo blanco, título medium en tono
 * secundario, cita neutra, sin punto ni barra. Seleccionada = verde muy suave;
 * sin leer, su barra y la de no leída son una sola más gruesa; leída, la barra
 * es neutra. El avatar lleva el color de la categoría en cualquier estado.
 */
export function InboxRow({ notificacion: n, seleccionada, onSeleccionar, ahora }: InboxRowProps) {
  const noLeida = n.leidaEn === null;
  const identidad = identidadDeAviso(n);
  const origen = origenDeAviso(n);
  const proyecto = proyectoDeAviso(n);
  const idCategoria = categoriaDeTipo(n.tipoNotificacion);
  const categoria = tituloDeCategoria(idCategoria);
  const fecha = fechaCompacta(n.creadaEn, ahora);

  return (
    <li className="relative" data-notificacion={n.idNotificacion} data-leida={noLeida ? 'false' : 'true'}>
      <button
        type="button"
        onClick={onSeleccionar}
        aria-current={seleccionada ? 'true' : undefined}
        aria-label={`${noLeida ? 'No leída: ' : ''}${n.tituloNotificacion}${fecha ? `, ${fecha}` : ''}`}
        className={cn(
          'group/fila flex w-full items-start gap-inline px-inline py-inline text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40',
          seleccionada
            ? cn('transition-colors', FONDO_SELECCIONADA, noLeida ? BARRA_SELECCIONADA_NO_LEIDA : BARRA_SELECCIONADA_LEIDA)
            : cn(DATA_TABLE_ROW_HOVER, noLeida ? cn(FONDO_NO_LEIDA, BARRA_NO_LEIDA) : 'bg-surface-container-lowest'),
        )}
      >
        <span className="mt-0.5 shrink-0">
          {/* Sin leer, el avatar lleva el color de su categoría; leído, queda gris. */}
          <NotificationAvatar identidad={identidad} categoria={idCategoria} leida={!noLeida} />
        </span>

        <span className="min-w-0 flex-1">
          {origen && (
            <span className="type-meta block truncate text-[11px] uppercase tracking-wide text-text-secondary">{origen}</span>
          )}
          <span className={cn('block truncate text-sm', noLeida ? 'font-bold text-on-surface' : 'font-medium text-on-surface-variant')}>
            {n.tituloNotificacion}
          </span>
          {n.mensajeNotificacion && (
            <span className={cn('mt-0.5 line-clamp-2 text-xs leading-snug', noLeida ? 'text-on-surface-variant' : 'text-tertiary')}>
              <MensajeConCitas texto={n.mensajeNotificacion} noLeida={noLeida} />
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
            className={cn('text-[11px] tabular-nums', noLeida ? 'font-semibold text-on-surface' : 'text-text-secondary')}
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
            className={cn(DATA_TABLE_HEAD_ROW, DATA_TABLE_HEAD_TEXT, 'sticky top-0 z-10 border-t px-inline py-tight uppercase first:border-t-0')}
          >
            {grupo.etiqueta}
          </h3>
          <ul className={DATA_TABLE_ROWS} onKeyDown={onKeyDown}>
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
