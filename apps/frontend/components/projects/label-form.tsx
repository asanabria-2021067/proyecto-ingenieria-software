'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import type { LabelDTO } from '@/lib/services/labels';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/**
 * Sin normalización NFKC ni lowercase automático (Tarea 38, sección 33): el
 * nombre solo se recorta (trim) y se limita a 255 caracteres, igual que
 * `CreateLabelDto`/`UpdateLabelDto`. El backend sigue siendo la autoridad
 * del conflicto de nombre normalizado (409).
 */
const labelSchema = z.object({
  nombreEtiqueta: z
    .string()
    .trim()
    .min(1, 'El nombre no puede estar vacío.')
    .max(255, 'El nombre no puede exceder 255 caracteres.'),
  color: z.string().regex(HEX_COLOR, 'El color debe tener el formato #RRGGBB.'),
});

export type LabelFormValues = z.infer<typeof labelSchema>;

export interface LabelFormProps {
  mode: 'create' | 'edit';
  label: LabelDTO | null;
  onSubmit: (values: LabelFormValues) => void;
  onCancel: () => void;
  isPending: boolean;
  error: string | null;
}

export function LabelForm({ mode, label, onSubmit, onCancel, isPending, error }: LabelFormProps) {
  const form = useForm<LabelFormValues>({
    resolver: zodResolver(labelSchema),
    defaultValues: {
      nombreEtiqueta: label?.nombreEtiqueta ?? '',
      color: label?.color ?? '#006735',
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="nombreEtiqueta"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre</FormLabel>
              <FormControl>
                <Input {...field} maxLength={255} placeholder="Nombre de la etiqueta" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="color"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Color</FormLabel>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Selector de color"
                  value={HEX_COLOR.test(field.value) ? field.value : '#000000'}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  className="h-9 w-9 shrink-0 rounded-md border border-outline-variant cursor-pointer bg-transparent"
                />
                <FormControl>
                  <Input
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    onBlur={field.onBlur}
                    name={field.name}
                    placeholder="#RRGGBB"
                    maxLength={7}
                    className="font-mono"
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" disabled={isPending} onClick={onCancel} className="rounded-lg">
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-primary hover:bg-primary/90 text-on-primary font-bold"
          >
            {isPending ? 'Guardando...' : mode === 'create' ? 'Crear etiqueta' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
