'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { DashboardSearchField, DASHBOARD_FILTER_TRIGGER_CLASS } from '@/components/dashboard/dashboard-search-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SEGMENTED_ITEM_CLASS, ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SIN_PROYECTO, type ProyectoDeNotificaciones } from '@/lib/services/notifications';
import { INBOX_CATEGORIES } from '@/lib/notifications/inbox-model';
import type { NotificationGroupId } from '@/lib/notifications/preference-groups';
import { cn } from '@/lib/utils';

export type InboxReadTab = 'todas' | 'no-leidas' | 'leidas';
export type InboxProjectFilter = number | typeof SIN_PROYECTO | null;

interface InboxToolbarProps {
  busqueda: string;
  onBusqueda: (valor: string) => void;
  proyecto: InboxProjectFilter;
  onProyecto: (valor: InboxProjectFilter) => void;
  proyectos: ProyectoDeNotificaciones[];
  orden: 'desc' | 'asc';
  onOrden: (valor: 'desc' | 'asc') => void;
  lectura: InboxReadTab;
  onLectura: (valor: InboxReadTab) => void;
  /** Solo en móvil (la sidebar de carpetas no se muestra): categoría activa. */
  categoria: NotificationGroupId | null;
  onCategoria: (valor: NotificationGroupId | null) => void;
}

const TODOS = '__ALL__';
const TRIGGER = `${DASHBOARD_FILTER_TRIGGER_CLASS} h-9.5 py-0 text-[13px]`;
const ITEM = 'focus:bg-primary focus:text-on-primary';

/** Buscador con retardo: el servidor recibe el texto 300 ms después de la última tecla. */
export const BUSQUEDA_DEBOUNCE_MS = 300;

/**
 * Barra de búsqueda y filtros de la bandeja (§3.2–3.5): buscador estándar,
 * proyecto, orden y pestañas de lectura con el segmented control existente.
 * Sin atajo Ctrl/Cmd+K: ya lo usa el buscador global de UVGenius.
 */
export function InboxToolbar({ busqueda, onBusqueda, proyecto, onProyecto, proyectos, orden, onOrden, lectura, onLectura, categoria, onCategoria }: InboxToolbarProps) {
  const [texto, setTexto] = useState(busqueda);
  // Si el padre limpia o cambia la búsqueda, el campo la adopta (patrón
  // «derivar estado de props» sin efecto).
  const [busquedaPrevia, setBusquedaPrevia] = useState(busqueda);
  if (busquedaPrevia !== busqueda) {
    setBusquedaPrevia(busqueda);
    setTexto(busqueda);
  }
  useEffect(() => {
    if (texto === busqueda) return;
    const timer = setTimeout(() => onBusqueda(texto), BUSQUEDA_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [texto, busqueda, onBusqueda]);

  const valorProyecto = proyecto === null ? TODOS : String(proyecto);

  return (
    <div className="flex flex-col gap-tight border-b border-outline-variant/60 px-inline py-tight">
      <div className="relative">
        <DashboardSearchField
          aria-label="Buscar notificaciones por título o contenido"
          placeholder="Buscar por título o contenido..."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && texto) {
              e.preventDefault();
              setTexto('');
              onBusqueda('');
            }
          }}
          className={cn('h-9.5 py-0 text-[13px]', texto && 'pr-9')}
        />
        {texto && (
          <button
            type="button"
            onClick={() => {
              setTexto('');
              onBusqueda('');
            }}
            aria-label="Limpiar búsqueda"
            className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-text-secondary motion-icon hover:bg-surface-container hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-tight">
        <Select value={valorProyecto} onValueChange={(v) => onProyecto(v === TODOS ? null : v === SIN_PROYECTO ? SIN_PROYECTO : Number(v))}>
          <SelectTrigger aria-label="Filtrar por proyecto" className={cn(TRIGGER, 'min-w-0 flex-1 basis-40')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-50">
            <SelectItem value={TODOS} className={ITEM}>Todos los proyectos</SelectItem>
            {proyectos.map((p) => (
              <SelectItem key={p.idProyecto} value={String(p.idProyecto)} className={ITEM}>
                {p.tituloProyecto}
              </SelectItem>
            ))}
            <SelectItem value={SIN_PROYECTO} className={ITEM}>Avisos sin proyecto</SelectItem>
          </SelectContent>
        </Select>

        <Select value={orden} onValueChange={(v) => onOrden(v === 'asc' ? 'asc' : 'desc')}>
          <SelectTrigger aria-label="Ordenar por fecha" className={cn(TRIGGER, 'w-34 shrink-0')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-50">
            <SelectItem value="desc" className={ITEM}>Más recientes</SelectItem>
            <SelectItem value="asc" className={ITEM}>Más antiguas</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoria ?? TODOS} onValueChange={(v) => onCategoria(v === TODOS ? null : (v as NotificationGroupId))}>
          <SelectTrigger aria-label="Filtrar por categoría" className={cn(TRIGGER, 'w-full md:hidden')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-50">
            <SelectItem value={TODOS} className={ITEM}>Todas las categorías</SelectItem>
            {INBOX_CATEGORIES.map((c) => (
              <SelectItem key={c.id} value={c.id} className={ITEM}>
                {c.titulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={lectura}
        onValueChange={(v) => v && onLectura(v as InboxReadTab)}
        aria-label="Estado de lectura"
        className="w-full"
      >
        <ToggleGroupItem value="todas" className={SEGMENTED_ITEM_CLASS}>Todas</ToggleGroupItem>
        <ToggleGroupItem value="no-leidas" className={SEGMENTED_ITEM_CLASS}>No leídas</ToggleGroupItem>
        <ToggleGroupItem value="leidas" className={SEGMENTED_ITEM_CLASS}>Leídas</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
