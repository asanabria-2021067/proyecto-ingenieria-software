'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { AnuncioAdmin, AnuncioInput } from '@/lib/services/anuncios';
import { toInput, validarFormulario, valoresIniciales, type AnuncioFormValues } from './anuncio-form';

const LABEL = 'mb-1 block text-sm font-semibold text-text-primary';
const SELECT =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-text-primary focus-visible:border-primary focus-visible:outline-none';

/** Formulario de crear/editar un anuncio. Se monta solo mientras está abierto, así parte siempre de cero. */
export function AnuncioFormDialog({
  anuncio,
  isPending,
  onSubmit,
  onClose,
}: {
  anuncio?: AnuncioAdmin;
  isPending: boolean;
  onSubmit: (input: AnuncioInput) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState<AnuncioFormValues>(() => valoresIniciales(anuncio));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof AnuncioFormValues>(k: K, valor: AnuncioFormValues[K]) => setV((p) => ({ ...p, [k]: valor }));

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent>
        <form
          noValidate
          className="flex flex-col gap-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const mensaje = validarFormulario(v);
            setError(mensaje);
            if (!mensaje) onSubmit(toInput(v));
          }}
        >
          <DialogHeader>
            <DialogTitle>{anuncio ? 'Editar anuncio' : 'Nuevo anuncio'}</DialogTitle>
            <DialogDescription>Se muestra como banner en el dashboard mientras esté vigente.</DialogDescription>
          </DialogHeader>

          <div>
            <label htmlFor="anuncio-titulo" className={LABEL}>Título</label>
            <Input id="anuncio-titulo" maxLength={120} value={v.titulo} onChange={(e) => set('titulo', e.target.value)} />
          </div>
          <div>
            <label htmlFor="anuncio-mensaje" className={LABEL}>Mensaje</label>
            <Textarea id="anuncio-mensaje" maxLength={1000} value={v.mensaje} onChange={(e) => set('mensaje', e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-stack sm:grid-cols-2">
            <div>
              <label htmlFor="anuncio-nivel" className={LABEL}>Nivel</label>
              <select id="anuncio-nivel" className={SELECT} value={v.nivel} onChange={(e) => set('nivel', e.target.value as AnuncioFormValues['nivel'])}>
                <option value="INFO">Información</option>
                <option value="ADVERTENCIA">Advertencia</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </div>
            <div>
              <label htmlFor="anuncio-audiencia" className={LABEL}>Audiencia</label>
              <select id="anuncio-audiencia" className={SELECT} value={v.audiencia} onChange={(e) => set('audiencia', e.target.value as AnuncioFormValues['audiencia'])}>
                <option value="TODOS">Todos</option>
                <option value="ESTUDIANTES">Solo estudiantes</option>
              </select>
            </div>
            <div>
              <label htmlFor="anuncio-inicio" className={LABEL}>Inicio</label>
              <Input id="anuncio-inicio" type="datetime-local" value={v.fechaInicio} onChange={(e) => set('fechaInicio', e.target.value)} />
            </div>
            <div>
              <label htmlFor="anuncio-fin" className={LABEL}>Fin</label>
              <Input id="anuncio-fin" type="datetime-local" value={v.fechaFin} onChange={(e) => set('fechaFin', e.target.value)} />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm font-medium text-error">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
