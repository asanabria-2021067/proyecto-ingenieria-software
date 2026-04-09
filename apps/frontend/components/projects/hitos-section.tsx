'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { HitoDTO as Hito, TareaDTO as Tarea } from '@/lib/dto/project.dto';

interface HitosSectionProps {
  hitos: Hito[];
  tareas: Tarea[];
}

const HITO_ESTADO_STYLES: Record<string, string> = {
  PENDIENTE:    'bg-gray-100 text-gray-600',
  EN_PROGRESO:  'bg-blue-100 text-blue-700',
  COMPLETADO:   'bg-[#b7f568] text-[#416900]',
};

const PRIORIDAD_STYLES: Record<string, string> = {
  ALTA:  'text-red-600 font-semibold',
  MEDIA: 'text-yellow-600 font-semibold',
  BAJA:  'text-blue-500 font-semibold',
};

const TAREA_ESTADO_STYLES: Record<string, string> = {
  POR_HACER:   'bg-gray-100 text-gray-600',
  EN_PROGRESO: 'bg-blue-100 text-blue-700',
  EN_REVISION: 'bg-yellow-100 text-yellow-700',
  HECHO:       'bg-[#b7f568] text-[#416900] font-semibold',
};

export function HitosSection({ hitos, tareas }: HitosSectionProps) {
  if (hitos.length === 0) return null;

  const tareasPorHito = tareas.reduce<Record<number, Tarea[]>>((acc, t) => {
    if (t.idHito !== null) {
      if (!acc[t.idHito]) acc[t.idHito] = [];
      acc[t.idHito].push(t);
    }
    return acc;
  }, {});

  const hitosOrdenados = [...hitos].sort((a, b) => a.orden - b.orden);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-5">
        Hitos y Tareas
      </h2>

      <div className="relative">
        {/* Línea vertical de timeline */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />

        <div className="space-y-6">
          {hitosOrdenados.map((hito) => {
            const tareasDelHito = tareasPorHito[hito.idHito] ?? [];
            const isCompletado = hito.estadoHito === 'COMPLETADO';

            return (
              <div key={hito.idHito} className="relative pl-7">
                {/* Dot del timeline */}
                <div className="absolute left-0 top-1.5">
                  {isCompletado ? (
                    <CheckCircle2 className="size-4 text-[#006735]" />
                  ) : (
                    <Circle className="size-4 text-gray-300 fill-gray-100" />
                  )}
                </div>

                {/* Hito header */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 text-sm">
                      {hito.tituloHito}
                    </h3>
                    <span
                      className={`px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        HITO_ESTADO_STYLES[hito.estadoHito] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {hito.estadoHito.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Tareas del hito */}
                  {tareasDelHito.length > 0 && (
                    <div className="space-y-2">
                      {tareasDelHito.map((tarea) => {
                        const done = tarea.estadoTarea === 'HECHO';
                        return (
                          <div
                            key={tarea.idTarea}
                            className="flex items-center gap-3 bg-white rounded-lg px-3 py-2.5"
                          >
                            <Checkbox
                              checked={done}
                              disabled
                              className="shrink-0"
                            />
                            <span
                              className={`flex-1 text-sm ${
                                done
                                  ? 'line-through text-gray-400'
                                  : 'text-gray-800'
                              }`}
                            >
                              {tarea.tituloTarea}
                            </span>
                            <span
                              className={`text-xs ${
                                PRIORIDAD_STYLES[tarea.prioridad] ?? 'text-gray-500'
                              }`}
                            >
                              {tarea.prioridad}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
                                TAREA_ESTADO_STYLES[tarea.estadoTarea] ??
                                'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {tarea.estadoTarea.replace('_', ' ')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
