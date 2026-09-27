'use client';

import Link from 'next/link';
import { ChevronRight, Clock } from 'lucide-react';
import type { AgendaItem } from '@/lib/calendar/agenda';

const ESTADO_TAREA_LABEL: Record<string, string> = {
  POR_HACER: 'Por hacer',
  EN_PROGRESO: 'En progreso',
  EN_REVISION: 'En revisión',
  HECHO: 'Hecho',
};

const TAREA_ESTADO_PILL: Record<string, string> = {
  POR_HACER: 'pill-neutral',
  EN_PROGRESO: 'pill-accent',
  EN_REVISION: 'pill-warning',
  HECHO: 'pill-success',
};

const PRIORIDAD_LABEL: Record<string, string> = { ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' };

/** Color por prioridad real de la tarea (dato del backend, no decorativo). */
const PRIORIDAD_BORDE: Record<string, string> = {
  ALTA: 'border-l-status-error',
  MEDIA: 'border-l-status-warning',
  BAJA: 'border-l-outline-variant',
};

/**
 * HU-169 (T-264): una fila de agenda, tarea o evento. Tareas y eventos se
 * distinguen por forma (ícono en cuadro vs. punto de prioridad) y etiqueta
 * de texto ("Evento" vs. estado de la tarea), nunca solo por color. El
 * acento del sistema de diseño marca únicamente el ícono del evento (fondo +
 * `on-accent`, la única cosa destacada del bloque); la pill "Evento" usa
 * `pill-neutral`, nunca como color de letra.
 */
export function AgendaItemRow({
  item,
  editable = false,
  onEditEvento,
}: {
  item: AgendaItem;
  /** El usuario lidera el proyecto del evento: el click abre edición en vez de navegar. */
  editable?: boolean;
  onEditEvento?: (item: Extract<AgendaItem, { kind: 'evento' }>) => void;
}) {
  if (item.kind === 'tarea') {
    return (
      <Link
        href={item.href}
        className={`flex flex-wrap items-center gap-3 rounded-xl border-l-4 bg-surface-container-low px-4 py-3 transition-colors hover:bg-surface-container ${PRIORIDAD_BORDE[item.prioridad]}`}
      >
        <span className="min-w-[10rem] flex-1 truncate text-sm text-on-surface">{item.titulo}</span>
        <span className="shrink-0 text-xs text-tertiary">{item.projectTitle}</span>
        <span className="pill pill-neutral shrink-0">{PRIORIDAD_LABEL[item.prioridad]}</span>
        <span className={`pill shrink-0 ${TAREA_ESTADO_PILL[item.estado] ?? 'pill-neutral'}`}>
          {ESTADO_TAREA_LABEL[item.estado] ?? item.estado}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-tertiary" aria-hidden="true" />
      </Link>
    );
  }

  const contenido = (
    <>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-accent text-on-accent">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-[10rem] flex-1 truncate text-sm text-on-surface">{item.titulo}</span>
      <span className="shrink-0 text-xs text-tertiary">
        {item.horaInicio}–{item.horaFin}
      </span>
      <span className="shrink-0 text-xs text-tertiary">{item.projectTitle}</span>
      <span className="pill pill-neutral shrink-0">Evento</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-tertiary" aria-hidden="true" />
    </>
  );

  if (editable) {
    return (
      <button
        type="button"
        onClick={() => onEditEvento?.(item)}
        className="flex w-full flex-wrap items-center gap-3 rounded-xl border-l-4 border-l-outline-variant bg-surface-container-low px-4 py-3 text-left transition-colors hover:bg-surface-container"
      >
        {contenido}
      </button>
    );
  }

  return (
    <Link
      href={item.href}
      className="flex flex-wrap items-center gap-3 rounded-xl border-l-4 border-l-outline-variant bg-surface-container-low px-4 py-3 transition-colors hover:bg-surface-container"
    >
      {contenido}
    </Link>
  );
}
