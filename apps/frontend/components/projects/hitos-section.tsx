'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, MessageCircle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { TaskCommentsDialog } from '@/components/projects/task-comments-dialog';
import type { HitoDTO as Hito } from '@/lib/dto/project.dto';
import type { TareaPublicaDTO } from '@/lib/types/tasks';

interface HitosSectionProps {
  hitos: Hito[];
  tareas: TareaPublicaDTO[];
  idProyecto: number;
}

const HITO_ESTADO_STYLES: Record<string, string> = {
  PENDIENTE:    'bg-surface-container-high text-on-surface-variant',
  EN_PROGRESO:  'bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 dark:text-blue-300',
  COMPLETADO:   'bg-secondary-container text-on-secondary-container',
};

const PRIORIDAD_STYLES: Record<string, string> = {
  ALTA:  'text-red-600 dark:text-red-400 font-semibold',
  MEDIA: 'text-amber-600 dark:text-amber-400 font-semibold',
  BAJA:  'text-blue-500 dark:text-blue-400 font-semibold',
};

const TAREA_ESTADO_STYLES: Record<string, string> = {
  POR_HACER:   'bg-surface-container-high text-on-surface-variant',
  EN_PROGRESO: 'bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 dark:text-blue-300',
  EN_REVISION: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300',
  HECHO:       'bg-secondary-container text-on-secondary-container font-semibold',
};

/**
 * Fila de tarea reutilizada tanto dentro de un hito como en "Tareas sin
 * hito", para no duplicar el render de la Tarea 35 al migrar a
 * `TareaPublicaDTO`.
 */
function TareaRow({ tarea, onSelect }: { tarea: TareaPublicaDTO; onSelect: (t: TareaPublicaDTO) => void }) {
  const done = tarea.estadoTarea === 'HECHO';

  return (
    <button
      type="button"
      onClick={() => onSelect(tarea)}
      className="w-full flex items-center gap-3 bg-surface-container-lowest rounded-lg px-3 py-2.5 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
    >
      <Checkbox checked={done} disabled className="shrink-0" />
      <span
        className={`flex-1 text-sm ${
          done ? 'line-through text-tertiary' : 'text-on-surface'
        }`}
      >
        {tarea.tituloTarea}
      </span>
      <span
        className="flex items-center gap-1 text-xs text-tertiary shrink-0"
        title="Comentarios"
      >
        <MessageCircle className="size-3.5" />
        {tarea.cantidadComentarios}
      </span>
      <span
        className={`text-xs ${PRIORIDAD_STYLES[tarea.prioridad] ?? 'text-tertiary'}`}
      >
        {tarea.prioridad}
      </span>
      <span
        className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
          TAREA_ESTADO_STYLES[tarea.estadoTarea] ?? 'bg-surface-container-high text-on-surface-variant'
        }`}
      >
        {tarea.estadoTarea.replace('_', ' ')}
      </span>
    </button>
  );
}

export function HitosSection({ hitos, tareas, idProyecto }: HitosSectionProps) {
  const [tareaSeleccionada, setTareaSeleccionada] = useState<TareaPublicaDTO | null>(null);

  const idsHitosCargados = new Set(hitos.map((h) => h.idHito));

  const tareasPorHito = tareas.reduce<Record<number, TareaPublicaDTO[]>>((acc, t) => {
    if (t.idHito !== null && idsHitosCargados.has(t.idHito)) {
      if (!acc[t.idHito]) acc[t.idHito] = [];
      acc[t.idHito].push(t);
    }
    return acc;
  }, {});

  // "Sin hito" incluye tanto idHito null como un idHito que no corresponde a
  // ninguno de los hitos cargados (dato inconsistente o hito eliminado entre
  // la carga de hitos y de tareas): en ambos casos la tarea se muestra aquí
  // en vez de desaparecer silenciosamente.
  const tareasSinHito = tareas.filter(
    (t) => t.idHito === null || !idsHitosCargados.has(t.idHito),
  );

  if (hitos.length === 0 && tareasSinHito.length === 0) return null;

  const hitosOrdenados = [...hitos].sort((a, b) => a.orden - b.orden);

  return (
    <>
    <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-tertiary mb-5">
        Hitos y Tareas
      </h2>

      {hitosOrdenados.length > 0 && (
        <div className="relative">
          {/* Línea vertical de timeline */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-outline-variant" />

          <div className="space-y-6">
            {hitosOrdenados.map((hito) => {
              const tareasDelHito = tareasPorHito[hito.idHito] ?? [];
              const isCompletado = hito.estadoHito === 'COMPLETADO';

              return (
                <div key={hito.idHito} data-testid={`hito-${hito.idHito}`} className="relative pl-7">
                  {/* Dot del timeline */}
                  <div className="absolute left-0 top-1.5">
                    {isCompletado ? (
                      <CheckCircle2 className="size-4 text-primary" />
                    ) : (
                      <Circle className="size-4 text-outline-variant fill-surface-container-high" />
                    )}
                  </div>

                  {/* Hito header */}
                  <div className="bg-surface-container-low rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-on-surface text-sm">
                        {hito.tituloHito}
                      </h3>
                      <span
                        className={`px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          HITO_ESTADO_STYLES[hito.estadoHito] ?? 'bg-surface-container-high text-on-surface-variant'
                        }`}
                      >
                        {hito.estadoHito.replace('_', ' ')}
                      </span>
                    </div>

                    {/* Tareas del hito */}
                    {tareasDelHito.length > 0 && (
                      <div className="space-y-2">
                        {tareasDelHito.map((tarea) => (
                          <TareaRow key={tarea.idTarea} tarea={tarea} onSelect={setTareaSeleccionada} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tareasSinHito.length > 0 && (
        <div data-testid="tareas-sin-hito" className={hitosOrdenados.length > 0 ? 'mt-6' : ''}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-tertiary">
              Tareas sin hito
            </h3>
            <span className="text-xs text-tertiary">
              {tareasSinHito.length} {tareasSinHito.length === 1 ? 'tarea' : 'tareas'}
            </span>
          </div>
          <div className="bg-surface-container-low rounded-xl p-4 space-y-2">
            {tareasSinHito.map((tarea) => (
              <TareaRow key={tarea.idTarea} tarea={tarea} onSelect={setTareaSeleccionada} />
            ))}
          </div>
        </div>
      )}
    </div>

    <TaskCommentsDialog
      tarea={tareaSeleccionada}
      idProyecto={idProyecto}
      open={tareaSeleccionada !== null}
      onOpenChange={(open) => {
        if (!open) setTareaSeleccionada(null);
      }}
    />
    </>
  );
}
