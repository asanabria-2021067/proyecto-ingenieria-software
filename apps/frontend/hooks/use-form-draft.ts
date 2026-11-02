'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { descartarBorrador, guardarBorrador, leerBorrador } from '@/lib/forms/borrador';

interface Opciones<T> {
  /** Clave del borrador; `null` lo desactiva (p. ej. al editar algo ya guardado). */
  clave: string | null;
  /** Estado actual del formulario, serializable a JSON. */
  valor: T;
  /** Se llama una vez al montar si hay un borrador guardado. */
  alRestaurar: (valor: T) => void;
  /** Se llama al pulsar «Descartar borrador»: debe devolver el formulario a su estado inicial. */
  alDescartar: () => void;
}

const ESPERA_MS = 400;

/**
 * Borrador automático: restaura al montar, guarda con retraso cada cambio y
 * se descarta al enviar (`limpiar`) o con «Descartar borrador» (`descartar`).
 * Un formulario sin cambios respecto al inicial no deja borrador.
 */
export function useFormDraft<T>({ clave, valor, alRestaurar, alDescartar }: Opciones<T>) {
  const [restaurado, setRestaurado] = useState(false);
  const inicial = useRef<string | null>(null);
  const bloqueado = useRef(false);
  const listo = useRef(false);
  const restaurar = useRef(alRestaurar);
  restaurar.current = alRestaurar;

  useEffect(() => {
    if (!clave) return;
    inicial.current = JSON.stringify(valor);
    const borrador = leerBorrador<T>(clave);
    if (borrador) {
      restaurar.current(borrador.valor);
      setRestaurado(true);
    }
    listo.current = true;
    // Solo al montar (o si cambia la clave): no se vuelve a leer en cada cambio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const serializado = JSON.stringify(valor);
  useEffect(() => {
    if (!clave || !listo.current || bloqueado.current) return;
    const t = setTimeout(() => {
      if (bloqueado.current) return;
      if (serializado === inicial.current) descartarBorrador(clave);
      else guardarBorrador(clave, JSON.parse(serializado) as T);
    }, ESPERA_MS);
    return () => clearTimeout(t);
  }, [clave, serializado]);

  /** Tras enviar con éxito: borra el borrador y no vuelve a guardarlo. */
  const limpiar = useCallback(() => {
    bloqueado.current = true;
    if (clave) descartarBorrador(clave);
    setRestaurado(false);
  }, [clave]);

  const descartar = useCallback(() => {
    if (clave) descartarBorrador(clave);
    setRestaurado(false);
    alDescartar();
  }, [clave, alDescartar]);

  return { restaurado, descartar, limpiar };
}
