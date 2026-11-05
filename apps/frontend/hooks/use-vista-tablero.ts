'use client';

import { useCallback, useState } from 'react';

export type VistaTablero = 'kanban' | 'lista' | 'tabla';

export const VISTAS_TABLERO: readonly VistaTablero[] = ['kanban', 'lista', 'tabla'];

const clave = (idProyecto: number) => `tablero-vista-${idProyecto}`;

/** Vista guardada del proyecto; Kanban si no hay una o el almacenamiento no está disponible. */
export function leerVistaTablero(idProyecto: number): VistaTablero {
  try {
    const guardada = window.localStorage.getItem(clave(idProyecto));
    return VISTAS_TABLERO.find((v) => v === guardada) ?? 'kanban';
  } catch {
    return 'kanban';
  }
}

/** MEJ-112: vista del tablero (Kanban, Lista o Tabla), recordada por proyecto en este navegador. */
export function useVistaTablero(idProyecto: number) {
  const [vista, setVistaEstado] = useState<VistaTablero>(() => leerVistaTablero(idProyecto));

  const setVista = useCallback(
    (nueva: VistaTablero) => {
      setVistaEstado(nueva);
      try {
        window.localStorage.setItem(clave(idProyecto), nueva);
      } catch {
        // Sin almacenamiento (ventana privada o bloqueado): la vista vale solo en esta sesión.
      }
    },
    [idProyecto],
  );

  return [vista, setVista] as const;
}
