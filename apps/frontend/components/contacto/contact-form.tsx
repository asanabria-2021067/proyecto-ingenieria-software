'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Send } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { CONTACTO_LIMITES, contactFormSchema, type ContactFormValues } from './contact-form.schema';

export interface ContactFormProps {
  defaultValues: ContactFormValues;
  onSubmit: (values: ContactFormValues) => Promise<unknown>;
  isPending: boolean;
}

const INPUT_CLASS = 'h-11 rounded-xl bg-white px-4 text-on-surface dark:bg-surface-container';

export function ContactForm({ defaultValues, onSubmit, isPending }: ContactFormProps) {
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues,
  });
  const mensaje = useWatch({ control: form.control, name: 'mensaje' }) ?? '';

  async function enviar(values: ContactFormValues) {
    try {
      await onSubmit(values);
    } catch {
      return;
    }
    form.reset(defaultValues);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(enviar)} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="nombre"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoComplete="name"
                    maxLength={CONTACTO_LIMITES.nombre}
                    placeholder="Tu nombre completo"
                    className={INPUT_CLASS}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="correo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Correo</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    autoComplete="email"
                    maxLength={CONTACTO_LIMITES.correo}
                    placeholder="usuario@uvg.edu.gt"
                    className={INPUT_CLASS}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="asunto"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Asunto</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  maxLength={CONTACTO_LIMITES.asunto}
                  placeholder="¿En qué te podemos ayudar?"
                  className={INPUT_CLASS}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="mensaje"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between gap-2">
                <FormLabel>Mensaje</FormLabel>
                <span className="text-xs text-tertiary" aria-live="polite">
                  {mensaje.length}/{CONTACTO_LIMITES.mensaje}
                </span>
              </div>
              <FormControl>
                <Textarea
                  {...field}
                  rows={6}
                  maxLength={CONTACTO_LIMITES.mensaje}
                  placeholder="Cuéntanos con detalle qué necesitas."
                  className="min-h-36 rounded-xl bg-white px-4 py-3 text-on-surface dark:bg-surface-container"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={isPending}
          className="h-12 w-full rounded-xl bg-primary-container font-headline font-bold text-white shadow-lg shadow-green-900/20 transition-all hover:bg-primary active:scale-[0.98]"
        >
          {isPending ? <Spinner aria-hidden="true" /> : <Send aria-hidden="true" />}
          {isPending ? 'Enviando...' : 'Enviar mensaje'}
        </Button>
      </form>
    </Form>
  );
}

export function ContactFormSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-12 rounded-xl" />
    </div>
  );
}
