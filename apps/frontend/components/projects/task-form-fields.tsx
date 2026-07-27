'use client';

import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Tags } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from '@/components/ui/form';
import { TaskLabelsMultiSelect } from '@/components/projects/task-labels-multiselect';
import { PRIORIDAD_COLOR, PRIORIDAD_ICON, PRIORIDAD_LABEL } from '@/components/projects/task-board.utils';
import { SIN_ASIGNAR, SIN_HITO, SIN_ROL, type TaskFormValues } from '@/components/projects/task-form.schema';
import type { MiembroProyecto } from '@/hooks/use-project-members';
import type { LabelDTO } from '@/lib/services/labels';
import type { Prioridad } from '@/lib/types/tasks';

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
  /** Abre el gestor de etiquetas del proyecto sin perder el borrador (Sección 30). */
  onManageLabels?: () => void;
}

/**
 * Candidatos para el usuario asignado (Sección 7/23). Con rol, los candidatos
 * son los participantes activos de ese rol exacto; sin rol, los participantes
 * activos de cualquier rol del proyecto. `members` viene de `findTeam` con una
 * fila POR participación, así que un usuario con varios roles aparecería varias
 * veces en el caso "Sin rol": se deduplica por `idUsuario` para que figure una
 * sola vez en el selector.
 */
function candidatosParaRol(rol: string, members: MiembroProyecto[]): MiembroProyecto[] {
  const filtrados =
    rol === SIN_ROL ? members : members.filter((m) => m.idRolProyecto === Number(rol));
  const vistos = new Set<number>();
  return filtrados.filter((m) => {
    if (vistos.has(m.idUsuario)) return false;
    vistos.add(m.idUsuario);
    return true;
  });
}

