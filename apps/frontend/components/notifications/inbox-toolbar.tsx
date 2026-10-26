'use client';

import { useEffect, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  /** Categoría activa (grupos reales de preference-groups.ts); `null` = todas. */
  categoria: NotificationGroupId | null;
  onCategoria: (valor: NotificationGroupId | null) => void;
}

const TODOS = '__ALL__';
const TRIGGER = `${DASHBOARD_FILTER_TRIGGER_CLASS} h-9.5 py-0 text-[13px]`;
const ITEM = 'focus:bg-primary focus:text-on-primary';
/** Mismo fondo blanco que la búsqueda y los selects; activo y hover siguen en verde. */
const SEGMENTO = cn(SEGMENTED_ITEM_CLASS, 'bg-surface-container-lowest');

/** Buscador con retardo: el servidor recibe el texto 300 ms después de la última tecla. */
export const BUSQUEDA_DEBOUNCE_MS = 300;

/**
 * Barra de búsqueda y filtros de la bandeja: buscador estándar, categoría y
 * proyecto (selects), pestañas de lectura (segmented control existente) y el
 * botón de dos estados para el orden. Única fuente del estado de lectura.
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

      {/* Categoría y proyecto en una fila; en anchos estrechos cada uno baja a su propia línea. */}
      <div className="flex flex-wrap items-center gap-tight">
        <Select value={categoria ?? TODOS} onValueChange={(v) => onCategoria(v === TODOS ? null : (v as NotificationGroupId))}>
          <SelectTrigger aria-label="Filtrar por categoría" className={cn(TRIGGER, 'min-w-0 flex-1 basis-44')}>
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

        <Select value={valorProyecto} onValueChange={(v) => onProyecto(v === TODOS ? null : v === SIN_PROYECTO ? SIN_PROYECTO : Number(v))}>
          <SelectTrigger aria-label="Filtrar por proyecto" className={cn(TRIGGER, 'min-w-0 flex-1 basis-44')}>
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
      </div>

      <div className="flex flex-wrap items-center gap-tight">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={lectura}
          onValueChange={(v) => v && onLectura(v as InboxReadTab)}
          aria-label="Estado de lectura"
          className="min-w-0 flex-1 basis-56"
        >
          <ToggleGroupItem value="todas" className={SEGMENTO}>Todas</ToggleGroupItem>
          <ToggleGroupItem value="no-leidas" className={SEGMENTO}>No leídas</ToggleGroupItem>
          <ToggleGroupItem value="leidas" className={SEGMENTO}>Leídas</ToggleGroupItem>
        </ToggleGroup>
        {/* Orden: un solo botón de dos estados (desc = más recientes primero). */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOrden(orden === 'desc' ? 'asc' : 'desc')}
          aria-label={orden === 'desc' ? 'Orden: más recientes primero. Cambiar a más antiguas primero' : 'Orden: más antiguas primero. Cambiar a más recientes primero'}
          data-orden={orden}
          className="ml-auto shrink-0 rounded-md bg-surface-container-lowest text-[13px] font-semibold dark:bg-surface-container-lowest"
        >
          {orden === 'desc' ? <ArrowDownWideNarrow className="size-4" aria-hidden="true" /> : <ArrowUpNarrowWide className="size-4" aria-hidden="true" />}
          {orden === 'desc' ? 'Más recientes' : 'Más antiguas'}
        </Button>
      </div>
    </div>
  );
}
