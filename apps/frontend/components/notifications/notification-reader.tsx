'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, CalendarX2, CheckCheck, ChevronLeft, ChevronRight, Inbox, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NotificationAvatar } from '@/components/notifications/notification-avatar';
import { MensajeConCitas } from '@/components/notifications/inbox-list';
import type { Notificacion } from '@/lib/services/notifications';
import {
  accionDeAviso,
  categoriaDeTipo,
  detallesDeAviso,
  estadoDeReunion,
  etiquetaDeTipo,
  fechaCompleta,
  identidadDeAviso,
  origenDeAviso,
  proyectoDeAviso,
  tituloDeCategoria,
} from '@/lib/notifications/inbox-model';
import { cn } from '@/lib/utils';

interface ReaderToolbarProps {
  onAnterior?: () => void;
  onSiguiente?: () => void;
  /** Solo en móvil: vuelve a la lista. */
  onVolver?: () => void;
  /** Marcado masivo con el alcance del filtro actual (texto exacto en `etiquetaMarcarFiltradas`). */
  onMarcarFiltradas?: () => void;
  etiquetaMarcarFiltradas?: string;
  marcarFiltradasDeshabilitado?: boolean;
}

const ICON_BUTTON = 'size-8 rounded-md text-text-secondary hover:text-text-primary';

