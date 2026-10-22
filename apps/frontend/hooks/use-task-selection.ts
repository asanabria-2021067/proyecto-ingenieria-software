'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { podarSeleccion, rangoEntre } from '@/lib/tasks/selection';

export interface AlternarSeleccionOpciones {
  /** Shift+clic: selecciona el rango desde la última tarea marcada. */
  rango?: boolean;
  /** Orden visible del grupo donde está la tarea (columna o página de la lista). */
  orden?: readonly number[];
}

/** Lo mínimo que el tablero y la tabla necesitan para pintar y alternar la selección. */
export interface TaskSelectionControl {
  activa: boolean;
  estaSeleccionada: (idTarea: number) => boolean;
  alternar: (idTarea: number, opciones?: AlternarSeleccionOpciones) => void;
}

/**
 * Hay un diálogo, menú o lista desplegable abierto: Esc le pertenece a él
 * (cerrarlo), no a la selección.
 */
function hayCapaAbierta(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]') !== null;
}

/**
 * HU-202/T-382: selección múltiple de tareas compartida por el Kanban y la
 * Lista de tareas. Clic alterna una tarea; Shift+clic marca el rango desde la
 * última marcada dentro del mismo grupo; Esc limpia. `idsVisibles` son las
 * tareas que hoy se ven: cuando cambian (filtros, una tarea eliminada) las
 * que dejaron de verse se desmarcan, para que una acción nunca toque tareas
 * que el líder no tiene delante.
 */
export function useTaskSelection(idsVisibles: readonly number[]) {
  const [seleccion, setSeleccion] = useState<ReadonlySet<number>>(() => new Set());
  const [ancla, setAncla] = useState<number | null>(null);

  // Ajuste durante el render (patrón de React para estado derivado de props)
  // en vez de un efecto: así nunca se pinta un fotograma con tareas ocultas
  // todavía marcadas.
  const claveVisibles = idsVisibles.join(',');
  const [claveAnterior, setClaveAnterior] = useState(claveVisibles);
  if (claveAnterior !== claveVisibles) {
    setClaveAnterior(claveVisibles);
    const podada = podarSeleccion(seleccion, idsVisibles);
    if (podada !== seleccion) setSeleccion(podada);
    if (ancla !== null && !idsVisibles.includes(ancla)) setAncla(null);
  }

  const alternar = useCallback(
    (idTarea: number, opciones: AlternarSeleccionOpciones = {}) => {
      const rango =
        opciones.rango && ancla !== null && opciones.orden ? rangoEntre(opciones.orden, ancla, idTarea) : null;
      if (rango) {
        setSeleccion((previa) => new Set([...previa, ...rango]));
      } else {
        setSeleccion((previa) => {
          const siguiente = new Set(previa);
          if (siguiente.has(idTarea)) siguiente.delete(idTarea);
          else siguiente.add(idTarea);
          return siguiente;
        });
      }
      setAncla(idTarea);
    },
    [ancla],
  );

  const seleccionarVarias = useCallback((ids: readonly number[]) => {
    setSeleccion((previa) => new Set([...previa, ...ids]));
  }, []);

  const deseleccionarVarias = useCallback((ids: readonly number[]) => {
    setSeleccion((previa) => {
      const siguiente = new Set(previa);
      for (const id of ids) siguiente.delete(id);
      return siguiente;
    });
  }, []);

  const limpiar = useCallback(() => {
    setSeleccion(new Set());
    setAncla(null);
  }, []);

  const haySeleccion = seleccion.size > 0;
  useEffect(() => {
    if (!haySeleccion) return;
    const alPresionar = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || hayCapaAbierta()) return;
      limpiar();
    };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [haySeleccion, limpiar]);

  const estaSeleccionada = useCallback((idTarea: number) => seleccion.has(idTarea), [seleccion]);

  const control = useMemo<TaskSelectionControl>(
    () => ({ activa: haySeleccion, estaSeleccionada, alternar }),
    [haySeleccion, estaSeleccionada, alternar],
  );

  return {
    seleccionadas: seleccion,
    cantidad: seleccion.size,
    control,
    alternar,
    estaSeleccionada,
    seleccionarVarias,
    deseleccionarVarias,
    limpiar,
  };
}
