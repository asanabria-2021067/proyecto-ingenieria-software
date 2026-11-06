'use client';

import { useState } from 'react';
import { ListChecks, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { aviso } from '@/lib/mensajes';
import { useTaskChecklist } from '@/hooks/use-task-extras';
import type { ChecklistItemDTO } from '@/lib/types/tasks';

/** Avance del checklist: `hechos/total` y porcentaje entero (0 si no hay elementos). */
export function resumenChecklist(items: ChecklistItemDTO[]): { hechos: number; total: number; porcentaje: number } {
  const hechos = items.filter((i) => i.completado).length;
  return { hechos, total: items.length, porcentaje: items.length === 0 ? 0 : Math.round((hechos / items.length) * 100) };
}

interface Props {
  idProyecto: number;
  idTarea: number;
  items: ChecklistItemDTO[];
  /** Líder o asignado activo (misma regla que cambiar el estado). */
  puedeEditar: boolean;
  tituloTarea: string;
}

/** MEJ-6: checklist de la tarea con avance; la lista llega dentro de la tarea. */
export function TaskChecklist({ idProyecto, idTarea, items, puedeEditar, tituloTarea }: Props) {
  const { agregar, actualizar, quitar } = useTaskChecklist(idProyecto, idTarea);
  const [texto, setTexto] = useState('');
  const { hechos, total, porcentaje } = resumenChecklist(items);
  const ocupado = agregar.isPending || actualizar.isPending || quitar.isPending;

  const onError = (err: unknown) => aviso.error('No se pudo actualizar el checklist', getApiErrorMessage(err, 'task'));

  const agregarItem = (event: React.FormEvent) => {
    event.preventDefault();
    const limpio = texto.trim();
    if (!limpio) return;
    agregar.mutate(limpio, { onSuccess: () => setTexto(''), onError });
  };

  return (
    <section
      className="rounded-[11px] border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm"
      aria-labelledby="checklist-titulo"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="checklist-titulo" className="type-section flex items-center gap-2">
          <ListChecks className="size-4 text-tertiary" aria-hidden="true" />
          Checklist
        </h2>
        {total > 0 && (
          <span className="text-xs font-semibold text-tertiary" aria-label={`${hechos} de ${total} completados`}>
            {hechos}/{total}
          </span>
        )}
      </div>

      {total > 0 && (
        <Progress value={porcentaje} aria-label={`Avance del checklist: ${porcentaje}%`} className="mb-3 h-1.5" />
      )}

      {total === 0 ? (
        <p className="text-sm italic text-tertiary">
          {puedeEditar
            ? 'Esta tarea aún no tiene pasos. Agrega el primero para llevar su avance.'
            : 'Esta tarea no tiene pasos en su checklist.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.idItem} className="group flex items-start gap-2.5">
              <Checkbox
                id={`checklist-${item.idItem}`}
                checked={item.completado}
                disabled={!puedeEditar || ocupado}
                onCheckedChange={(valor) =>
                  actualizar.mutate({ idItem: item.idItem, completado: valor === true }, { onError })
                }
                className="mt-0.5"
              />
              <label
                htmlFor={`checklist-${item.idItem}`}
                className={`min-w-0 flex-1 wrap-break-word text-sm ${
                  item.completado ? 'text-tertiary line-through' : 'text-on-surface'
                }`}
              >
                {item.texto}
              </label>
              {puedeEditar && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={ocupado}
                  onClick={() => quitar.mutate(item.idItem, { onError })}
                  aria-label={`Quitar «${item.texto}» del checklist`}
                  className="size-6 text-tertiary hover:text-destructive"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeEditar && (
        <form onSubmit={agregarItem} className="mt-3 flex gap-2">
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={200}
            placeholder="Nuevo paso"
            aria-label={`Nuevo paso del checklist de ${tituloTarea}`}
            className="h-9 flex-1"
          />
          <Button type="submit" size="sm" disabled={ocupado || texto.trim() === ''} className="h-9 gap-1.5">
            <Plus className="size-4" aria-hidden="true" />
            Agregar
          </Button>
        </form>
      )}
    </section>
  );
}