function IconAction({ label, onClick, disabled, children }: { label: string; onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" className={ICON_BUTTON} aria-label={label} onClick={onClick} disabled={disabled || !onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Barra superior del visor (§5.2): anterior/siguiente, el marcado masivo y volver en móvil. «Marcar como
 * leída» de la notificación abierta va en el pie de su tarjeta, junto a su acción.
 */
export function NotificationReaderToolbar({
  onAnterior,
  onSiguiente,
  onVolver,
  onMarcarFiltradas,
  etiquetaMarcarFiltradas,
  marcarFiltradasDeshabilitado,
}: ReaderToolbarProps) {
  return (
    <div className="flex shrink-0 items-center gap-micro border-b border-outline-variant/60 px-inline py-tight">
      {onVolver && (
        <Button type="button" variant="ghost" size="sm" onClick={onVolver} className="-ml-1 md:hidden">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a notificaciones
        </Button>
      )}
      <h2 className={cn('min-w-0 flex-1 truncate text-sm font-semibold text-on-surface', onVolver && 'hidden md:block')}>Detalle de la notificación</h2>
      <IconAction label="Notificación anterior" onClick={onAnterior}>
        <ChevronLeft className="size-4" aria-hidden="true" />
      </IconAction>
      <IconAction label="Notificación siguiente" onClick={onSiguiente}>
        <ChevronRight className="size-4" aria-hidden="true" />
      </IconAction>
      {onMarcarFiltradas && etiquetaMarcarFiltradas && (
        // Compacta: icono siempre, texto solo cuando hay ancho (el nombre accesible no cambia).
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              onClick={onMarcarFiltradas}
              disabled={marcarFiltradasDeshabilitado}
              aria-label={etiquetaMarcarFiltradas}
              className="ml-micro rounded-md text-[13px] font-semibold"
            >
              <CheckCheck className="size-4" aria-hidden="true" />
              <span className="hidden 2xl:inline">{etiquetaMarcarFiltradas}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{etiquetaMarcarFiltradas}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

/** Estado inicial del visor (§5.1): nada seleccionado, sin contenido ficticio. */
export function NotificationReaderEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-tight px-section text-center" role="status">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-surface-container text-tertiary" aria-hidden="true">
        <Inbox className="size-6" />
      </span>
      <p className="text-sm font-semibold text-on-surface">Selecciona una notificación</p>
      <p className="max-w-xs text-xs text-tertiary">Los detalles se mostrarán aquí sin salir de tu bandeja de entrada.</p>
    </div>
  );
}

const REUNION_TEXTO = {
  programada: { etiqueta: 'Reunión programada', clase: 'pill-accent' },
  actualizada: { etiqueta: 'Reunión actualizada', clase: 'pill-amber' },
  cancelada: { etiqueta: 'Reunión cancelada', clase: 'pill-error' },
} as const;

/** Columnas de la caja de datos: hasta tres por fila, separadas por una línea vertical. */
const COLUMNAS_DATOS = ['sm:grid-cols-1', 'sm:grid-cols-2', 'sm:grid-cols-3'] as const;

/**
 * Contenido del visor (§5.3) como una tarjeta, extensión de la fila: categoría
 * (y reunión o «No leída»), avatar con título y metadatos (de, tipo, fecha,
 * proyecto), el mensaje con el mismo énfasis que la fila, los datos
 * estructurados en columnas y, al pie, la acción contextual y «Marcar como
 * leída» si aún no lo está. Todo sale del aviso real.
 */
export function NotificationReaderContent({
  notificacion: n,
  onMarcarLeida,
  marcando,
}: {
  notificacion: Notificacion;
  /** Sin función = ya está leída (el backend no marca «no leída»). */
  onMarcarLeida?: () => void;
  marcando?: boolean;
}) {
  const categoria = tituloDeCategoria(categoriaDeTipo(n.tipoNotificacion));
  const origen = origenDeAviso(n);
  const proyecto = proyectoDeAviso(n);
  const detalles = detallesDeAviso(n);
  const reunion = estadoDeReunion(n.tipoNotificacion);
  const accion = accionDeAviso(n);
  const noLeida = n.leidaEn === null;
  const columnas = COLUMNAS_DATOS[Math.min(detalles.length, 3) - 1] ?? COLUMNAS_DATOS[0];

  return (
    <div className="px-inline py-stack sm:px-section">
      <article
        aria-labelledby={`notificacion-${n.idNotificacion}-titulo`}
        className="card-base flex w-full max-w-4xl flex-col gap-stack"
      >
        <header className="flex flex-col gap-tight">
          <div className="flex flex-wrap items-center gap-tight">
            <span className="pill pill-neutral">{categoria}</span>
            {reunion && <span className={cn('pill', REUNION_TEXTO[reunion].clase)}>{REUNION_TEXTO[reunion].etiqueta}</span>}
            {noLeida && <span className="pill pill-accent">No leída</span>}
          </div>
          <div className="flex items-start gap-inline">
            <span className="mt-0.5 shrink-0">
              <NotificationAvatar identidad={identidadDeAviso(n)} categoria={categoriaDeTipo(n.tipoNotificacion)} size="lg" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 id={`notificacion-${n.idNotificacion}-titulo`} className="type-section break-words text-on-surface">
                {n.tituloNotificacion}
              </h3>
              <dl className="mt-micro flex flex-wrap gap-x-stack gap-y-micro text-xs text-text-secondary">
                {origen && (
                  <div className="flex gap-1">
                    <dt className="font-semibold">De:</dt>
                    <dd>{origen}</dd>
                  </div>
                )}
                <div className="flex gap-1">
                  <dt className="font-semibold">Tipo:</dt>
                  <dd>{etiquetaDeTipo(n.tipoNotificacion)}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="font-semibold">Fecha:</dt>
                  <dd>
                    <time dateTime={n.creadaEn}>{fechaCompleta(n.creadaEn)}</time>
                  </dd>
                </div>
                {proyecto && (proyecto.titulo || proyecto.id) && (
                  <div className="flex min-w-0 gap-1">
                    <dt className="font-semibold">Proyecto:</dt>
                    <dd className="min-w-0 truncate">
                      {proyecto.id ? (
                        <Link href={`/dashboard/proyectos/${proyecto.id}`} className="font-semibold text-primary hover:underline">
                          {proyecto.titulo ?? `Proyecto ${proyecto.id}`}
                        </Link>
                      ) : (
                        <span className="font-semibold text-on-surface">{proyecto.titulo}</span>
                      )}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </header>

        {/* Mismo lenguaje que la fila: lo citado en verde mientras el aviso siga sin leer. */}
        {n.mensajeNotificacion && (
          <p className="whitespace-pre-line break-words text-base leading-relaxed text-on-surface">
            <MensajeConCitas texto={n.mensajeNotificacion} noLeida={noLeida} />
          </p>
        )}

        {detalles.length > 0 && (
          <section aria-label="Detalles" className="rounded-card border border-outline-variant/50 bg-surface-container-low/60 px-stack py-inline">
            <dl className={cn('grid grid-cols-1 gap-y-tight', columnas)}>
              {detalles.map((detalle, i) => (
                <div
                  key={detalle.etiqueta}
                  className={cn('min-w-0 sm:px-stack', i % 3 === 0 ? 'sm:pl-0' : 'sm:border-l sm:border-outline-variant/60')}
                >
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">{detalle.etiqueta}</dt>
                  <dd className="mt-micro truncate text-base text-on-surface" title={detalle.valor}>
                    {detalle.valor}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {reunion === 'cancelada' && (
          <p role="note" className="flex items-start gap-tight rounded-card border border-error/30 bg-error/10 p-inline text-xs text-on-surface">
            <CalendarX2 className="mt-0.5 size-4 shrink-0 text-error" aria-hidden="true" />
            Esta reunión fue cancelada por Administración y ya no aparece en tu calendario.
          </p>
        )}

        {(accion || onMarcarLeida) && (
          <footer className="flex flex-wrap items-center gap-x-stack gap-y-tight border-t border-outline-variant/60 pt-stack">
            {accion && (
              <Link
                href={accion.href}
                className="inline-flex items-center gap-1.5 rounded-control text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <ArrowUpRight className="size-4" aria-hidden="true" />
                {accion.etiqueta}
              </Link>
            )}
            {accion && onMarcarLeida && <span aria-hidden="true" className="h-5 w-px bg-outline-variant/60" />}
            {onMarcarLeida && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onMarcarLeida}
                disabled={marcando}
                className="gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
              >
                <Mail className="size-4" aria-hidden="true" />
                Marcar como leída
              </Button>
            )}
          </footer>
        )}
      </article>
    </div>
  );
}
