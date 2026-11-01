'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SemestreHorasFields } from '@/components/hours/semestre-horas-fields';
import { useGuardarHorasActual, useHorasActual } from '@/hooks/use-horas-semestre';
import { useCurrentUser } from '@/hooks/use-current-user';
import { datosDeForm, erroresForm, etiquetaSemestre, formDesdeRegistro } from '@/lib/hours/semestre';
import type { HorasActual } from '@/lib/services/horas-semestre';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Formulario({ actual, onClose }: { actual: HorasActual; onClose: () => void }) {
  const { data: user } = useCurrentUser();
  const guardar = useGuardarHorasActual();
  // El contenido del dialogo se monta al abrir, asi que el estado inicial siempre sale del registro vigente.
  const [form, setForm] = useState(() => formDesdeRegistro(actual.registro, user?.perfil ?? undefined));
  const invalido = Object.keys(erroresForm(form)).length > 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-headline text-xl font-extrabold text-on-surface">Horas del semestre</DialogTitle>
        <DialogDescription className="text-tertiary">{etiquetaSemestre(actual.semestre)}</DialogDescription>
      </DialogHeader>
      <SemestreHorasFields value={form} onChange={setForm} idBase="editar-horas" />
      {guardar.isError && (
        <p role="alert" className="type-meta text-error">
          No pudimos guardar tus horas. Inténtalo de nuevo.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={invalido || guardar.isPending}
          onClick={() => guardar.mutate(datosDeForm(form), { onSuccess: onClose })}
        >
          {guardar.isPending ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </>
  );
}

/** Edita el registro del semestre actual desde el perfil o «Mis horas». */
export function EditarHorasSemestreDialog({ open, onOpenChange }: Props) {
  const { data: actual } = useHorasActual();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-surface sm:max-w-lg">
        {actual ? (
          <Formulario actual={actual} onClose={() => onOpenChange(false)} />
        ) : (
          <DialogHeader>
            <DialogTitle>Horas del semestre</DialogTitle>
            <DialogDescription>Cargando...</DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}
