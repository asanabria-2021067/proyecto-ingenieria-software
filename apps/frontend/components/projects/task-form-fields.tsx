'use client';

import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { TaskLabelChip } from '@/components/projects/task-label-chip';
import { PRIORIDAD_LABEL } from '@/components/projects/task-board.utils';
import { SIN_ASIGNAR, SIN_HITO, SIN_ROL, type TaskFormValues } from '@/components/projects/task-form.schema';
import type { MiembroProyecto } from '@/hooks/use-project-members';
import type { LabelDTO } from '@/lib/services/labels';
import type { EtiquetaTareaDTO } from '@/lib/types/tasks';

/**
 * `TaskLabelChip` (protegido en esta tarea) espera `EtiquetaTareaDTO`
 * (incluye `nombreNormalizado`), pero el catálogo del proyecto usa
 * `LabelDTO` (sin ese campo, deliberadamente no expuesto por el backend —
 * Tarea 35). `TaskLabelChip` nunca lee `nombreNormalizado`; se completa con
 * `''` solo para satisfacer el tipo, sin normalizar ni inventar nada
 * visible.
 */
function toEtiquetaTareaDTO(etiqueta: LabelDTO): EtiquetaTareaDTO {
  return { ...etiqueta, nombreNormalizado: '' };
}

interface RolOpcion {
  idRolProyecto: number;
  nombreRol: string;
}

interface HitoOpcion {
  idHito: number;
  tituloHito: string;
}

export interface TaskFormFieldsProps {
  roles: RolOpcion[];
  milestones: HitoOpcion[];
  members: MiembroProyecto[];
  labels: LabelDTO[];
}

function candidatosParaRol(rol: string, members: MiembroProyecto[]): MiembroProyecto[] {
  return rol === SIN_ROL ? members : members.filter((m) => m.idRolProyecto === Number(rol));
}

export function TaskFormFields({ roles, milestones, members, labels }: TaskFormFieldsProps) {
  const { control, watch, getValues, setValue } = useFormContext<TaskFormValues>();
  const rolSeleccionado = watch('idRolProyecto');
  const [cascadaMensaje, setCascadaMensaje] = useState<string | null>(null);

  const candidatos = candidatosParaRol(rolSeleccionado, members);

  // Cambio de rol síncrono dentro del propio handler (no en un efecto): si
  // el asignado actual deja de pertenecer al rol nuevo, se limpia de
  // inmediato y se informa — nunca se conserva en silencio un asignado
  // incompatible.
  const handleRolChange = (nuevoRol: string, onChange: (value: string) => void) => {
    onChange(nuevoRol);
    const asignadoActual = getValues('idUsuarioAsignado');
    if (asignadoActual === SIN_ASIGNAR) {
      setCascadaMensaje(null);
      return;
    }
    const siguenValido = candidatosParaRol(nuevoRol, members).some(
      (m) => String(m.idUsuario) === asignadoActual,
    );
    if (!siguenValido) {
      setValue('idUsuarioAsignado', SIN_ASIGNAR);
      setCascadaMensaje('Se limpió el usuario asignado porque no pertenece al nuevo rol.');
    } else {
      setCascadaMensaje(null);
    }
  };

  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name="tituloTarea"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Título</FormLabel>
            <FormControl>
              <Input {...field} maxLength={150} placeholder="Título de la tarea" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="descripcionTarea"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Descripción</FormLabel>
            <FormControl>
              <Textarea {...field} maxLength={5000} rows={3} placeholder="Descripción opcional" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name="prioridad"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Prioridad</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(['ALTA', 'MEDIA', 'BAJA'] as const).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORIDAD_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="fechaLimite"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fecha límite</FormLabel>
              <FormControl>
                <Input {...field} type="date" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name="tiempoEstimadoHoras"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Tiempo estimado (horas)</FormLabel>
            <FormControl>
              <Input
                {...field}
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                step={1}
                placeholder="Opcional"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name="idRolProyecto"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Rol</FormLabel>
              <Select
                value={field.value}
                onValueChange={(valor) => handleRolChange(valor, field.onChange)}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={SIN_ROL}>Sin rol</SelectItem>
                  {roles.map((rol) => (
                    <SelectItem key={rol.idRolProyecto} value={String(rol.idRolProyecto)}>
                      {rol.nombreRol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="idHito"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hito</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={SIN_HITO}>Sin hito</SelectItem>
                  {milestones.map((hito) => (
                    <SelectItem key={hito.idHito} value={String(hito.idHito)}>
                      {hito.tituloHito}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name="idUsuarioAsignado"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Asignado</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={SIN_ASIGNAR}>Sin asignar</SelectItem>
                {candidatos.map((miembro) => (
                  <SelectItem key={miembro.idUsuario} value={String(miembro.idUsuario)}>
                    {miembro.nombre} {miembro.apellido} · {miembro.correo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cascadaMensaje && (
              <p role="status" className="text-xs text-tertiary">
                {cascadaMensaje}
              </p>
            )}
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="idsEtiquetas"
        render={({ field }) => (
          <FormItem>
            <fieldset>
              <legend className="text-sm font-medium mb-2">Etiquetas</legend>
              {labels.length === 0 ? (
                <p className="text-xs text-tertiary">
                  Este proyecto todavía no tiene etiquetas.
                </p>
              ) : (
                <div className="flex flex-wrap gap-3 max-h-32 overflow-y-auto">
                  {labels.map((etiqueta) => {
                    const checked = (field.value as number[]).includes(etiqueta.idEtiqueta);
                    return (
                      <label
                        key={etiqueta.idEtiqueta}
                        className="inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => {
                            const seleccionadas = field.value as number[];
                            field.onChange(
                              value
                                ? [...seleccionadas, etiqueta.idEtiqueta]
                                : seleccionadas.filter((id) => id !== etiqueta.idEtiqueta),
                            );
                          }}
                        />
                        <TaskLabelChip etiqueta={toEtiquetaTareaDTO(etiqueta)} />
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
