'use client';

import { ChevronDown, ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TIPO_EVENTO_ESTILO, TIPOS_EVENTO_EN_ORDEN, TONO_CLASES } from '@/lib/calendar/paleta';
import type { TipoEvento } from '@/lib/services/events';

/**
 * HU-184 (T-324): filtro "Todos los eventos (N)" de la maqueta. Muestra u
 * oculta las fechas límite de tareas y cada tipo de evento; cada tipo lleva
 * su color, así que el menú sirve también de leyenda. N cuenta lo que queda
 * visible en el rango.
 */
export function CalendarFilterMenu({
  total,
  mostrarTareas,
  onToggleTareas,
  tiposOcultos,
  onToggleTipo,
  onMostrarTodo,
}: {
  total: number;
  mostrarTareas: boolean;
  onToggleTareas: () => void;
  tiposOcultos: Set<TipoEvento>;
  onToggleTipo: (tipo: TipoEvento) => void;
  onMostrarTodo: () => void;
}) {
  const filtrando = !mostrarTareas || tiposOcultos.size > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="h-9 gap-1.5 rounded-md border-outline-variant text-xs font-bold">
          <ListFilter className="size-4" aria-hidden="true" />
          {filtrando ? 'Eventos filtrados' : 'Todos los eventos'} ({total})
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Mostrar</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={mostrarTareas}
          onCheckedChange={onToggleTareas}
          onSelect={(e) => e.preventDefault()}
        >
          <span className="size-2 shrink-0 rounded-pill bg-primary" aria-hidden="true" />
          Fechas límite de tareas
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Tipos de actividad</DropdownMenuLabel>
        {TIPOS_EVENTO_EN_ORDEN.map((tipo) => {
          const estilo = TIPO_EVENTO_ESTILO[tipo];
          return (
            <DropdownMenuCheckboxItem
              key={tipo}
              checked={!tiposOcultos.has(tipo)}
              onCheckedChange={() => onToggleTipo(tipo)}
              onSelect={(e) => e.preventDefault()}
            >
              <span className={`size-2 shrink-0 rounded-pill ${TONO_CLASES[estilo.tono].punto}`} aria-hidden="true" />
              {estilo.label}
            </DropdownMenuCheckboxItem>
          );
        })}
        {filtrando && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onMostrarTodo}>Mostrar todo</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
