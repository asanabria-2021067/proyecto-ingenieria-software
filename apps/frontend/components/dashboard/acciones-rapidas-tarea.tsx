'use client';

import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { ESTADO_LABEL } from '@/components/projects/task-board.utils';
import { projectAvanceQueryKey, projectTasksQueryKey } from '@/lib/query-keys/tasks';
import { registrarHorasTarea } from '@/lib/services/task-hours';
import { updateTaskEstado } from '@/lib/services/tasks';
import type { MiTareaDTO } from '@/lib/services/users';
import type { EstadoTarea } from '@/lib/types/tasks';

/** Día local YYYY-MM-DD (no UTC: de noche en Guatemala el día UTC ya es mañana). */
function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Horas como número positivo con hasta dos decimales; null si no es válido. */
export function parseHorasRapidas(texto: string): number | null {
  const n = Number(texto.replace(',', '.'));
  return texto.trim() !== '' && Number.isFinite(n) && n >= 0.01 && n <= 24 ? Math.round(n * 100) / 100 : null;
}

function DialogoHoras({ tarea, open, onOpenChange }: { tarea: MiTareaDTO; open: boolean; onOpenChange: (v: boolean) => void }) {
  const id = useId();
  const queryClient = useQueryClient();
  const [horas, setHoras] = useState('');
  const registrar = useMutation({
    mutationFn: (valor: number) =>
      registrarHorasTarea(tarea.proyecto.idProyecto, tarea.idTarea, { horas: valor, fecha: hoyLocal() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(tarea.proyecto.idProyecto) });
      void queryClient.invalidateQueries({ queryKey: projectAvanceQueryKey(tarea.proyecto.idProyecto) });
      void queryClient.invalidateQueries({ queryKey: ['mis-horas'] });
      setHoras('');
      onOpenChange(false);
    },
  });
  const valor = parseHorasRapidas(horas);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-headline text-xl font-extrabold text-on-surface">Registrar horas</DialogTitle>
          <DialogDescription className="text-tertiary">
            {tarea.tituloTarea} · hoy. Para agregar una nota, registrar otro día o justificar un exceso sobre la estimación, abre la tarea.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (valor !== null) registrar.mutate(valor);
          }}
        >
          <div className="flex flex-col gap-tight">
            <Label htmlFor={`${id}-horas`}>Horas trabajadas</Label>
            <Input
              id={`${id}-horas`}
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ej. 1.5"
              value={horas}
              onChange={(e) => setHoras(e.target.value)}
              aria-invalid={horas.trim() !== '' && valor === null}
            />
            {horas.trim() !== '' && valor === null && (
              <p className="type-meta text-error">Escribe un número entre 0.01 y 24.</p>
            )}
          </div>
          {registrar.isError && (
            <p role="alert" className="type-meta text-error">
              {getApiErrorMessage(registrar.error, 'hours')}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={valor === null || registrar.isPending}>
              {registrar.isPending ? 'Guardando...' : 'Registrar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** MEJ-8: cambiar el estado y registrar horas de hoy sin salir de «Mis tareas». */
export function AccionesRapidasTarea({ tarea }: { tarea: MiTareaDTO }) {
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const estado = useMutation({
    mutationFn: (estadoTarea: EstadoTarea) => updateTaskEstado(tarea.proyecto.idProyecto, tarea.idTarea, { estadoTarea }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mis-tareas'] });
      void queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(tarea.proyecto.idProyecto) });
      void queryClient.invalidateQueries({ queryKey: projectAvanceQueryKey(tarea.proyecto.idProyecto) });
    },
  });

  return (
    // z-10: queda por encima del enlace que se estira sobre toda la fila.
    <div className="relative z-10 flex flex-wrap items-center gap-tight">
      <Select value={tarea.estadoTarea} onValueChange={(v) => estado.mutate(v as EstadoTarea)} disabled={estado.isPending}>
        <SelectTrigger size="sm" aria-label={`Cambiar estado de ${tarea.tituloTarea}`} className="h-8 w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(ESTADO_LABEL).map(([valor, etiqueta]) => (
            <SelectItem key={valor} value={valor}>
              {etiqueta}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setAbierto(true)}
        aria-label={`Registrar horas en ${tarea.tituloTarea}`}
      >
        <Clock aria-hidden="true" />
        Horas
      </Button>
      {estado.isError && (
        <p role="alert" className="type-meta basis-full text-error">
          {getApiErrorMessage(estado.error, 'general')}
        </p>
      )}
      {abierto && <DialogoHoras tarea={tarea} open={abierto} onOpenChange={setAbierto} />}
    </div>
  );
}
