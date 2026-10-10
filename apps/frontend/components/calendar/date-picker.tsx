'use client';

import { useState, type ComponentProps } from 'react';
import { es } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

function formatFecha(date: Date): string {
  return date.toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * HU-184 (T-323): selector de día con el Calendar del sistema dentro de un
 * Popover, en vez del `datetime-local` nativo (que cambia de forma y de
 * idioma según el navegador). El resto de props (id, aria-*) van al botón,
 * así funciona dentro de `FormControl`.
 */
export function DatePicker({
  value,
  onChange,
  disabledBefore,
  disabled,
  placeholder = 'Selecciona una fecha',
  className,
  ...triggerProps
}: Omit<ComponentProps<'button'>, 'value' | 'onChange'> & {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  /** Días anteriores a este quedan deshabilitados en el calendario. */
  disabledBefore?: Date;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'h-10 w-full justify-start gap-2 rounded-md border-outline-variant px-3 text-left text-sm font-normal',
            !value && 'text-on-surface-variant',
            className,
          )}
          {...triggerProps}
        >
          <CalendarDays className="size-4 shrink-0 text-on-surface-variant" aria-hidden="true" />
          <span className="truncate capitalize">{value ? formatFecha(value) : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={es}
          weekStartsOn={1}
          selected={value}
          defaultMonth={value}
          disabled={disabledBefore ? { before: disabledBefore } : undefined}
          onSelect={(date) => {
            onChange(date);
            if (date) setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
