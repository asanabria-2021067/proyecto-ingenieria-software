'use client';

import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Check, ChevronDown, X } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SIN_ASIGNAR, SIN_ROL, type TaskFormValues } from '@/components/projects/task-form.schema';
import { candidatosResponsables } from '@/lib/tasks/extras';
import { cn } from '@/lib/utils';
import type { MiembroProyecto } from '@/hooks/use-project-members';

/** Tope del servidor: responsables además del principal. */
export const MAX_RESPONSABLES_ADICIONALES = 9;

interface Props {
  members: MiembroProyecto[];
  value: number[];
  onChange: (ids: number[]) => void;
}

/**
 * MEJ-109: selector múltiple de responsables adicionales. El principal sigue siendo el de «Usuario asignado»;
 * aquí se eligen los demás, entre quienes cumplen el rol de la tarea. Mismo patrón que el selector de etiquetas.
 */
export function TaskResponsablesField({ members, value, onChange }: Props) {
  const { watch } = useFormContext<TaskFormValues>();
  const rol = watch('idRolProyecto');
  const principal = watch('idUsuarioAsignado');
  const [open, setOpen] = useState(false);

  const candidatos = candidatosResponsables(
    members,
    rol === SIN_ROL ? null : Number(rol),
    principal === SIN_ASIGNAR ? null : Number(principal),
  );
  const seleccionados = candidatos.filter((m) => value.includes(m.idUsuario));
  const alternar = (id: number) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const lleno = seleccionados.length >= MAX_RESPONSABLES_ADICIONALES;

  return (
    <div className="space-y-1.5">
      <Label htmlFor="tarea-responsables">Responsables adicionales</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <div className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-sm transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          {seleccionados.map((m) => (
            <span
              key={m.idUsuario}
              className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-surface-container-high py-0.5 pl-2 pr-1 text-[11px] font-medium text-on-surface-variant"
            >
              <span className="truncate">
                {m.nombre} {m.apellido}
              </span>
              <button
                type="button"
                aria-label={`Quitar a ${m.nombre} ${m.apellido} de los responsables`}
                onClick={() => alternar(m.idUsuario)}
                className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-tertiary transition-colors hover:bg-surface-container-highest hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          <PopoverTrigger asChild>
            <button
              type="button"
              id="tarea-responsables"
              aria-label="Seleccionar responsables adicionales"
              aria-expanded={open}
              className="inline-flex min-w-0 flex-1 items-center justify-between gap-2 rounded-sm px-1 py-1 text-left text-sm text-on-surface-variant focus-visible:outline-none"
            >
              <span className={cn('truncate', seleccionados.length > 0 && 'sr-only')}>Selecciona responsables</span>
              <ChevronDown className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
            </button>
          </PopoverTrigger>
        </div>
        <PopoverContent
          align="start"
          className="w-[--radix-popover-trigger-width] min-w-56 rounded-lg border-outline-variant bg-surface-container-lowest p-1.5"
        >
          {candidatos.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-tertiary">No hay más integrantes con este rol.</p>
          ) : (
            <div
              role="listbox"
              aria-multiselectable="true"
              aria-label="Integrantes del proyecto"
              className="max-h-64 space-y-0.5 overflow-y-auto"
            >
              {candidatos.map((m) => {
                const marcado = value.includes(m.idUsuario);
                return (
                  <button
                    key={m.idUsuario}
                    type="button"
                    role="option"
                    aria-selected={marcado}
                    disabled={!marcado && lleno}
                    onClick={() => alternar(m.idUsuario)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:opacity-50',
                      marcado && 'bg-surface-container-high/60',
                    )}
                  >
                    <Avatar className="size-5 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-[9px] font-bold text-primary">
                        {`${m.nombre.charAt(0)}${m.apellido.charAt(0)}`.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-on-surface">
                      {m.nombre} {m.apellido}
                    </span>
                    {marcado && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>
      <p className="text-xs text-tertiary">
        Cada responsable registra sus propias horas. El usuario asignado sigue siendo el principal.
      </p>
    </div>
  );
}
