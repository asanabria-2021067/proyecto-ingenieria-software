'use client';

import { useState } from 'react';
import { useHourAdjustments } from '@/hooks/use-hour-adjustments';
import { getApiErrorMessage, getApiErrorStatus, isProyectoOcupado } from '@/components/projects/api-error';
import type { AjusteHoraDTO, SprintClosingMemberTotalsDto, UpsertHourAdjustmentInput } from '@/lib/types/sprints';

/**
 * Piezas que comparten las dos vistas del cierre de un Sprint: el resumen y
 * confirmación (`…/finalizar`) y la revisión de horas (`…/finalizar/revision`).
 * Ambas leen el mismo resumen de cierre; aquí no se calcula nada nuevo.
 */

/** Totales de un integrante sin tramos: ceros explícitos, nunca `undefined`. */
export const SIN_TOTALES: SprintClosingMemberTotalsDto = {
  tareasDistintas: 0,
  estimacionAsociada: null,
  reportadas: '0.00',
  legacy: '0.00',
  exceso: '0.00',
  propuestas: '0.00',
  filasPendientes: 0,
  filasConsumidas: 0,
  tramos: [],
};

/** Suma decimales del backend en centésimas enteras, sin cola binaria. */
export function sumarDecimales(valores: string[]): string {
  const total = valores.reduce((acc, v) => acc + Math.round(Number(v) * 100), 0);
  const signo = total < 0 ? '-' : '';
  const abs = Math.abs(total);
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

/**
 * Ajustes de horas por tramo durante el cierre: guardar, revertir e historial,
 * con su manejo de errores (400 junto a la fila; 409 como aviso global con
 * «Actualizar»). Es la misma lógica que vivía en la página de cierre, movida
 * tal cual para que la use la vista de revisión.
 */
export function useSprintClosingAdjustments(idProyecto: number, idSprint: number) {
  const { upsert, revert, history } = useHourAdjustments(idProyecto, idSprint);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [globalError, setGlobalError] = useState<{ message: string; conflict: boolean } | null>(null);

  const manejarErrorAjuste = (idAsignacion: number, err: unknown) => {
    const status = getApiErrorStatus(err);
    const message = getApiErrorMessage(err, 'hours');
    if (status === 400) {
      setRowErrors((prev) => ({ ...prev, [idAsignacion]: message }));
      return;
    }
    if (status === 409) {
      setGlobalError({
        message: isProyectoOcupado(err)
          ? 'El proyecto esta ocupado por otra operacion. Actualiza e intentalo de nuevo.'
          : 'El resumen cambio mientras trabajabas. Actualiza para ver el estado actual.',
        conflict: true,
      });
      return;
    }
    setGlobalError({ message, conflict: false });
  };

  const onUpsert = (idAsignacion: number, input: UpsertHourAdjustmentInput) => {
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[idAsignacion];
      return next;
    });
    setGlobalError(null);
    setPendingId(idAsignacion);
    upsert.mutate(
      { idAsignacion, input },
      {
        onError: (err) => manejarErrorAjuste(idAsignacion, err),
        onSettled: () => setPendingId(null),
      },
    );
  };

  const onRevert = (idAsignacion: number) => {
    setGlobalError(null);
    setPendingId(idAsignacion);
    revert.mutate(
      { idAsignacion },
      {
        onError: (err) => manejarErrorAjuste(idAsignacion, err),
        onSettled: () => setPendingId(null),
      },
    );
  };

  const onLoadHistory = (idAsignacion: number): Promise<AjusteHoraDTO[]> => history.mutateAsync({ idAsignacion });

  return { pendingId, rowErrors, globalError, clearGlobalError: () => setGlobalError(null), onUpsert, onRevert, onLoadHistory };
}
