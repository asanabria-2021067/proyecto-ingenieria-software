'use client';

import { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProjectTasks } from '@/hooks/use-project-tasks';
import { useTaskTemplates } from '@/hooks/use-task-extras';
import {
  REPETICION_LABEL,
  candidatosBloqueo,
  valoresDePlantilla,
  type TaskExtrasValue,
} from '@/lib/tasks/extras';
import type { TaskFormValues } from '@/components/projects/task-form.schema';
import type { RepeticionTarea } from '@/lib/types/tasks';

const NINGUNA = 'ninguna';

interface Props {
  idProyecto: number;
  mode: 'create' | 'edit';
  /** Tarea que se edita (null al crear): no puede bloquearse a sí misma. */
  idTareaActual: number | null;
  value: TaskExtrasValue;
  onChange: (value: TaskExtrasValue) => void;
}

/** MEJ-48 (bloqueada por), MEJ-47 (repetición) y MEJ-52 (plantilla) dentro del formulario de tarea. */
export function TaskFormExtras({ idProyecto, mode, idTareaActual, value, onChange }: Props) {
  const form = useFormContext<TaskFormValues>();
  const { tasks } = useProjectTasks(idProyecto);
  const { plantillas } = useTaskTemplates(idProyecto, mode === 'create');
  const candidatos = useMemo(() => candidatosBloqueo(tasks, idTareaActual), [tasks, idTareaActual]);

  const aplicarPlantilla = (idPlantilla: string) => {
    const plantilla = plantillas.find((p) => String(p.idPlantilla) === idPlantilla);
    if (!plantilla) return;
    const valores = valoresDePlantilla(plantilla);
    const opciones = { shouldDirty: true, shouldValidate: true } as const;
    form.setValue('tituloTarea', valores.tituloTarea, opciones);
    form.setValue('descripcionTarea', valores.descripcionTarea, opciones);
    form.setValue('prioridad', valores.prioridad, opciones);
    form.setValue('tiempoEstimadoHoras', valores.tiempoEstimadoHoras, opciones);
    onChange({ ...value, checklist: plantilla.checklist });
  };

  return (
    <div className="mt-6 space-y-4 border-t border-outline-variant/40 pt-5">
      {mode === 'create' && (
        <div className="space-y-1.5">
          <Label htmlFor="tarea-plantilla">Plantilla</Label>
          {plantillas.length === 0 ? (
            <p className="text-xs text-tertiary">
              El proyecto aún no tiene plantillas. El líder puede crearlas desde «Plantillas» en el tablero.
            </p>
          ) : (
            <>
              <Select onValueChange={aplicarPlantilla}>
                <SelectTrigger id="tarea-plantilla" className="h-9 w-full bg-surface-container-lowest">
                  <SelectValue placeholder="Empezar desde una plantilla (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {plantillas.map((p) => (
                    <SelectItem key={p.idPlantilla} value={String(p.idPlantilla)}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {value.checklist.length > 0 && (
                <p className="text-xs text-tertiary">
                  Se creará con {value.checklist.length} {value.checklist.length === 1 ? 'paso' : 'pasos'} de checklist.
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tarea-bloqueante">Bloqueada por</Label>
          <Select
            value={value.idTareaBloqueante === null ? NINGUNA : String(value.idTareaBloqueante)}
            onValueChange={(v) => onChange({ ...value, idTareaBloqueante: v === NINGUNA ? null : Number(v) })}
          >
            <SelectTrigger id="tarea-bloqueante" className="h-9 w-full bg-surface-container-lowest">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NINGUNA}>Ninguna</SelectItem>
              {candidatos.map((t) => (
                <SelectItem key={t.idTarea} value={String(t.idTarea)}>
                  {t.tituloTarea}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-tertiary">No podrá empezar hasta que esa tarea esté en Hecho.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tarea-repeticion">Repetir</Label>
          <Select
            value={value.repeticion ?? NINGUNA}
            onValueChange={(v) => onChange({ ...value, repeticion: v === NINGUNA ? null : (v as RepeticionTarea) })}
          >
            <SelectTrigger id="tarea-repeticion" className="h-9 w-full bg-surface-container-lowest">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NINGUNA}>No se repite</SelectItem>
              {(Object.keys(REPETICION_LABEL) as RepeticionTarea[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {REPETICION_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-tertiary">Se crea una copia en el sprint activo en cada ocurrencia.</p>
        </div>
      </div>
    </div>
  );
}
