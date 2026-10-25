'use client';

import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { DASHBOARD_FILTER_TRIGGER_CLASS } from './dashboard-search-field';

export interface FilterOption {
  id: number;
  nombre: string;
}

/** Forma de `SelectTrigger` (components/ui/select.tsx) para un botón; el tamaño lo da `DASHBOARD_FILTER_TRIGGER_CLASS`. */
const TRIGGER_CLASS =
  'flex items-center justify-between gap-2 rounded-md border px-3 text-left whitespace-nowrap shadow-xs outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';

/**
 * Opción con el resaltado de `SelectItem` (verde con texto claro) y la marca a
 * la derecha, como en los selectores de Mis Proyectos.
 */
const ITEM_CLASS =
  'cursor-default rounded-lg py-1.5 pr-8 pl-2 focus:bg-primary focus:text-on-primary focus:[&_*]:text-on-primary data-[state=checked]:font-semibold [&>span:first-child]:right-2 [&>span:first-child]:left-auto';

/**
 * Filtro de selección múltiple con la apariencia de los filtros del dashboard
 * (`Select` + `DASHBOARD_FILTER_TRIGGER_CLASS`). Es un menú de casillas: el
 * menú sigue abierto al marcar varias (como el filtro del calendario), el
 * disparador cuenta las elegidas y la flecha gira al abrir.
 */
export function DashboardFilterMultiSelect({
  label,
  ariaLabel,
  options,
  value,
  onChange,
  className,
}: {
  /** Texto visible del disparador, p. ej. «Habilidades». */
  label: string;
  /** Nombre accesible; el conteo se le añade solo. */
  ariaLabel: string;
  options: readonly FilterOption[];
  value: readonly number[];
  onChange: (ids: number[]) => void;
  className?: string;
}) {
  const elegidas = value.length;
  const alternar = (id: number) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={options.length === 0}>
        <button
          type="button"
          aria-label={elegidas > 0 ? `${ariaLabel}, ${elegidas} ${elegidas === 1 ? 'seleccionada' : 'seleccionadas'}` : ariaLabel}
          className={cn(TRIGGER_CLASS, DASHBOARD_FILTER_TRIGGER_CLASS, className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{label}</span>
            {elegidas > 0 && <span className="pill pill-accent pill-sm tabular-nums">{elegidas}</span>}
          </span>
          <ChevronDown
            className="size-4 shrink-0 opacity-50 transition-transform duration-200 motion-reduce:transition-none in-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 min-w-(--radix-dropdown-menu-trigger-width) rounded-xl shadow-lg"
      >
        {options.map((opcion) => (
          <DropdownMenuCheckboxItem
            key={opcion.id}
            checked={value.includes(opcion.id)}
            onCheckedChange={() => alternar(opcion.id)}
            onSelect={(e) => e.preventDefault()}
            className={ITEM_CLASS}
          >
            {opcion.nombre}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
