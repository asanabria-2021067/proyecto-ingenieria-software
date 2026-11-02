'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { AsociacionAdmin, AsociacionInput } from '@/lib/services/asociaciones';
import type { Carrera } from '@/lib/services/catalogs';

const LABEL = 'mb-1 block text-sm font-semibold text-text-primary';

/** Crear o editar una asociación (nombre, descripción y carreras que representa). Se monta solo mientras está abierto. */
export function AsociacionFormDialog({
  asociacion,
  carreras,
  isPending,
  onSubmit,
  onClose,
}: {
  asociacion?: AsociacionAdmin;
  carreras: Carrera[];
  isPending: boolean;
  onSubmit: (input: AsociacionInput) => void;
  onClose: () => void;
}) {
  const [nombre, setNombre] = useState(asociacion?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(asociacion?.descripcion ?? '');
  const [ids, setIds] = useState<number[]>(asociacion?.carreras.map((c) => c.carrera.idCarrera) ?? []);
  const [error, setError] = useState<string | null>(null);

  const alternar = (id: number, marcada: boolean) => setIds((actual) => (marcada ? [...actual, id] : actual.filter((x) => x !== id)));

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent>
        <form
          noValidate
          className="flex flex-col gap-stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (nombre.trim().length < 3) return setError('El nombre debe tener al menos 3 caracteres.');
            if (ids.length === 0) return setError('Elige al menos una carrera que represente la asociación.');
            setError(null);
            onSubmit({ nombre: nombre.trim(), descripcion: descripcion.trim() || undefined, idsCarreras: ids });
          }}
        >
          <DialogHeader>
            <DialogTitle>{asociacion ? 'Editar asociación' : 'Nueva asociación'}</DialogTitle>
            <DialogDescription>Su junta verá el avance de horas de los estudiantes de las carreras que elijas.</DialogDescription>
          </DialogHeader>

          <div>
            <label htmlFor="aso-nombre" className={LABEL}>
              Nombre
            </label>
            <Input id="aso-nombre" maxLength={255} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div>
            <label htmlFor="aso-descripcion" className={LABEL}>
              Descripción (opcional)
            </label>
            <Textarea id="aso-descripcion" maxLength={2000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          <fieldset>
            <legend className={LABEL}>Carreras que representa</legend>
            <div className="grid max-h-48 grid-cols-1 gap-tight overflow-y-auto rounded-md border border-outline-variant p-inline sm:grid-cols-2">
              {carreras.map((c) => (
                <label key={c.idCarrera} className="flex cursor-pointer items-center gap-tight text-sm">
                  <Checkbox checked={ids.includes(c.idCarrera)} onCheckedChange={(v) => alternar(c.idCarrera, v === true)} />
                  {c.nombreCarrera}
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="type-meta text-error">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