function iniciales(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

/** Encabezado numerado de sección (Sección 12): mismo estilo en crear y editar. */
function SectionTitle({ numero, children }: { numero: number; children: React.ReactNode }) {
  return (
    <h3 className="mb-3.5 flex items-center gap-2 text-sm font-bold text-on-surface">
      <span className="inline-flex size-5 items-center justify-center rounded-md bg-primary/10 text-[11px] font-black text-primary">
        {numero}
      </span>
      {children}
    </h3>
  );
}

const SELECT_TRIGGER_CLASS = 'h-10 w-full bg-surface-container-lowest';

/**
 * Envuelve el `TaskLabelsMultiSelect` dentro del contexto de `FormField` para
 * heredar el `id`/`aria-describedby`/`aria-invalid` que expone `useFormField`
 * (el multiselect no es un `input` nativo y no puede pasar por `FormControl`).
 */
function LabelsControl({
  labels,
  value,
  onChange,
}: {
  labels: LabelDTO[];
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const { formItemId, formDescriptionId, formMessageId, error } = useFormField();
  return (
    <TaskLabelsMultiSelect
      labels={labels}
      value={value}
      onChange={onChange}
      id={formItemId}
      ariaInvalid={!!error}
      ariaDescribedBy={error ? `${formDescriptionId} ${formMessageId}` : formDescriptionId}
    />
  );
}

export function TaskFormFields({ roles, milestones, members, labels, onManageLabels }: TaskFormFieldsProps) {
  const { control, watch, getValues, setValue } = useFormContext<TaskFormValues>();
  const rolSeleccionado = watch('idRolProyecto');
  const [cascadaMensaje, setCascadaMensaje] = useState<string | null>(null);

  const candidatos = candidatosParaRol(rolSeleccionado, members);

  // Cambio de rol síncrono dentro del propio handler (no en un efecto): si
  // el asignado actual deja de pertenecer al rol nuevo, se limpia de
  // inmediato y se informa — nunca se conserva en silencio un asignado
  // incompatible (Sección 22-23).
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
    <div className="space-y-6">
      {/* ── SECCIÓN 1: INFORMACIÓN BÁSICA (Sección 13) ── */}
      <section>
        <SectionTitle numero={1}>Información básica</SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          <FormField
            control={control}
            name="tituloTarea"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>
                  Título de la tarea <span className="text-red-600">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoFocus
                    maxLength={150}
                    placeholder="Escribe un título claro para la tarea"
                    className="h-10"
                  />
                </FormControl>
                <FormDescription className="text-xs">Usa un título breve y descriptivo.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="prioridad"
            render={({ field }) => (
              <FormItem className="md:col-span-1">
                <FormLabel>
                  Prioridad <span className="text-red-600">*</span>
                </FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger aria-label="Seleccionar prioridad" className={SELECT_TRIGGER_CLASS}>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(['ALTA', 'MEDIA', 'BAJA'] as const).map((p) => {
                      const Icon = PRIORIDAD_ICON[p as Prioridad];
                      return (
                        <SelectItem key={p} value={p}>
                          <span className="flex items-center gap-2">
                            <Icon className={`size-3.5 ${PRIORIDAD_COLOR[p as Prioridad]}`} aria-hidden="true" />
                            {PRIORIDAD_LABEL[p as Prioridad]}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="descripcionTarea"
            render={({ field }) => (
              <FormItem className="md:col-span-2 md:flex md:flex-col">
                <FormLabel>Descripción</FormLabel>
                <FormControl>
                  {/* En md+ el textarea crece para llenar la columna, de modo que
                      su borde inferior quede a la misma altura que el bloque
                      Fecha/Tiempo de al lado (sin escalón). */}
                  <Textarea
                    {...field}
                    maxLength={5000}
                    placeholder="Describe el objetivo, alcance y detalles relevantes de la tarea."
                    className="min-h-26 resize-y md:min-h-0 md:flex-1"
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  Descripción opcional. Incluye la información necesaria para quien la realice.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-col gap-4 md:col-span-1">
            <FormField
              control={control}
              name="fechaLimite"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Fecha límite <span className="text-red-600">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} type="date" className="h-10" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                      className="h-10"
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Horas de dedicación estimadas para la tarea.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      </section>

      <div className="border-t border-outline-variant/40" />

      {/* ── SECCIÓN 2: ORGANIZACIÓN (Sección 20) ── */}
      <section>
        <SectionTitle numero={2}>Organización</SectionTitle>
        <div className="grid gap-3 md:grid-cols-3">
          <FormField
            control={control}
            name="idRolProyecto"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel>Rol del proyecto</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(valor) => handleRolChange(valor, field.onChange)}
                >
                  <FormControl>
                    <SelectTrigger aria-label="Seleccionar rol del proyecto" className={SELECT_TRIGGER_CLASS}>
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
                <FormDescription className="text-xs">Define el rol responsable de ejecutar la tarea.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="idUsuarioAsignado"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel>Usuario asignado</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger aria-label="Seleccionar usuario asignado" className={SELECT_TRIGGER_CLASS}>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={SIN_ASIGNAR}>Sin asignar</SelectItem>
                    {candidatos.map((miembro) => (
                      <SelectItem key={miembro.idUsuario} value={String(miembro.idUsuario)}>
                        {/* El trigger muestra avatar + nombre (sin el correo largo,
                            que desbordaba sobre la columna "Hito"). El correo se
                            ofrece como title para consulta rápida. */}
                        <span
                          className="flex min-w-0 items-center gap-2"
                          title={`${miembro.nombre} ${miembro.apellido} · ${miembro.correo}`}
                        >
                          <Avatar className="size-5 shrink-0">
                            <AvatarFallback className="bg-primary/10 text-[9px] font-bold text-primary">
                              {iniciales(miembro.nombre, miembro.apellido)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 truncate">
                            {miembro.nombre} {miembro.apellido}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {candidatos.length === 0 ? (
                  <FormDescription className="text-xs">
                    No hay participantes disponibles para este rol.
                  </FormDescription>
                ) : (
                  <FormDescription className="text-xs">
                    Los usuarios disponibles dependen del rol seleccionado.
                  </FormDescription>
                )}
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
            name="idHito"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel>Hito</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger aria-label="Seleccionar hito" className={SELECT_TRIGGER_CLASS}>
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
                <FormDescription className="text-xs">Asocia la tarea a una etapa del proyecto.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </section>

      <div className="border-t border-outline-variant/40" />

      {/* ── SECCIÓN 3: ETIQUETAS (Sección 27) ── */}
      <section>
        <SectionTitle numero={3}>Etiquetas</SectionTitle>
        <FormField
          control={control}
          name="idsEtiquetas"
          render={({ field }) => (
            <FormItem>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="min-w-0 sm:flex-1">
                  <LabelsControl
                    labels={labels}
                    value={field.value as number[]}
                    onChange={field.onChange}
                  />
                </div>
                {onManageLabels && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onManageLabels}
                    aria-label="Gestionar etiquetas del proyecto"
                    className="h-10 shrink-0 gap-1.5 border-outline-variant bg-surface-container-lowest text-sm font-semibold text-on-surface hover:bg-primary/10 max-sm:w-full sm:w-auto"
                  >
                    <Tags className="size-4" aria-hidden="true" />
                    Gestionar etiquetas
                  </Button>
                )}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </section>
    </div>
  );
}
