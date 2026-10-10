'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { AgendaItem } from '@/lib/calendar/agenda';
import { MODALIDAD_ESTILO } from '@/lib/calendar/modalidad';
import { TIPO_EVENTO_ESTILO, TONO_CLASES } from '@/lib/calendar/paleta';
import { tonoDeEvento } from '@/lib/calendar/time-grid';

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
 * de texto ("Evento" vs. estado de la tarea), nunca solo por color. HU-184:
 * el ícono del evento lleva el color de su tipo (lib/calendar/paleta.ts) y la
 * pill nombra tipo y modalidad en texto; lo que viene de un calendario
 * compartido dice de quién es y sus tareas no son navegables.
 */
export function AgendaItemRow({
  item,
  onSelectEvento,
}: {
  item: AgendaItem;
  /** HU-184 (T-324): el clic en un evento abre su detalle. */
  onSelectEvento?: (item: Extract<AgendaItem, { kind: 'evento' }>) => void;
}) {
  if (item.kind === 'tarea') {
    const clase = `flex flex-wrap items-center gap-3 rounded-xl border-l-4 bg-surface-container-low px-4 py-3 ${PRIORIDAD_BORDE[item.prioridad]}`;
    const contenido = (
      <>
        <span className="min-w-[10rem] flex-1 truncate text-sm text-on-surface">{item.titulo}</span>
        <span className="shrink-0 text-xs text-tertiary">
          {item.compartidoPor ? `${item.compartidoPor.nombre} · ${item.projectTitle}` : item.projectTitle}
        </span>
        <span className="pill pill-neutral shrink-0">{PRIORIDAD_LABEL[item.prioridad]}</span>
        <span className={`pill shrink-0 ${TAREA_ESTADO_PILL[item.estado] ?? 'pill-neutral'}`}>
          {ESTADO_TAREA_LABEL[item.estado] ?? item.estado}
        </span>
      </>
    );
    if (!item.href) {
      return <div className={clase}>{contenido}</div>;
    }
    return (
      <Link href={item.href} className={`${clase} transition-colors hover:bg-surface-container`}>
        {contenido}
        <ChevronRight className="h-4 w-4 shrink-0 text-tertiary" aria-hidden="true" />
      </Link>
    );
  }

  const tipo = TIPO_EVENTO_ESTILO[item.tipo];
  const tono = TONO_CLASES[tonoDeEvento(item)];
  const modalidad = MODALIDAD_ESTILO[item.modalidad];
  return (
    <button
      type="button"
      onClick={() => onSelectEvento?.(item)}
      className={`flex w-full flex-wrap items-center gap-3 rounded-xl border-l-4 bg-surface-container-low px-4 py-3 text-left transition-colors hover:bg-surface-container ${tono.borde}`}
    >
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-control ${tono.bloque}`}>
        <tipo.icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-[10rem] flex-1 truncate text-sm text-on-surface">{item.titulo}</span>
      <span className="shrink-0 text-xs text-tertiary">
        {item.horaInicio}–{item.horaFin}
      </span>
      <span className="shrink-0 text-xs text-tertiary">
        {item.compartidoPor ? `${item.compartidoPor.nombre} · ${item.projectTitle}` : item.projectTitle}
      </span>
      <span className="pill pill-neutral inline-flex shrink-0 items-center gap-1">
        <modalidad.icon className="size-3" aria-hidden="true" />
        {tipo.label} · {modalidad.label}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-tertiary" aria-hidden="true" />
    </button>
  );
}
