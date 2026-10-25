'use client';

import { createElement } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarX2, Check, ChevronLeft, ChevronRight, Inbox, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Notificacion } from '@/lib/services/notifications';
import {
  accionDeAviso,
  categoriaDeTipo,
  detallesDeAviso,
  estadoDeReunion,
  etiquetaDeTipo,
  fechaCompleta,
  iconoDeTipo,
  origenDeAviso,
  proyectoDeAviso,
  tituloDeCategoria,
} from '@/lib/notifications/inbox-model';
import { cn } from '@/lib/utils';

interface ReaderToolbarProps {
  onAnterior?: () => void;
  onSiguiente?: () => void;
  /** Sin función = la notificación ya está leída (el backend no marca «no leída»). */
  onMarcarLeida?: () => void;
  marcando?: boolean;
  listaContraida?: boolean;
  onAlternarLista?: () => void;
  /** Solo en móvil: vuelve a la lista. */
  onVolver?: () => void;
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

/** Barra superior del visor (§5.2): anterior/siguiente, marcar leída, contraer/restaurar bandeja y volver en móvil. */
export function NotificationReaderToolbar({ onAnterior, onSiguiente, onMarcarLeida, marcando, listaContraida, onAlternarLista, onVolver }: ReaderToolbarProps) {
  return (
    <div className="flex shrink-0 items-center gap-micro border-b border-outline-variant/60 px-inline py-tight">
      {onVolver && (
        <Button type="button" variant="ghost" size="sm" onClick={onVolver} className="-ml-1 md:hidden">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a notificaciones
        </Button>
      )}
      {onAlternarLista && (
        <span className="hidden md:inline-flex">
          <IconAction label={listaContraida ? 'Restaurar bandeja' : 'Contraer bandeja'} onClick={onAlternarLista}>
            {listaContraida ? <PanelLeftOpen className="size-4" aria-hidden="true" /> : <PanelLeftClose className="size-4" aria-hidden="true" />}
          </IconAction>
        </span>
      )}
      <h2 className={cn('min-w-0 flex-1 truncate text-sm font-semibold text-on-surface', onVolver && 'hidden md:block')}>Detalle de la notificación</h2>
      <IconAction label="Notificación anterior" onClick={onAnterior}>
        <ChevronLeft className="size-4" aria-hidden="true" />
      </IconAction>
      <IconAction label="Notificación siguiente" onClick={onSiguiente}>
        <ChevronRight className="size-4" aria-hidden="true" />
      </IconAction>
      {onMarcarLeida && (
        <Button type="button" variant="outline" size="sm" onClick={onMarcarLeida} disabled={marcando} className="ml-micro">
          <Check className="size-4" aria-hidden="true" />
          Marcar como leída
        </Button>
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

/**
 * Contenido del visor (§5.3), en orden: categoría, título, origen, tipo,
 * fecha, mensaje completo, detalles estructurados, proyecto, avisos
 * relevantes y la acción de navegación. Todo sale del aviso real.
 */
export function NotificationReaderContent({ notificacion: n }: { notificacion: Notificacion }) {
  const categoria = tituloDeCategoria(categoriaDeTipo(n.tipoNotificacion));
  const origen = origenDeAviso(n);
  const proyecto = proyectoDeAviso(n);
  const detalles = detallesDeAviso(n);
  const reunion = estadoDeReunion(n.tipoNotificacion);
  const accion = accionDeAviso(n);
  const noLeida = n.leidaEn === null;

  return (
    <article aria-labelledby={`notificacion-${n.idNotificacion}-titulo`} className="flex flex-col gap-stack px-section py-stack">
      <header className="flex flex-col gap-tight">
        <div className="flex flex-wrap items-center gap-tight">
          <span className="pill pill-neutral">{categoria}</span>
          {reunion && <span className={cn('pill', REUNION_TEXTO[reunion].clase)}>{REUNION_TEXTO[reunion].etiqueta}</span>}
          {noLeida && <span className="pill pill-accent">No leída</span>}
        </div>
        <div className="flex items-start gap-inline">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-control bg-primary-container/15 text-primary" aria-hidden="true">
            {createElement(iconoDeTipo(n.tipoNotificacion), { className: 'size-5' })}
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
            </dl>
          </div>
        </div>
      </header>

      {n.mensajeNotificacion && <p className="type-body whitespace-pre-line break-words text-on-surface">{n.mensajeNotificacion}</p>}

      {detalles.length > 0 && (
        <section aria-label="Detalles" className="rounded-card border border-outline-variant/50 bg-surface-container-low/60 p-stack">
          <dl className="grid grid-cols-1 gap-x-stack gap-y-tight sm:grid-cols-2">
            {detalles.map((detalle) => (
              <div key={detalle.etiqueta} className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">{detalle.etiqueta}</dt>
                <dd className="truncate text-sm text-on-surface" title={detalle.valor}>{detalle.valor}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {proyecto && (proyecto.titulo || proyecto.id) && (
        <section aria-label="Proyecto relacionado" className="flex flex-wrap items-center gap-tight text-sm">
          <span className="text-text-secondary">Proyecto:</span>
          {proyecto.id ? (
            <Link href={`/dashboard/proyectos/${proyecto.id}`} className="font-semibold text-primary hover:underline">
              {proyecto.titulo ?? `Proyecto ${proyecto.id}`}
            </Link>
          ) : (
            <span className="font-semibold text-on-surface">{proyecto.titulo}</span>
          )}
        </section>
      )}

      {reunion === 'cancelada' && (
        <p role="note" className="flex items-start gap-tight rounded-card border border-error/30 bg-error/10 p-inline text-xs text-on-surface">
          <CalendarX2 className="mt-0.5 size-4 shrink-0 text-error" aria-hidden="true" />
          Esta reunión fue cancelada por Administración y ya no aparece en tu calendario.
        </p>
      )}

      {accion && (
        <div>
          <Button asChild size="sm" className="rounded-md text-[13px] font-semibold">
            <Link href={accion.href}>
              {accion.etiqueta}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}
    </article>
  );
}
